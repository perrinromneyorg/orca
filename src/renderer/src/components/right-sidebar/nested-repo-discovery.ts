import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
/** One scan per repo row per session; a new row object for the same repo reuses it. */
function cachedScan(container: Repo): Promise<string[]> {
  const key = scanKey(container)
  let scan = scansByRepo.get(key)
  if (!scan) {
    scan = scanInsideRepo(container).catch(() => [])
    scansByRepo.set(key, scan)
  }
  return scan
}

export function useUnregisteredNestedRepos(
  container: Repo | null,
  repos: readonly Repo[]
): UnregisteredNestedRepo[] {
  const [found, setFound] = useState<{ key: string; paths: string[] } | null>(null)
  const key = container ? scanKey(container) : null
  useEffect(() => {
    if (!container || !key) {
      return
    }
    let cancelled = false
    void cachedScan(container).then((paths) => {
      if (!cancelled) {
        setFound({ key, paths })
      }
    })
    return () => {
      cancelled = true
    }
  }, [container, key])
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

/** Adds the repos and reports a failure as a toast; `onBusy` brackets the work. */
export async function addNestedReposWithFeedback(
  container: Repo,
  nested: readonly UnregisteredNestedRepo[],
  onBusy: (busy: boolean) => void
): Promise<void> {
  onBusy(true)
  try {
    await addNestedReposToOrca(container, nested)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    onBusy(false)
  }
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
