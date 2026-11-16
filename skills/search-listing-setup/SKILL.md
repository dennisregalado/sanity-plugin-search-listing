---
name: search-listing-setup
description: >
  Set up sanity-plugin-search-listing in a Sanity Studio, or migrate a project to it: register
  the plugin, add the `seo` field to each document type with its route, URL handle and
  fallbacks, and hide the routing slug. Use when adding SEO/search listing fields, URL handles
  or sharing-image fallbacks to a Sanity schema, or replacing a hand-rolled SEO object.
---

# Search listing setup

`sanity-plugin-search-listing` registers one object type, `seo` (`image`, `title`, `description`, `url`), with a Google-style preview. Editors set the page's URL handle in `seo.url`; nothing else about routing is shown to them.

Three skills cover a full setup. Do them in order:

1. **This skill**: Studio config and schema.
2. **`search-listing-functions`**: Sanity Functions that save the slug and create redirects.
3. **`search-listing-metadata`**: frontend metadata using the same fallbacks.

## 1. Inventory before writing anything

Answer these from the code, not from assumptions. Write the answers down; later steps use them.

- **Routed types.** Which document types have their own URL, and what is each route? Read the frontend router (e.g. `src/routes/pages/[slug]`, `app/blog/[slug]`). Record `type → path prefix`.
- **Routing field.** What does each route query on? Usually `slug.current`. Shopify-synced types (Sanity Connect) route on `store.slug.current` and are owned by Shopify.
- **Fixed-URL documents.** Singletons with one URL (`/`, `/about`, a landing page).
- **Site-wide settings.** A singleton (`preferences`, `settings`, `siteSettings`) that should hold the default sharing image. The plugin treats types named `preferences`, `site`, `storefront` and `theme` as site-wide: their listing is labelled "Home page title" and has no URL handle.
- **Existing SEO data.** Any type already named `seo` (it collides with the plugin's), and any fields such as `metaTitle`, `ogImage`, `seoDescription` that hold content.

## 2. Install and register

```sh
npm install sanity-plugin-search-listing
```

The plugin requires Sanity 6 (`sanity` ^6). It uses the Studio's `@sanity/ui` 4 and `@sanity/icons` 5 as peer dependencies; `sanity` already installs both, so do not add them separately. If the project is on Sanity 5, upgrade the Studio first or pin `sanity-plugin-search-listing@1.3`.

```ts
// sanity.config.ts
import {searchListing} from 'sanity-plugin-search-listing'

export default defineConfig({
  plugins: [
    structureTool(/* ... */),
    // After structureTool(): it adds the Duplicate action this plugin wraps, so a duplicate
    // is titled "… Copy" with its own URL instead of the original's. `duplicate: false` turns that off.
    searchListing({
      siteName: 'Site Name', // defaults to the workspace title
      fallbacks: {
        // Site-wide default image, tried after each field's own fallbacks.
        image: {query: '*[_type == "settings"][0].seo.image', label: 'Settings'},
      },
    }),
  ],
})
```

TypeScript weak-type checking rejects an options object whose properties are all unknown to an older plugin version. If a project must type-check against an older version, include `siteName` so at least one property overlaps.

## 3. Add the field to each type

```ts
defineField({
  name: 'seo',
  title: 'Search engine listing',
  type: 'seo',
  group: 'seo', // if the type uses groups
  options: {
    pathPrefix: '/blog/', // the route from the inventory
  },
})
```

Field options (`SearchListingFieldOptions`):

| Option       | Use                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------- |
| `pathPrefix` | Route before the handle. `/` for top-level pages.                                            |
| `handle`     | `false` for a fixed-URL document: the preview shows `pathPrefix` alone and the URL field is removed. |
| `fallbacks`  | Per-field fallbacks, tried before the plugin's. See below.                                   |

### Routing slug

For every routed type, keep the `slug` field the frontend queries but **hide it**: functions set it from `seo.url` (see `search-listing-functions`). Remove `options.source` and `required` validation, since editors never fill it.

```ts
defineField({name: 'slug', type: 'slug', hidden: true})
```

Do not hide or change `store.slug` on Shopify types. Make their `seo` field `readOnly: true` if Shopify owns their SEO.

### Fallbacks

When a listing field is empty, the Studio shows a fallback in its place. Mirror exactly what the frontend will use, so the preview never promises something the site does not render.

```ts
// Shopify product: its featured image
options: {pathPrefix: '/products/', fallbacks: {image: {path: 'store.previewImageUrl', label: 'Shopify'}}}
// Shopify collection
options: {pathPrefix: '/collections/', fallbacks: {image: {path: 'store.imageUrl', label: 'Shopify'}}}
// A person: their portrait
options: {pathPrefix: '/team/', fallbacks: {image: {path: 'portrait', label: 'Portrait'}}}
// A landing page whose intro copy is the description
options: {pathPrefix: '/makers', handle: false, fallbacks: {description: 'content'}}
```

Rules:

- A source is a document path (`'portrait'` or `{path, label}`) or a live GROQ query (`{query, params?, label?}`, given `$id`, `$draftId`, `$type`).
- Order: the field's sources, then the plugin's.
- Without field fallbacks, `title` reads `title`, `name`, `store.title`, and `description` reads `description`, `store.descriptionHtml`, `body`. Setting `title` or `description` on a field **replaces** these; `[]` turns them off.
- Image values may be a Sanity image, an image asset, or a URL.

Check the real field names before writing a path: `previewImageUrl` and `imageUrl` are Sanity Connect's names; other sync tools differ.

## 4. Migrating an existing project

Work through `migrating.md` in this folder when the project already has slugs, SEO fields or redirects.

## 5. Verify

- Run the Studio, open one document of each routed type, and check the preview: URL breadcrumb, title, description, image (or fallback with its label).
- Type a handle with a space: the field must show a validation error. Type another document's handle: it must say the slug is in use.
- Open a fixed-URL document: no URL handle field.
- Run the schema/type generation the project uses (e.g. `sanity schema extract && sanity typegen generate`).
