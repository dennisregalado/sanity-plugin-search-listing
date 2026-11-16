/**
 * Fields that hold a document's URL. A duplicate that kept them would claim the original's
 * URL, so the plugin's Duplicate action leaves them out: the copy then shows the next free
 * handle derived from its title, and `auto-slug` saves it when the copy is published.
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

export interface PrepareDuplicateOptions extends OmitUrlHandleOptions {
  /**
   * Appended to the copy's `title` (or `name` when it has no title), so the copy reads
   * "Homepage Copy" and its URL follows as `homepage-copy`; later copies keep that title and
   * take `homepage-copy-2`, `-3`. A title that already ends with it is left alone.
   * `false` keeps the title.
   * @defaultValue `' Copy'`
   */
  titleSuffix?: string | false
}

/** The fields a document's title is read from, in order. */
const TITLE_FIELDS = ['title', 'name'] as const

/**
 * What the plugin's Duplicate action writes: the document without its URL handle and
 * routing slug, with `titleSuffix` appended to its title.
 */
export function prepareDuplicate<T extends Record<string, unknown>>(
  document: T,
  options: PrepareDuplicateOptions = {},
): T {
  const copy: Record<string, unknown> = omitUrlHandle(document, options)
  const suffix = options.titleSuffix ?? ' Copy'

  if (suffix) {
    const field = TITLE_FIELDS.find((name) => {
      const value = copy[name]
      return typeof value === 'string' && value.trim() !== ''
    })
    const title = field ? (copy[field] as string) : ''
    // A copy of a copy keeps "Homepage Copy"; its URL is numbered instead.
    if (field && !title.trimEnd().toLowerCase().endsWith(suffix.trim().toLowerCase())) {
      copy[field] = `${title.trimEnd()}${suffix}`
    }
  }

  return copy as T
}
