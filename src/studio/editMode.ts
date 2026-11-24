import type {FormNodeValidation, FormPatch, ObjectMember, Path} from 'sanity'

/** A validation message on a listing member that is hidden while the listing is closed. */
export type HiddenProblem = {
  /** The member's title, such as "Page title". */
  title: string
  message: string
  level: FormNodeValidation['level']
}

/** The most severe level among `problems`, or `undefined` when there are none. */
export type HiddenProblemLevel = FormNodeValidation['level'] | undefined

const LEVEL_RANK: Record<FormNodeValidation['level'], number> = {info: 1, warning: 2, error: 3}

/**
 * Validation messages on the given members (the ones closed edit mode hides), most severe
 * first, so the Edit toggle can say something needs attention.
 */
export function getHiddenProblems(members: readonly ObjectMember[]): HiddenProblem[] {
  const problems: HiddenProblem[] = []

  for (const member of members) {
    if (member.kind !== 'field') continue
    const title = member.field.schemaType.title || member.name
    for (const marker of member.field.validation ?? []) {
      problems.push({title, message: marker.message, level: marker.level})
    }
  }

  return problems.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])
}

/** The highest validation level among `problems`. */
export function getHighestLevel(problems: readonly HiddenProblem[]): HiddenProblemLevel {
  return problems.reduce<HiddenProblemLevel>(
    (highest, problem) =>
      !highest || LEVEL_RANK[problem.level] > LEVEL_RANK[highest] ? problem.level : highest,
    undefined,
  )
}

/** The Sanity UI tone for a validation level: errors are critical, warnings caution. */
export function getLevelTone(level: HiddenProblemLevel): 'critical' | 'caution' | 'default' {
  if (level === 'error') return 'critical'
  if (level === 'warning') return 'caution'
  return 'default'
}

/**
 * The listing member a focus path (relative to the `seo` object) points into, such as `title`
 * for `['title']` or `url` for `['url', 'current']`. Validation panel clicks, links and presence
 * move focus this way.
 */
export function getFocusedMemberName(focusPath: Path | undefined): string | undefined {
  const first = focusPath?.[0]
  return typeof first === 'string' ? first : undefined
}

/**
 * Whether a focus path points into a member that only edit mode renders: anything but the
 * image, which is always shown.
 */
export function isFocusOnHiddenMember(focusPath: Path | undefined): boolean {
  const name = getFocusedMemberName(focusPath)
  return Boolean(name) && name !== 'image'
}

/**
 * The patches the image input may write while it shows a stand-in fallback image (a value
 * the document doesn't have). Only a change that sets a real asset gets through, so Upload and
 * Select still write a complete image. Anything else (Clear field, hotspot or crop edits) would
 * write a partial `seo.image` (or unset the listing), so it is dropped. Upload progress
 * (`_upload`) is dropped too: the stand-in can't show it, and its clean-up would arrive after
 * the input has swapped to the real image. Patch paths are relative to the image.
 */
export function guardFallbackImagePatches(patches: readonly FormPatch[]): FormPatch[] {
  if (!patches.some(setsAsset)) return []
  return patches.filter((patch) => patch.path[0] !== '_upload')
}

/** Whether a patch sets the image's asset to a reference. */
function setsAsset(patch: FormPatch): boolean {
  if (patch.type !== 'set') return false
  const value = patch.value as {_ref?: unknown; asset?: {_ref?: unknown}} | undefined
  if (patch.path.length === 1 && patch.path[0] === 'asset') return typeof value?._ref === 'string'
  if (patch.path.length === 0) return typeof value?.asset?._ref === 'string'
  return false
}
