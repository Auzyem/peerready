import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAuth } from '@/lib/apiKeys/middleware'
import { parsePDF } from '@/lib/parsers/pdfParser'
import { parseDOCX } from '@/lib/parsers/docxParser'
import { RATE_LIMITS, hourAgoIso } from '@/lib/rateLimit'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
  // Accepts either the session cookie (browser) or an API key with manuscript:write.
  const auth = await resolveAuth(request, ['manuscript:write'])
  if (auth instanceof NextResponse) return auth
  const { userId, viaApiKey } = auth
  // Cookie path keeps RLS auto-scoping; API path uses the service-role client
  // and applies the explicit ownership scoping below.
  const supabase = viaApiKey ? createAdminClient() : createClient()

  // Rolling hourly upload cap.
  let recentUploads = 0
  if (viaApiKey) {
    const { data: mans } = await supabase.from('manuscripts').select('id').eq('user_id', userId)
    const manIds = (mans ?? []).map((m) => m.id)
    if (manIds.length > 0) {
      const { count } = await supabase
        .from('drafts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', hourAgoIso())
        .in('manuscript_id', manIds)
      recentUploads = count ?? 0
    }
  } else {
    const { count } = await supabase
      .from('drafts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', hourAgoIso())
    recentUploads = count ?? 0
  }
  if (recentUploads >= RATE_LIMITS.uploadsPerHour) {
    return NextResponse.json(
      { error: 'Hourly upload limit reached. Please try again later.' },
      { status: 429 }
    )
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const manuscriptId = formData.get('manuscriptId') as string | null

  if (!file || !manuscriptId) {
    return NextResponse.json({ error: 'Missing file or manuscriptId' }, { status: 400 })
  }

  // API-key path bypasses RLS, so verify the manuscript belongs to the caller.
  if (viaApiKey) {
    const { data: owned } = await supabase
      .from('manuscripts')
      .select('id')
      .eq('id', manuscriptId)
      .eq('user_id', userId)
      .single()
    if (!owned) return NextResponse.json({ error: 'Manuscript not found' }, { status: 403 })
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
  const storagePath = `${userId}/${manuscriptId}/v${versionNumber}_${file.name}`

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
  } catch (error: unknown) {
    console.error('[api/upload] error:', error)
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
