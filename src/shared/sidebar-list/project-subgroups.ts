import type { Repo } from '../repo-types'
import type { WorktreeOccurrence } from '../worktree-occurrence-plan'
import type { WorkspaceStatusDefinition, Worktree } from '../worktree/types'
import { getWorkspaceStatus } from '../workspace-statuses'
import { findWorktreeSection, getWorktreeSubgroupBy } from '../worktree/worktree-sections'
import type { ProjectSubgroupHeaderRow } from './row-types'

/** A lane inside one project section; `header` is null for the unsectioned rows drawn first. */
export type ProjectSubgroupLane = {
  laneId: string | null
  header: Omit<ProjectSubgroupHeaderRow, 'count' | 'groupDepth'> | null
}

const UNSECTIONED_LANE = null

export function getProjectSubgroupKey(sectionKey: string, laneId: string): string {
  return `${sectionKey}::sub:${laneId}`
}

/** The lane a lineage root draws in; its nested children follow it. */
export function getProjectSubgroupLaneId(
  repo: Repo,
  root: Worktree,
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
): string | null {
  if (getWorktreeSubgroupBy(repo) === 'status') {
    return `status:${getWorkspaceStatus(root, workspaceStatuses)}`
  }
  const section = findWorktreeSection(repo, root.path)
  return section ? `section:${section.id}` : UNSECTIONED_LANE
}

export function getOccurrenceRoot<Row>(occurrence: WorktreeOccurrence<Row>): Row {
  let root = occurrence
  while (root.parent) {
    root = root.parent
  }
  return root.row
}

/** Null when the project draws its rows unsplit: section mode with no sections. */
export function planProjectSubgroupLanes(args: {
  repo: Repo
  sectionKey: string
  occupiedLaneIds: ReadonlySet<string | null>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
}): ProjectSubgroupLane[] | null {
  const { repo, sectionKey, occupiedLaneIds, workspaceStatuses } = args
  const headerOf = (
    laneId: string,
    label: string,
    icon: ProjectSubgroupHeaderRow['icon'],
    sectionId?: string
  ): ProjectSubgroupLane => ({
    laneId,
    header: {
      type: 'subgroup-header',
      key: getProjectSubgroupKey(sectionKey, laneId),
      sectionKey,
      label,
      icon,
      repo,
      ...(sectionId ? { sectionId } : {})
    }
  })
  if (getWorktreeSubgroupBy(repo) === 'status') {
    // Like top-level status grouping, empty status lanes are omitted.
    return workspaceStatuses
      .filter((status) => occupiedLaneIds.has(`status:${status.id}`))
      .map((status) =>
        headerOf(`status:${status.id}`, status.label, {
          kind: 'workspace-status',
          status: status.id
        })
      )
  }
  const sections = repo.worktreeSections ?? []
  if (sections.length === 0) {
    return null
  }
  // Empty sections stay visible so a new section is a place to move worktrees into.
  return [
    { laneId: UNSECTIONED_LANE, header: null },
    ...sections.map((section) =>
      headerOf(`section:${section.id}`, section.name, { kind: 'section' }, section.id)
    )
  ]
}
