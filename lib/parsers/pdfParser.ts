import pdf from 'pdf-parse/lib/pdf-parse.js'

export interface ParsedDocument {
  full_text: string
  word_count: number
  sections: Record<string, string>
  title?: string
  abstract?: string
}

const SECTION_PATTERNS = [
  /^(abstract|introduction|background|literature review|related work|methodology|methods|materials and methods|results|findings|discussion|conclusion|conclusions|references|acknowledgements?|appendix)/im
]

export async function parsePDF(buffer: Buffer): Promise<ParsedDocument> {
  // pdf-parse passes the Buffer's underlying ArrayBuffer directly to pdf.js.
  // Node.js Buffers allocated from the internal pool have a non-zero byteOffset
  // into their ArrayBuffer, which causes pdf.js xref offset calculations to be
  // off by byteOffset bytes, producing "bad XRef entry" errors. A fresh
  // Uint8Array copy always has byteOffset === 0 and its own ArrayBuffer.
  const safeBuffer = new Uint8Array(buffer) as unknown as Buffer
  const data = await pdf(safeBuffer)
  const full_text = data.text
  const word_count = full_text.split(/\s+/).filter(Boolean).length
  const sections = extractSections(full_text)

  return {
    full_text,
    word_count,
    sections,
    title: sections['title'],
    abstract: sections['abstract'],
  }
}

function extractSections(text: string): Record<string, string> {
  const lines = text.split('\n')
  const sections: Record<string, string> = {}
  let currentSection = 'preamble'
  let buffer: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const isHeading = SECTION_PATTERNS.some(p => p.test(trimmed)) && trimmed.length < 80
    if (isHeading) {
      sections[currentSection] = buffer.join('\n').trim()
      currentSection = trimmed.toLowerCase().replace(/\s+/g, '_')
      buffer = []
    } else {
      buffer.push(line)
    }
  }
  sections[currentSection] = buffer.join('\n').trim()
  return sections
}
