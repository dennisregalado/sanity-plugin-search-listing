/**
 * A demo locale for the workbench: Norwegian (bokmål) strings for the plugin only, to see the
 * listing translated. Sanity's own strings stay English (no `@sanity/locale-nb-no` installed).
 * Listed before US English, so the Studio still opens in English; the `nb-*` screenshot
 * scenarios pick this locale.
 */
import {defineLocale, defineLocaleResourceBundle} from 'sanity'

import {searchListingLocaleNamespace, type SearchListingLocaleResourceKeys} from '../../src'

const searchListingNorwegian: Record<SearchListingLocaleResourceKeys, string> = {
  'preview.untitled': 'Uten tittel',
  'preview.missing-handle': 'url-adresse',
  'edit-toggle.edit': 'Rediger',
  'edit-toggle.done': 'Ferdig',
  'edit-toggle.edit.label': 'Rediger oppføring',
  'edit-toggle.done.label': 'Ferdig med redigering',
  'edit-toggle.level.error': 'Rett før publisering',
  'edit-toggle.level.warning': 'Trenger oppmerksomhet',
  'edit-toggle.level.info': 'Merknader',
  'edit-toggle.problem': '{{title}}: {{message}}',
  'field.title.title': 'Sidetittel',
  'field.title.home-title': 'Tittel på forsiden',
  'field.description.title': 'Metabeskrivelse',
  'field.url.title': 'URL-adresse',
  'field.description.home-placeholder': 'Skriv en beskrivelse som vises i søkemotorer som Google',
  'field.characters-used': '{{count}} av {{max}} tegn brukt',
  'url-handle.reset': 'Tilbakestill',
  'url-handle.reset.tooltip': 'Tilbakestill til {{path}}, URL-en laget fra tittelen',
  'url-handle.published-moved':
    'Publisert på {{path}}. Endrer du adressen, flyttes siden; lenker til den gamle URL-en trenger en omdirigering.',
  'fallback-image.from-document': 'Reservebilde fra',
  'fallback-image.from-source': 'Reservebilde fra {{source}}',
  'fallback-image.tooltip': 'Reservebilde',
  'validation.title-too-long': 'Lengre titler kan bli forkortet av søkemotorer',
  'validation.description-too-long': 'Lengre beskrivelser kan bli forkortet av søkemotorer',
  'validation.url-handle-invalid': 'Bruk bare små bokstaver, tall og bindestreker',
}

export const norwegianLocale = defineLocale({
  id: 'nb-NO',
  title: 'Norsk (bokmål)',
  weekInfo: {firstDay: 1, weekend: [6, 7]},
  bundles: [
    defineLocaleResourceBundle({
      locale: 'nb-NO',
      namespace: searchListingLocaleNamespace,
      resources: searchListingNorwegian,
    }),
  ],
})
