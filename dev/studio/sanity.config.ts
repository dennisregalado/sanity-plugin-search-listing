import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {searchListing} from '../../src'
import {schemaTypes} from './schema'

export default defineConfig({
  name: 'default',
  title: 'Workbench',
  projectId: 'mock1234',
  dataset: 'production',
  plugins: [structureTool(), searchListing({siteName: 'Acme Store'})],
  schema: {types: schemaTypes},
})
