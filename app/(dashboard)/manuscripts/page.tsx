import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ManuscriptList } from '@/components/manuscripts/ManuscriptList'
import type { Manuscript } from '@/lib/types'

export default async function ManuscriptsPage() {
  const supabase = createClient()
  const { data } = await supabase
    .from('manuscripts')
    .select('*, drafts(*)')
    .order('updated_at', { ascending: false })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manuscripts</h1>
        <Link href="/manuscripts/new"><Button>New review</Button></Link>
      </div>
      <ManuscriptList manuscripts={(data as Manuscript[]) ?? []} />
    </div>
  )
}
