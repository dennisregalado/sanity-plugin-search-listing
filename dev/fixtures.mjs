/**
 * The workbench dataset. Each document is served by the mocked Content Lake in `mock-api.mjs`.
 * Add documents here for new screenshot scenarios.
 */
const now = '2026-01-01T00:00:00Z'

export const IMAGE_ASSET_ID = 'image-0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c-1200x630-png'

export const documents = [
  {
    _id: IMAGE_ASSET_ID,
    _type: 'sanity.imageAsset',
    _createdAt: now,
    _updatedAt: now,
    _rev: 'r1',
    url: `https://cdn.sanity.io/images/mock1234/production/0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c-1200x630.png`,
    path: 'images/mock1234/production/0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c-1200x630.png',
    assetId: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c',
    extension: 'png',
    mimeType: 'image/png',
    originalFilename: 'share.png',
    size: 1024,
    metadata: {
      _type: 'sanity.imageMetadata',
      dimensions: {_type: 'sanity.imageDimensions', width: 1200, height: 630, aspectRatio: 1.9047},
      lqip: '',
    },
  },
  {
    _id: 'settings',
    _type: 'settings',
    _createdAt: now,
    _updatedAt: now,
    _rev: 'r1',
    title: 'Acme Store',
    seo: {
      _type: 'seo',
      image: {_type: 'image', asset: {_type: 'reference', _ref: IMAGE_ASSET_ID}},
    },
  },
  {
    _id: 'page-about',
    _type: 'page',
    _createdAt: now,
    _updatedAt: now,
    _rev: 'r1',
    title: 'About Us',
    description:
      'Acme makes durable everyday goods in small batches. Learn about our story, the people behind the work, and the materials we choose for every product we make.',
  },
  {
    _id: 'page-long',
    _type: 'page',
    _createdAt: now,
    _updatedAt: now,
    _rev: 'r1',
    title: 'Contact',
    slug: {_type: 'slug', current: 'contact'},
    seo: {
      _type: 'seo',
      title:
        'Contact Acme Store customer support for orders, returns, wholesale and press enquiries today',
      url: {_type: 'slug', current: 'about-us'},
    },
  },
  {
    _id: 'page-error',
    _type: 'page',
    _createdAt: now,
    _updatedAt: now,
    _rev: 'r1',
    title: 'Careers',
    seo: {_type: 'seo', url: {_type: 'slug', current: 'Join Us!'}},
  },
  {
    _id: 'page-empty',
    _type: 'page',
    _createdAt: now,
    _updatedAt: now,
    _rev: 'r1',
  },
  {
    _id: 'product-tote',
    _type: 'product',
    _createdAt: now,
    _updatedAt: now,
    _rev: 'r1',
    store: {
      title: 'Canvas Tote Bag',
      descriptionHtml:
        '<p>A <strong>heavyweight</strong> canvas tote with an inside pocket and reinforced handles.</p>',
      previewImageUrl: 'https://cdn.shopify.com/s/files/tote.png',
      slug: {_type: 'slug', current: 'canvas-tote-bag'},
      priceRange: {minVariantPrice: 1299},
    },
  },
]
