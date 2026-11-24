# Changelog

## Unreleased

### Added

- `siteUrl` plugin option, and a per-field `siteUrl` for multi-site schemas: the listing shows the site's URL instead of the Studio's host.
- Edit mode opens when focus moves to a hidden field (validation panel, links, presence), and once when a hidden field gets an error.
- URL handle **Reset** button: sets the handle to the URL generated from the title.
- A caution note when the handle would move a page published at an explicit URL.
- Studio UI strings are translatable: `searchListingLocaleNamespace`, `searchListingUsEnglishLocaleBundle` and `SearchListingLocaleResourceKeys`.
- `autoSlugEvent`, `autoRedirectEvent` and `syncSlug` take the field's `slug` option (`{source, current}`); the first `current` path is the routing slug.
- `SlugOptions` exported from `/functions`; `getPathValue` exported from `/slug`.
- Options on a named `seo` subtype (`defineType({name: 'productSeo', type: 'seo', options})`), merged shallowly with the field's own.
- A workbench Studio with a mocked Content Lake for development and screenshots (`dev/`).

### Changed

- The "Edit listing" button is an Edit/Done toggle in the listing's header. While closed it takes the tone of the hidden fields' warnings or errors and lists them in its tooltip.
- The price line uses the full currency format in the Studio's locale (`$1,299.00`, was `$1.3K`).
- The preview title uses the theme's link colour, shows a muted "Untitled" without a title, and the breadcrumb ends in a "url-handle" placeholder when a handle is missing.
- The slug preview computes the slug locally on each title change from one live query per type (no refetch, no 300 ms delay).
- `home: true` inputs use the same fallbacks as the preview.

### Fixed

- Typing into an empty title, description or handle appended to the fallback ("About UsOur story"); the fallback is now selected and replaced.
- An `seo` field inside an object or array used the wrong options in validation and the input.
- A Sanity-image fallback could be partly written by Clear, hotspot/crop or upload progress; only Upload and Select write an image now.
- The fallback-source popover opens from the keyboard (focus, Escape, Tab to the link).
- The URL prefix in the handle field follows the theme (dark mode).
- Edit mode no longer depends on CSS against Studio internals.
- Duplicating a document whose `seo` field uses a named subtype (`productSeo`) kept its URL handle.
- The listing showed a typed handle percent-encoded (`Join%20Us!`).

## 2.0.0 - 2026-11-16

### Breaking

- Requires Sanity 6, with `@sanity/ui` 4 and `@sanity/icons` 5 as peers. Sanity 5 stays on 1.3.x.
- No Shopify defaults: title, description and slug no longer read `store.*` or `body` unless configured.
- `home: true` replaces the special `preferences`, `site`, `storefront` and `theme` type names.

### Added

- Fallback image shown in the image field, with its source on hover (a popover for another document's field).
- Field options `home`, `maxLength`, `slug` (`{source, current}`) and `preview.price`.
- `shopifyProduct` and `shopifyCollection` presets for Sanity Connect, and `defaultFallbacks`.
- `getSlugCandidatesQuery(options)`; slug rules and Functions take `SlugOptions`.

### Fixed

- The character count counts only what is typed, not the fallback; fallback placeholders are clipped to `maxLength`.

## 1.3.1 - 2026-11-16

- `@sanity/ui` is an optional peer (`^3 || ^4`), so a Sanity 6 Studio no longer gets a second copy; `@sanity/icons` is no longer a dependency.

## 1.3.0 - 2026-11-16

- Duplicate leaves out the URL handle and routing slug and appends " Copy" to the title (`duplicate` option).
- Same-title slugs are numbered `base-2`, `base-3` (were `base-copy`, `base-copy-2`).
- New `/functions` entry: `syncSlug`, `syncRedirects`, `autoSlugEvent`, `autoRedirectEvent`.
- `omitUrlHandle` and `prepareDuplicate` exported from `/slug`.

## 1.2.0 - 2026-11-15

- `fallbacks` at the field and plugin level: document paths or live GROQ queries.
- Agent skills for setup, Functions and metadata, with `npx sanity-plugin-search-listing skills sync`.
- `react` and `sanity` are optional peers, so the `/slug` entry works without a Studio.

## 1.1.0 - 2026-11-14

- New `/slug` entry with the slug rules, so a Function saves the slug the Studio previews.
- `handle: false` field option for documents at a fixed URL.
- URL handle validation: format, and uniqueness against other documents' handles and slugs.
- Title and slug previews fall back to the document's `name`.
- The slug preview no longer refetches on every render.

## 1.0.7 - 2026-07-10

- `siteName` falls back to the workspace title.

## 1.0.6 - 2026-07-09

- First release: the `seo` object type with a search listing preview.
