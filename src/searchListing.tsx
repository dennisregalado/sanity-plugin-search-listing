import { EditIcon } from '@sanity/icons'
import { Box, Button, Stack, Text, Tooltip } from '@sanity/ui'
import React from 'react'
import {
  defineField,
  definePlugin,
  defineType,
  type ObjectFieldProps,
  type ObjectInputProps,
  type ObjectMember,
  type SlugInputProps,
  type StringFieldProps,
  type StringInputProps,
  useClient,
  useFormValue,
  useSchema,
  useWorkspace,
} from 'sanity'

import type { SearchListingPluginOptions } from './types'

type StudioFormDocument = {
  _createdAt?: unknown
  _id?: unknown
  _type?: unknown
  body?: unknown
  description?: unknown
  seo?: {
    description?: unknown
    title?: unknown
    url?: {
      current?: unknown
    } | null
  } | null
  slug?: {
    current?: unknown
  } | null
  store?: {
    descriptionHtml?: unknown
    priceRange?: {
      minVariantPrice?: unknown
    } | null
    slug?: {
      current?: unknown
    } | null
    title?: unknown
  } | null
  title?: unknown
}

type SearchListingInputProps = ObjectInputProps & {
  siteName?: string
}

const SiteNameContext = React.createContext(null as string | null)
const PathPrefixContext = React.createContext('/')
const SlugFallbackContext = React.createContext('')

const SEO_MAX_LENGTH = {
  'Page title': 70,
  'Meta description': 160,
} as const

const CENTRAL_SEO_DESCRIPTION_MAX_LENGTH = 320
const CENTRAL_SEO_DESCRIPTION_PLACEHOLDER =
  'Enter a description to be shown on search engines like Google'
const SEO_STUDIO_FIELD_STYLES = `
[data-testid="field-actions-menu-seo"],
[data-testid="field-actions-menu-seo"] + div {
  transform: translateX(-25px);
}

.seo-image-field div:has(> img[data-testid="hotspot-image-input"]) {
  aspect-ratio: 1200 / 630 !important;
  max-height: min-content !important;
}
`

export const searchListing = definePlugin<SearchListingPluginOptions | void>((options) => {
  const siteName = options?.siteName

  const searchListingType = defineType({
    name: 'seo',
    title: 'Search engine listing',
    type: 'object',
    components: {
      field: SearchListingField,
      input: (props: ObjectInputProps) =>
        React.createElement(SearchListingInput, {
          ...props,
          siteName,
        } as SearchListingInputProps),
    },
    fields: [
      defineField({
        name: 'image',
        title: 'Image',
        type: 'image',
        components: {
          field: (props: ObjectFieldProps) => {
            return <div className="seo-image-field">{props.children}</div>
          },
        },
      }),
      defineField({
        name: 'title',
        title: 'Page title',
        placeholder: 'Enter page title',
        components: {
          field: HomePageTitleField,
          input: PlaceholderInput,
        },
        validation: (rule) =>
          rule
            .max(SEO_MAX_LENGTH['Page title'])
            .warning('Longer titles may be truncated by search engines'),
        type: 'string',
      }),
      defineField({
        name: 'description',
        title: 'Meta description',
        type: 'text',
        components: {
          input: PlaceholderInput,
        },
        rows: 4,
        validation: (rule) =>
          rule
            .custom((value, context) => {
              const documentType = context.document?._type
              const maxLength = isCentralDocumentType(documentType)
                ? CENTRAL_SEO_DESCRIPTION_MAX_LENGTH
                : SEO_MAX_LENGTH['Meta description']

              if (typeof value === 'string' && value.length > maxLength) {
                return 'Longer descriptions may be truncated by search engines'
              }

              return true
            })
            .warning(),
      }),
      defineField({
        name: 'url',
        title: 'URL handle',
        type: 'slug',
        hidden: ({ document }) => {
          return isCentralDocumentType(document?._type)
        },
        components: {
          input: UrlHandleInput,
        },
      }),
    ],
  })

  return {
    name: 'search-listing',
    schema: {
      types: [searchListingType],
    },
  }
})

function SearchListingField(props: ObjectFieldProps) {
  const pathPrefix = getPathPrefixFromOptions(props.schemaType.options) || '/'

  return (
    <PathPrefixContext.Provider value={pathPrefix}>
      {props.renderDefault(props)}
    </PathPrefixContext.Provider>
  )
}

