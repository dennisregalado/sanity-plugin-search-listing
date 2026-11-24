import {EditIcon} from '@sanity/icons/Edit'
import {Button, Flex, Stack, Text} from '@sanity/ui'
import {Tooltip} from '@sanity/ui/tooltip'
import React from 'react'
import {
  type ObjectFieldProps,
  type ObjectInputProps,
  type ObjectMember,
  useClient,
  useFormValue,
  useSchema,
  useTranslation,
} from 'sanity'

import {getImageUrl} from '../fallbacks'
import {searchListingLocaleNamespace} from '../i18n'
import type {SearchListingFallbacks} from '../types'
import {API_VERSION} from './constants'
import {
  FallbacksContext,
  FieldOptionsContext,
  HasHandleContext,
  PathPrefixContext,
  SiteProvider,
  SlugFallbackContext,
} from './contexts'
import {
  getHiddenProblems,
  getHighestLevel,
  getLevelTone,
  type HiddenProblem,
  type HiddenProblemLevel,
  isFocusOnHiddenMember,
} from './editMode'
import {FallbackImage, FallbackSource} from './FallbackSource'
import {useFallbacks, useResolvedSlugFallback} from './hooks'
import {getFieldOptions, getPathPrefixFromOptions, resolveFieldOptions} from './options'
import {FallbackImageContext} from './SearchListingImage'
import {SearchListingPreview} from './SearchListingPreview'
import type {StudioFormDocument} from './types'
import {getFallbackImageValue, getImageOnlyValue, hasImage, resolveSiteUrlOption} from './utils'

export type SearchListingInputProps = ObjectInputProps & {
  siteName?: string
  /** The plugin's `siteUrl`, normalized. */
  siteUrl?: string
  pluginFallbacks?: SearchListingFallbacks
}

export function SearchListingField(props: ObjectFieldProps) {
  const pathPrefix = getPathPrefixFromOptions(props.schemaType.options) || '/'

  return (
    <PathPrefixContext.Provider value={pathPrefix}>
      {props.renderDefault(props)}
    </PathPrefixContext.Provider>
  )
}

export function SearchListingInput(props: SearchListingInputProps) {
  const document = useFormValue([]) as StudioFormDocument
  const schema = useSchema()
  const fieldPathPrefix = React.useContext(PathPrefixContext)
  const fieldOptions = getFieldOptions(props, schema, document?._type)
  const pathPrefix = getPathPrefixFromOptions(fieldOptions) || fieldPathPrefix || '/'
  const siteUrl = resolveSiteUrlOption(fieldOptions.siteUrl, 'field') ?? props.siteUrl ?? null
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
  const metadataMembers = React.useMemo(
    () =>
      props.members.filter(
        (member) => !isImageMember(member) && (hasHandle || !isUrlMember(member)),
      ),
    [props.members, hasHandle],
  )
  // Title, description and URL handle only render in edit mode, so their validation is
  // surfaced on the toggle while it's closed.
  const {t} = useTranslation(searchListingLocaleNamespace)
  const hiddenProblems = React.useMemo(
    () => getHiddenProblems(metadataMembers, (name) => getMemberTitle(t, name)),
    [metadataMembers, t],
  )
  const hasHiddenError = getHighestLevel(hiddenProblems) === 'error'

  const hiddenOnFocus = isFocusOnHiddenMember(props.focusPath)
  const [isEditing, setIsEditing] = useEditMode({hiddenOnFocus, hasHiddenError})

  const client = useClient({apiVersion: API_VERSION})
  const {projectId, dataset} = client.config()
  // While previewing (not in edit mode), a listing with no image of its own shows its fallback.
  // A Sanity image fallback is shown in the image field itself: its input (see
  // `SearchListingImageInput`) is handed a stand-in value pointing at the fallback's asset, so it
  // renders filled while the document stays empty. Only Upload or Select write, a real image. Any other fallback (a URL) is shown
  // as a plain image in place of the field. Edit mode always shows the document's own field.
  const showFallback = !isEditing && !hasImage(props.value) && Boolean(fallbacks.image)
  const fallbackImage = showFallback ? getFallbackImageValue(fallbacks.image?.value) : undefined
  const fallbackImageUrl =
    showFallback && !fallbackImage
      ? getImageUrl(fallbacks.image?.value, {projectId, dataset}) || undefined
      : undefined
  const {onPathFocus} = props
  const handleEditToggle = React.useCallback(() => {
    setIsEditing((value) => !value)
    // Closing hides the focused field: move focus to the listing itself, so a later
    // validation click on the same field opens edit mode again.
    if (isEditing && hiddenOnFocus) onPathFocus([])
  }, [isEditing, hiddenOnFocus, onPathFocus, setIsEditing])
  const imageMembers = React.useMemo(() => props.members.filter(isImageMember), [props.members])

  let imageField: React.ReactNode
  if (fallbackImageUrl) {
    imageField = (
      <FallbackSource source={fallbacks.image!.source}>
        <FallbackImage url={fallbackImageUrl} />
      </FallbackSource>
    )
  } else {
    // The image input reads the stand-in from `FallbackImageContext` and guards its writes.
    const imageInput = (
      <FallbackImageContext.Provider value={fallbackImage}>
        {props.renderDefault({
          ...props,
          members: imageMembers,
          value: getImageOnlyValue(props.value),
        })}
      </FallbackImageContext.Provider>
    )
    imageField = fallbackImage ? (
      <FallbackSource source={fallbacks.image!.source}>{imageInput}</FallbackSource>
    ) : (
      imageInput
    )
  }

  return (
    <SiteProvider siteName={props.siteName ?? null} siteUrl={siteUrl}>
      <PathPrefixContext.Provider value={pathPrefix}>
        <SlugFallbackContext.Provider value={slugFallback}>
          <HasHandleContext.Provider value={hasHandle}>
            <FallbacksContext.Provider value={fallbacks}>
              <FieldOptionsContext.Provider value={resolvedOptions}>
                <Stack gap={3}>
                  <Flex justify="flex-end">
                    <EditToggle
                      isEditing={isEditing}
                      problems={hiddenProblems}
                      onToggle={handleEditToggle}
                    />
                  </Flex>
                  <Stack gap={5}>
                    {imageField}
                    <SearchListingPreview />
                    {isEditing &&
                      props.renderDefault({
                        ...props,
                        members: metadataMembers,
                      })}
                  </Stack>
                </Stack>
              </FieldOptionsContext.Provider>
            </FallbacksContext.Provider>
          </HasHandleContext.Provider>
        </SlugFallbackContext.Provider>
      </PathPrefixContext.Provider>
    </SiteProvider>
  )
}

