# Slug Function Logic

This note documents the slug allocation logic that should be reused by a future Sanity Function so the saved slug matches the Studio preview from `sanity-plugin-search-listing`.

## Goal

When a document has no explicit URL handle, document slug, or storefront slug, derive a visual slug from its title. If another document already owns that slug, or another unslugged document would receive it first, append `-copy` and then numbered copies.

Example for duplicate pages titled `Very cool function`:

1. `very-cool-function`
2. `very-cool-function-copy`
3. `very-cool-function-copy-2`
4. `very-cool-function-copy-3`

## Rules

- Explicit slugs always win:
  - `seo.url.current`
  - `slug.current`
  - `store.slug.current`
- Draft and published versions of the same document are one logical document.
- Ignore Sanity release/version documents under `versions.*`.
- If a document has no explicit slug, derive its base from `title` or `store.title`.
- For unslugged documents with the same derived base, sort by `_createdAt`, then canonical document id.
- The first unslugged document gets the base slug unless an explicit slug already uses it.
- The next unslugged documents get `-copy`, then `-copy-2`, and so on.

## GROQ

Fetch same-type documents and resolve the slug in JavaScript. This keeps slugification identical between Studio preview and the write function.

```ts
const SLUG_CANDIDATES_QUERY = `*[
  _type == $type &&
  !(_id in path("versions.**"))
]{
  _id,
  _createdAt,
  _type,
  title,
  slug{current},
  store{title, slug{current}},
  seo{url{current}}
}`
```

## Resolver

```ts
type SlugDocument = {
  _createdAt?: string
  _id?: string
  _type?: string
  title?: unknown
  slug?: {current?: unknown} | null
  store?: {
    title?: unknown
    slug?: {current?: unknown} | null
  } | null
  seo?: {
    url?: {current?: unknown} | null
  } | null
}

function resolveAvailableSlug(currentDocument: SlugDocument, documents: SlugDocument[]) {
  const currentKey = getCanonicalDocumentId(currentDocument._id)
  const currentTitleSlug = slugify(
    getFieldText(currentDocument.title || currentDocument.store?.title),
  )

  if (!currentTitleSlug) return ''

  const documentsByKey = new Map<string, SlugDocument>()

  for (const document of [...documents, currentDocument]) {
    const key = getCanonicalDocumentId(document._id)
    if (!key) continue

    const existing = documentsByKey.get(key)
    documentsByKey.set(key, mergeCandidateDocuments(existing, document, key === currentKey))
  }

  const mergedDocuments = [...documentsByKey.values()]
  const currentMergedDocument = currentKey ? documentsByKey.get(currentKey) : currentDocument
  const currentExplicitSlug = getDocumentSlug(currentMergedDocument || currentDocument)

  if (currentExplicitSlug) return currentExplicitSlug

  const usedSlugs = new Set(
    mergedDocuments
      .filter((document) => getCanonicalDocumentId(document._id) !== currentKey)
      .map(getDocumentSlug)
      .filter(Boolean),
  )

  const implicitDocuments = mergedDocuments
    .filter((document) => !getDocumentSlug(document))
    .filter(
      (document) =>
        slugify(getFieldText(document.title || document.store?.title)) === currentTitleSlug,
    )
    .sort(compareCandidateDocuments)

  for (const document of implicitDocuments) {
    const candidate = getCopyCandidate(currentTitleSlug, usedSlugs)
    const key = getCanonicalDocumentId(document._id)

    if (key === currentKey) return candidate

    usedSlugs.add(candidate)
  }

  return getCopyCandidate(currentTitleSlug, usedSlugs)
}

function getCopyCandidate(base: string, usedSlugs: Set<string>) {
  if (!usedSlugs.has(base)) return base

  for (let index = 1; index < 10000; index += 1) {
    const candidate = index === 1 ? `${base}-copy` : `${base}-copy-${index}`
    if (!usedSlugs.has(candidate)) return candidate
  }

  return `${base}-copy`
}

function getDocumentSlug(document: SlugDocument | undefined) {
  if (!document) return ''
  return getSlugCurrent(document.seo?.url || document.slug || document.store?.slug)
}

function getSlugCurrent(value: unknown) {
  if (!value || typeof value !== 'object' || !('current' in value)) return ''
  const current = (value as {current?: unknown}).current
  return typeof current === 'string' ? current : ''
}

function getCanonicalDocumentId(id: unknown) {
  if (typeof id !== 'string') return ''
  return id.replace(/^drafts\./, '').replace(/^versions\.[^.]+\./, '')
}

function compareCandidateDocuments(a: SlugDocument, b: SlugDocument) {
  const dateComparison = String(a._createdAt || '').localeCompare(String(b._createdAt || ''))
  if (dateComparison !== 0) return dateComparison
  return getCanonicalDocumentId(a._id).localeCompare(getCanonicalDocumentId(b._id))
}

function mergeCandidateDocuments(
  existing: SlugDocument | undefined,
  incoming: SlugDocument,
  preferIncoming: boolean,
) {
  if (!existing) return incoming

  return {
    ...existing,
    ...incoming,
    _createdAt: getEarlierDate(existing._createdAt, incoming._createdAt),
    seo: preferIncoming ? incoming.seo || existing.seo : existing.seo || incoming.seo,
    slug: preferIncoming ? incoming.slug || existing.slug : existing.slug || incoming.slug,
    store: preferIncoming
      ? {...existing.store, ...incoming.store}
      : {...incoming.store, ...existing.store},
    title: preferIncoming ? incoming.title || existing.title : existing.title || incoming.title,
  }
}

function getEarlierDate(a: unknown, b: unknown) {
  if (typeof a !== 'string') return typeof b === 'string' ? b : undefined
  if (typeof b !== 'string') return a
  return a.localeCompare(b) <= 0 ? a : b
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getFieldText(value: unknown) {
  if (typeof value === 'string')
    return value
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  return ''
}
```

## Function flow

```ts
export async function resolveSlugForDocument(document: SlugDocument, getClient: Function) {
  const client = getClient({apiVersion: '2025-02-19'})
  const documents = await client.fetch<SlugDocument[]>(SLUG_CANDIDATES_QUERY, {
    type: document._type,
  })

  return resolveAvailableSlug(document, documents)
}
```
