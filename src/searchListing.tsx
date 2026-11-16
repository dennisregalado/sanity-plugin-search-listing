import {EditIcon} from '@sanity/icons'
import {Box, Button, Card, Stack, Text, Tooltip} from '@sanity/ui'
import React from 'react'
import {
  defineField,
  definePlugin,
  defineType,
  type DocumentActionComponent,
  type DuplicateActionProps,
  type ObjectFieldProps,
  type ObjectInputProps,
  type ObjectMember,
  type SlugInputProps,
  type SlugValidationContext,
  type StringFieldProps,
  type StringInputProps,
  useClient,
  useDocumentStore,
  useFormValue,
  useSchema,
  useWorkspace,
} from 'sanity'

import {omitUrlHandle} from './duplicate'
import {
  FALLBACK_FIELDS,
  type FallbackField,
  getFallbackSources,
  getImageUrl,
  getQueryKey,
  type NormalizedSource,
  resolveFallback,
} from './fallbacks'
import {
  getCanonicalDocumentId,
  getDocumentSlug,
  getTitleSlug,
  isValidUrlHandle,
  resolveAvailableSlug,
  SLUG_CANDIDATES_QUERY,
  type SlugDocument,
} from './resolveSlug'
import type {
  SearchListingFallbacks,
  SearchListingFallbackValue,
  SearchListingPluginOptions,
} from './types'

const API_VERSION = '2025-02-19'
const SLUG_LOOKUP_DELAY = 300

type StudioFormDocument = {
  _createdAt?: unknown
  _id?: unknown
  _type?: unknown
  body?: unknown
  description?: unknown
  name?: unknown
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
  pluginFallbacks?: SearchListingFallbacks
}

type ResolvedFallback = {value: SearchListingFallbackValue; source: NormalizedSource}
type ResolvedFallbacks = Partial<Record<FallbackField, ResolvedFallback>>

const SiteNameContext = React.createContext(null as string | null)
const PathPrefixContext = React.createContext('/')
const SlugFallbackContext = React.createContext('')
const HasHandleContext = React.createContext(true)
const FallbacksContext = React.createContext<ResolvedFallbacks>({})

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
  const pluginFallbacks = options?.fallbacks
  const duplicateOption = options?.duplicate ?? true
  const duplicateOmit =
    typeof duplicateOption === 'object' ? (duplicateOption.omit ?? ['slug']) : ['slug']

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
          pluginFallbacks,
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
        hidden: ({document}) => {
          return isCentralDocumentType(document?._type)
        },
        options: {
          isUnique: isUrlHandleUnique,
        },
        validation: (rule) =>
          rule.custom((value) => {
            if (!value?.current || isValidUrlHandle(value.current)) {
              return true
            }

            return 'Use lowercase letters, numbers and hyphens only'
          }),
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
    document:
      duplicateOption === false
        ? undefined
        : {
            // A duplicate would otherwise claim the original's URL. Every type with an `seo`
            // field gets a copy without its URL handle and routing slug.
            actions: (prev, context) => {
              // structureTool() adds the default actions, Duplicate included. A plugin listed
              // before it sees an empty list and has nothing to wrap.
              if (!prev.length) {
                warnRegisteredBeforeStructureTool()
                return prev
              }
              const seoFields = getSeoFieldNames(context.schema.get(context.schemaType))
              if (!seoFields.length) return prev

              return prev.map((action) =>
                action.action === 'duplicate'
                  ? withoutUrlOnDuplicate(action, {seoFields, omit: duplicateOmit})
                  : action,
              )
            },
          },
  }
})

let warnedAboutOrder = false

function warnRegisteredBeforeStructureTool() {
  if (warnedAboutOrder) return
  warnedAboutOrder = true
  // eslint-disable-next-line no-console -- a configuration mistake the developer must see
  console.warn(
    'sanity-plugin-search-listing: register searchListing() after structureTool() in `plugins`, ' +
      'or duplicating a document copies its URL handle. Pass `duplicate: false` to silence this.',
  )
}

/** Names of the document's top-level fields of type `seo`. */
function getSeoFieldNames(schemaType: unknown): string[] {
  const fields = (schemaType as {fields?: Array<{name: string; type?: {name?: string}}>})?.fields
  if (!Array.isArray(fields)) return []
  return fields.filter((field) => field.type?.name === 'seo').map((field) => field.name)
}

