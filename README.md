# sanity-plugin-search-listing

A small Sanity Studio plugin for editing how a document appears in search results.

It registers a single `seo` object type with four fields:

- `image` - the social sharing image
- `title` - the page title shown in search results
- `description` - the meta description shown in search results
- `url` - an optional URL handle override

The plugin also adds a compact search listing preview above the editable fields. Editors can see the current title, description, URL, image, and common fallbacks without leaving the document form.

When a document does not have an SEO URL, document slug, or storefront slug yet, the URL handle field shows a visual fallback slugified from the document's `title`, `name`, or `store.title`. This does not save a slug value; it only previews the URL an automatic slug function would create. See [Persisting the slug](#persisting-the-slug).

A URL handle the editor types must be lowercase letters, numbers and hyphens, and must not match the `seo.url`, `slug`, or `store.slug` of another document of the same type.

## Why this design

Most projects need the same SEO fields on pages, products, posts, collections, and global settings. This plugin keeps that shape reusable without turning SEO into a large framework.

**vs. copying an SEO object into every schema**

- One shared `seo` type instead of repeating fields across documents.
- One preview UI everywhere the type is used.
- One place to adjust character counts, fallbacks, and image presentation.

**vs. a highly configurable SEO plugin**

- Two plugin options: `siteName` and `fallbacks`.
- No project-specific routes, document types, or frontend assumptions.
- The stored value stays plain Sanity data that your frontend can query however it wants.

## Agent skills

The package ships skills that walk a coding agent through a full setup or a migration: Studio schema, the slug and redirect Sanity Functions, and frontend metadata. Copy them into a project, and resync after upgrading:

```sh
npx sanity-plugin-search-listing skills sync
```

They are written to `.claude/skills` (Claude Code) and `.agents/skills` (Codex, Cursor, OpenCode):

- `search-listing-setup`: register the plugin, add `seo` fields with routes and fallbacks, hide routing slugs, and audit an existing dataset before migrating.
- `search-listing-functions`: `auto-slug` and `auto-redirect`, with tested reference code, plus the storefront redirect lookup.
- `search-listing-metadata`: render `<title>`, description and sharing tags with the same fallbacks as the Studio preview.

A skill you edit locally is kept on the next sync (`--force` replaces it). `npx sanity-plugin-search-listing skills check` exits non-zero when skills are missing or out of date; add `--mode=warn` for dev scripts.

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
    structureTool(),
    // After structureTool(): it adds the Duplicate action this plugin wraps.
    searchListing({
      siteName: 'Your Site Name',
    }),
  ],
})
```

### Duplicating documents

Duplicating a document that has an `seo` field leaves out its URL handle (`seo.url`) and its routing `slug`, so the copy never claims the original's URL. The Studio shows the copy's URL as the next free `<title>-copy` handle, and [`auto-slug`](#persisting-the-slug) saves it when the copy is published. Everything else is copied.

Register the plugin after `structureTool()`. Listed before it, the plugin cannot see the Duplicate action and logs a warning in the browser console. To keep the Studio's own Duplicate, pass `duplicate: false`. If your routing slug field is not called `slug`, name it: `duplicate: {omit: ['path']}`.

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

Set `options.handle` to `false` on a document that lives at one fixed URL, such as a landing page singleton. The preview shows `pathPrefix` as the whole path and the URL handle field is removed:

```ts
// makers landing page, always at /makers
options: {
  pathPrefix: '/makers',
  handle: false
}
```

## Fallbacks

When a listing field is empty, the preview and the field placeholders show a fallback, the way the storefront would. Fallbacks can be set per field and for the whole plugin, much like `sanity-plugin-link-picker` routes:

```ts
// sanity.config.ts: site-wide, tried last
searchListing({
  fallbacks: {
    image: {query: '*[_id == "preferences"][0].seo.image', label: 'Preferences'},
  },
})

// product schema: tried first
defineField({
  name: 'seo',
  type: 'seo',
  options: {
    pathPrefix: '/products/',
    fallbacks: {
      image: {path: 'store.previewImageUrl', label: 'Shopify'},
    },
  },
})
```

A product with no listing image shows its Shopify image; any other document shows the image set in Preferences. Uploading an image replaces the fallback.

Each of `image`, `title` and `description` takes one source or a list, tried in order:

- A path on the document, as a string (`'store.previewImageUrl'`) or `{path, label}`.
- A GROQ query, as `{query, params?, label?}`. It receives `$id`, `$draftId` and `$type` for the document being edited, sees drafts, and updates live.

The field's sources are tried before the plugin's. Without field fallbacks, `title` reads `title`, `name`, then `store.title`, and `description` reads `description`, `store.descriptionHtml`, then `body`. Setting `title` or `description` on a field replaces those defaults; an empty list turns them off.

An image fallback can be a Sanity image object, an image asset, or an image URL.

Fallbacks are only shown in the Studio; nothing is saved. Apply the same fallbacks where your frontend builds its metadata.

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

## Persisting the slug

The Studio preview only shows the slug a document would get. To save it, run the same rules where you write the document, usually a Sanity Function that fires when a document is published. The rules are exported from a separate entry with no React or Studio imports:

```ts
import {
  resolveAvailableSlug,
  SLUG_CANDIDATES_QUERY,
  type SlugDocument,
} from 'sanity-plugin-search-listing/slug'

// `client` must use the `raw` perspective so drafts are counted.
const documents = await client.fetch<SlugDocument[]>(SLUG_CANDIDATES_QUERY, {type: document._type})
const slug = resolveAvailableSlug(document, documents)
```

Using this entry keeps the saved slug identical to the one the editor was shown. The rules:

- An explicit slug always wins, in this order: `seo.url.current`, `slug.current`, `store.slug.current`.
- Otherwise the slug is derived from `title`, then `name`, then `store.title`.
- Documents with the same derived slug take `base`, `base-copy`, `base-copy-2`, and so on, in `_createdAt` order, skipping any slug another document already owns.
- The draft and published copies of a document count as one document. Release versions are ignored.

The entry also exports `slugify`, `isValidUrlHandle`, `isSlugTaken`, `getDocumentSlug`, `getTitleSlug` and `omitUrlHandle` (the duplicate guard's mapping, for your own copy flows).

### Sanity Functions

`sanity-plugin-search-listing/functions` has the two Functions' logic and their Blueprint events, so a project only lists its routed types:

```ts
// sanity.blueprint.ts
import {autoRedirectEvent, autoSlugEvent} from 'sanity-plugin-search-listing/functions'

const SLUG_TYPES = ['page', 'post'] // routed by slug.current; never Shopify types

defineDocumentFunction({
  name: 'auto-slug',
  src: './functions/auto-slug',
  event: autoSlugEvent(SLUG_TYPES),
})
defineDocumentFunction({
  name: 'auto-redirect',
  src: './functions/auto-redirect',
  event: autoRedirectEvent(SLUG_TYPES),
})
```

```ts
// functions/auto-slug/index.ts
import {createClient} from '@sanity/client'
import {documentEventHandler} from '@sanity/functions'
import {syncSlug, type SlugDocument} from 'sanity-plugin-search-listing/functions'

export const handler = documentEventHandler(async ({context, event}) => {
  const client = createClient({
    ...context.clientOptions,
    useCdn: false,
    apiVersion: '2025-05-08',
    perspective: 'raw',
  })
  await syncSlug(client, event.data as SlugDocument)
})
```

`auto-redirect` is the same with `syncRedirects(client, {page: '/pages/', post: '/blog/'}, event.data)` and `perspective: 'published'`. The `search-listing-functions` agent skill has the full setup, the redirect schema and the frontend lookup.
