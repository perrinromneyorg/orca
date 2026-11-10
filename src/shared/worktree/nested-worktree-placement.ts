import { splitWorktreeId } from './id'
import type { WorktreeNestedIn } from './types'

/** Validated placement for a nested-repo worktree; throws on anything that could escape the container. */
export function resolveNestedWorktreePlacement(
  nestedUnder: WorktreeNestedIn,
  joinPath: (...segments: string[]) => string
): {
  containerWorktreeId: string
  containerRepoId: string
  containerPath: string
  worktreePath: string
  relativePath: string
} {
  const parsed = splitWorktreeId(nestedUnder.containerWorktreeId)
  if (!parsed?.repoId || !parsed.worktreePath) {
    throw new Error('The container workspace for this nested repo is unknown.')
  }
  const segments = nestedUnder.relativePath.replace(/\\/g, '/').split('/')
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
    /^[a-z]:$/i.test(segments[0])
  ) {
    throw new Error(`Invalid nested repo path "${nestedUnder.relativePath}".`)
  }
  return {
    containerWorktreeId: nestedUnder.containerWorktreeId,
    containerRepoId: parsed.repoId,
    containerPath: parsed.worktreePath,
    worktreePath: joinPath(parsed.worktreePath, ...segments),
    relativePath: segments.join('/')
  }
}
