import { getRepoExecutionHostId } from '../execution-host'
import { relativePathInsideRoot } from '../cross-platform-path'
import { isFolderRepo } from '../repo-kind'
import type { Repo } from '../repo-types'
import type { Worktree } from './types'

export type NestedRepo = { repo: Repo; relativePath: string }
export type NestedWorktree = { worktree: Worktree; relativePath: string }

function toPosixRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

/** Keep only the outermost entries so a repo nested two levels down belongs to its closest container. */
function keepOutermost<T extends { relativePath: string }>(entries: T[]): T[] {
  return entries
    .filter(
      (entry) =>
        !entries.some(
          (other) =>
            other !== entry &&
            other.relativePath !== entry.relativePath &&
            entry.relativePath.startsWith(`${other.relativePath}/`)
        )
    )
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

/** Registered git repos on the container's host whose checkout sits inside the container's checkout (VS Code-style nested repos, not submodules). */
export function getNestedRepos(container: Repo, repos: readonly Repo[]): NestedRepo[] {
  if (isFolderRepo(container)) {
    return []
  }
  const hostId = getRepoExecutionHostId(container)
  const nested: NestedRepo[] = []
  for (const repo of repos) {
    if (repo.id === container.id || isFolderRepo(repo) || getRepoExecutionHostId(repo) !== hostId) {
      continue
    }
    const relativePath = relativePathInsideRoot(container.path, repo.path)
    if (relativePath) {
      nested.push({ repo, relativePath: toPosixRelativePath(relativePath) })
    }
  }
  return keepOutermost(nested)
}

/** Other repos' worktrees checked out inside this worktree: a container's main checkout or a worktree Orca nested into it. */
export function getNestedWorktrees(
  container: Pick<Worktree, 'id' | 'repoId' | 'path'>,
  nestedRepos: readonly NestedRepo[],
  worktreesByRepo: Readonly<Record<string, readonly Worktree[]>>
): NestedWorktree[] {
  const nested: NestedWorktree[] = []
  for (const { repo } of nestedRepos) {
    for (const worktree of worktreesByRepo[repo.id] ?? []) {
      const relativePath = relativePathInsideRoot(container.path, worktree.path)
      if (relativePath) {
        nested.push({ worktree, relativePath: toPosixRelativePath(relativePath) })
      }
    }
  }
  return keepOutermost(nested)
}

export function isNestedRepoWorktree(worktree: Pick<Worktree, 'nestedIn'>): boolean {
  return worktree.nestedIn !== undefined
}

/** Drops the container's untracked `api/` rows for nested repos; their changes show in their own cards. */
export function withoutNestedRepoRows<T extends { path: string; area: string }>(
  entries: T[],
  nestedRepos: readonly NestedRepo[]
): T[] {
  if (nestedRepos.length === 0) {
    return entries
  }
  const nestedPaths = new Set(nestedRepos.map(({ relativePath }) => relativePath))
  const filtered = entries.filter(
    (entry) => entry.area !== 'untracked' || !nestedPaths.has(entry.path.replace(/\/+$/, ''))
  )
  return filtered.length === entries.length ? entries : filtered
}

/** Nested repos a new container worktree should include: the last pick, or all of them before any pick. */
export function selectNestedReposForCreate(
  container: Pick<Repo, 'nestedWorktreeRepoIds'>,
  nestedRepos: readonly NestedRepo[]
): NestedRepo[] {
  const picked = container.nestedWorktreeRepoIds
  return picked ? nestedRepos.filter(({ repo }) => picked.includes(repo.id)) : [...nestedRepos]
}
