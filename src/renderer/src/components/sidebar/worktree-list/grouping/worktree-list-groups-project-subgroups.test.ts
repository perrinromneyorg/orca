import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Row } from '../../../../../../shared/sidebar-list/row-types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { buildRows } from './build-rows.test-fixture'
import { repo, worktree } from './worktree-list-groups-test-fixtures'

function wt(id: string, extra: Partial<Worktree> = {}): Worktree {
  return { ...worktree, id, instanceId: `${id}-instance`, path: `/ws/${id}`, ...extra }
}

function describeRows(rows: Row[]): string[] {
  return rows.flatMap((row) => {
    if (row.type === 'subgroup-header') {
      return [`# ${row.label} (${row.count})`]
    }
    return row.type === 'item' ? [`${'  '.repeat(row.depth)}${row.worktree.id}`] : []
  })
}

describe('project worktree subgroups', () => {
  const loose = wt('loose')
  const parent = wt('parent')
  const child = wt('child')
  const other = wt('other')
  const lineage: WorktreeLineage = {
    worktreeId: 'child',
    worktreeInstanceId: 'child-instance',
    parentWorktreeId: 'parent',
    parentWorktreeInstanceId: 'parent-instance',
    origin: 'cli',
    capture: { source: 'terminal-context', confidence: 'inferred' },
    createdAt: 1
  }

  function rowsFor(project: Repo, worktrees: Worktree[]): string[] {
    return describeRows(
      buildRows(
        'repo',
        worktrees,
        new Map([[project.id, project]]),
        null,
        new Set(),
        undefined,
        undefined,
        undefined,
        { child: lineage },
        undefined,
        true
      )
    )
  }

  it('draws unsectioned rows first, then each named section with nested children following their root', () => {
    const project: Repo = {
      ...repo,
      worktreeSections: [
        { id: 'a', name: 'Features', worktreePaths: ['/ws/parent', '/ws/child'] },
        { id: 'b', name: 'Empty', worktreePaths: [] }
      ]
    }
    expect(rowsFor(project, [loose, parent, child, other])).toEqual([
      'loose',
      'other',
      '# Features (2)',
      'parent',
      '  child',
      '# Empty (0)'
    ])
  })

  it('splits by status lanes, omitting empty ones', () => {
    const project: Repo = { ...repo, worktreeSubgroupBy: 'status' }
    expect(
      rowsFor(project, [
        wt('one', { workspaceStatus: 'in-review' }),
        wt('two', { workspaceStatus: 'in-progress' })
      ])
    ).toEqual(['# In progress (1)', 'two', '# In review (1)', 'one'])
  })
})
