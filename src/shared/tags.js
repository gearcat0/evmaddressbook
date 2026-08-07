// Tag normalization shared between the main process and renderer.
//
// Accepts an array of tags or a comma-separated string; returns a clean
// array: trimmed, empties dropped, deduplicated case-insensitively (first
// spelling wins), insertion order preserved.
export function normalizeTags(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(',')
  const seen = new Set()
  const tags = []
  for (const item of raw) {
    const tag = String(item || '').trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  return tags
}
