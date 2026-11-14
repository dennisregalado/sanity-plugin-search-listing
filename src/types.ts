export interface SearchListingPluginOptions {
  /**
   * The site name shown above the search result preview.
   * Falls back to the current workspace title when omitted.
   */
  siteName?: string
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
}