/**
 * Whether edit mode is open, and its setter. It opens when focus moves into a hidden member
 * (a validation panel click, a link, presence), so the field it points to is rendered, and
 * when a hidden member gets an error. Each opens it once, when it starts: the editor can still
 * close it. Warnings never open it; they only tint the toggle.
 */
function useEditMode({
  hiddenOnFocus,
  hasHiddenError,
}: {
  hiddenOnFocus: boolean
  hasHiddenError: boolean
}) {
  const [isEditing, setIsEditing] = React.useState(hiddenOnFocus || hasHiddenError)
  const [previous, setPrevious] = React.useState({hiddenOnFocus, hasHiddenError})

  // Adjusted while rendering, not in an effect: the field it opens renders in the same pass.
  if (previous.hiddenOnFocus !== hiddenOnFocus || previous.hasHiddenError !== hasHiddenError) {
    setPrevious({hiddenOnFocus, hasHiddenError})
    if (
      (hiddenOnFocus && !previous.hiddenOnFocus) ||
      (hasHiddenError && !previous.hasHiddenError)
    ) {
      setIsEditing(true)
    }
  }

  return [isEditing, setIsEditing] as const
}

/**
 * Opens and closes edit mode. While closed, it takes the tone of the most severe problem on
 * the hidden fields and lists them in its tooltip.
 */
export function EditToggle({
  isEditing,
  problems,
  onToggle,
}: {
  isEditing: boolean
  problems: readonly HiddenProblem[]
  onToggle: () => void
}) {
  const {t} = useTranslation(searchListingLocaleNamespace)
  const shownProblems = isEditing ? [] : problems
  const level = getHighestLevel(shownProblems)
  const label = isEditing ? t('edit-toggle.done.label') : t('edit-toggle.edit.label')

  return (
    <Tooltip
      animate
      delay={5}
      placement="top"
      portal
      content={
        <Stack gap={3} padding={1} style={{maxWidth: 320}}>
          <Text size={1} weight="medium">
            {label}
          </Text>
          {level && (
            <Text size={1} muted>
              {getLevelHeading(t, level)}
            </Text>
          )}
          {shownProblems.map((problem) => (
            <Text key={`${problem.title}\n${problem.message}`} size={1}>
              {t('edit-toggle.problem', {title: problem.title, message: problem.message})}
            </Text>
          ))}
        </Stack>
      }
    >
      <Button
        mode={level ? 'ghost' : 'bleed'}
        tone={getLevelTone(level)}
        icon={EditIcon}
        text={isEditing ? t('edit-toggle.done') : t('edit-toggle.edit')}
        fontSize={1}
        padding={2}
        onClick={onToggle}
        selected={isEditing}
        aria-label={label}
        aria-pressed={isEditing}
      />
    </Tooltip>
  )
}

type TFunction = ReturnType<typeof useTranslation>['t']

/** The Edit toggle tooltip's heading above problems of the given (highest) level. */
function getLevelHeading(t: TFunction, level: NonNullable<HiddenProblemLevel>): string {
  if (level === 'error') return t('edit-toggle.level.error')
  if (level === 'warning') return t('edit-toggle.level.warning')
  return t('edit-toggle.level.info')
}

/** A listing member's title as its field shows it, or `undefined` for the schema's own. */
function getMemberTitle(t: TFunction, name: string): string | undefined {
  if (name === 'title') return t('field.title.title')
  if (name === 'description') return t('field.description.title')
  if (name === 'url') return t('field.url.title')
  return undefined
}

export function isImageMember(member: ObjectMember) {
  return member.kind === 'field' && member.name === 'image'
}

export function isUrlMember(member: ObjectMember) {
  return member.kind === 'field' && member.name === 'url'
}
