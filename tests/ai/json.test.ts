import { describe, it, expect } from 'vitest'
import { extractJson } from '@/lib/ai/json'

describe('extractJson', () => {
  it('parses clean JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })
  it('strips markdown fences', () => {
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 })
  })
  it('throws on unparseable text', () => {
    expect(() => extractJson('not json')).toThrow()
  })
})
