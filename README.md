# sanity-plugin-search-listing

A small Sanity Studio plugin for editing how a document appears in search results.

It registers a single `seo` object type with four fields:

- `image` - the social sharing image
- `title` - the page title shown in search results
- `description` - the meta description shown in search results
- `url` - an optional URL handle override

The plugin also adds a compact search listing preview above the editable fields. Editors can see the current title, description, URL, image, and common fallbacks without leaving the document form.

When a document does not have an SEO URL, document slug, or storefront slug yet, the URL handle field shows a visual fallback slugified from the document title. This does not save a slug value; it only previews the URL an automatic slug function could create later.

## Why this design

Most projects need the same SEO fields on pages, products, posts, collections, and global settings. This plugin keeps that shape reusable without turning SEO into a large framework.

**vs. copying an SEO object into every schema**

- One shared `seo` type instead of repeating fields across documents.
- One preview UI everywhere the type is used.
- One place to adjust character counts, fallbacks, and image presentation.

**vs. a highly configurable SEO plugin**

- Only one plugin option: `siteName`.
- No project-specific routes, document types, or frontend assumptions.
- The stored value stays plain Sanity data that your frontend can query however it wants.

## Installation

```sh
npm install sanity-plugin-search-listing
```

## Usage

Add the plugin to `sanity.config.ts`:

```ts
import {defineConfig} from 'sanity'
import {searchListing} from 'sanity-plugin-search-listing'

export default defineConfig({
  // ...
  plugins: [
    searchListing({
      siteName: 'Your Site Name',
    }),
  ],
})
```

Use the `seo` type anywhere in your schema:

```ts
import {defineField, defineType} from 'sanity'

export const page = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    defineField({
      name: 'seo',
      title: 'Search engine listing',
      type: 'seo',
      options: {
        pathPrefix: '/',
      },
    }),
  ],
})
```

Set `options.pathPrefix` on each schema field when a document type needs a route prefix in the preview:

```ts
defineField({
  name: 'seo',
  title: 'Search engine listing',
  type: 'seo',
  group: 'seo',
  options: {
    pathPrefix: '/products/',
  },
})
```

Common storefront patterns:

```ts
// page
options: {
  pathPrefix: '/'
}

// product
options: {
  pathPrefix: '/products/'
}

// collection
options: {
  pathPrefix: '/collections/'
}
```

## Stored Value

A saved search listing value looks like this:

```ts
type SearchListingValue = {
  _type?: 'seo'
  image?: unknown
  title?: string | null
  description?: string | null
  url?: {
    _type?: 'slug'
    current?: string | null
  } | null
}
```

The plugin does not generate frontend metadata for you. It gives editors a consistent object, then lets your GROQ projection and frontend decide how that object becomes `<title>`, meta tags, Open Graph tags, and canonical URLs.

## Querying Search Listings

Project the fields your frontend needs:

```groq
*[_type == "page" && slug.current == $slug][0] {
  title,
  slug,
  seo {
    image,
    title,
    description,
    url
  }
}
```

Then resolve fallbacks in your app:

```ts
type Page = {
  title?: string | null
  slug?: {current?: string | null} | null
  seo?: SearchListingValue | null
}

function resolveMetadata(page: Page) {
  return {
    title: page.seo?.title || page.title,
    description: page.seo?.description,
    slug: page.seo?.url?.current || page.slug?.current,
    image: page.seo?.image,
  }
}
```

The Studio preview uses similar fallbacks for common fields like `title`, `description`, `body`, and Shopify-style `store` data. Your frontend can keep those rules, simplify them, or replace them completely.
