import {defineLocaleResourceBundle} from 'sanity'

import type {SearchListingLocaleResourceKeys} from './resources'

export type {SearchListingLocaleResourceKeys} from './resources'

/**
 * The i18n namespace of the plugin's Studio strings. Add a locale with
 * `defineLocaleResourceBundle({locale: 'nb-NO', namespace: searchListingLocaleNamespace, resources})`.
 *
 * @public
 */
export const searchListingLocaleNamespace = 'search-listing' as const

/**
 * The plugin's US English strings, loaded on first use. The plugin registers it.
 *
 * @public
 */
export const searchListingUsEnglishLocaleBundle = defineLocaleResourceBundle({
  locale: 'en-US',
  namespace: searchListingLocaleNamespace,
  resources: () => import('./resources'),
})

/** The part of a validation context's `i18n` this plugin uses (Studio, CLI and Functions). */
type ValidationI18n = {
  loadNamespaces?: (namespaces: string[]) => Promise<void>
  t: (key: string, options?: Record<string, unknown>) => string
}

/**
 * A validation message in the Studio's locale, through the validation context's `i18n`. Falls
 * back to English where there is no `i18n`, or it has no `search-listing` strings (such as
 * `sanity documents validate`, which only loads Sanity's own).
 */
export async function getValidationMessage(
  context: unknown,
  key: SearchListingLocaleResourceKeys,
): Promise<string> {
  const i18n = (context as {i18n?: ValidationI18n} | undefined)?.i18n
  if (i18n && typeof i18n.t === 'function') {
    try {
      await i18n.loadNamespaces?.([searchListingLocaleNamespace])
      const message = i18n.t(key, {ns: searchListingLocaleNamespace})
      if (message && message !== key && message !== `${searchListingLocaleNamespace}:${key}`) {
        return message
      }
    } catch {
      // Fall back to English below.
    }
  }
  const {default: english} = await import('./resources')
  return english[key]
}