function SearchListingInput(props: SearchListingInputProps) {
  const document = useFormValue([]) as StudioFormDocument
  const schema = useSchema()
  const fieldPathPrefix = React.useContext(PathPrefixContext)
  const pathPrefix =
    getPathPrefixFromInputProps(props, schema, document?._type) || fieldPathPrefix || '/'
  const isCentralDocument = isCentralDocumentType(document?._type)
  const slugFallback = useResolvedSlugFallback(document, { disabled: isCentralDocument })
  const [isEditing, setIsEditing] = React.useState(false)
  const handleEditToggle = React.useCallback(() => {
    setIsEditing((value) => !value)
  }, [])
  const imageMembers = React.useMemo(() => props.members.filter(isImageMember), [props.members])
  const metadataMembers = React.useMemo(
    () => props.members.filter((member) => !isImageMember(member)),
    [props.members],
  )

  return (
    <SiteNameContext.Provider value={props.siteName ?? null}>
      <PathPrefixContext.Provider value={pathPrefix}>
        <SlugFallbackContext.Provider value={slugFallback}>
          <style>{SEO_STUDIO_FIELD_STYLES}</style>
          <Stack gap={5}>
            <Box style={{ position: 'absolute', top: 0, right: 0 }}>
              <Tooltip
                animate
                delay={5}
                placement="top"
                content={
                  <Text size={1} weight="medium">
                    Edit listing
                  </Text>
                }
                portal
              >
                <Button
                  mode="bleed"
                  icon={EditIcon}
                  padding={2}
                  onClick={handleEditToggle}
                  selected={isEditing}
                />
              </Tooltip>
            </Box>
            {props.renderDefault({
              ...props,
              members: imageMembers,
              value: getImageOnlyValue(props.value),
            })}
            <SearchListingPreview />
            {isEditing &&
              props.renderDefault({
                ...props,
                members: metadataMembers,
              })}
          </Stack>
        </SlugFallbackContext.Provider>
      </PathPrefixContext.Provider>
    </SiteNameContext.Provider>
  )
}

function SearchListingPreview() {
  const document = useFormValue([]) as StudioFormDocument
  const workspace = useWorkspace()
  const siteName = React.useContext(SiteNameContext)
  const pathPrefix = React.useContext(PathPrefixContext)
  const isCentralDocument = isCentralDocumentType(document?._type)
  const slugFallback = React.useContext(SlugFallbackContext)
  const pathSegments = isCentralDocument ? [] : getPathBreadcrumbSegments(pathPrefix, slugFallback)

  const title = getFieldText(document?.seo?.title || document?.title || document?.store?.title)
  const descriptionSource =
    document?.seo?.description ||
    document?.description ||
    document?.store?.descriptionHtml ||
    document?.body
  const descriptionText = getFieldText(descriptionSource)
  const description =
    descriptionText.length > SEO_MAX_LENGTH['Meta description']
      ? `${descriptionText.slice(0, SEO_MAX_LENGTH['Meta description'])}...`
      : descriptionText
  const price = getPricePreview(document?.store?.priceRange?.minVariantPrice)

  return (
    <Stack gap={2}>
      <Stack gap={4}>
        <Stack gap={2}>
          <Text>{siteName || workspace.title}</Text>
          <Text size={1} muted>
            {[getHost(), ...pathSegments].filter(Boolean).join(' › ')}
          </Text>
        </Stack>
        {title && (
          <Text size={3} weight="medium" style={{ color: 'var(--card-avatar-blue-bg-color)' }}>
            {title}
          </Text>
        )}
        {description && (
          <Text size={1} muted>
            {description}
          </Text>
        )}
        {price && (
          <Text size={1} muted>
            {price}
          </Text>
        )}
      </Stack>
    </Stack>
  )
}

function HomePageTitleField(props: StringFieldProps) {
  const document = useFormValue([]) as StudioFormDocument
  const title = isCentralDocumentType(document?._type) ? 'Home page title' : props.schemaType.title

  return props.renderDefault({
    ...props,
    title,
  })
}

