import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { runtimeTargetForRepoOwner } from '@/lib/workspace/ownership/repo-runtime-owner'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../../shared/execution-host'
import { relativePathInsideRoot } from '../../../../shared/cross-platform-path'
import type { NestedRepoScanResult } from '../../../../shared/project-group-types'
import type { Repo } from '../../../../shared/repo-types'

export type UnregisteredNestedRepo = { path: string; relativePath: string }

const scansByRepo = new Map<string, Promise<string[]>>()

function scanKey(repo: Repo): string {
  return `${getRepoExecutionHostId(repo)}\0${repo.id}\0${repo.path}`
}

async function scanInsideRepo(repo: Repo): Promise<string[]> {
  const target = runtimeTargetForRepoOwner(useAppStore.getState(), repo.id)
  if (!target) {
    return []
  }
  const scan: NestedRepoScanResult =
    target.kind === 'local'
      ? await window.api.projectGroups.scanNested({
          path: repo.path,
          options: { insideGitRepo: true, timeoutMs: 10_000 }
        })
      : await callRuntimeRpc<NestedRepoScanResult>(
          target,
          'projectGroup.scanNested',
          { path: repo.path, insideGitRepo: true },
          { timeoutMs: 20_000 }
        )
  // An older host ignores the flag and reports the container itself as a plain repo.
  return scan.selectedPathKind === 'git_repo' ? scan.repos.map((candidate) => candidate.path) : []
}

/** Git repos inside the container's checkout that Orca doesn't track yet; scanned once per session. */
export function useUnregisteredNestedRepos(
  container: Repo | null,
  repos: readonly Repo[],
  refreshToken: number
): UnregisteredNestedRepo[] {
  const [found, setFound] = useState<{ key: string; paths: string[] } | null>(null)
  const key = container ? scanKey(container) : null
  useEffect(() => {
    if (!container || !key) {
      return
    }
    let cancelled = false
    if (refreshToken > 0) {
      scansByRepo.delete(key)
    }
    let scan = scansByRepo.get(key)
    if (!scan) {
      scan = scanInsideRepo(container).catch(() => [])
      scansByRepo.set(key, scan)
    }
    void scan.then((paths) => {
      if (!cancelled) {
        setFound({ key, paths })
      }
    })
    return () => {
      cancelled = true
    }
    // The container's identity is its key; a new row object for the same repo must not rescan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshToken])
  if (!container || !found || found.key !== key) {
    return []
  }
  const hostId = getRepoExecutionHostId(container)
  return found.paths.flatMap((path) => {
    const relativePath = relativePathInsideRoot(container.path, path)
    const registered = repos.some(
      (repo) =>
        getRepoExecutionHostId(repo) === hostId && relativePathInsideRoot(repo.path, path) === ''
    )
    return relativePath && !registered
      ? [{ path, relativePath: relativePath.replace(/\\/g, '/') }]
      : []
  })
}

/** Registers each nested repo as its own project on the container's host. */
export async function addNestedReposToOrca(
  container: Repo,
  nested: readonly UnregisteredNestedRepo[]
): Promise<void> {
  const owner = parseExecutionHostId(getRepoExecutionHostId(container))
  const runtimeEnvironmentId = owner?.kind === 'runtime' ? owner.environmentId : null
  for (const nestedRepo of nested) {
    const repo = await useAppStore
      .getState()
      .addRepoPath(nestedRepo.path, 'git', { runtimeEnvironmentId })
    // Its checkouts must be listed before its Source Control card can appear.
    if (repo) {
      await useAppStore.getState().fetchWorktrees(repo.id)
    }
  }
}
