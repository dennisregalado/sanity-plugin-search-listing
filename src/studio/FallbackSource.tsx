import {Box, Card, Stack, Text} from '@sanity/ui'
import {Popover} from '@sanity/ui/popover'
import {Tooltip} from '@sanity/ui/tooltip'
import React from 'react'
import {Preview, useDocumentStore, useFormValue, useSchema} from 'sanity'
import {useIntentLink} from 'sanity/router'

import {type NormalizedSource, splitDocumentQuery} from '../fallbacks'
import {getCanonicalDocumentId} from '../resolveSlug'
import {API_VERSION} from './constants'
import type {StudioFormDocument} from './types'

/** The image a listing falls back to, shown in place of the empty image field. */
export function FallbackImage({url}: {url: string}) {
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
 * Marks the listing's image as borrowed, on hover over (or focus within) the whole field. A fallback from another
 * document (a query such as `*[_type == "settings"][0].seo.image`) opens a popover with that
 * document's preview, linking to the field. One read from this document (such as Shopify's
 * `store.previewImageUrl`) names the field in a tooltip.
 */
export function FallbackSource({
  source,
  children,
}: {
  source: NormalizedSource
  children: React.ReactNode
}) {
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
export function useFallbackSourceDocument(source: NormalizedSource, document: StudioFormDocument) {
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
export function FallbackSourceLink({
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

/** Elements that take keyboard focus. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A popover that opens on hover like a tooltip but stays open while the pointer moves into
 * it, so its link can be clicked. It also opens when focus moves into the field and closes on
 * Escape or when focus leaves both the field and the popover. It is rendered in place (not in a
 * portal), right after the field, so Tab moves from the field into its link.
 */
export function FallbackSourcePopover({
  content,
  children,
}: {
  content: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [trigger, setTrigger] = React.useState<HTMLDivElement | null>(null)
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  // Set by Escape: focus moving within the field doesn't reopen it until focus leaves.
  const dismissed = React.useRef(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const schedule = React.useCallback((next: boolean, delay: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(next), delay)
  }, [])
  const show = React.useCallback(() => schedule(true, 150), [schedule])
  const hide = React.useCallback(() => schedule(false, 200), [schedule])
  React.useEffect(() => () => clearTimeout(timer.current), [])

  const handleFocus = React.useCallback(() => {
    if (!dismissed.current) show()
  }, [show])
  const handleBlur = React.useCallback(
    (event: React.FocusEvent) => {
      if (isWithin(event.relatedTarget, [trigger, contentRef.current])) return
      dismissed.current = false
      hide()
    },
    [hide, trigger],
  )
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Escape' || !open) return
      dismissed.current = true
      clearTimeout(timer.current)
      setOpen(false)
      // Focus on the link would be lost with the popover: hand it back to the field.
      if (isWithin(event.target, [contentRef.current])) {
        trigger?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
      }
    },
    [open, trigger],
  )
  const handlers = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  }

  return (
    <>
      <Box ref={setTrigger} {...handlers}>
        {children}
      </Box>
      {/* After the field in the DOM, so Tab moves from the field into the popover's link. */}
      <Popover
        animate
        open={open}
        placement="top"
        referenceElement={trigger}
        content={
          <Box ref={contentRef} padding={1} style={{minWidth: 260}} {...handlers}>
            {content}
          </Box>
        }
      />
    </>
  )
}

/** Whether `target` (such as a blur's `relatedTarget`) is inside one of `elements`. */
function isWithin(target: EventTarget | null, elements: Array<HTMLElement | null>): boolean {
  return target instanceof Node && elements.some((element) => element?.contains(target))
}

/** `store.previewImageUrl` as the schema's field titles: "Shopify › Preview image URL". */
export function getFieldTitlePath(schemaType: unknown, path: string): string {
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
