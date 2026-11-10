import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { readIpcErrorDetail } from '@/runtime/errors/ipc-error'
import { runtimeTargetSupportsCapability } from '@/runtime/rpc/compatibility/runtime-target-capability'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/rpc/targets/runtime-client-target'
import { useAppStore } from '@/store/index'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'
import { WORKTREE_CREATE_EXACT_NAME_TAKEN_CODE } from '../../../../shared/new-workspace/worktree-create-collision'
import { hasRuntimeRpcErrorCode } from '../../../../shared/runtime-rpc-error-code'
import { WORKTREE_CREATE_EXACT_NAME_RUNTIME_CAPABILITY } from '../../../../shared/worktree-runtime-capabilities'
import {
  getNestedRepos,
  selectNestedReposForCreate,
  type NestedRepo
} from '../../../../shared/worktree/nested-repo-worktrees'
import type { SetupDecision } from '../../../../shared/worktree/create-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { CreateWorktreeCallOptions } from '@/store/slices/worktrees/create/worktree-create-payload'

const SETUP_DECISION_REQUIRED = 'Setup decision required for this repository'

type NestedCreateOutcome = 'created' | 'failed'

function containerBranchName(container: Pick<Worktree, 'branch'>): string | null {
  const branch = container.branch.replace(/^refs\/heads\//, '').trim()
  return branch || null
}

async function createOnce(
  repoId: string,
  branch: string,
  setupDecision: SetupDecision,
  options: CreateWorktreeCallOptions
): Promise<void> {
  // Positional slots up to `branchNameOverride` and `options`; the rest stay unset.
  await useAppStore
    .getState()
    .createWorktree(
      repoId,
      branch,
      undefined,
      setupDecision,
      undefined,
      'sidebar',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      branch,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      options
    )
}

/**
 * Checks a nested repo out inside the container worktree, on the container's branch, so the
 * workspace keeps the same layout as the main checkout. Reuses that branch when it already exists.
 */
export async function createNestedRepoWorktree(
  container: Pick<Worktree, 'id' | 'branch' | 'displayName'>,
  nested: NestedRepo
): Promise<NestedCreateOutcome> {
  const branch = containerBranchName(container)
  if (!branch) {
    toast.error(
      translate(
        'auto.components.rightSidebar.NestedRepoSourceControl.detached',
        'Check out a branch in {{name}} before adding nested repos.',
        { name: container.displayName }
      )
    )
    return 'failed'
  }
  const hostId = getRepoExecutionHostId(nested.repo)
  const exactSupported = await runtimeTargetSupportsCapability(
    runtimeRpcTargetForAuthorityKey(hostId) ?? { kind: 'local' },
    WORKTREE_CREATE_EXACT_NAME_RUNTIME_CAPABILITY
  )
  const base: CreateWorktreeCallOptions = {
    executionHostId: hostId,
    nestedUnder: { containerWorktreeId: container.id, relativePath: nested.relativePath }
  }
  const attempt = async (setupDecision: SetupDecision): Promise<void> => {
    try {
      await createOnce(nested.repo.id, branch, setupDecision, {
        ...base,
        branchIntent: exactSupported ? 'create-exact' : 'create-new'
      })
    } catch (error) {
      // The branch already exists in this repo (earlier work on the same task): check it out instead.
      if (!hasRuntimeRpcErrorCode(error, WORKTREE_CREATE_EXACT_NAME_TAKEN_CODE)) {
        throw error
      }
      await createOnce(nested.repo.id, branch, setupDecision, {
        ...base,
        branchIntent: 'open-existing-v2'
      })
    }
  }
  try {
    try {
      await attempt('inherit')
    } catch (error) {
      if (readIpcErrorDetail(error) !== SETUP_DECISION_REQUIRED) {
        throw error
      }
      // The container's setup owns the workspace; a nested repo that would prompt is created without its own.
      await attempt('skip')
    }
    return 'created'
  } catch (error) {
    toast.error(
      error instanceof Error && error.message
        ? error.message
        : translate(
            'auto.components.rightSidebar.NestedRepoSourceControl.createFailed',
            'Could not add {{repo}} to this workspace.',
            { repo: nested.repo.displayName }
          )
    )
    return 'failed'
  }
}

/** `onPending` brackets the create so the caller can disable its menu entry meanwhile. */
export async function createNestedRepoWorktreeTracked(
  container: Pick<Worktree, 'id' | 'branch' | 'displayName'>,
  nested: NestedRepo,
  onPending: (pending: boolean) => void
): Promise<void> {
  onPending(true)
  try {
    await createNestedRepoWorktree(container, nested)
  } finally {
    onPending(false)
  }
}

/** Adds each picked nested repo in order; one failure leaves the container and the others in place. */
export async function createNestedRepoWorktrees(
  container: Pick<Worktree, 'id' | 'branch' | 'displayName'>,
  nestedRepos: readonly NestedRepo[]
): Promise<void> {
  for (const nested of nestedRepos) {
    await createNestedRepoWorktree(container, nested)
  }
}

/** Mirror the container's nested repos into the new worktree before the user lands on it. */
export async function createPickedNestedRepoWorktrees(
  worktree: Worktree,
  creationHostId: ExecutionHostId | undefined
): Promise<void> {
  const { repos } = useAppStore.getState()
  const container = repos.find(
    (repo) =>
      repo.id === worktree.repoId &&
      (!creationHostId || getRepoExecutionHostId(repo) === creationHostId)
  )
  if (!container) {
    return
  }
  const picked = selectNestedReposForCreate(container, getNestedRepos(container, repos))
  if (picked.length > 0) {
    await createNestedRepoWorktrees(worktree, picked)
  }
}
