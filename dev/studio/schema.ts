import {defineField, defineType} from 'sanity'

import {shopifyProduct} from '../../src'

export const schemaTypes = [
  defineType({
    name: 'page',
    title: 'Page',
    type: 'document',
    fields: [
      defineField({name: 'title', type: 'string'}),
      defineField({name: 'slug', type: 'slug'}),
      defineField({name: 'description', type: 'text'}),
      defineField({
        name: 'seo',
        title: 'Search engine listing',
        type: 'seo',
        options: {
          pathPrefix: '/pages/',
          fallbacks: {
            image: {query: '*[_id == "settings"][0].seo.image', label: 'Settings'},
          },
        },
      }),
    ],
  }),
  defineType({
    name: 'product',
    title: 'Product',
    type: 'document',
    fields: [
      defineField({name: 'title', type: 'string'}),
      defineField({
        name: 'store',
        title: 'Shopify',
        type: 'object',
        fields: [
          defineField({name: 'title', type: 'string'}),
          defineField({name: 'descriptionHtml', type: 'text'}),
          defineField({name: 'previewImageUrl', title: 'Preview image URL', type: 'string'}),
          defineField({name: 'slug', type: 'slug'}),
          defineField({
            name: 'priceRange',
            type: 'object',
            fields: [defineField({name: 'minVariantPrice', type: 'number'})],
          }),
        ],
      }),
      defineField({
        name: 'seo',
        title: 'Search engine listing',
        type: 'seo',
        options: {pathPrefix: '/products/', ...shopifyProduct},
      }),
    ],
  }),
  defineType({
    name: 'settings',
    title: 'Settings',
    type: 'document',
    fields: [
      defineField({name: 'title', type: 'string'}),
      defineField({
        name: 'seo',
        title: 'Search engine listing',
        type: 'seo',
        options: {home: true},
      }),
    ],
  }),
]
