import type {SlugValidationContext} from 'sanity'

import {getCanonicalDocumentId} from '../resolveSlug'
import {API_VERSION} from './constants'
import {getValidationFieldOptions} from './options'

/** A handle must not collide with another document's handle or routing slug. */
export async function isUrlHandleUnique(slug: string, context: SlugValidationContext) {
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
