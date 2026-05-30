import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePDF } from '@/lib/parsers/pdfParser'
import { parseDOCX } from '@/lib/parsers/docxParser'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const manuscriptId = formData.get('manuscriptId') as string | null

  if (!file || !manuscriptId) {
    return NextResponse.json({ error: 'Missing file or manuscriptId' }, { status: 400 })
  }
  const isPdf = file.name.toLowerCase().endsWith('.pdf')
  const isDocx = file.name.toLowerCase().endsWith('.docx')
  if (!isPdf && !isDocx) {
    return NextResponse.json({ error: 'Only .pdf and .docx are supported' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileType: 'pdf' | 'docx' = isPdf ? 'pdf' : 'docx'

  const { data: drafts } = await supabase
    .from('drafts')
    .select('version_number')
    .eq('manuscript_id', manuscriptId)
    .order('version_number', { ascending: false })
    .limit(1)

  const versionNumber = drafts?.[0]?.version_number ? drafts[0].version_number + 1 : 1
  const storagePath = `${user.id}/${manuscriptId}/v${versionNumber}_${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('manuscripts')
    .upload(storagePath, buffer, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const parsed = fileType === 'pdf' ? await parsePDF(buffer) : await parseDOCX(buffer)

  const { data: draft, error: draftError } = await supabase
    .from('drafts')
    .insert({
      manuscript_id: manuscriptId,
      version_number: versionNumber,
      storage_path: storagePath,
      file_name: file.name,
      file_type: fileType,
      parsed_text: parsed.full_text,
      parsed_sections: parsed.sections,
    })
    .select()
    .single()

  if (draftError) {
    return NextResponse.json({ error: draftError.message }, { status: 500 })
  }

  await supabase.from('manuscripts').update({
    word_count: parsed.word_count,
    abstract: parsed.abstract || undefined,
  }).eq('id', manuscriptId)

  return NextResponse.json({ draft })
}
