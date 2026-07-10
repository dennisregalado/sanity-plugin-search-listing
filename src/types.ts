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
