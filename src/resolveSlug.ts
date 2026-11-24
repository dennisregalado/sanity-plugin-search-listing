/**
 * Slug allocation shared by the Studio preview and by anything that persists the slug
 * (a Sanity Function, a migration). It has no React or Studio imports, so it is safe to
 * import from `sanity-plugin-search-listing/slug` in a server runtime.
 */

/** The fields of a document the slug rules read: the defaults, plus any configured paths. */
export type SlugDocument = {
  _createdAt?: unknown
  _id?: unknown
  _type?: unknown
  title?: unknown
  name?: unknown
  slug?: {current?: unknown} | null
  seo?: {
    url?: {current?: unknown} | null
  } | null
  [field: string]: unknown
}

/**
 * Where a type's slug comes from, as dot paths on the document. The defaults suit documents
 * routed by their own `slug`; a Sanity Connect product or collection uses
 * `{source: ['store.title'], current: ['store.slug']}` (see the `shopifyProduct` preset).
 */
export interface SlugOptions {
  /** Fields a slug is derived from, tried in order. @defaultValue `['title', 'name']` */
  source?: string[]
  /**
   * Slug fields (`{current}` objects) a document may already route on. Its URL handle,
   * `seo.url`, always comes first. @defaultValue `['slug']`
   */
  current?: string[]
}

export const DEFAULT_SLUG_SOURCE = ['title', 'name']
export const DEFAULT_SLUG_CURRENT = ['slug']

function getSourcePaths(options?: SlugOptions): string[] {
  return options?.source?.length ? options.source : DEFAULT_SLUG_SOURCE
}

function getCurrentPaths(options?: SlugOptions): string[] {
  return options?.current?.length ? options.current : DEFAULT_SLUG_CURRENT
}

const FIELD_PATH_PATTERN = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/

/**
 * A GROQ projection of the given dot paths, nested: `['store.title', 'store.slug']` becomes
 * `store{title, slug}`.
 */
export function getPathsProjection(paths: string[]): string {
  type Tree = Map<string, Tree>
  const tree: Tree = new Map()
  for (const path of paths) {
    if (!FIELD_PATH_PATTERN.test(path)) throw new Error(`Not a field path: ${path}`)
    let node = tree
    for (const key of path.split('.')) {
      if (!node.has(key)) node.set(key, new Map())
      node = node.get(key)!
    }
  }
  const render = (node: Tree): string =>
    [...node.entries()]
      .map(([key, children]) => (children.size ? `${key}{${render(children)}}` : key))
      .join(', ')
  return render(tree)
}

/**
 * Every document of one type that can own or reserve a slug. Run it with the `raw`
 * perspective so drafts are included; release versions are left out.
 */
export function getSlugCandidatesQuery(options?: SlugOptions): string {
  const fields = getPathsProjection([
    ...getSourcePaths(options),
    ...getCurrentPaths(options).map((path) => `${path}.current`),
    'seo.url.current',
  ])
  return `*[
  _type == $type &&
  !(_id in path("versions.**"))
]{
  _id,
  _createdAt,
  _type,
  ${fields}
}`
}

/** `getSlugCandidatesQuery()` with the default slug fields. */
export const SLUG_CANDIDATES_QUERY = getSlugCandidatesQuery()

