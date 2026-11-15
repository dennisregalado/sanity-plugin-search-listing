# Migrating to sanity-plugin-search-listing

Run each audit against the production dataset first and record the counts. Change nothing until the audits are read.

## A type named `seo` already exists

The plugin registers `seo`. Two types with one name fail schema validation.

1. Find it: `grep -rn "name: 'seo'" ` in the schema folder.
2. Compare its fields with the plugin's: `image`, `title`, `description`, `url` (slug).
3. If the stored field names match, delete the local type: existing data reads as-is.
4. If they differ, migrate the data to the plugin's names with a content migration (`sanity migration create`), then delete the local type. Example mapping: `metaTitle → seo.title`, `metaDescription → seo.description`, `ogImage → seo.image`.

```groq
// Documents with data in the old fields
count(*[defined(seo.metaTitle) || defined(seo.ogImage) || defined(metaTitle)])
```

## Existing slugs

No backfill is needed. A document with `slug.current` and no `seo.url` shows its slug as the URL handle, and `auto-slug` does not run for it (its filter only matches documents out of sync or with neither field).

```groq
// Routed documents with a slug but no handle: they keep their URL
count(*[_type in ["page","post"] && defined(slug.current) && !defined(seo.url.current)])
```

## Handles that differ from slugs

These go live the next time each document is published once `auto-slug` is deployed: `slug.current` moves to the handle and `auto-redirect` adds a redirect. Review them with the editors before deploying.

```groq
*[_type in ["page","post"] && defined(seo.url.current) && seo.url.current != slug.current]{
  _id, _type, "slug": slug.current, "handle": seo.url.current
}
```

## Invalid or duplicate slugs

The handle field accepts lowercase letters, numbers and hyphens, unique per type. Legacy slugs may break both rules. They keep working (the function never rewrites a slug that has no handle), but editing the handle will require a valid one.

GROQ has no regular expressions or group-by, so check in a script with the plugin's own rules:

```ts
import {createClient} from '@sanity/client'
import {isValidUrlHandle} from 'sanity-plugin-search-listing/slug'

const client = createClient({projectId, dataset, apiVersion: '2025-02-19', useCdn: false})
const docs = await client.fetch<{_id: string; _type: string; slug: string}[]>(
  `*[_type in $types && defined(slug.current) && !(_id in path("drafts.**"))]{_id, _type, "slug": slug.current}`,
  {types: ['page', 'post']},
)
const invalid = docs.filter((doc) => !isValidUrlHandle(doc.slug))
const seen = new Map<string, string>()
const duplicates = docs.filter((doc) => {
  const key = `${doc._type}:${doc.slug}`
  if (seen.has(key)) return true
  seen.set(key, doc._id)
  return false
})
console.table(invalid)
console.table(duplicates)
```

## Existing redirects

`auto-redirect` writes `redirect` documents with `source.current` and `destination.current` as full paths (`/blog/old`). If the project has its own redirect type:

- Same type name, different fields: migrate the data or rename one type.
- Bare slugs (`old`) instead of paths: they never match the storefront lookup. Prefix them with the type's route or delete them.

```groq
*[_type == "redirect" && !string::startsWith(source.current, "/")]{_id, "source": source.current}
```

Also check the frontend actually reads the redirect fields the schema defines. A query on fields the schema does not have (e.g. `from`/`to` against `source`/`destination`) types as `null` in TypeGen, which is a quick tell.

## Old slug functions

Remove any earlier slug or redirect Function and its Blueprint entry before deploying the new ones, so two functions never write the same field.
