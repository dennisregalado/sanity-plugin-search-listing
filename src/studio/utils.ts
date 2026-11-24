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

export function getPricePreview(value: unknown, currency: string) {
  const amount = typeof value === 'string' ? Number(value) : value
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return undefined
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
    }).format(amount)
  } catch {
    // An unknown currency code.
    return undefined
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

export function getUrlPreview(slug: string | undefined, pathPrefix = '/') {
  const path = getPathBreadcrumbSegments(pathPrefix, slug).join('/')
  return [getHost(), path].filter(Boolean).join('/')
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
    .map((segment) => segment.trim())
    .filter(Boolean)
}

export function parsePathname(path: string) {
  const trimmed = path.trim()

  if (!trimmed) {
    return ''
  }

  try {
    return new URL(trimmed, getHost()).pathname
  } catch {
    return trimmed.split(/[?#]/)[0] || ''
  }
}

export function getHost() {
  return typeof window === 'undefined' ? '' : window.location.origin
}
