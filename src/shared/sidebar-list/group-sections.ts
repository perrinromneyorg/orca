import type { Repo } from '../repo-types'
import type { WorktreeOccurrence, WorktreeOccurrencePlan } from '../worktree-occurrence-plan'
import type { WorkspaceStatusDefinition, Worktree } from '../worktree/types'
import type { ExecutionHostId } from '../execution-host'
import { getWorkspaceStatusFromGroupKey } from '../workspace-statuses'
import type { PRGroupKey } from './group-keys'
import type { NoticeHostContext } from './host-labels'
import {
  getHostWorktreeIds,
  getLaneHostWorktreeCounts,
  getLaneHostWorktreeIds,
  getMixedHostContextLabels,
  getProjectHeaderHostRepos
} from './host-labels'
import type { OrderedGroupEntry, WorktreeGroupEntry } from './worktree-group-entry'
import {
  getOccurrenceRoot,
  getProjectSubgroupLaneId,
  planProjectSubgroupLanes
} from './project-subgroups'
import type { RenderableFolderWorkspace } from './folder-workspace-lanes'
import type { ProjectGroupingIndex } from '../project-section-grouping'
import {
  appendWorktreeRows,
  buildImportedWorktreesCardRow,
  buildNewExternalWorktreesInboxRow,
  buildPendingCreationRow
} from './row-builders'
import type {
  ImportedWorktreesCardCandidate,
  NewExternalWorktreesInboxCandidate,
  PendingCreationRef,
  GroupHeaderRow,
  RepoOfWorktree,
  Row,
  WorktreeGroupBy
} from './row-types'

/** Everything section emission reads that stays fixed for one planSidebarRows call. */
export type SectionAppendContext = {
  result: Row[]
  groupBy: WorktreeGroupBy
  collapsedGroups: Set<string>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  repoMap: Map<string, Repo>
  repoOf: RepoOfWorktree
  defaultHostId: ExecutionHostId
  hostLabelById: ReadonlyMap<string, string> | undefined
  projectIndex: ProjectGroupingIndex | null
  importedWorktreesByRepo: ReadonlyMap<string, ImportedWorktreesCardCandidate>
  newExternalWorktreesInboxByRepo: ReadonlyMap<string, NewExternalWorktreesInboxCandidate>
  pendingByRepo: ReadonlyMap<string, PendingCreationRef[]>
  mixedWorktreeHostContextLabels: Map<string, string> | undefined
  noticeHostContextLabelByRepoId: Map<string, NoticeHostContext> | undefined
  occurrencePlan: WorktreeOccurrencePlan<Worktree>
  folderPairByIdentity?: ReadonlyMap<string, RenderableFolderWorkspace>
}

function getProjectHeaderHostScope(
  ctx: SectionAppendContext,
  group: WorktreeGroupEntry
): Pick<GroupHeaderRow, 'hostRepos' | 'hostWorktreeCounts' | 'hostWorktreeIds'> {
  const hostRepos = getProjectHeaderHostRepos({
    group,
    repoMap: ctx.repoMap,
    repoOf: ctx.repoOf,
    noticeRepoOf: (repoId) =>
      [
        ctx.importedWorktreesByRepo.get(repoId)?.repo,
        ctx.newExternalWorktreesInboxByRepo.get(repoId)?.repo
      ].filter((repo) => repo !== undefined),
    hasPendingCreation: (repoId) => ctx.pendingByRepo.has(repoId),
    defaultHostId: ctx.defaultHostId
  })
  if (!hostRepos) {
    return {}
  }
  const hostWorktreeIds = getHostWorktreeIds(group.items, ctx.repoOf, ctx.defaultHostId)
  return {
    hostRepos,
    hostWorktreeCounts: hostWorktreeIds
      ? new Map([...hostWorktreeIds].map(([hostId, ids]) => [hostId, ids.length]))
      : undefined,
    hostWorktreeIds
  }
}