function PlaceholderInput(props: StringInputProps) {
  const document = useFormValue([]) as StudioFormDocument
  const fieldName = getFieldName(props)
  const isCentralDocument = isCentralDocumentType(document?._type)

  const placeholder = React.useMemo(() => {
    if (fieldName === 'description') {
      if (isCentralDocument) {
        return CENTRAL_SEO_DESCRIPTION_PLACEHOLDER
      }

      return getFieldText(
        document?.description || document?.store?.descriptionHtml || document?.body,
      )
    }

    if (isCentralDocument) {
      return getHost()
    }

    return getFieldText(document?.title || document?.store?.title)
  }, [document, fieldName, isCentralDocument])

  const maxLength = getSeoFieldMaxLength(fieldName, isCentralDocument)

  const count = React.useMemo(() => {
    const value = props.value || (isCentralDocument ? '' : placeholder) || ''
    return value.length
  }, [props.value, placeholder, isCentralDocument])

  const [isEditing, setIsEditing] = React.useState(false)

  const displayValue =
    isEditing && !isCentralDocument ? props.value || placeholder : (props.value ?? '')

  return (
    <Stack gap={2}>
      {props.renderDefault({
        ...props,
        elementProps: {
          ...props.elementProps,
          value: displayValue,
          placeholder: placeholder,
          onFocus: (event) => {
            props.elementProps.onFocus?.(event)
            setIsEditing(true)
          },
          onBlur: (event) => {
            props.elementProps.onBlur?.(event)
            setIsEditing(false)
          },
        },
      })}
      <Text size={1} muted>
        {count} of {maxLength} characters used
      </Text>
    </Stack>
  )
}

