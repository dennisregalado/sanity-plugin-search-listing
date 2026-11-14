/**
 * Slug allocation shared by the Studio preview and by anything that persists the slug
 * (a Sanity Function, a migration). It has no React or Studio imports, so it is safe to
 * import from `sanity-plugin-search-listing/slug` in a server runtime.
 */

/** The fields of a document the slug rules read. */
export type SlugDocument = {
  _createdAt?: unknown
  _id?: unknown
  _type?: unknown
  title?: unknown
  name?: unknown
  slug?: {current?: unknown} | null
  store?: {
    title?: unknown
    slug?: {current?: unknown} | null
  } | null
  seo?: {
    url?: {current?: unknown} | null
  } | null
}

/**
 * Every document of one type that can own or reserve a slug. Run it with the `raw`
 * perspective so drafts are included; release versions are left out.
 */
export const SLUG_CANDIDATES_QUERY = `*[
  _type == $type &&
  !(_id in path("versions.**"))
]{
  _id,
  _createdAt,
  _type,
  title,
  name,
  slug{current},
  store{title, slug{current}},
  seo{url{current}}
}`

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

/** The text a document's slug is derived from: `title`, then `name`, then `store.title`. */
export function getSlugSourceText(document: SlugDocument | null | undefined): string {
  if (!document) return ''
  return (
    toPlainText(document.title) || toPlainText(document.name) || toPlainText(document.store?.title)
  )
}

/** The slug a document's title would produce, before duplicates are resolved. */
export function getTitleSlug(document: SlugDocument | null | undefined): string {
  return slugify(getSlugSourceText(document))
}

/** The slug a document already owns: `seo.url`, then `slug`, then `store.slug`. */
export function getDocumentSlug(document: SlugDocument | null | undefined): string {
  if (!document) return ''
  return (
    getSlugCurrent(document.seo?.url) ||
    getSlugCurrent(document.slug) ||
    getSlugCurrent(document.store?.slug)
  )
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
 * with the same title slug take `base`, `base-copy`, `base-copy-2`... in creation order,
 * skipping slugs other documents already own.
 */
export function resolveAvailableSlug(
  currentDocument: SlugDocument,
  documents: SlugDocument[],
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
  const explicitSlug = getDocumentSlug(current)

  if (explicitSlug) return explicitSlug

  const titleSlug = getTitleSlug(current)

  if (!titleSlug) return ''

  const usedSlugs = new Set(
    mergedDocuments
      .filter((document) => getCanonicalDocumentId(document._id) !== currentKey)
      .flatMap(getOwnedSlugs),
  )

  const implicitDocuments = mergedDocuments
    .filter((document) => !getDocumentSlug(document) && getTitleSlug(document) === titleSlug)
    .sort(compareCandidateDocuments)

  for (const document of implicitDocuments) {
    const candidate = getCopyCandidate(titleSlug, usedSlugs)
    if (getCanonicalDocumentId(document._id) === currentKey) return candidate
    usedSlugs.add(candidate)
  }

  return getCopyCandidate(titleSlug, usedSlugs)
}

/**
 * Whether another document of the same type already owns `slug` under any of the slug
 * fields. `documents` is the result of `SLUG_CANDIDATES_QUERY`.
 */
export function isSlugTaken(
  slug: string,
  currentDocument: SlugDocument,
  documents: SlugDocument[],
): boolean {
  const currentKey = getCanonicalDocumentId(currentDocument._id)

  return documents.some(
    (document) =>
      getCanonicalDocumentId(document._id) !== currentKey && getOwnedSlugs(document).includes(slug),
  )
}

/** Every slug a document holds, so a handle never collides with a routing slug either. */
function getOwnedSlugs(document: SlugDocument): string[] {
  return [
    getSlugCurrent(document.seo?.url),
    getSlugCurrent(document.slug),
    getSlugCurrent(document.store?.slug),
  ].filter(Boolean)
}

function getCopyCandidate(base: string, usedSlugs: Set<string>): string {
  if (!usedSlugs.has(base)) return base

  for (let index = 1; ; index += 1) {
    const candidate = index === 1 ? `${base}-copy` : `${base}-copy-${index}`
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

  return {
    ...existing,
    ...incoming,
    _createdAt: getEarlierDate(existing._createdAt, incoming._createdAt),
    seo: incoming.seo || existing.seo,
    slug: incoming.slug || existing.slug,
    store: incoming.store || existing.store ? {...existing.store, ...incoming.store} : undefined,
    title: incoming.title || existing.title,
    name: incoming.name || existing.name,
  }
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
