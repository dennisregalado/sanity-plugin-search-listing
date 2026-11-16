# sanity-plugin-search-listing

A small Sanity Studio plugin for editing how a document appears in search results.

It registers a single `seo` object type with four fields:

- `image` - the social sharing image
- `title` - the page title shown in search results
- `description` - the meta description shown in search results
- `url` - an optional URL handle override

The plugin also adds a compact search listing preview above the editable fields. Editors can see the current title, description, URL, image, and common fallbacks without leaving the document form.

When a document does not have an SEO URL or routing slug yet, the URL handle field shows a visual fallback slugified from the document's `title` or `name` (or the fields in the [`slug` option](#field-options)). This does not save a slug value; it only previews the URL an automatic slug function would create. See [Persisting the slug](#persisting-the-slug).

A URL handle the editor types must be lowercase letters, numbers and hyphens, and must not match the `seo.url` or routing slug (`slug`, or the `slug.current` fields you configure) of another document of the same type.

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

The Studio plugin requires Sanity 6.10 or later and React 19.2 or later. It uses the Studio's own `@sanity/ui` (4) and `@sanity/icons` (5), which `sanity` already installs, so they are peer dependencies rather than bundled copies. Sanity 6.0 to 6.9 ship `@sanity/ui` 3, which this plugin does not support. For Sanity 5, stay on 1.3.x.

The `/slug` and `/functions` entries need none of these: `sanity`, `react`, `@sanity/ui` and `@sanity/icons` are optional peers, so a Sanity Function can install the package without a Studio.

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

Duplicating a document that has an `seo` field appends " Copy" to its title and leaves out its URL handle (`seo.url`) and routing `slug`, so the copy never claims the original's URL. Its URL follows from the new title, and [`auto-slug`](#persisting-the-slug) saves it when the copy is published. Everything else is copied.

| Duplicate       | Title         | URL               |
| --------------- | ------------- | ----------------- |
| Homepage        | Homepage Copy | `homepage-copy`   |
| Homepage, again | Homepage Copy | `homepage-copy-2` |
| Homepage Copy   | Homepage Copy | `homepage-copy-3` |

A title that already ends in " Copy" is left alone. The suffix goes on `title`, or on `name` for types without one.

Register the plugin after `structureTool()`. Listed before it, the plugin cannot see the Duplicate action and logs a warning in the browser console. To keep the Studio's own Duplicate, pass `duplicate: false`. If your routing slug field is not called `slug`, name it: `duplicate: {omit: ['path']}`. Change or drop the title suffix with `duplicate: {titleSuffix: ' (copy)'}` or `titleSuffix: false`.

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

### Field options

Set these as `options` on each `seo` field:

| Option          | What it does                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pathPrefix`    | The route shown before the URL handle, e.g. `'/products/'`. Default `/`.                                                                                                                        |
| `handle: false` | A document at a fixed URL: no URL handle field; the preview shows `pathPrefix`.                                                                                                                 |
| `home: true`    | The site's own listing, on a settings or home page document: no URL handle, the preview shows the host, the description may run to 320 characters, and the title field reads "Home page title". |
| `fallbacks`     | What the listing shows while a field is empty. See [Fallbacks](#fallbacks).                                                                                                                     |
| `maxLength`     | `{title, description}` lengths past which the listing warns. Default `{title: 70, description: 160}` (320 with `home`).                                                                         |
| `slug`          | Where the URL comes from when there is no handle: `{source, current}` as dot paths. Default `{source: ['title', 'name'], current: ['slug']}`.                                                   |
| `preview.price` | A price under the description: a path to a number, or `{path, currency}` (default `USD`).                                                                                                       |

#### Presets: Sanity Connect for Shopify

Sanity Connect keeps a product's data under `store` (`store.title`, `store.descriptionHtml`, `store.slug`, `store.previewImageUrl`, `store.priceRange`). Spread a preset instead of writing those paths:

```ts
import {shopifyCollection, shopifyProduct} from 'sanity-plugin-search-listing'

defineField({name: 'seo', type: 'seo', options: {pathPrefix: '/products/', ...shopifyProduct}})
defineField({
  name: 'seo',
  type: 'seo',
  options: {pathPrefix: '/collections/', ...shopifyCollection},
})
```

`shopifyProduct` sets the title, description and image fallbacks, `slug: {source: ['store.title'], current: ['store.slug']}` and the price line; `shopifyCollection` the same without a price and with `store.imageUrl`. To change one part, spread it too: `fallbacks: {...shopifyProduct.fallbacks, image: 'mainImage'}`.

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

The field's sources are tried before the plugin's. Without field fallbacks, `title` reads `title`, then `name`, and `description` reads `description`. Setting `title` or `description` on a field replaces those defaults; extend them instead with `defaultFallbacks`, and an empty list turns them off:

```ts
import {defaultFallbacks} from 'sanity-plugin-search-listing'

options: {fallbacks: {title: [...defaultFallbacks.title, 'headline'], description: 'excerpt'}}
```

For Shopify documents use the [Sanity Connect presets](#presets-sanity-connect-for-shopify).

While the image is empty and the listing is not in edit mode, its fallback is shown in the image field: a Sanity image through the image input itself (nothing is saved), any other image URL in a box like the input's preview. Hovering it names the source: a fallback from another document (a query such as `*[_type == "settings"][0].seo.image`) opens a popover with that document's preview, linking to the field; one read from the document itself names the field. A title or description fallback is the field's placeholder, clipped to its `maxLength`; the character count only counts what is typed.

An image fallback can be a Sanity image object, an image asset, or an image URL.

Fallbacks are only shown in the Studio; nothing is saved. Apply the same fallbacks where your frontend builds its metadata.

## Migrating to 2.0

- **Sanity 6.10+ only.** `@sanity/ui` 4, `@sanity/icons` 5 and `sanity` 6.10+ are peer dependencies.
- **No Shopify defaults.** Title, description and slug no longer read `store.title`, `store.descriptionHtml`, `body` or `store.slug` unless configured. Add `...shopifyProduct` / `...shopifyCollection` to Sanity Connect `seo` fields, and `description: 'body'` (or similar) where the body was the description.
- **`home: true` instead of type names.** The plugin no longer treats `preferences`, `site`, `storefront` or `theme` specially; set `home: true` on that document's `seo` field.
- **Numbered duplicates.** Same-title slugs are `base-2`, `base-3` (were `base-copy`, `base-copy-2`); saved slugs never change.

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

The Studio preview uses the fallbacks configured on each `seo` field and the plugin. Apply the same order in your frontend; the `search-listing-metadata` agent skill shows how.

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

- An explicit slug always wins, in this order: `seo.url.current`, then each routing slug field (`slug.current` by default).
- Otherwise the slug is derived from `title`, then `name` (or the `slug.source` paths).
- Every rule takes the field's `slug` options as its last argument: `resolveAvailableSlug(document, documents, {source: ['store.title'], current: ['store.slug']})`, with `getSlugCandidatesQuery(options)` to fetch the documents.
- Documents with the same derived slug take `base`, `base-2`, `base-3`, and so on, in `_createdAt` order, skipping any slug another document already owns.
- The draft and published copies of a document count as one document. Release versions are ignored.

The entry also exports `slugify`, `isValidUrlHandle`, `isSlugTaken`, `getDocumentSlug`, `getTitleSlug` and `prepareDuplicate` / `omitUrlHandle` (the duplicate guard's mapping, for your own copy flows).

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
