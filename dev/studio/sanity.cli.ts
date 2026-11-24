import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {projectId: 'mock1234', dataset: 'production'},
  server: {port: 3333},
})
