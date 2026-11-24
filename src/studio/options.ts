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

/**
 * The parts of a compiled schema type the resolver reads. A field's type is a subtype of its
 * named type (`type`), which is a subtype of `seo`, and so on down to `object`.
 */
export type SchemaTypeLike = {
  name?: unknown
  jsonType?: unknown
  type?: SchemaTypeLike
  options?: unknown
  fields?: {name?: unknown; type?: SchemaTypeLike}[]
  of?: SchemaTypeLike[]
}

/** A segment of a Studio path: a field name, an array index, or an array item's `_key`. */
type PathSegment = unknown

/** Whether `type` is the `seo` type or a subtype of it, such as `productSeo`. */
export function isSeoType(type: unknown): type is SchemaTypeLike {
  for (let current = asSchemaType(type); current; current = asSchemaType(current.type)) {
    if (current.name === 'seo') return true
  }
  return false
}

/**
 * The options of an `seo` field's type, merged down its type chain: the named subtype's
 * (`defineType({name: 'productSeo', type: 'seo', options})`), then the field's own on top.
 * Shallow: a field that sets `maxLength` replaces the subtype's `maxLength`.
 */
export function getSeoTypeOptions(type: unknown): Record<string, unknown> {
  const chain: Record<string, unknown>[] = []
  for (let current = asSchemaType(type); current; current = asSchemaType(current.type)) {
    if (isRecord(current.options)) chain.unshift(current.options)
  }
  return Object.assign({}, ...chain)
}

/**
 * The `seo` type at `path`, walking from `rootType` (a document type) through object fields
 * and array items. The walk stops at the first `seo` type, so a path into it (`seo.title`)
 * finds it too. `document` picks the member type of an array item by its `_type`; without it
 * an array of several member types cannot be walked.
 */
export function findSeoTypeAtPath(
  rootType: unknown,
  path: readonly PathSegment[] | undefined,
  document?: unknown,
): SchemaTypeLike | undefined {
  let type = asSchemaType(rootType)
  let value: unknown = document

  for (const segment of path ?? []) {
    if (!type || isSeoType(type)) break

    if (typeof segment === 'string') {
      const field = getFields(type).find((candidate) => candidate.name === segment)
      type = asSchemaType(field?.type)
      value = isRecord(value) ? value[segment] : undefined
      continue
    }

    const members = getArrayMembers(type)
    if (!members) return undefined
    const item = getArrayItem(value, segment)
    const itemType = isRecord(item) ? item._type : undefined
    type =
      members.find((member) => itemType !== undefined && member.name === itemType) ??
      (members.length === 1 ? members[0] : undefined)
    value = item
  }

  return isSeoType(type) ? type : undefined
}

/** The `seo` field's options at `path` in a document of `documentType`, or `{}`. */
export function getSeoOptionsAtPath(input: {
  schema?: {get?: (typeName: string) => unknown}
  documentType: unknown
  path: readonly PathSegment[] | undefined
  document?: unknown
  /** The `seo` type to use when the path cannot be walked, such as an input's `schemaType`. */
  fallbackType?: unknown
}): Record<string, unknown> {
  const rootType =
    typeof input.documentType === 'string' ? input.schema?.get?.(input.documentType) : undefined
  const type =
    findSeoTypeAtPath(rootType, input.path, input.document) ??
    (isSeoType(input.fallbackType) ? input.fallbackType : undefined)
  return type ? getSeoTypeOptions(type) : {}
}

/** The `seo` field's options, from validation: walks its document type's schema to the field. */
export function getValidationFieldOptions(context: {
  document?: {_type?: unknown} | null
  path?: unknown[]
  schema?: {get?: (typeName: string) => unknown}
}): ResolvedFieldOptions {
  return resolveFieldOptions(
    getSeoOptionsAtPath({
      schema: context.schema,
      documentType: context.document?._type,
      path: context.path,
      document: context.document,
    }),
  )
}

/**
 * The `options` of the `seo` field an input renders: the same walk as validation, so both
 * agree, falling back to the input's own `schemaType`.
 */
export function getFieldOptions(
  props: {schemaType?: unknown; path: readonly unknown[]},
  schema: {get?: (typeName: string) => unknown},
  documentType: unknown,
  document?: unknown,
): Record<string, unknown> {
  return getSeoOptionsAtPath({
    schema,
    documentType,
    path: props.path,
    document,
    fallbackType: props.schemaType,
  })
}

function asSchemaType(value: unknown): SchemaTypeLike | undefined {
  return isRecord(value) ? (value as SchemaTypeLike) : undefined
}

function getFields(type: SchemaTypeLike): {name?: unknown; type?: SchemaTypeLike}[] {
  return Array.isArray(type.fields) ? type.fields : []
}

function getArrayMembers(type: SchemaTypeLike): SchemaTypeLike[] | undefined {
  return Array.isArray(type.of) ? type.of : undefined
}

/** An array item by `{_key}` segment or index. */
function getArrayItem(value: unknown, segment: PathSegment): unknown {
  if (!Array.isArray(value)) return undefined
  if (typeof segment === 'number') return value[segment]
  if (isRecord(segment) && typeof segment._key === 'string') {
    return value.find((item) => isRecord(item) && item._key === segment._key)
  }
  return undefined
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

function normalizePathPrefix(pathPrefix: unknown) {
  if (typeof pathPrefix !== 'string') {
    return '/'
  }

  const trimmed = pathPrefix.trim()
  return trimmed || '/'
}

/**
 * Names of the document's top-level fields of type `seo` or a subtype of it (`productSeo`),
 * whose URL handle the duplicate guard leaves out.
 */
export function getSeoFieldNames(schemaType: unknown): string[] {
  const fields = (schemaType as {fields?: Array<{name: string; type?: unknown}>})?.fields
  if (!Array.isArray(fields)) return []
  return fields.filter((field) => isSeoType(field.type)).map((field) => field.name)
}
