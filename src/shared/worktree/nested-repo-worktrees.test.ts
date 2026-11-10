import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import type { Repo } from '../repo-types'
import type { Worktree } from './types'
import { getNestedRepos, getNestedWorktrees, withoutNestedRepoRows } from './nested-repo-worktrees'
import { resolveNestedWorktreePlacement } from './nested-worktree-placement'

function repo(id: string, path: string, extra: Partial<Repo> = {}): Repo {
  return { id, path, displayName: id, badgeColor: '', addedAt: 0, kind: 'git', ...extra }
}

function worktree(repoId: string, path: string): Worktree {
  return { id: `${repoId}::${path}`, repoId, path } as Worktree
}

describe('getNestedRepos', () => {
  const container = repo('app', '/code/app')

  it('lists registered repos inside the container, closest container wins', () => {
    const repos = [
      container,
      repo('api', '/code/app/api'),
      repo('web', '/code/app/web'),
      repo('web-vendor', '/code/app/web/vendor/lib'),
      repo('sibling', '/code/app-other'),
      repo('notes', '/code/app/notes', { kind: 'folder' }),
      repo('remote-api', '/code/app/api2', { executionHostId: 'ssh:box' })
    ]
    expect(getNestedRepos(container, repos).map((n) => [n.repo.id, n.relativePath])).toEqual([
      ['api', 'api'],
      ['web', 'web']
    ])
  })
})

describe('getNestedWorktrees', () => {
  it('finds nested checkouts inside a worktree of the container, not elsewhere', () => {
    const container = repo('app', '/code/app')
    const api = repo('api', '/code/app/api')
    const nested = getNestedRepos(container, [container, api])
    const containerWorktree = worktree('app', '/ws/task')
    const result = getNestedWorktrees(containerWorktree, nested, {
      api: [
        worktree('api', '/code/app/api'),
        worktree('api', '/ws/task/api'),
        worktree('api', '/ws/other/api')
      ]
    })
    expect(result.map((n) => [n.worktree.path, n.relativePath])).toEqual([['/ws/task/api', 'api']])
  })
})

describe('withoutNestedRepoRows', () => {
  it('drops only the untracked directory row of a nested repo', () => {
    const entries = [
      { path: 'api/', area: 'untracked' },
      { path: 'api', area: 'unstaged' },
      { path: 'apis/', area: 'untracked' },
      { path: 'README.md', area: 'untracked' }
    ]
    const nested = [{ repo: repo('api', '/code/app/api'), relativePath: 'api' }]
    expect(withoutNestedRepoRows(entries, nested).map((e) => e.path)).toEqual([
      'api',
      'apis/',
      'README.md'
    ])
  })
})

describe('resolveNestedWorktreePlacement', () => {
  it('places the checkout at the relative path inside the container worktree', () => {
    expect(
      resolveNestedWorktreePlacement(
        { containerWorktreeId: 'app::/ws/task', relativePath: 'services/api' },
        join
      ).worktreePath
    ).toBe(join('/ws/task', 'services', 'api'))
  })

  it.each(['../escape', 'api/../../x', '', '/abs', 'C:/x'])('rejects %j', (relativePath) => {
    expect(() =>
      resolveNestedWorktreePlacement({ containerWorktreeId: 'app::/ws/task', relativePath }, join)
    ).toThrow()
  })
})
