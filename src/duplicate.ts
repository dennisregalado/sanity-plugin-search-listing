/**
 * Fields that hold a document's URL. A duplicate that kept them would claim the original's
 * URL, so the plugin's Duplicate action leaves them out: the copy then shows the next free
 * `<title>-copy` handle, and `auto-slug` saves it when the copy is published.
 */
export interface OmitUrlHandleOptions {
  /** Names of fields of type `seo` on the document. Their `url` is left out. @defaultValue `['seo']` */
  seoFields?: readonly string[]
  /** Other top-level fields to leave out, such as the routing slug. @defaultValue `['slug']` */
  omit?: readonly string[]
}

/** A copy of `document` without its URL handle (`<seo field>.url`) and routing slug. */
export function omitUrlHandle<T extends Record<string, unknown>>(
  document: T,
  options: OmitUrlHandleOptions = {},
): T {
  const seoFields = options.seoFields ?? ['seo']
  const omit = new Set(options.omit ?? ['slug'])
  const copy: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(document)) {
    if (omit.has(key)) continue

    if (seoFields.includes(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      const seo = {...(value as Record<string, unknown>)}
      delete seo.url
      copy[key] = seo
    } else {
      copy[key] = value
    }
  }

  return copy as T
}
