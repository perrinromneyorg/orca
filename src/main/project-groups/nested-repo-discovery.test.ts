import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scanNestedRepos } from './nested-repo-discovery'
import { isGitRepoAsync } from '../git/repositories/discovery/repo-detection'

vi.mock('../git/repositories/discovery/repo-detection', () => ({ isGitRepoAsync: vi.fn() }))

let tempDirs: string[] = []

beforeEach(() => {
  vi.mocked(isGitRepoAsync).mockReset().mockResolvedValue(false)
  for (const key of Object.keys(process.env).filter((key) => key.startsWith('GIT_'))) {
    vi.stubEnv(key, undefined)
  }
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-nested-repos-'))
  tempDirs.push(dir)
  return dir
}

async function makeGitRepo(path: string): Promise<void> {
  await mkdir(join(path, '.git'), { recursive: true })
}

describe('scanNestedRepos inside a Git repo', () => {
  it('lists repos the container ignores, one level down, without descending into them', async () => {
    const root = await tempRoot()
    await makeGitRepo(root)
    await writeFile(join(root, '.gitignore'), 'api/\nweb/\nnode_modules\n')
    await makeGitRepo(join(root, 'api'))
    await makeGitRepo(join(root, 'api', 'vendored'))
    await makeGitRepo(join(root, 'web'))
    await makeGitRepo(join(root, 'node_modules', 'pkg'))
    await makeGitRepo(join(root, 'tools', 'deep'))
    vi.mocked(isGitRepoAsync).mockResolvedValue(true)

    const scan = await scanNestedRepos({ path: root, options: { insideGitRepo: true } })

    expect(scan.selectedPathKind).toBe('git_repo')
    expect(scan.repos.map((repo) => repo.displayName)).toEqual(['api', 'web'])
  })
})
