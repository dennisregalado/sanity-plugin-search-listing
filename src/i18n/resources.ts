/**
 * The plugin's Studio strings in US English: the `search-listing` namespace. Keys are flat and
 * dot-separated. Values use i18next interpolation (`{{name}}`); a translation can add plural
 * forms (`key_one`, `key_other`) for keys that receive a `count`.
 */
const searchListingLocaleStrings = {
  /** Shown, muted, in place of the title when the listing has no title or fallback. */
  'preview.untitled': 'Untitled',
  /** Shown, muted, at the end of the preview's breadcrumb when the page has no URL handle yet. */
  'preview.missing-handle': 'url-handle',

  /** The Edit toggle's text while the listing is previewed. */
  'edit-toggle.edit': 'Edit',
  /** The Edit toggle's text while the listing is edited. */
  'edit-toggle.done': 'Done',
  /** The Edit toggle's accessible label and tooltip heading while the listing is previewed. */
  'edit-toggle.edit.label': 'Edit listing',
  /** The Edit toggle's accessible label and tooltip heading while the listing is edited. */
  'edit-toggle.done.label': 'Done editing',
  /** The Edit toggle's tooltip, above the hidden fields' problems, when one is an error. */
  'edit-toggle.level.error': 'Fix before publishing',
  /** The Edit toggle's tooltip, above the hidden fields' problems, when the worst is a warning. */
  'edit-toggle.level.warning': 'Needs attention',
  /** The Edit toggle's tooltip, above the hidden fields' problems, when they are all notes. */
  'edit-toggle.level.info': 'Notes',
  /** A problem on a hidden field in the Edit toggle's tooltip: the field's title and the message. */
  'edit-toggle.problem': '{{title}}: {{message}}',

  /** The title field's label. */
  'field.title.title': 'Page title',
  /** The title field's label on a `home` document. */
  'field.title.home-title': 'Home page title',
  /** The description field's label. */
  'field.description.title': 'Meta description',
  /** The URL handle field's label. */
  'field.url.title': 'URL handle',
  /** Placeholder of an empty description on a `home` document with no fallback. */
  'field.description.home-placeholder':
    'Enter a description to be shown on search engines like Google',
  /** Below the title and description: how many characters are typed, of the recommended maximum. */
  'field.characters-used': '{{count}} of {{max}} characters used',

  /** The button that resets the URL handle to the one generated from the title. */
  'url-handle.reset': 'Reset',
  /** The Reset button's tooltip; `path` is the generated URL path, such as `/pages/about`. */
  'url-handle.reset.tooltip': 'Reset to {{path}}, the URL generated from the title',
  /** Shown when the handle differs from the published one; `path` is the published URL path. */
  'url-handle.published-moved':
    'Published at {{path}}. Changing the handle moves the page; links to the old URL need a redirect.',

  /** Heading of the popover naming the document a fallback image comes from. */
  'fallback-image.from-document': 'Fallback image from',
  /** Tooltip on a fallback image; `source` is a field path (such as "Shopify › Preview image URL") or a label. */
  'fallback-image.from-source': 'Fallback image from {{source}}',
  /** Tooltip on a fallback image whose source has no name. */
  'fallback-image.tooltip': 'Fallback image',

  /** Validation warning on a title longer than the recommended maximum. */
  'validation.title-too-long': 'Longer titles may be truncated by search engines',
  /** Validation warning on a description longer than the recommended maximum. */
  'validation.description-too-long': 'Longer descriptions may be truncated by search engines',
  /** Validation error on a URL handle with characters other than lowercase letters, numbers and hyphens. */
  'validation.url-handle-invalid': 'Use lowercase letters, numbers and hyphens only',
} as const

/** @public */
export type SearchListingLocaleResourceKeys = keyof typeof searchListingLocaleStrings

export default searchListingLocaleStrings