/** A URL handle: lowercase letters and digits in hyphen-separated groups. */
export const URL_HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidUrlHandle(value: unknown): value is string {
  return typeof value === 'string' && URL_HANDLE_PATTERN.test(value)
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The text a document's slug is derived from: the first `source` field with text. */
export function getSlugSourceText(
  document: SlugDocument | null | undefined,
  options?: SlugOptions,
): string {
  if (!document) return ''
  for (const path of getSourcePaths(options)) {
    const text = toPlainText(getPathValue(document, path))
    if (text) return text
  }
  return ''
}

/** The slug a document's title would produce, before duplicates are resolved. */
export function getTitleSlug(
  document: SlugDocument | null | undefined,
  options?: SlugOptions,
): string {
  return slugify(getSlugSourceText(document, options))
}

/** The slug a document already owns: `seo.url`, then each `current` field. */
export function getDocumentSlug(
  document: SlugDocument | null | undefined,
  options?: SlugOptions,
): string {
  if (!document) return ''
  return getOwnedSlugs(document, options)[0] ?? ''
}

export function getSlugCurrent(value: unknown): string {
  if (!value || typeof value !== 'object' || !('current' in value)) return ''
  const current = (value as {current?: unknown}).current
  return typeof current === 'string' ? current : ''
}

/** Draft, published and release versions of a document share one canonical id. */
export function getCanonicalDocumentId(id: unknown): string {
  if (typeof id !== 'string') return ''
  return id.replace(/^drafts\./, '').replace(/^versions\.[^.]+\./, '')
}

/**
 * The slug `currentDocument` owns, or the one it would be given. `documents` is the result
 * of `SLUG_CANDIDATES_QUERY` for its type. An explicit slug always wins. Otherwise documents
 * with the same title slug take `base`, `base-2`, `base-3`... in creation order,
 * skipping slugs other documents already own.
 */
export function resolveAvailableSlug(
  currentDocument: SlugDocument,
  documents: SlugDocument[],
  options?: SlugOptions,
): string {
  const currentKey = getCanonicalDocumentId(currentDocument._id)
  const documentsByKey = new Map<string, SlugDocument>()

  // Later copies win: published, then draft, then the copy being resolved.
  const copies = [
    ...documents.filter((document) => !isDraft(document)),
    ...documents.filter(isDraft),
    currentDocument,
  ]

  for (const document of copies) {
    const key = getCanonicalDocumentId(document._id)
    if (!key) continue
    documentsByKey.set(key, mergeCandidateDocuments(documentsByKey.get(key), document))
  }

  const mergedDocuments = [...documentsByKey.values()]
  const current = (currentKey && documentsByKey.get(currentKey)) || currentDocument
  const explicitSlug = getDocumentSlug(current, options)

  if (explicitSlug) return explicitSlug

  const titleSlug = getTitleSlug(current, options)

  if (!titleSlug) return ''

  const usedSlugs = new Set(
    mergedDocuments
      .filter((document) => getCanonicalDocumentId(document._id) !== currentKey)
      .flatMap((document) => getOwnedSlugs(document, options)),
  )

  const implicitDocuments = mergedDocuments
    .filter(
      (document) =>
        !getDocumentSlug(document, options) && getTitleSlug(document, options) === titleSlug,
    )
    .sort(compareCandidateDocuments)

  for (const document of implicitDocuments) {
    const candidate = getNumberedCandidate(titleSlug, usedSlugs)
    if (getCanonicalDocumentId(document._id) === currentKey) return candidate
    usedSlugs.add(candidate)
  }

  return getNumberedCandidate(titleSlug, usedSlugs)
}

/**
 * Whether another document of the same type already owns `slug` under any of the slug
 * fields. `documents` is the result of `SLUG_CANDIDATES_QUERY`.
 */
export function isSlugTaken(
  slug: string,
  currentDocument: SlugDocument,
  documents: SlugDocument[],
  options?: SlugOptions,
): boolean {
  const currentKey = getCanonicalDocumentId(currentDocument._id)

  return documents.some(
    (document) =>
      getCanonicalDocumentId(document._id) !== currentKey &&
      getOwnedSlugs(document, options).includes(slug),
  )
}

/** Every slug a document holds, so a handle never collides with a routing slug either. */
function getOwnedSlugs(document: SlugDocument, options?: SlugOptions): string[] {
  return [
    getSlugCurrent(document.seo?.url),
    ...getCurrentPaths(options).map((path) => getSlugCurrent(getPathValue(document, path))),
  ].filter(Boolean)
}

/** `store.slug.current` on a plain object. Arrays are indexed by number: `images.0`. */
export function getPathValue(document: unknown, path: string): unknown {
  let value: unknown = document
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

function getNumberedCandidate(base: string, usedSlugs: Set<string>): string {
  if (!usedSlugs.has(base)) return base

  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`
    if (!usedSlugs.has(candidate)) return candidate
  }
}

function isDraft(document: SlugDocument): boolean {
  return typeof document._id === 'string' && document._id.startsWith('drafts.')
}

/** Fold two copies of one document together; `incoming` wins where both have a value. */
function mergeCandidateDocuments(
  existing: SlugDocument | undefined,
  incoming: SlugDocument,
): SlugDocument {
  if (!existing) return incoming

  // Each field: the incoming copy's value when it has one. Objects (`store`) are merged.
  const merged: SlugDocument = {...existing}
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null || value === '') continue
    const previous = existing[key]
    merged[key] =
      isPlainObject(value) && isPlainObject(previous) && key !== 'seo' && key !== 'slug'
        ? {...previous, ...value}
        : value
  }
  merged._createdAt = getEarlierDate(existing._createdAt, incoming._createdAt)
  return merged
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function compareCandidateDocuments(a: SlugDocument, b: SlugDocument): number {
  const dateComparison = compareStrings(toSortableDate(a._createdAt), toSortableDate(b._createdAt))
  if (dateComparison !== 0) return dateComparison
  return compareStrings(getCanonicalDocumentId(a._id), getCanonicalDocumentId(b._id))
}

/** Code-unit order, so the Studio and a server runtime sort identically in any locale. */
function compareStrings(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/** A document without `_createdAt` has not been saved yet, so it sorts last. */
function toSortableDate(value: unknown): string {
  return typeof value === 'string' && value ? value : '9999'
}

function getEarlierDate(a: unknown, b: unknown): string | undefined {
  const first = typeof a === 'string' && a ? a : undefined
  const second = typeof b === 'string' && b ? b : undefined
  if (!first || !second) return first || second
  return first <= second ? first : second
}

function toPlainText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
