import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parsePDF } from '@/lib/parsers/pdfParser'

describe('parsePDF', () => {
  it('extracts non-empty text and a plausible word count', async () => {
    const buf = readFileSync(path.resolve(__dirname, '../fixtures/sample.pdf'))
    const result = await parsePDF(buf)
    expect(result.full_text.length).toBeGreaterThan(0)
    expect(result.word_count).toBeGreaterThan(0)
    expect(typeof result.sections).toBe('object')
  })
})
