import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parseDOCX } from '@/lib/parsers/docxParser'

describe('parseDOCX', () => {
  it('extracts non-empty text and word count', async () => {
    const buf = readFileSync(path.resolve(__dirname, '../fixtures/sample.docx'))
    const result = await parseDOCX(buf)
    expect(result.full_text.length).toBeGreaterThan(0)
    expect(result.word_count).toBeGreaterThan(0)
  })
})
