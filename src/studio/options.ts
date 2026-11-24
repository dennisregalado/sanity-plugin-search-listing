import type {SlugOptions} from '../resolveSlug'

/** The `seo` field's options with their defaults applied. */
export type ResolvedFieldOptions = {
  home: boolean
  /** Whether the document has a URL handle of its own (not `home`, not `handle: false`). */
  hasHandle: boolean
  maxLength: {title: number; description: number}
  slug: SlugOptions | undefined
  price: {path: string; currency: string} | undefined
}

export function resolveFieldOptions(options: Record<string, unknown>): ResolvedFieldOptions {
  const home = options.home === true
  const maxLength = isRecord(options.maxLength) ? options.maxLength : {}
  const preview = isRecord(options.preview) ? options.preview : {}
  const positive = (value: unknown, fallback: number) =>
    typeof value === 'number' && value > 0 ? value : fallback

  return {
    home,
    hasHandle: !home && options.handle !== false,
    maxLength: {
      title: positive(maxLength.title, 70),
      description: positive(maxLength.description, home ? 320 : 160),
    },
    slug: isRecord(options.slug) ? (options.slug as SlugOptions) : undefined,
    price: getPriceOption(preview.price),
  }
}

export function getPriceOption(price: unknown): ResolvedFieldOptions['price'] {
  if (typeof price === 'string') return {path: price, currency: 'USD'}
  if (!isRecord(price) || typeof price.path !== 'string') return undefined
  return {path: price.path, currency: typeof price.currency === 'string' ? price.currency : 'USD'}
}

/** The `seo` field's options, from validation: its document type's schema has them. */
export function getValidationFieldOptions(context: {
  document?: {_type?: unknown} | null
  path?: unknown[]
  schema?: {get?: (typeName: string) => unknown}
}): ResolvedFieldOptions {
  const documentType = context.document?._type
  const fieldName = context.path?.find((segment) => typeof segment === 'string')
  if (typeof documentType !== 'string' || typeof fieldName !== 'string') {
    return resolveFieldOptions({})
  }
  const field = getSchemaFields(context.schema?.get?.(documentType)).find(
    (candidate) => candidate?.name === fieldName,
  )
  const options = field?.options ?? field?.type?.options
  return resolveFieldOptions(isRecord(options) ? options : {})
}

/** The `options` of the `seo` field: from the field's own type, or the document schema. */
/** Keys of `SearchListingFieldOptions`, to tell the field's own options from the type's. */
export const FIELD_OPTION_KEYS = [
  'pathPrefix',
  'siteUrl',
  'handle',
  'fallbacks',
  'home',
  'maxLength',
  'slug',
  'preview',
]

export function getFieldOptions(
  props: {schemaType?: {options?: unknown}; path: readonly unknown[]},
  schema: {get?: (typeName: string) => unknown},
  documentType: unknown,
): Record<string, unknown> {
  const ownOptions = props.schemaType?.options

  if (isRecord(ownOptions) && FIELD_OPTION_KEYS.some((key) => key in ownOptions)) {
    return ownOptions
  }

  const fieldName = props.path.find((segment) => typeof segment === 'string')

  if (typeof documentType !== 'string' || typeof fieldName !== 'string') {
    return {}
  }

  const field = getSchemaFields(schema.get?.(documentType)).find(
    (candidate) => candidate?.name === fieldName,
  )
  const fieldOptions = field?.options ?? field?.type?.options

  return isRecord(fieldOptions) ? fieldOptions : {}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

export function getPathPrefixFromOptions(options: unknown) {
  if (!options || typeof options !== 'object' || !('pathPrefix' in options)) {
    return ''
  }
  const pathPrefix = (options as {pathPrefix?: unknown}).pathPrefix
  return typeof pathPrefix === 'string' ? normalizePathPrefix(pathPrefix) : ''
}

export function getSchemaFields(schemaType: unknown) {
  if (!schemaType || typeof schemaType !== 'object' || !('fields' in schemaType)) {
    return []
  }

  const fields = (schemaType as {fields?: unknown}).fields
  return Array.isArray(fields)
    ? (fields as {name?: unknown; options?: unknown; type?: {options?: unknown}}[])
    : []
}

function normalizePathPrefix(pathPrefix: unknown) {
  if (typeof pathPrefix !== 'string') {
    return '/'
  }

  const trimmed = pathPrefix.trim()
  return trimmed || '/'
}
