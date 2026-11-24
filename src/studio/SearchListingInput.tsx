import {EditIcon} from '@sanity/icons/Edit'
import {Box, Button, Stack, Text} from '@sanity/ui'
import {Tooltip} from '@sanity/ui/tooltip'
import React from 'react'
import {
  type ObjectFieldProps,
  type ObjectInputProps,
  type ObjectMember,
  useClient,
  useFormValue,
  useSchema,
} from 'sanity'

import {getImageUrl} from '../fallbacks'
import type {SearchListingFallbacks} from '../types'
import {API_VERSION} from './constants'
import {
  FallbacksContext,
  FieldOptionsContext,
  HasHandleContext,
  PathPrefixContext,
  SiteNameContext,
  SlugFallbackContext,
} from './contexts'
import {FallbackImage, FallbackSource} from './FallbackSource'
import {useFallbacks, useResolvedSlugFallback} from './hooks'
import {getFieldOptions, getPathPrefixFromOptions, resolveFieldOptions} from './options'
import {SearchListingPreview} from './SearchListingPreview'
import type {StudioFormDocument} from './types'
import {getFallbackImageValue, getImageOnlyValue, hasImage} from './utils'

export type SearchListingInputProps = ObjectInputProps & {
  siteName?: string
  pluginFallbacks?: SearchListingFallbacks
}

export const SEO_STUDIO_FIELD_STYLES = `
[data-testid="field-actions-menu-seo"],
[data-testid="field-actions-menu-seo"] + div {
  transform: translateX(-25px);
}

.seo-image-field div:has(> img[data-testid="hotspot-image-input"]) {
  aspect-ratio: 1200 / 630 !important;
  max-height: min-content !important;
}
`

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
                  <SearchListingPreview />
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

export function isImageMember(member: ObjectMember) {
  return member.kind === 'field' && member.name === 'image'
}

export function isUrlMember(member: ObjectMember) {
  return member.kind === 'field' && member.name === 'url'
}
