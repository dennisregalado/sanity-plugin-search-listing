---
name: search-listing-metadata
description: >
  Render page metadata (title, meta description, Open Graph and Twitter tags) from
  sanity-plugin-search-listing `seo` fields with the same fallbacks the Studio preview shows,
  including Shopify product images and a site-wide default image. Use when wiring SEO or
  sharing tags into a frontend that uses the plugin, or when the live tags do not match the
  Studio search listing preview.
---

# Search listing metadata

The plugin only stores data and previews it. The frontend has to apply the **same fallbacks in the same order**, or the Studio promises one listing and the site renders another.

## The contract

For each field, the first value with content wins:

1. The document's `seo` value (`seo.title`, `seo.description`, `seo.image`).
2. The field's own fallbacks (the `fallbacks` option on that type's `seo` field). Without any, `title` uses `title`/`name`/`store.title` and `description` uses `description`/`store.descriptionHtml`/`body`.
3. The plugin-level fallbacks (`searchListing({fallbacks})`), typically the site-wide settings document.

Before coding, read `sanity.config.ts` and every `seo` field's `options.fallbacks`, and write the order down per route.

## Shape

- **One resolver module.** Copy `references/seo.ts`: `firstText`, `firstImage`, `toDescription` (plain text, clipped at 160), `sizeImageUrl` (crops Shopify CDN images to 1200×630).
- **Each route resolves its own metadata** from data it already loads, with steps 1 and 2, and returns `{title, description, image}`.
- **One head component** renders the tags. It receives step 3 (the settings document's listing) and fills only what the route left empty.
- **One `<title>`.** Remove per-page `<title>` tags so the head component is the only one. Leave error pages their own.

Images arrive in two shapes: a Sanity image (build the URL with `@sanity/image-url` at 1200×630) or `{url, altText}` (Shopify, external). Handle both.

## Projections

Every routed query must project the listing:

```groq
seo { title, description, image }
```

For Shopify-owned types, SEO comes from the Storefront API, not Sanity:

```graphql
product(handle: $handle) { title descriptionHtml seo { title description } featuredImage { url altText } }
collection(handle: $handle) { title description seo { title description } image { url altText } }
```

`store.previewImageUrl` (the Studio fallback) is Sanity Connect's copy of the Shopify featured image, so the two match.

## Per-route patterns

```ts
// Page: listing, then its own title
metadata: {
  title: firstText(page.seo?.title, page.title),
  description: firstText(page.seo?.description),
  image: firstImage(page.seo?.image),
}

// Homepage: listing only. Homepage documents often have internal titles ("SU26 HP"), so
// the head component falls back to the settings listing, which the Studio labels
// "Home page title" on site-wide documents.
metadata: {title: firstText(home.seo?.title), description: firstText(home.seo?.description), image: firstImage(home.seo?.image)}

// Shopify product
metadata: {
  title: firstText(product.seo?.title, product.title),
  description: toDescription(firstText(product.seo?.description, product.descriptionHtml)),
  image: firstImage(product.featuredImage),
}
```

Any fallback the frontend adds (a maker portrait, intro copy) must also be added to that type's `seo` field `fallbacks`, so the Studio preview shows it.

## Framework wiring

**SvelteKit**: return `metadata` from each `+page.server.ts` load. In the layout, render a `Seo` component that reads `page.data.metadata` and takes the settings listing as a prop. Skip `<title>` when `page.error` is set.

**Next.js (App Router)**: resolve in `generateMetadata`, merging the settings listing last:

```ts
const toImageUrl = (image: SeoImage) =>
  typeof image.url === 'string' ? sizeImageUrl(image.url) : urlFor(image).width(1200).height(630).url()

export async function generateMetadata({params}): Promise<Metadata> {
  const [page, settings] = await Promise.all([getPage(params.slug), getSettings()])
  const image = firstImage(page.seo?.image, settings.seo?.image)
  return {
    title: firstText(page.seo?.title, page.title, settings.seo?.title),
    description: firstText(page.seo?.description, settings.seo?.description),
    openGraph: image ? {images: [{url: toImageUrl(image), width: 1200, height: 630}]} : undefined,
  }
}
```

## Verify

Unit-test the resolver. Then load one page of each route with an empty listing and check the rendered `<title>`, `meta[name=description]`, `og:image` against the Studio preview for the same document. There must be exactly one `<title>` in the head.
