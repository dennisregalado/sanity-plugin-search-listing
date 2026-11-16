/**
 * Where a fallback comes from when the search listing field is empty:
 *
 * - A path on the document being edited, such as `'store.previewImageUrl'`.
 * - A GROQ query, such as `{query: '*[_id == "preferences"][0].seo.image'}`. It receives
 *   `$id`, `$draftId` and `$type` for the document being edited, plus any `params`, and
 *   updates live while the Studio is open.
 *
 * `label` names the source under the fallback, such as `'Shopify'` or `'Preferences'`.
 */
export type SearchListingFallbackSource =
  | string
  | {path: string; label?: string}
  | {query: string; params?: Record<string, string>; label?: string}

/**
 * A fallback value. An image fallback can be a Sanity image object, an image asset, or a
 * URL; a title or description fallback is a string, HTML, or Portable Text.
 */
export type SearchListingFallbackValue = string | Record<string, unknown> | unknown[]

/** One source or several, tried in order, for each field of the search listing. */
export interface SearchListingFallbacks {
  image?: SearchListingFallbackSource | SearchListingFallbackSource[]
  title?: SearchListingFallbackSource | SearchListingFallbackSource[]
  description?: SearchListingFallbackSource | SearchListingFallbackSource[]
}

export interface SearchListingPluginOptions {
  /**
   * The site name shown above the search result preview.
   * Falls back to the current workspace title when omitted.
   */
  siteName?: string
  /**
   * Fallbacks for every `seo` field, tried after the field's own `fallbacks`. Use it for
   * site-wide defaults, such as a sharing image set in a settings document.
   */
  fallbacks?: SearchListingFallbacks
  /**
   * Duplicating a document with an `seo` field leaves out its URL handle and routing slug and
   * appends `titleSuffix` to its title, so "Homepage" is copied as "Homepage Copy" at
   * `homepage-copy` instead of claiming the original's URL. `false` keeps the Studio's
   * default Duplicate; `omit` names the routing slug fields; `titleSuffix: false` keeps the title.
   * @defaultValue `true` (omits `slug`, appends `' Copy'`)
   */
  duplicate?: boolean | {omit?: string[]; titleSuffix?: string | false}
}

export type SearchListingValue = {
  _type?: 'seo'
  image?: unknown
  title?: string | null
  description?: string | null
  url?: {
    _type?: 'slug'
    current?: string | null
  } | null
}

/** Set as `options` on a field of type `seo`. */
export interface SearchListingFieldOptions {
  /** The route the document lives under, shown before the URL handle. Defaults to `/`. */
  pathPrefix?: string
  /**
   * Set to `false` for a document with a fixed URL, such as a landing page singleton. The
   * preview then shows `pathPrefix` as the whole path and the URL handle field is removed.
   */
  handle?: boolean
  /**
   * Fallbacks for this field, tried before the plugin's. Setting `title` or `description`
   * here replaces the defaults read from the document (`title`, `name`, `store.title`, and
   * `description`, `store.descriptionHtml`, `body`).
   */
  fallbacks?: SearchListingFallbacks
}
