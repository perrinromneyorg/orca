import type { Repo } from '../../../shared/repository/repo-types'
import {
  normalizeWorktreeSections,
  normalizeWorktreeSubgroupBy
} from '../../../shared/worktree/worktree-sections'

type WorktreeLayoutUpdates = Partial<
  Pick<Repo, 'nestedWorktreeRepoIds' | 'worktreeSections' | 'worktreeSubgroupBy'>
>

/** Drops malformed nested-repo and worktree-section fields from an IPC repo update. */
export function sanitizeWorktreeLayoutUpdates(updates: WorktreeLayoutUpdates): void {
  if ('nestedWorktreeRepoIds' in updates && updates.nestedWorktreeRepoIds !== undefined) {
    const v: unknown = updates.nestedWorktreeRepoIds
    if (!Array.isArray(v) || !v.every((e) => typeof e === 'string')) {
      delete updates.nestedWorktreeRepoIds
    }
  }
  if ('worktreeSections' in updates && updates.worktreeSections !== undefined) {
    const sections = normalizeWorktreeSections(updates.worktreeSections)
    if (sections) {
      updates.worktreeSections = sections
    } else {
      delete updates.worktreeSections
    }
  }
  if ('worktreeSubgroupBy' in updates && updates.worktreeSubgroupBy !== undefined) {
    const subgroupBy = normalizeWorktreeSubgroupBy(updates.worktreeSubgroupBy)
    if (subgroupBy) {
      updates.worktreeSubgroupBy = subgroupBy
    } else {
      delete updates.worktreeSubgroupBy
    }
  }
}
