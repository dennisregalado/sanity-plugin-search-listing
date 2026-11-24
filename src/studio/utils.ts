import {isRecord} from './options'

export function hasImage(value: Record<string, unknown> | undefined) {
  const image = value?.image
  return Boolean(image && typeof image === 'object' && 'asset' in image && image.asset)
}

/**
 * `text` cut at a word to fit `maxLength`, with `ellipsis` after it, as search engines and the
 * listing preview show it.
 */
export function clipText(text: string, maxLength: number, ellipsis = '…'): string {
  if (text.length <= maxLength) return text
  const room = Math.max(0, maxLength - ellipsis.length)
  const cut = text.slice(0, room)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > room * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}${ellipsis}`
}

/** A copy of `target` with `value` at the dot path `path`. */
export function setPathValue(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const [key, ...rest] = path.split('.')
  if (!rest.length) return {...target, [key]: value}
  const child = isRecord(target[key]) ? target[key] : {}
  return {...target, [key]: setPathValue(child, rest.join('.'), value)}
}

export function getFieldText(value: unknown) {
  if (typeof value === 'string') {
    return stripHtml(value)
  }

  if (Array.isArray(value)) {
    return portableTextToPlainText(value)
  }

  return ''
}

/**
 * `value` as a price in `currency`, in the Studio's `locale` and the currency's usual format
 * ("$1,299.00", as search results show it), or `undefined` for a missing, zero or negative
 * amount or an unknown currency. A malformed locale falls back to `en-US`.
 */
export function getPricePreview(value: unknown, currency: string, locale = 'en-US') {
  const amount = typeof value === 'string' && value.trim() ? Number(value) : value
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return undefined
  }

  const format = (tag: string) =>
    new Intl.NumberFormat(tag, {style: 'currency', currency}).format(amount)
  try {
    return format(locale)
  } catch {
    // A malformed locale tag or an unknown currency code; only the first is worth a retry.
    try {
      return format('en-US')
    } catch {
      return undefined
    }
  }
}

export function portableTextToPlainText(value: unknown[]) {
  return value
    .map((block) => {
      if (!block || typeof block !== 'object' || !('children' in block)) {
        return ''
      }

      const children = (block as {children?: unknown}).children

      if (!Array.isArray(children)) {
        return ''
      }

      return children
        .map((child) => {
          if (!child || typeof child !== 'object' || !('text' in child)) {
            return ''
          }

          const text = (child as {text?: unknown}).text
          return typeof text === 'string' ? text : ''
        })
        .join('')
    })
    .filter(Boolean)
    .join('\n\n')
}

export function stripHtml(value: string) {
  if (typeof DOMParser === 'undefined') {
    return value
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const document = new DOMParser().parseFromString(value, 'text/html')
  return document.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

/**
 * The stand-in image value for a fallback that is a Sanity image (an image object or an image
 * asset), or `undefined` for anything the image input cannot show, such as a URL.
 */
export function getFallbackImageValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const asset =
    record.asset && typeof record.asset === 'object'
      ? (record.asset as Record<string, unknown>)
      : record
  const id = [asset._ref, asset._id].find((candidate) => typeof candidate === 'string')
  if (typeof id !== 'string' || !id.startsWith('image-')) return undefined

  return {
    _type: 'image',
    asset: {_type: 'reference', _ref: id},
    ...(record.crop ? {crop: record.crop} : {}),
    ...(record.hotspot ? {hotspot: record.hotspot} : {}),
  }
}

export function getImageOnlyValue(value: Record<string, unknown> | undefined) {
  if (!value || !('image' in value)) {
    return undefined
  }

  return {image: value.image}
}

/** The URL line under the URL handle input: site URL, route and handle. */
export function getUrlPreview(slug: string | undefined, pathPrefix = '/', siteUrl = getHost()) {
  const path = getPathBreadcrumbSegments(pathPrefix, slug).join('/')
  return [siteUrl, path].filter(Boolean).join('/')
}

export function getPathBreadcrumbSegments(pathPrefix: string, slug: string | undefined) {
  return [...getPathSegments(pathPrefix), ...getPathSegments(slug)].filter(Boolean)
}

export function getPathSegments(path: string | undefined) {
  if (!path) {
    return []
  }

  const parsedPath = parsePathname(path)

  return parsedPath
    .split('/')
    .map((segment) => decodeSegment(segment).trim())
    .filter(Boolean)
}

/** A path segment as typed: `Join%20Us!` (how URL parsing encodes it) shows as `Join Us!`. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Any base works: only the pathname is read, so a full URL's own host is dropped. */
const PATHNAME_BASE = 'https://search-listing.invalid'

/** The pathname of `path`, a path or a full URL, without its query or hash. */
export function parsePathname(path: string) {
  const trimmed = path.trim()

  if (!trimmed) {
    return ''
  }

  try {
    return new URL(trimmed, PATHNAME_BASE).pathname
  } catch {
    return trimmed.split(/[?#]/)[0] || ''
  }
}

/** The Studio's own origin, shown when no `siteUrl` is set. */
export function getHost() {
  return typeof window === 'undefined' ? '' : window.location.origin
}

/**
 * `value` as a site URL to show in the listing: an absolute http(s) URL without a trailing
 * slash, query or hash (`'https://acme.com/'` → `'https://acme.com'`, `'https://acme.com/shop/'`
 * → `'https://acme.com/shop'`), or `undefined` for anything else.
 */
export function normalizeSiteUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return undefined
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return undefined
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

const warnedSiteUrls = new Set<string>()

/**
 * The site URL from a `siteUrl` option, normalized. A value that is set but is not an absolute
 * http(s) URL is ignored, with a console warning (once per value) naming `where` it was set.
 */
export function resolveSiteUrlOption(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const siteUrl = normalizeSiteUrl(value)
  const key = `${where}:${String(value)}`
  if (!siteUrl && !warnedSiteUrls.has(key)) {
    warnedSiteUrls.add(key)
    console.warn(
      `[search-listing] Ignoring ${where} siteUrl ${JSON.stringify(value)}: expected an absolute http(s) URL, such as "https://example.com".`,
    )
  }
  return siteUrl
}
