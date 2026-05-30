import mammoth from 'mammoth'

export async function parseDOCX(buffer: Buffer): Promise<{
  full_text: string
  word_count: number
  sections: Record<string, string>
  title?: string
  abstract?: string
}> {
  const result = await mammoth.extractRawText({ buffer })
  const full_text = result.value
  const word_count = full_text.split(/\s+/).filter(Boolean).length

  return {
    full_text,
    word_count,
    sections: { full: full_text },
    abstract: extractAbstract(full_text),
  }
}

function extractAbstract(text: string): string | undefined {
  const match = text.match(/abstract[\s\S]{0,50}?([\s\S]{100,2000})introduction/i)
  return match?.[1]?.trim()
}
