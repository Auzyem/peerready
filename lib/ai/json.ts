// Parse a model text response into JSON, tolerating markdown fences and
// leading/trailing prose. Throws if no JSON object can be recovered.
export function extractJson<T = unknown>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T
    }
    throw new Error('No parseable JSON found in model response')
  }
}
