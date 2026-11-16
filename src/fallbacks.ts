import type {
  SearchListingFallbacks,
  SearchListingFallbackSource,
  SearchListingFallbackValue,
} from './types'

export type FallbackField = keyof SearchListingFallbacks

export const FALLBACK_FIELDS: FallbackField[] = ['image', 'title', 'description']

/** A fallback source in one shape: read a document path, or run a query. */
export type NormalizedSource =
  | {kind: 'path'; path: string; label?: string}
  | {kind: 'query'; query: string; params: Record<string, string>; label?: string}

/** Read from the document itself when a field sets no `fallbacks` of its own. */
export const DEFAULT_FIELD_FALLBACKS: Required<SearchListingFallbacks> = {
  image: [],
  title: ['title', 'name', 'store.title'],
  description: ['description', 'store.descriptionHtml', 'body'],
}

/**
 * The sources for one field, in the order they are tried: the field's own `fallbacks`
 * (or the document defaults when it sets none for this field), then the plugin's.
 */
export function getFallbackSources(
  field: FallbackField,
  fieldFallbacks: SearchListingFallbacks | undefined,
  pluginFallbacks: SearchListingFallbacks | undefined,
): NormalizedSource[] {
  const own =
    fieldFallbacks && field in fieldFallbacks
      ? fieldFallbacks[field]
      : DEFAULT_FIELD_FALLBACKS[field]

  return [...toArray(own), ...toArray(pluginFallbacks?.[field])].flatMap(normalizeSource)
}

export function normalizeSource(source: SearchListingFallbackSource): NormalizedSource[] {
  if (typeof source === 'string') {
    return source.trim() ? [{kind: 'path', path: source.trim()}] : []
  }

  if (!source || typeof source !== 'object') return []

  if ('path' in source && typeof source.path === 'string' && source.path.trim()) {
    return [{kind: 'path', path: source.path.trim(), label: source.label}]
  }

  if ('query' in source && typeof source.query === 'string' && source.query.trim()) {
    return [{kind: 'query', query: source.query, params: source.params ?? {}, label: source.label}]
  }

  return []
}

/** A stable key for a query source, so one subscription serves every field that uses it. */
export function getQueryKey(source: Extract<NormalizedSource, {kind: 'query'}>): string {
  return JSON.stringify([source.query, source.params])
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

/** Whether a fallback value is worth showing. */
export function hasFallbackValue(value: unknown): value is SearchListingFallbackValue {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).some((key) => key !== '_type')
  return false
}

/**
 * The first source with a value. `queryResults` holds the results of the query sources by
 * `getQueryKey`; a query still loading is skipped so later sources can show meanwhile.
 */
export function resolveFallback(
  sources: NormalizedSource[],
  document: unknown,
  queryResults: ReadonlyMap<string, unknown>,
): {value: SearchListingFallbackValue; source: NormalizedSource} | undefined {
  for (const source of sources) {
    const value =
      source.kind === 'path'
        ? getPathValue(document, source.path)
        : queryResults.get(getQueryKey(source))

    if (hasFallbackValue(value)) return {value, source}
  }

  return undefined
}

/**
 * A URL for an image fallback: a URL string, an asset with a `url`, or a Sanity image
 * object whose `asset._ref` points at an image in this project.
 */
export function getImageUrl(
  value: unknown,
  project: {projectId?: string; dataset?: string},
  width = 1200,
): string | undefined {
  if (typeof value === 'string') {
    return /^(https?:)?\/\//.test(value) || value.startsWith('data:') ? value : undefined
  }

  if (!value || typeof value !== 'object') return undefined

  const record = value as Record<string, unknown>

  if (typeof record.url === 'string') return getImageUrl(record.url, project, width)

  const ref =
    record.asset && typeof record.asset === 'object'
      ? (record.asset as Record<string, unknown>)
      : record

  if (typeof ref.url === 'string') return getImageUrl(ref.url, project, width)

  const id = [ref._ref, ref._id].find((candidate) => typeof candidate === 'string') ?? ''
  const match = /^image-([a-zA-Z0-9]+)-(\d+x\d+)-([a-z0-9]+)$/.exec(String(id))

  if (!match || !project.projectId || !project.dataset) return undefined

  const [, hash, dimensions, format] = match
  return `https://cdn.sanity.io/images/${project.projectId}/${project.dataset}/${hash}-${dimensions}.${format}?w=${width}&fit=max&auto=format`
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * A query that reads a field of one document, `*[_type == "settings"][0].seo.image`, split
 * into the query for that document and the field's path in it, so the Studio can link to the
 * field. `undefined` for any other shape of query.
 */
export function splitDocumentQuery(
  query: string,
): {documentQuery: string; path: string} | undefined {
  const trimmed = query.trim()
  if (!trimmed.startsWith('*')) return undefined

  // The filter: from the first `[` to its matching `]`, skipping brackets inside strings.
  const open = trimmed.indexOf('[')
  if (open < 0 || trimmed.slice(1, open).trim()) return undefined
  let depth = 0
  let quote = ''
  let close = -1
  for (let index = open; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (quote) {
      if (char === '\\') index += 1
      else if (char === quote) quote = ''
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '[') {
      depth += 1
    } else if (char === ']') {
      depth -= 1
      if (depth === 0) {
        close = index
        break
      }
    }
  }
  if (close < 0) return undefined

  // Then an optional `[n]`, and a plain field path.
  const match = /^(\s*\[\s*\d+\s*\])?\s*\.\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)$/.exec(
    trimmed.slice(close + 1),
  )
  if (!match) return undefined
  return {documentQuery: trimmed.slice(0, close + 1) + (match[1]?.trim() ?? ''), path: match[2]}
}
