import type { RuntimeClient } from '../runtime/client'
import { getOptionalStringFlag } from '../flags'
import type { Repo } from '../../shared/repo-types'
import type {
  RuntimeWorktreeCreateResult,
  RuntimeWorktreeRecord
} from '../../shared/runtime-worktree-contracts'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import { hasRuntimeRpcErrorCode } from '../../shared/runtime-rpc-error-code'
import { WORKTREE_CREATE_EXACT_NAME_TAKEN_CODE } from '../../shared/new-workspace/worktree-create-collision'
import {
  getNestedRepos,
  selectNestedReposForCreate,
  type NestedRepo
} from '../../shared/worktree/nested-repo-worktrees'

/** `--nested all|none|<repo>[,<repo>...]`; repos match by path inside the container, display name, or id. */
function pickNestedRepos(
  container: Repo,
  nestedRepos: NestedRepo[],
  flag: string | undefined,
  fallback: NestedFallback
): NestedRepo[] {
  if (flag === undefined) {
    return fallback === 'all' ? nestedRepos : selectNestedReposForCreate(container, nestedRepos)
  }
  const value = flag.trim()
  if (value === 'none' || value === '') {
    return []
  }
  if (value === 'all') {
    return nestedRepos
  }
  const wanted = value.split(',').map((part) => part.trim())
  const picked = nestedRepos.filter(({ repo, relativePath }) =>
    wanted.some((name) => name === relativePath || name === repo.displayName || name === repo.id)
  )
  const unknown = wanted.filter(
    (name) =>
      !nestedRepos.some(
        ({ repo, relativePath }) =>
          name === relativePath || name === repo.displayName || name === repo.id
      )
  )
  if (unknown.length > 0) {
    const known = nestedRepos.map(({ relativePath }) => relativePath).join(', ') || 'none'
    throw new Error(`Unknown nested repo: ${unknown.join(', ')}. Nested repos here: ${known}.`)
  }
  return picked
}

/** Without --nested: a new worktree follows the app's saved pick; add-nested fills in everything missing. */
type NestedFallback = 'saved' | 'all'

export type NestedRepoAddOutcome = {
  created: RuntimeWorktreeRecord[]
  /** Already checked out at their path inside the container. */
  present: string[]
  failed: { relativePath: string; message: string }[]
}

const ALREADY_PRESENT = 'already exists in this workspace.'

/** Checks the picked nested repos out inside the container worktree, on its branch. */
export async function addNestedRepoWorktreesForCli(
  client: RuntimeClient,
  container: RuntimeWorktreeRecord,
  flags: Map<string, string | boolean>,
  json: boolean,
  fallback: NestedFallback
): Promise<NestedRepoAddOutcome> {
  const outcome: NestedRepoAddOutcome = { created: [], present: [], failed: [] }
  const nestedFlag = getOptionalStringFlag(flags, 'nested')
  if (nestedFlag?.trim() === 'none') {
    return outcome
  }
  // A create must not fail on the optional nested step unless the caller asked for it.
  const repos = await client.call<{ repos?: Repo[] }>('repo.list', {}).then(
    (response) => response.result.repos ?? [],
    (error: unknown) => {
      if (nestedFlag !== undefined) {
        throw error
      }
      return [] as Repo[]
    }
  )
  const containerRepo = repos.find(
    (repo) =>
      repo.id === container.repoId &&
      (!container.hostId || getRepoExecutionHostId(repo) === container.hostId)
  )
  if (!containerRepo) {
    return outcome
  }
  const picked = pickNestedRepos(
    containerRepo,
    getNestedRepos(containerRepo, repos),
    nestedFlag,
    fallback
  )
  const branch = container.branch.replace(/^refs\/heads\//, '').trim()
  if (picked.length > 0 && !branch) {
    throw new Error('The worktree has no branch checked out, so nested repos were not added.')
  }
  for (const nested of picked) {
    const create = (branchIntent: 'create-exact' | 'open-existing-v2') =>
      client.call<RuntimeWorktreeCreateResult>('worktree.create', {
        repo: `id:${nested.repo.id}`,
        name: branch,
        branchNameOverride: branch,
        branchIntent,
        nestedUnder: { containerWorktreeId: container.id, relativePath: nested.relativePath },
        noParent: true
      })
    try {
      const result = await create('create-exact').catch((error: unknown) => {
        // The branch exists from earlier work on this task: check it out instead.
        if (hasRuntimeRpcErrorCode(error, WORKTREE_CREATE_EXACT_NAME_TAKEN_CODE)) {
          return create('open-existing-v2')
        }
        throw error
      })
      outcome.created.push(result.result.worktree)
      if (!json) {
        console.log(`nested: ${nested.relativePath} -> ${result.result.worktree.path}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes(ALREADY_PRESENT)) {
        outcome.present.push(nested.relativePath)
        continue
      }
      // One nested repo failing leaves the container and the others in place.
      outcome.failed.push({ relativePath: nested.relativePath, message })
      console.error(`warning: could not add nested repo ${nested.relativePath}: ${message}`)
    }
  }
  return outcome
}

/** The create response with any nested checkouts beside the container's record (JSON callers read it there). */
export async function withNestedRepoWorktrees<T extends { result: RuntimeWorktreeCreateResult }>(
  client: RuntimeClient,
  created: T,
  flags: Map<string, string | boolean>,
  json: boolean
): Promise<T> {
  const { created: nestedWorktrees } = await addNestedRepoWorktreesForCli(
    client,
    created.result.worktree,
    flags,
    json,
    'saved'
  )
  return nestedWorktrees.length > 0 ? { ...created, nestedWorktrees } : created
}
