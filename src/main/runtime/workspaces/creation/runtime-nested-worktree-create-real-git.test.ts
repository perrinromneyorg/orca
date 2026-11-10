import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import { gitExecFileAsync } from '../../../git/command-runner/git-exec-file'
import { addWorktree } from '../../../git/worktrees/creation/worktree-add'
import { openWorktreeCreatePathClaim } from '../../../workspaces/creation/worktree-create-in-flight'
import { WorktreeCreate } from '../../../../shared/rpc-contract/worktree-create-params'
import { buildManagedWorktreeCreateArgs } from '../../rpc/methods/workspaces/worktree-create-args'
import { resolveRuntimeLocalWorktreeCreateCandidate } from './runtime-local-worktree-create-candidate'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function git(cwd: string, ...argv: string[]): Promise<string> {
  return (await gitExecFileAsync(argv, { cwd })).stdout.trim()
}

async function initRepo(path: string, hooks: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await git(path, 'init', '--quiet')
  await git(path, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  await git(path, 'config', 'user.name', 'Nested Test')
  await git(path, 'config', 'user.email', 'test@example.com')
  await git(path, 'config', 'core.hooksPath', hooks)
  await git(path, 'commit', '--quiet', '--allow-empty', '-m', 'base')
}

async function createChild(apiPath: string, workspaceRoot: string, params: object) {
  const repo: Repo = { id: 'api', path: apiPath, displayName: 'api', badgeColor: '', addedAt: 0 }
  const request = buildManagedWorktreeCreateArgs(WorktreeCreate.parse(params), {})
  const settings = { workspaceDir: workspaceRoot, nestWorkspaces: false, branchPrefix: '' }
  const pathClaim = openWorktreeCreatePathClaim()
  try {
    const picked = await resolveRuntimeLocalWorktreeCreateCandidate({
      request,
      repo,
      settings,
      worktreePathSettings: settings,
      workspaceRoot,
      username: '',
      baseBranch: 'main',
      localWorktreeGitOptions: {},
      pathClaim
    })
    await addWorktree(apiPath, picked.worktreePath, picked.branchName, 'main', true, false, {})
    return picked
  } finally {
    pathClaim.release()
  }
}

describe('nested repo worktree create with real Git', () => {
  it('checks the nested repo out inside the container worktree at its relative path', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'orca-nested-create-')))
    roots.push(root)
    const hooks = join(root, 'no-hooks')
    const apiPath = join(root, 'app', 'api')
    await initRepo(join(root, 'app'), hooks)
    await initRepo(apiPath, hooks)
    const containerWorktree = join(root, 'workspaces', 'task')
    await git(join(root, 'app'), 'worktree', 'add', '--quiet', '-b', 'task', containerWorktree)

    const picked = await createChild(apiPath, join(root, 'workspaces'), {
      repo: 'api',
      name: 'task',
      branchNameOverride: 'task',
      branchIntent: 'create-exact',
      nestedUnder: { containerWorktreeId: `app::${containerWorktree}`, relativePath: 'api' }
    })

    expect(picked.worktreePath).toBe(join(containerWorktree, 'api'))
    expect(picked.branchName).toBe('task')
    expect(await git(join(containerWorktree, 'api'), 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(
      'task'
    )
    expect(await git(join(containerWorktree, 'api'), 'rev-parse', '--show-toplevel')).toBe(
      join(containerWorktree, 'api')
    )
  })

  it('refuses a nested path that already exists instead of picking a sibling', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'orca-nested-create-')))
    roots.push(root)
    const apiPath = join(root, 'app', 'api')
    await initRepo(apiPath, join(root, 'no-hooks'))
    const containerWorktree = join(root, 'workspaces', 'task')
    await mkdir(join(containerWorktree, 'api'), { recursive: true })

    await expect(
      createChild(apiPath, join(root, 'workspaces'), {
        repo: 'api',
        name: 'task',
        nestedUnder: { containerWorktreeId: `app::${containerWorktree}`, relativePath: 'api' }
      })
    ).rejects.toThrow('"api" already exists in this workspace.')
  })
})
