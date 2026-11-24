import type {NormalizedSource} from '../fallbacks'
import type {FallbackField} from '../fallbacks'
import type {SearchListingFallbackValue} from '../types'

export type StudioFormDocument = {
  _createdAt?: unknown
  _id?: unknown
  _type?: unknown
  seo?: {
    description?: unknown
    title?: unknown
    url?: {
      current?: unknown
    } | null
  } | null
  [field: string]: unknown
}

export type ResolvedFallback = {value: SearchListingFallbackValue; source: NormalizedSource}
export type ResolvedFallbacks = Partial<Record<FallbackField, ResolvedFallback>>
