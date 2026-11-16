import {defaultFallbacks} from './fallbacks'
import type {SearchListingFieldOptions} from './types'

/**
 * Field options for documents synced by Sanity Connect for Shopify, which keeps the
 * product's data under `store`. Spread into the `seo` field's options:
 *
 * ```ts
 * defineField({name: 'seo', type: 'seo', options: {pathPrefix: '/products/', ...shopifyProduct}})
 * ```
 *
 * Title and description fall back to the document's own fields (the defaults), then the
 * Shopify product's; the image to its Shopify image. The URL comes from its Shopify handle,
 * and the listing shows its lowest price.
 */
export const shopifyProduct = {
  fallbacks: {
    title: [...defaultFallbacks.title, 'store.title'],
    description: [...defaultFallbacks.description, 'store.descriptionHtml'],
    image: {path: 'store.previewImageUrl', label: 'Shopify'},
  },
  slug: {source: ['store.title'], current: ['store.slug']},
  preview: {price: {path: 'store.priceRange.minVariantPrice', currency: 'USD'}},
} satisfies SearchListingFieldOptions

/** As `shopifyProduct`, for Sanity Connect collections: no price, and `store.imageUrl`. */
export const shopifyCollection = {
  fallbacks: {
    title: [...defaultFallbacks.title, 'store.title'],
    description: [...defaultFallbacks.description, 'store.descriptionHtml'],
    image: {path: 'store.imageUrl', label: 'Shopify'},
  },
  slug: {source: ['store.title'], current: ['store.slug']},
} satisfies SearchListingFieldOptions
