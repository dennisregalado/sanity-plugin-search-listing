import {EditIcon} from '@sanity/icons/Edit'
import {Box, Button, Card, Stack, Text} from '@sanity/ui'
import {Popover} from '@sanity/ui/popover'
import {Tooltip} from '@sanity/ui/tooltip'
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
  Preview,
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
import {useIntentLink} from 'sanity/router'

import {prepareDuplicate} from './duplicate'
import {
  FALLBACK_FIELDS,
  type FallbackField,
  getFallbackSources,
  getImageUrl,
  getPathValue,
  getQueryKey,
  type NormalizedSource,
  resolveFallback,
  splitDocumentQuery,
} from './fallbacks'
import {
  getCanonicalDocumentId,
  getDocumentSlug,
  getSlugCandidatesQuery,
  getTitleSlug,
  isValidUrlHandle,
  resolveAvailableSlug,
  type SlugDocument,
  type SlugOptions,
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
  [field: string]: unknown
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

const HOME_DESCRIPTION_PLACEHOLDER = 'Enter a description to be shown on search engines like Google'

/** The `seo` field's options with their defaults applied. */
type ResolvedFieldOptions = {
  home: boolean
  /** Whether the document has a URL handle of its own (not `home`, not `handle: false`). */
  hasHandle: boolean
  maxLength: {title: number; description: number}
  slug: SlugOptions | undefined
  price: {path: string; currency: string} | undefined
}

function resolveFieldOptions(options: Record<string, unknown>): ResolvedFieldOptions {
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

function getPriceOption(price: unknown): ResolvedFieldOptions['price'] {
  if (typeof price === 'string') return {path: price, currency: 'USD'}
  if (!isRecord(price) || typeof price.path !== 'string') return undefined
  return {path: price.path, currency: typeof price.currency === 'string' ? price.currency : 'USD'}
}

const FieldOptionsContext = React.createContext<ResolvedFieldOptions>(resolveFieldOptions({}))

/** The `seo` field's options, from validation: its document type's schema has them. */
function getValidationFieldOptions(context: {
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
  const duplicateTitleSuffix =
    typeof duplicateOption === 'object' ? duplicateOption.titleSuffix : undefined

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
            .custom((value, context) => {
              const {maxLength} = getValidationFieldOptions(context)
              return typeof value === 'string' && value.length > maxLength.title
                ? 'Longer titles may be truncated by search engines'
                : true
            })
            .warning(),
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
              const {maxLength} = getValidationFieldOptions(context)

              if (typeof value === 'string' && value.length > maxLength.description) {
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
        // Not shown for `home` or `handle: false`: the input leaves the member out.
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
                  ? withoutUrlOnDuplicate(action, {
                      seoFields,
                      omit: duplicateOmit,
                      titleSuffix: duplicateTitleSuffix,
                    })
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
  options: {seoFields: string[]; omit: readonly string[]; titleSuffix?: string | false},
): DocumentActionComponent {
  const Duplicate = duplicate as unknown as (
    props: DuplicateActionProps,
  ) => ReturnType<DocumentActionComponent>
  const action: DocumentActionComponent = (props) =>
    Duplicate({...props, mapDocument: (document) => prepareDuplicate(document, options)})

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
  const resolvedOptions = React.useMemo(() => resolveFieldOptions(fieldOptions), [fieldOptions])
  // `home` and `handle: false` mark a document that lives at a fixed URL (its `pathPrefix`).
  const hasHandle = resolvedOptions.hasHandle
  const slugFallback = useResolvedSlugFallback(document, {
    disabled: !hasHandle,
    slug: resolvedOptions.slug,
  })
  const fallbacks = useFallbacks(
    document,
    fieldOptions.fallbacks as SearchListingFallbacks | undefined,
    props.pluginFallbacks,
  )
  const [isEditing, setIsEditing] = React.useState(false)
  const client = useClient({apiVersion: API_VERSION})
  const {projectId, dataset} = client.config()
  // While previewing (not in edit mode), a listing with no image of its own shows its fallback.
  // A Sanity image fallback is shown in the image field itself: the field's member is handed a
  // stand-in value pointing at the fallback's asset, so it renders filled while the document
  // stays empty, and Upload or Select writes a real image. Any other fallback (a URL) is shown
  // as a plain image in place of the field. Edit mode always shows the document's own field.
  const showFallback = !isEditing && !hasImage(props.value) && Boolean(fallbacks.image)
  const fallbackImage = showFallback ? getFallbackImageValue(fallbacks.image?.value) : undefined
  const fallbackImageUrl =
    showFallback && !fallbackImage
      ? getImageUrl(fallbacks.image?.value, {projectId, dataset}) || undefined
      : undefined
  const handleEditToggle = React.useCallback(() => {
    setIsEditing((value) => !value)
  }, [])
  const imageMembers = React.useMemo(() => {
    const members = props.members.filter(isImageMember)
    if (!fallbackImage) return members
    return members.map((member) =>
      member.kind === 'field'
        ? ({...member, field: {...member.field, value: fallbackImage}} as ObjectMember)
        : member,
    )
  }, [props.members, fallbackImage])
  const metadataMembers = React.useMemo(
    () =>
      props.members.filter(
        (member) => !isImageMember(member) && (hasHandle || !isUrlMember(member)),
      ),
    [props.members, hasHandle],
  )

  let imageField: React.ReactNode
  if (fallbackImageUrl) {
    imageField = (
      <FallbackSource source={fallbacks.image!.source}>
        <FallbackImage url={fallbackImageUrl} />
      </FallbackSource>
    )
  } else if (fallbackImage) {
    imageField = (
      <FallbackSource source={fallbacks.image!.source}>
        {props.renderDefault({...props, members: imageMembers, value: {image: fallbackImage}})}
      </FallbackSource>
    )
  } else {
    imageField = props.renderDefault({
      ...props,
      members: imageMembers,
      value: getImageOnlyValue(props.value),
    })
  }

  return (
    <SiteNameContext.Provider value={props.siteName ?? null}>
      <PathPrefixContext.Provider value={pathPrefix}>
        <SlugFallbackContext.Provider value={slugFallback}>
          <HasHandleContext.Provider value={hasHandle}>
            <FallbacksContext.Provider value={fallbacks}>
              <FieldOptionsContext.Provider value={resolvedOptions}>
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
                  {imageField}
                  <SearchListingPreview value={props.value} />
                  {isEditing &&
                    props.renderDefault({
                      ...props,
                      members: metadataMembers,
                    })}
                </Stack>
              </FieldOptionsContext.Provider>
            </FallbacksContext.Provider>
          </HasHandleContext.Provider>
        </SlugFallbackContext.Provider>
      </PathPrefixContext.Provider>
    </SiteNameContext.Provider>
  )
}

/**
 * The listing as a search engine shows it. `value` is this field's own value, so the preview
 * works for a field of any name, at any depth; the document is read for the price only.
 */
function SearchListingPreview({value}: {value: Record<string, unknown> | undefined}) {
  const document = useFormValue([]) as StudioFormDocument
  const workspace = useWorkspace()
  const siteName = React.useContext(SiteNameContext)
  const pathPrefix = React.useContext(PathPrefixContext)
  const options = React.useContext(FieldOptionsContext)
  const slugFallback = React.useContext(SlugFallbackContext)
  const hasHandle = React.useContext(HasHandleContext)
  const pathSegments = options.home
    ? []
    : getPathBreadcrumbSegments(pathPrefix, hasHandle ? slugFallback : '')

  const fallbacks = React.useContext(FallbacksContext)
  const title = getFieldText(value?.title) || getFieldText(fallbacks.title?.value)
  const descriptionText =
    getFieldText(value?.description) || getFieldText(fallbacks.description?.value)
  const description = clipText(descriptionText, options.maxLength.description)
  const price = options.price
    ? getPricePreview(getPathValue(document, options.price.path), options.price.currency)
    : undefined

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
  const {home} = React.useContext(FieldOptionsContext)
  const title = home ? 'Home page title' : props.schemaType.title

  return props.renderDefault({
    ...props,
    title,
  })
}

function PlaceholderInput(props: StringInputProps) {
  const fieldName = getFieldName(props)
  const options = React.useContext(FieldOptionsContext)
  const isHome = options.home
  const fallbacks = React.useContext(FallbacksContext)
  const maxLength =
    fieldName === 'description' ? options.maxLength.description : options.maxLength.title

  // The fallback, as long as the listing would show it: what the field holds while empty.
  const fallbackText = React.useMemo(() => {
    if (isHome) return ''
    const text = getFieldText(
      fieldName === 'description' ? fallbacks.description?.value : fallbacks.title?.value,
    )
    return clipText(text, maxLength, '')
  }, [fallbacks, fieldName, isHome, maxLength])

  const placeholder = React.useMemo(() => {
    if (isHome) return fieldName === 'description' ? HOME_DESCRIPTION_PLACEHOLDER : getHost()
    return fallbackText
  }, [fallbackText, fieldName, isHome])

  // Only what is typed counts; the fallback is not the field's value.
  const count = (props.value ?? '').length

  const [isEditing, setIsEditing] = React.useState(false)
  // Once the editor types, show exactly what is stored so the field can be cleared.
  const [hasTyped, setHasTyped] = React.useState(false)

  const displayValue =
    isEditing && !hasTyped && !isHome ? props.value || fallbackText : (props.value ?? '')

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

  // The handle, and every routing slug field the type uses (`slug`, or e.g. `store.slug`).
  const currentPaths = getValidationFieldOptions(context).slug?.current?.length
    ? getValidationFieldOptions(context).slug!.current!
    : ['slug']
  const owned = ['seo.url', ...currentPaths.filter((path) => /^[A-Za-z_][\w.]*$/.test(path))]
    .map((path) => `${path}.current == $slug`)
    .join(' || ')

  const isTaken = await getClient({apiVersion: API_VERSION})
    .withConfig({perspective: 'raw'})
    .fetch<boolean>(
      `defined(*[
        _type == $type &&
        !(_id in path("versions.**")) &&
        !(_id in [$id, $draftId]) &&
        (${owned})
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
function FallbackImage({url}: {url: string}) {
  return (
    // Matches the image input's preview (its RatioBox): a transparent-tone card in the
    // listing's 1200×630 box, the image scaled down to fit at its own aspect ratio.
    <Card tone="transparent" style={{aspectRatio: '1200 / 630'}}>
      <img
        src={url}
        alt=""
        style={{display: 'block', width: '100%', height: '100%', objectFit: 'scale-down'}}
      />
    </Card>
  )
}

/**
 * Marks the listing's image as borrowed, on hover over the whole field. A fallback from another
 * document (a query such as `*[_type == "settings"][0].seo.image`) opens a popover with that
 * document's preview, linking to the field. One read from this document (such as Shopify's
 * `store.previewImageUrl`) names the field in a tooltip.
 */
function FallbackSource({source, children}: {source: NormalizedSource; children: React.ReactNode}) {
  const document = useFormValue([]) as StudioFormDocument
  const schema = useSchema()
  const sourceDocument = useFallbackSourceDocument(source, document)
  const sourceSchemaType = sourceDocument ? schema.get(sourceDocument.type) : undefined

  if (sourceDocument && sourceSchemaType) {
    return (
      <FallbackSourcePopover
        content={
          <Stack gap={2}>
            <Box paddingX={2} paddingTop={2}>
              <Text size={1} weight="medium">
                Fallback image from
              </Text>
            </Box>
            <FallbackSourceLink {...sourceDocument} schemaType={sourceSchemaType} />
          </Stack>
        }
      >
        {children}
      </FallbackSourcePopover>
    )
  }

  const from =
    source.kind === 'path'
      ? getFieldTitlePath(
          typeof document?._type === 'string' ? schema.get(document._type) : undefined,
          source.path,
        )
      : source.label

  return (
    <Tooltip
      animate
      delay={5}
      placement="top"
      content={
        <Text size={1} weight="medium">
          {from ? `Fallback image from ${from}` : 'Fallback image'}
        </Text>
      }
      portal
    >
      <Box>{children}</Box>
    </Tooltip>
  )
}

/** The document a query fallback reads from, and the field it reads, once it resolves. */
function useFallbackSourceDocument(source: NormalizedSource, document: StudioFormDocument) {
  const documentStore = useDocumentStore()
  const id = getCanonicalDocumentId(document?._id)
  const type = typeof document?._type === 'string' ? document._type : ''
  const split = source.kind === 'query' ? splitDocumentQuery(source.query) : undefined
  const documentQuery = split?.documentQuery
  const paramsKey = source.kind === 'query' ? JSON.stringify(source.params) : ''
  const queryKey = documentQuery ? JSON.stringify([documentQuery, paramsKey, id, type]) : ''
  const [result, setResult] = React.useState<{key: string; _id: string; _type: string} | null>(null)

  React.useEffect(() => {
    if (!documentQuery) return undefined
    const params = JSON.parse(paramsKey || '{}') as Record<string, string>
    const subscription = documentStore
      .listenQuery(
        `${documentQuery}{_id, _type}`,
        {...params, id, draftId: `drafts.${id}`, type},
        {apiVersion: API_VERSION, perspective: 'drafts', tag: 'search-listing.fallback-source'},
      )
      .subscribe({
        next: (value: unknown) => {
          const record = value as {_id?: unknown; _type?: unknown} | null
          setResult(
            record && typeof record._id === 'string' && typeof record._type === 'string'
              ? {key: queryKey, _id: record._id, _type: record._type}
              : null,
          )
        },
        error: () => setResult(null),
      })
    return () => subscription.unsubscribe()
  }, [documentStore, documentQuery, paramsKey, id, type, queryKey])

  // A result from an earlier query (or none) is ignored.
  if (!split || !result || result.key !== queryKey) return undefined
  return {id: getCanonicalDocumentId(result._id), type: result._type, path: split.path}
}

/** The source document's own preview, opening it at the fallback field. */
function FallbackSourceLink({
  id,
  type,
  path,
  schemaType,
}: {
  id: string
  type: string
  path: string
  schemaType: NonNullable<ReturnType<ReturnType<typeof useSchema>['get']>>
}) {
  const {href, onClick} = useIntentLink({intent: 'edit', params: {id, type, path}})

  return (
    <Card as="a" href={href} onClick={onClick} radius={2} padding={1} __unstable_focusRing>
      <Preview schemaType={schemaType} value={{_id: id, _type: type}} layout="compact" />
    </Card>
  )
}

/**
 * A popover that opens on hover like a tooltip but stays open while the pointer moves into
 * it, so its link can be clicked.
 */
function FallbackSourcePopover({
  content,
  children,
}: {
  content: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const schedule = React.useCallback((next: boolean, delay: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(next), delay)
  }, [])
  const show = React.useCallback(() => schedule(true, 150), [schedule])
  const hide = React.useCallback(() => schedule(false, 200), [schedule])
  React.useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <Popover
      animate
      open={open}
      placement="top"
      portal
      content={
        <Box padding={1} style={{minWidth: 260}} onMouseEnter={show} onMouseLeave={hide}>
          {content}
        </Box>
      }
    >
      <Box onMouseEnter={show} onMouseLeave={hide}>
        {children}
      </Box>
    </Popover>
  )
}

/** `store.previewImageUrl` as the schema's field titles: "Shopify › Preview image URL". */
function getFieldTitlePath(schemaType: unknown, path: string): string {
  let type = schemaType as {fields?: Array<{name: string; type?: unknown}>} | undefined
  const titles: string[] = []

  for (const key of path.split('.')) {
    const field = type?.fields?.find((candidate) => candidate.name === key)
    const fieldType = field?.type as {title?: string; fields?: unknown} | undefined
    titles.push(fieldType?.title || key)
    type = fieldType as typeof type
  }

  return titles.join(' › ')
}

function hasImage(value: Record<string, unknown> | undefined) {
  const image = value?.image
  return Boolean(image && typeof image === 'object' && 'asset' in image && image.asset)
}

/**
 * `text` cut at a word to fit `maxLength`, with `ellipsis` after it, as search engines and the
 * listing preview show it.
 */
function clipText(text: string, maxLength: number, ellipsis = '…'): string {
  if (text.length <= maxLength) return text
  const room = Math.max(0, maxLength - ellipsis.length)
  const cut = text.slice(0, room)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > room * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}${ellipsis}`
}

/** A copy of `target` with `value` at the dot path `path`. */
function setPathValue(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const [key, ...rest] = path.split('.')
  if (!rest.length) return {...target, [key]: value}
  const child = isRecord(target[key]) ? target[key] : {}
  return {...target, [key]: setPathValue(child, rest.join('.'), value)}
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
function useResolvedSlugFallback(
  document: StudioFormDocument,
  options: {disabled?: boolean; slug?: SlugOptions} = {},
) {
  const client = useClient({apiVersion: API_VERSION})
  const rawClient = React.useMemo(
    () => client.withConfig({perspective: 'raw', useCdn: false}),
    [client],
  )
  const disabled = options.disabled === true
  const documentType = typeof document?._type === 'string' ? document._type : ''
  const documentId = typeof document?._id === 'string' ? document._id : ''
  const documentCreatedAt = typeof document?._createdAt === 'string' ? document._createdAt : ''
  const slugOptions = options.slug
  const slugOptionsKey = JSON.stringify(slugOptions ?? null)
  const explicitSlug = disabled ? '' : getDocumentSlug(document as SlugDocument, slugOptions)
  const titleSlug = disabled ? '' : getTitleSlug(document as SlugDocument, slugOptions)
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
        .fetch<SlugDocument[]>(getSlugCandidatesQuery(slugOptions), {type: documentType})
        .then((documents) => {
          if (cancelled) {
            return
          }

          // The title being edited, at the first source field. Already slugified, and slugify
          // is idempotent.
          const sourcePath = slugOptions?.source?.[0] ?? 'title'
          const currentDocument = setPathValue(
            {_createdAt: documentCreatedAt, _id: documentId, _type: documentType},
            sourcePath,
            titleSlug,
          ) as SlugDocument

          setResolved({
            key: lookupKey,
            value: resolveAvailableSlug(currentDocument, documents, slugOptions),
          })
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
    slugOptions,
    slugOptionsKey,
  ])

  if (explicitSlug) {
    return explicitSlug
  }

  return resolved.key === lookupKey ? resolved.value : titleSlug
}

function getPricePreview(value: unknown, currency: string) {
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

/**
 * The stand-in image value for a fallback that is a Sanity image (an image object or an image
 * asset), or `undefined` for anything the image input cannot show, such as a URL.
 */
function getFallbackImageValue(value: unknown): Record<string, unknown> | undefined {
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

function getImageOnlyValue(value: Record<string, unknown> | undefined) {
  if (!value || !('image' in value)) {
    return undefined
  }

  return {image: value.image}
}

/** The `options` of the `seo` field: from the field's own type, or the document schema. */
/** Keys of `SearchListingFieldOptions`, to tell the field's own options from the type's. */
const FIELD_OPTION_KEYS = [
  'pathPrefix',
  'handle',
  'fallbacks',
  'home',
  'maxLength',
  'slug',
  'preview',
]

function getFieldOptions(
  props: SearchListingInputProps,
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