export function appendOrderedGroups(
  ctx: SectionAppendContext,
  groupsToAppend: OrderedGroupEntry[],
  projectGroupDepth = 0
): void {
  const {
    result,
    groupBy,
    collapsedGroups,
    workspaceStatuses,
    repoMap,
    repoOf,
    defaultHostId,
    hostLabelById,
    projectIndex,
    importedWorktreesByRepo,
    newExternalWorktreesInboxByRepo,
    pendingByRepo,
    mixedWorktreeHostContextLabels,
    occurrencePlan
  } = ctx
  for (const [key, group] of groupsToAppend) {
    const isCollapsed = collapsedGroups.has(key)
    const repo = group.repo
    const folderPairs = group.folderWorkspaces ?? []
    const header =
      groupBy === 'repo'
        ? {
            type: 'header' as const,
            key,
            label: group.label,
            count: group.items.length,
            icon: { kind: 'project' as const },
            repo,
            projectGroupDepth,
            ...getProjectHeaderHostScope(ctx, group)
          }
        : groupBy === 'workspace-status'
          ? (() => {
              const workspaceStatus =
                getWorkspaceStatusFromGroupKey(key, workspaceStatuses) ??
                workspaceStatuses[0]?.id ??
                'in-progress'
              const definition = workspaceStatuses.find((status) => status.id === workspaceStatus)
              return {
                type: 'header' as const,
                key,
                label: definition?.label ?? workspaceStatus,
                count: group.items.length + folderPairs.length,
                icon: { kind: 'workspace-status' as const, status: workspaceStatus },
                hostWorktreeCounts: getLaneHostWorktreeCounts(
                  group.items,
                  folderPairs,
                  repoOf,
                  defaultHostId
                ),
                hostWorktreeIds: getLaneHostWorktreeIds(
                  group.items,
                  folderPairs,
                  repoOf,
                  defaultHostId
                ),
                worktreeIds: group.items.map((worktree) => worktree.id)
              }
            })()
          : (() => {
              const prGroup = key.replace(/^pr:/, '') as PRGroupKey
              return {
                type: 'header' as const,
                key,
                count: group.items.length + folderPairs.length,
                icon: { kind: 'pr-status' as const, prGroup },
                hostWorktreeCounts: getLaneHostWorktreeCounts(
                  group.items,
                  folderPairs,
                  repoOf,
                  defaultHostId
                ),
                hostWorktreeIds: getLaneHostWorktreeIds(
                  group.items,
                  folderPairs,
                  repoOf,
                  defaultHostId
                ),
                worktreeIds: group.items.map((worktree) => worktree.id)
              }
            })()

    result.push(header)
    if (!isCollapsed) {
      if (groupBy === 'repo') {
        const repoIds =
          group.repoIds.size > 0
            ? [...group.repoIds]
            : repo
              ? [repo.id]
              : key.startsWith('repo:')
                ? [key.slice('repo:'.length)]
                : []
        for (const repoId of repoIds) {
          const candidate = importedWorktreesByRepo.get(repoId)
          if (candidate) {
            result.push(
              buildImportedWorktreesCardRow(
                candidate,
                ctx.noticeHostContextLabelByRepoId?.get(repoId)
              )
            )
          }
        }
        for (const repoId of repoIds) {
          const candidate = newExternalWorktreesInboxByRepo.get(repoId)
          if (candidate) {
            result.push(
              buildNewExternalWorktreesInboxRow(
                candidate,
                ctx.noticeHostContextLabelByRepoId?.get(repoId)
              )
            )
          }
        }
        // Place in-progress creates atop their own repo so the workspace appears where it will land.
        for (const repoId of repoIds) {
          for (const creation of pendingByRepo.get(repoId) ?? []) {
            result.push(buildPendingCreationRow(creation, repoMap))
          }
        }
      }
      const hostContextLabelByRepoId =
        groupBy === 'repo'
          ? getMixedHostContextLabels(group, repoMap, projectIndex, hostLabelById)
          : undefined
      const rowOptions = {
        collapsedGroups,
        groupDepth: projectGroupDepth,
        sectionKey: key,
        hostContextLabelByRepoId,
        hostContextLabelByWorktreeIdentity: mixedWorktreeHostContextLabels,
        folderPairByIdentity: ctx.folderPairByIdentity
      }
      if (groupBy !== 'repo' || !repo || !appendProjectSubgroupRows(ctx, key, repo, rowOptions)) {
        appendWorktreeRows(result, repoOf, occurrencePlan, rowOptions)
      }
    }
  }
}

/** Splits a project's rows into its section or status lanes; false when the project is unsplit. */
function appendProjectSubgroupRows(
  ctx: SectionAppendContext,
  sectionKey: string,
  repo: Repo,
  rowOptions: Parameters<typeof appendWorktreeRows>[3]
): boolean {
  const occurrences = ctx.occurrencePlan.bySection.get(sectionKey) ?? []
  const laneIdOf = (occurrence: WorktreeOccurrence<Worktree>): string | null =>
    getProjectSubgroupLaneId(repo, getOccurrenceRoot(occurrence), ctx.workspaceStatuses)
  const countByLane = new Map<string | null, number>()
  for (const occurrence of occurrences) {
    const laneId = laneIdOf(occurrence)
    countByLane.set(laneId, (countByLane.get(laneId) ?? 0) + 1)
  }
  const lanes = planProjectSubgroupLanes({
    repo,
    sectionKey,
    occupiedLaneIds: new Set(countByLane.keys()),
    workspaceStatuses: ctx.workspaceStatuses
  })
  if (!lanes) {
    return false
  }
  for (const lane of lanes) {
    if (lane.header) {
      ctx.result.push({
        ...lane.header,
        count: countByLane.get(lane.laneId) ?? 0,
        groupDepth: rowOptions.groupDepth
      })
      if (ctx.collapsedGroups.has(lane.header.key)) {
        continue
      }
    }
    appendWorktreeRows(ctx.result, ctx.repoOf, ctx.occurrencePlan, {
      ...rowOptions,
      includeOccurrence: (occurrence) => laneIdOf(occurrence) === lane.laneId
    })
  }
  return true
}