function UrlHandleInput(props: SlugInputProps) {
  const pathPrefix = React.useContext(PathPrefixContext)
  const slugFallback = React.useContext(SlugFallbackContext)
  const [isEditing, setIsEditing] = React.useState(false)

  const displayValue = isEditing
    ? props.value?.current || slugFallback
    : (props.value?.current ?? '')
  const previewValue = props.value?.current || slugFallback

  const prefixRef = React.useRef<HTMLDivElement>(null)
  const [prefixWidth, setPrefixWidth] = React.useState(0)

  React.useLayoutEffect(() => {
    if (!prefixRef.current) {
      return undefined
    }

    const updateWidth = () => {
      setPrefixWidth(prefixRef.current?.offsetWidth ?? 0)
    }

    updateWidth()

    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(prefixRef.current)

    return () => resizeObserver.disconnect()
  }, [pathPrefix])

  return (
    <Stack gap={2}>
      <Box style={{ position: 'relative' }}>
        {props.renderDefault({
          ...props,
          elementProps: {
            ...props.elementProps,
            style: {
              ...props.elementProps?.style,
              paddingLeft: prefixWidth + 12.5,
            } as React.CSSProperties,
            value: displayValue,
            placeholder: slugFallback,
            onFocus: (event) => {
              props.elementProps.onFocus?.(event)
              setIsEditing(true)
            },
            onBlur: (event) => {
              props.elementProps.onBlur?.(event)
              setIsEditing(false)
            },
          },
        })}
        <Text
          ref={prefixRef}
          style={{
            color: '#555c75',
            position: 'absolute',
            top: 12,
            left: 12,
            fontSize: 15,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {pathPrefix}
        </Text>
      </Box>
      <Text size={1} muted>
        {getUrlPreview(previewValue, pathPrefix)}
      </Text>
    </Stack>
  )
}

function isImageMember(member: ObjectMember) {
  return member.kind === 'field' && member.name === 'image'
}

function isCentralDocumentType(documentType: unknown) {
  return (
    typeof documentType === 'string' &&
    ['preferences', 'site', 'storefront', 'theme'].includes(documentType)
  )
}

function getSeoFieldMaxLength(fieldName: string, isCentralDocument: boolean) {
  if (fieldName === 'description' && isCentralDocument) {
    return CENTRAL_SEO_DESCRIPTION_MAX_LENGTH
  }

  if (fieldName === 'description') {
    return SEO_MAX_LENGTH['Meta description']
  }

  return SEO_MAX_LENGTH['Page title']
}

function getFieldName(props: StringInputProps) {
  const lastPathSegment = props.path.at(-1)

  if (typeof lastPathSegment === 'string') {
    return lastPathSegment
  }

  if (props.schemaType.title === 'Meta description') {
    return 'description'
  }

  return 'title'
}

function getFieldText(value: unknown) {
  if (typeof value === 'string') {
    return stripHtml(value)
  }

  if (Array.isArray(value)) {
    return portableTextToPlainText(value)
  }

  return ''
}

function getSlugCurrent(value: unknown) {
  if (!value || typeof value !== 'object' || !('current' in value)) {
    return ''
  }

  const current = (value as { current?: unknown }).current
  return typeof current === 'string' ? current : ''
}

type CandidateDocument = StudioFormDocument & {
  _createdAt?: string
  _id?: string
  _type?: string
}

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

function useResolvedSlugFallback(document: StudioFormDocument, options: { disabled?: boolean } = {}) {
  const client = useClient({ apiVersion: '2025-02-19' }).withConfig({
    perspective: 'raw',
    useCdn: false,
  })
  const documentType = typeof document?._type === 'string' ? document._type : ''
  const documentId = typeof document?._id === 'string' ? document._id : ''
  const documentCreatedAt = typeof document?._createdAt === 'string' ? document._createdAt : ''
  const disabled = options.disabled === true
  const title = getFieldText(document?.title || document?.store?.title)
  const explicitSlug = disabled ? '' : getDocumentSlug(document)
  const immediateFallback = disabled ? '' : explicitSlug || slugify(title)
  const lookupKey = `${documentType}:${documentId}:${documentCreatedAt}:${title}:${immediateFallback}`
  const [resolvedSlugFallback, setResolvedSlugFallback] = React.useState({ key: '', value: '' })

  React.useEffect(() => {
    if (disabled || explicitSlug || !documentType || !title) {
      return undefined
    }

    let cancelled = false
    const currentDocument: CandidateDocument = {
      ...document,
      _createdAt: documentCreatedAt,
      _id: documentId,
      _type: documentType,
    }

    client
      .fetch<CandidateDocument[]>(SLUG_CANDIDATES_QUERY, { type: documentType })
      .then((documents) => {
        if (cancelled) {
          return
        }

        setResolvedSlugFallback({
          key: lookupKey,
          value: resolveAvailableSlug(currentDocument, documents),
        })
      })
      .catch(() => {
        // Keep the immediate local fallback when the preview cannot query the dataset.
      })

    return () => {
      cancelled = true
    }
  }, [
    client,
    document,
    documentCreatedAt,
    documentId,
    documentType,
    disabled,
    explicitSlug,
    lookupKey,
    title,
  ])

  return resolvedSlugFallback.key === lookupKey ? resolvedSlugFallback.value : immediateFallback
}

function resolveAvailableSlug(currentDocument: CandidateDocument, documents: CandidateDocument[]) {
  const currentKey = getCanonicalDocumentId(currentDocument._id)
  const currentTitleSlug = slugify(
    getFieldText(currentDocument.title || currentDocument.store?.title),
  )

  if (!currentTitleSlug) {
    return ''
  }

  const documentsByKey = new Map<string, CandidateDocument>()

  for (const document of [...documents, currentDocument]) {
    const key = getCanonicalDocumentId(document._id)

    if (!key) {
      continue
    }

    const existing = documentsByKey.get(key)
    documentsByKey.set(key, mergeCandidateDocuments(existing, document, key === currentKey))
  }

  const mergedDocuments = [...documentsByKey.values()]
  const currentMergedDocument = currentKey ? documentsByKey.get(currentKey) : currentDocument
  const currentExplicitSlug = getDocumentSlug(currentMergedDocument || currentDocument)

  if (currentExplicitSlug) {
    return currentExplicitSlug
  }

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

    if (key === currentKey) {
      return candidate
    }

    usedSlugs.add(candidate)
  }

  return getCopyCandidate(currentTitleSlug, usedSlugs)
}

function mergeCandidateDocuments(
  existing: CandidateDocument | undefined,
  incoming: CandidateDocument,
  preferIncoming: boolean,
) {
  if (!existing) {
    return incoming
  }

  return {
    ...existing,
    ...incoming,
    _createdAt: getEarlierDate(existing._createdAt, incoming._createdAt),
    seo: preferIncoming ? incoming.seo || existing.seo : existing.seo || incoming.seo,
    slug: preferIncoming ? incoming.slug || existing.slug : existing.slug || incoming.slug,
    store: preferIncoming
      ? { ...existing.store, ...incoming.store }
      : { ...incoming.store, ...existing.store },
    title: preferIncoming ? incoming.title || existing.title : existing.title || incoming.title,
  }
}

function getCopyCandidate(base: string, usedSlugs: Set<string>) {
  if (!usedSlugs.has(base)) {
    return base
  }

  for (let index = 1; index < 10000; index += 1) {
    const candidate = index === 1 ? `${base}-copy` : `${base}-copy-${index}`

    if (!usedSlugs.has(candidate)) {
      return candidate
    }
  }

  return `${base}-copy`
}

function getDocumentSlug(document: StudioFormDocument | undefined) {
  if (!document) {
    return ''
  }

  return getSlugCurrent(document.seo?.url || document.slug || document.store?.slug)
}

function getCanonicalDocumentId(id: unknown) {
  if (typeof id !== 'string') {
    return ''
  }

  return id.replace(/^drafts\./, '').replace(/^versions\.[^.]+\./, '')
}

function compareCandidateDocuments(a: CandidateDocument, b: CandidateDocument) {
  const dateComparison = String(a._createdAt || '').localeCompare(String(b._createdAt || ''))

  if (dateComparison !== 0) {
    return dateComparison
  }

  return getCanonicalDocumentId(a._id).localeCompare(getCanonicalDocumentId(b._id))
}

function getEarlierDate(a: unknown, b: unknown) {
  if (typeof a !== 'string') {
    return typeof b === 'string' ? b : undefined
  }

  if (typeof b !== 'string') {
    return a
  }

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

function getPricePreview(value: unknown) {
  if (typeof value !== 'number' || value <= 0) {
    return undefined
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
  }).format(value)
}

function portableTextToPlainText(value: unknown[]) {
  return value
    .map((block) => {
      if (!block || typeof block !== 'object' || !('children' in block)) {
        return ''
      }

      const children = (block as { children?: unknown }).children

      if (!Array.isArray(children)) {
        return ''
      }

      return children
        .map((child) => {
          if (!child || typeof child !== 'object' || !('text' in child)) {
            return ''
          }

          const text = (child as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        })
        .join('')
    })
    .filter(Boolean)
    .join('\n\n')
}

function stripHtml(value: string) {
  if (typeof DOMParser === 'undefined') {
    return value
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const document = new DOMParser().parseFromString(value, 'text/html')
  return document.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function getImageOnlyValue(value: Record<string, unknown> | undefined) {
  if (!value || !('image' in value)) {
    return undefined
  }

  return { image: value.image }
}

function getPathPrefixFromInputProps(
  props: SearchListingInputProps,
  schema: { get?: (typeName: string) => unknown },
  documentType: unknown,
) {
  return (
    getPathPrefixFromOptions(props.schemaType?.options) ||
    getPathPrefixFromDocumentField(schema, documentType, props.path)
  )
}

function getPathPrefixFromDocumentField(
  schema: { get?: (typeName: string) => unknown },
  documentType: unknown,
  path: unknown[],
) {
  const fieldName = path.find((segment) => typeof segment === 'string')

  if (typeof documentType !== 'string' || typeof fieldName !== 'string') {
    return '/'
  }

  const schemaType = schema.get?.(documentType)
  const fields = getSchemaFields(schemaType)
  const field = fields.find((candidate) => candidate?.name === fieldName)
  const options = field?.options

  return getPathPrefixFromOptions(options)
}

function getPathPrefixFromOptions(options: unknown) {
  if (!options || typeof options !== 'object' || !('pathPrefix' in options)) {
    return ''
  }
  const pathPrefix = (options as { pathPrefix?: unknown }).pathPrefix
  return typeof pathPrefix === 'string' ? normalizePathPrefix(pathPrefix) : ''
}

function getSchemaFields(schemaType: unknown) {
  if (!schemaType || typeof schemaType !== 'object' || !('fields' in schemaType)) {
    return []
  }

  const fields = (schemaType as { fields?: unknown }).fields
  return Array.isArray(fields) ? (fields as { name?: unknown; options?: unknown }[]) : []
}

function getUrlPreview(slug: string | undefined, pathPrefix = '/') {
  const path = getPathBreadcrumbSegments(pathPrefix, slug).join('/')
  return [getHost(), path].filter(Boolean).join('/')
}

function getPathBreadcrumbSegments(pathPrefix: string, slug: string | undefined) {
  return [...getPathSegments(pathPrefix), ...getPathSegments(slug)].filter(Boolean)
}

function getPathSegments(path: string | undefined) {
  if (!path) {
    return []
  }

  const parsedPath = parsePathname(path)

  return parsedPath
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function parsePathname(path: string) {
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

function normalizePathPrefix(pathPrefix: unknown) {
  if (typeof pathPrefix !== 'string') {
    return '/'
  }

  const trimmed = pathPrefix.trim()
  return trimmed || '/'
}

function getHost() {
  return typeof window === 'undefined' ? '' : window.location.origin
}