function withoutUrlOnDuplicate(
  duplicate: DocumentActionComponent,
  options: {seoFields: string[]; omit: readonly string[]},
): DocumentActionComponent {
  const Duplicate = duplicate as unknown as (
    props: DuplicateActionProps,
  ) => ReturnType<DocumentActionComponent>
  const action: DocumentActionComponent = (props) =>
    Duplicate({...props, mapDocument: (document) => omitUrlHandle(document, options)})

  action.action = 'duplicate'
  action.displayName = 'SearchListingDuplicateAction'
  return action
}

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
  const fieldOptions = getFieldOptions(props, schema, document?._type)
  const pathPrefix = getPathPrefixFromOptions(fieldOptions) || fieldPathPrefix || '/'
  const isCentralDocument = isCentralDocumentType(document?._type)
  // `handle: false` marks a document that lives at a fixed URL (its `pathPrefix`).
  const hasHandle = !isCentralDocument && fieldOptions.handle !== false
  const slugFallback = useResolvedSlugFallback(document, {disabled: !hasHandle})
  const fallbacks = useFallbacks(
    document,
    fieldOptions.fallbacks as SearchListingFallbacks | undefined,
    props.pluginFallbacks,
  )
  const imageFallback = hasImage(props.value) ? undefined : fallbacks.image
  const [isEditing, setIsEditing] = React.useState(false)
  const handleEditToggle = React.useCallback(() => {
    setIsEditing((value) => !value)
  }, [])
  const imageMembers = React.useMemo(() => props.members.filter(isImageMember), [props.members])
  const metadataMembers = React.useMemo(
    () =>
      props.members.filter(
        (member) => !isImageMember(member) && (hasHandle || !isUrlMember(member)),
      ),
    [props.members, hasHandle],
  )

  return (
    <SiteNameContext.Provider value={props.siteName ?? null}>
      <PathPrefixContext.Provider value={pathPrefix}>
        <SlugFallbackContext.Provider value={slugFallback}>
          <HasHandleContext.Provider value={hasHandle}>
            <FallbacksContext.Provider value={fallbacks}>
              <style>{SEO_STUDIO_FIELD_STYLES}</style>
              <Stack gap={5}>
                <Box style={{position: 'absolute', top: 0, right: 0}}>
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
                {imageFallback && <FallbackImage fallback={imageFallback} />}
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
            </FallbacksContext.Provider>
          </HasHandleContext.Provider>
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
  const hasHandle = React.useContext(HasHandleContext)
  const pathSegments = isCentralDocument
    ? []
    : getPathBreadcrumbSegments(pathPrefix, hasHandle ? slugFallback : '')

  const fallbacks = React.useContext(FallbacksContext)
  const title = getFieldText(document?.seo?.title) || getFieldText(fallbacks.title?.value)
  const descriptionText =
    getFieldText(document?.seo?.description) || getFieldText(fallbacks.description?.value)
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
          <Text size={3} weight="medium" style={{color: 'var(--card-avatar-blue-bg-color)'}}>
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
  const fallbacks = React.useContext(FallbacksContext)

  const placeholder = React.useMemo(() => {
    if (fieldName === 'description') {
      if (isCentralDocument) {
        return CENTRAL_SEO_DESCRIPTION_PLACEHOLDER
      }

      return getFieldText(fallbacks.description?.value)
    }

    if (isCentralDocument) {
      return getHost()
    }

    return getFieldText(fallbacks.title?.value)
  }, [fallbacks, fieldName, isCentralDocument])

  const maxLength = getSeoFieldMaxLength(fieldName, isCentralDocument)

  const count = React.useMemo(() => {
    const value = props.value || (isCentralDocument ? '' : placeholder) || ''
    return value.length
  }, [props.value, placeholder, isCentralDocument])

  const [isEditing, setIsEditing] = React.useState(false)
  // Once the editor types, show exactly what is stored so the field can be cleared.
  const [hasTyped, setHasTyped] = React.useState(false)

  const displayValue =
    isEditing && !hasTyped && !isCentralDocument ? props.value || placeholder : (props.value ?? '')

  return (
    <Stack gap={2}>
      {props.renderDefault({
        ...props,
        elementProps: {
          ...props.elementProps,
          value: displayValue,
          placeholder: placeholder,
          onInput: () => setHasTyped(true),
          onFocus: (event) => {
            props.elementProps.onFocus?.(event)
            setIsEditing(true)
          },
          onBlur: (event) => {
            props.elementProps.onBlur?.(event)
            setIsEditing(false)
            setHasTyped(false)
          },
        } as StringInputProps['elementProps'],
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
  const [hasTyped, setHasTyped] = React.useState(false)

  const displayValue =
    isEditing && !hasTyped ? props.value?.current || slugFallback : (props.value?.current ?? '')
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
      <Box style={{position: 'relative'}}>
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
            onInput: () => setHasTyped(true),
            onFocus: (event: React.FocusEvent) => {
              props.elementProps.onFocus?.(event)
              setIsEditing(true)
            },
            onBlur: (event: React.FocusEvent) => {
              props.elementProps.onBlur?.(event)
              setIsEditing(false)
              setHasTyped(false)
            },
          } as SlugInputProps['elementProps'],
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

function isUrlMember(member: ObjectMember) {
  return member.kind === 'field' && member.name === 'url'
}

/** A handle must not collide with another document's handle or routing slug. */
async function isUrlHandleUnique(slug: string, context: SlugValidationContext) {
  const {document, getClient} = context
  const id = getCanonicalDocumentId(document?._id)

  if (!document?._type || !id) {
    return true
  }

  const isTaken = await getClient({apiVersion: API_VERSION})
    .withConfig({perspective: 'raw'})
    .fetch<boolean>(
      `defined(*[
        _type == $type &&
        !(_id in path("versions.**")) &&
        !(_id in [$id, $draftId]) &&
        (seo.url.current == $slug || slug.current == $slug || store.slug.current == $slug)
      ][0]._id)`,
      {draftId: `drafts.${id}`, id, slug, type: document._type},
    )

  return !isTaken
}

/**
 * The first fallback with a value for each field. Path sources read the form document;
 * query sources are live queries, shared by every field that uses the same one.
 */
function useFallbacks(
  document: StudioFormDocument,
  fieldFallbacks: SearchListingFallbacks | undefined,
  pluginFallbacks: SearchListingFallbacks | undefined,
): ResolvedFallbacks {
  const documentStore = useDocumentStore()
  const id = getCanonicalDocumentId(document?._id)
  const type = typeof document?._type === 'string' ? document._type : ''

  const sourcesByField = React.useMemo(
    () =>
      Object.fromEntries(
        FALLBACK_FIELDS.map((field) => [
          field,
          getFallbackSources(field, fieldFallbacks, pluginFallbacks),
        ]),
      ) as Record<FallbackField, NormalizedSource[]>,
    [fieldFallbacks, pluginFallbacks],
  )

  const querySources = React.useMemo(() => {
    const byKey = new Map<string, Extract<NormalizedSource, {kind: 'query'}>>()
    for (const sources of Object.values(sourcesByField)) {
      for (const source of sources) {
        if (source.kind === 'query') byKey.set(getQueryKey(source), source)
      }
    }
    return [...byKey.entries()]
  }, [sourcesByField])

  const [queryResults, setQueryResults] = React.useState<ReadonlyMap<string, unknown>>(
    () => new Map(),
  )

  React.useEffect(() => {
    if (querySources.length === 0) return undefined

    const subscriptions = querySources.map(([key, source]) =>
      documentStore
        .listenQuery(
          source.query,
          {...source.params, id, draftId: `drafts.${id}`, type},
          {apiVersion: API_VERSION, perspective: 'drafts', tag: 'search-listing.fallback'},
        )
        .subscribe({
          next: (result: unknown) => {
            setQueryResults((previous) => new Map(previous).set(key, result))
          },
          error: () => {
            // A failing query is skipped; the next source is used instead.
          },
        }),
    )

    return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
  }, [documentStore, querySources, id, type])

  return React.useMemo(() => {
    const resolved: ResolvedFallbacks = {}
    for (const field of FALLBACK_FIELDS) {
      const fallback = resolveFallback(sourcesByField[field], document, queryResults)
      if (fallback) resolved[field] = fallback
    }
    return resolved
  }, [sourcesByField, document, queryResults])
}

/** The image a listing falls back to, shown in place of the empty image field. */
function FallbackImage({fallback}: {fallback: ResolvedFallback}) {
  const client = useClient({apiVersion: API_VERSION})
  const {projectId, dataset} = client.config()
  const url = getImageUrl(fallback.value, {projectId, dataset})

  if (!url) {
    return null
  }

  const label = fallback.source.label

  return (
    <Stack gap={2}>
      <Card radius={2} overflow="hidden" tone="transparent" border>
        <img
          src={url}
          alt=""
          style={{
            display: 'block',
            width: '100%',
            aspectRatio: '1200 / 630',
            objectFit: 'cover',
            opacity: 0.75,
          }}
        />
      </Card>
      <Text size={1} muted>
        {label ? `Fallback image from ${label}.` : 'Fallback image.'} Add an image to replace it.
      </Text>
    </Stack>
  )
}

function hasImage(value: Record<string, unknown> | undefined) {
  const image = value?.image
  return Boolean(image && typeof image === 'object' && 'asset' in image && image.asset)
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

/**
 * The slug the document would be given if it has none: its title slug at once, then the
 * duplicate-aware slug once the dataset has been checked.
 */
function useResolvedSlugFallback(document: StudioFormDocument, options: {disabled?: boolean} = {}) {
  const client = useClient({apiVersion: API_VERSION})
  const rawClient = React.useMemo(
    () => client.withConfig({perspective: 'raw', useCdn: false}),
    [client],
  )
  const disabled = options.disabled === true
  const documentType = typeof document?._type === 'string' ? document._type : ''
  const documentId = typeof document?._id === 'string' ? document._id : ''
  const documentCreatedAt = typeof document?._createdAt === 'string' ? document._createdAt : ''
  const explicitSlug = disabled ? '' : getDocumentSlug(document)
  const titleSlug = disabled ? '' : getTitleSlug(document)
  const lookupKey = `${documentType}:${documentId}:${titleSlug}`
  const [resolved, setResolved] = React.useState({key: '', value: ''})

  React.useEffect(() => {
    if (disabled || explicitSlug || !documentType || !titleSlug) {
      return undefined
    }

    let cancelled = false
    // Wait for typing to settle: the query reads every document of this type.
    const timeout = setTimeout(() => {
      rawClient
        .fetch<SlugDocument[]>(SLUG_CANDIDATES_QUERY, {type: documentType})
        .then((documents) => {
          if (cancelled) {
            return
          }

          const currentDocument: SlugDocument = {
            _createdAt: documentCreatedAt,
            _id: documentId,
            _type: documentType,
            // Already slugified, and slugify is idempotent.
            title: titleSlug,
          }

          setResolved({key: lookupKey, value: resolveAvailableSlug(currentDocument, documents)})
        })
        .catch(() => {
          // Keep the title slug when the preview cannot query the dataset.
        })
    }, SLUG_LOOKUP_DELAY)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [
    rawClient,
    disabled,
    explicitSlug,
    documentType,
    documentId,
    documentCreatedAt,
    titleSlug,
    lookupKey,
  ])

  if (explicitSlug) {
    return explicitSlug
  }

  return resolved.key === lookupKey ? resolved.value : titleSlug
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

  return {image: value.image}
}

/** The `options` of the `seo` field: from the field's own type, or the document schema. */
function getFieldOptions(
  props: SearchListingInputProps,
  schema: {get?: (typeName: string) => unknown},
  documentType: unknown,
): Record<string, unknown> {
  const ownOptions = props.schemaType?.options

  if (
    isRecord(ownOptions) &&
    ('pathPrefix' in ownOptions || 'handle' in ownOptions || 'fallbacks' in ownOptions)
  ) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function getPathPrefixFromOptions(options: unknown) {
  if (!options || typeof options !== 'object' || !('pathPrefix' in options)) {
    return ''
  }
  const pathPrefix = (options as {pathPrefix?: unknown}).pathPrefix
  return typeof pathPrefix === 'string' ? normalizePathPrefix(pathPrefix) : ''
}

function getSchemaFields(schemaType: unknown) {
  if (!schemaType || typeof schemaType !== 'object' || !('fields' in schemaType)) {
    return []
  }

  const fields = (schemaType as {fields?: unknown}).fields
  return Array.isArray(fields)
    ? (fields as {name?: unknown; options?: unknown; type?: {options?: unknown}}[])
    : []
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
