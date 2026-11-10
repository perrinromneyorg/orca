import {
  selectCrossStoreFolderChildrenById,
  selectSidebarLineageParentIdentities
} from '@/store/slices/worktrees/metadata/cross-store-lineage-parents'
import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store'
import {
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspaces/catalog/workspace-record-fields'
import {
  getAttachedWorktreesForFolderWorkspace,
  attachedWorktreeOwnerKey
} from './folder-workspace-attached-worktrees'
import { resolveReviewRepository } from '@/lib/review-owner'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FolderWorkspaceEmptyState } from './folder-workspace-empty-state'
import { SourceControlWorktreeCard } from './source-control-worktree-card'

export default function FolderWorkspaceSourceControlPanel() {
  const t = useTranslate()
  const activeWorkspaceKey = useAppStore((state) => state.activeWorkspaceKey)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const executionHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const folderWorkspaces = useAppStore(selectFolderWorkspaces)
  const worktreesByRepo = useAppStore(selectWorktreesByRepo)
  const workspaceLineageByChildKey = useAppStore((state) => state.workspaceLineageByChildKey)
  const worktreeLineageById = useAppStore((state) => state.worktreeLineageById)
  const lineageParentIdentities = useAppStore(selectSidebarLineageParentIdentities)
  const crossStoreChildrenByFolderId = useAppStore(selectCrossStoreFolderChildrenById)
  const repos = useAppStore((state) => state.repos)
  const resolution = useMemo(
    () =>
      getAttachedWorktreesForFolderWorkspace({
        activeWorkspaceKey,
        activeWorktreeId,
        executionHostId,
        folderWorkspaces,
        worktreesByRepo,
        workspaceLineageByChildKey,
        worktreeLineageById,
        lineageParentIdentities,
        crossStoreChildrenByFolderId
      }),
    [
      activeWorkspaceKey,
      activeWorktreeId,
      executionHostId,
      folderWorkspaces,
      worktreesByRepo,
      workspaceLineageByChildKey,
      worktreeLineageById,
      lineageParentIdentities,
      crossStoreChildrenByFolderId
    ]
  )
  const owners = useMemo(
    () =>
      resolution.owners.flatMap((owner) => {
        const repo = resolveReviewRepository(repos, owner.worktree)
        return repo && resolution.folderWorkspace
          ? [{ ...owner, repo, placementWorkspaceId: `folder:${resolution.folderWorkspace.id}` }]
          : []
      }),
    [resolution, repos]
  )
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null)
  const [refreshers] = useState(() => new Set<() => void>())
  // Each section's scheduler applies the status tier, coalescing, abort and stale-result guards.
  const refresh = () => {
    for (const refreshNow of refreshers) {
      refreshNow()
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{resolution.folderWorkspace?.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t(
              'auto.components.rightSidebar.FolderWorkspaceWorktreesPanel.attachedCount',
              '{{count}} attached worktrees',
              { count: owners.length, defaultValue_one: '{{count}} attached worktree' }
            )}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={refresh}
              aria-label={t(
                'auto.components.right.sidebar.SourceControl.refreshAll',
                'Refresh all'
              )}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t('auto.components.right.sidebar.SourceControl.refreshAll', 'Refresh all')}
          </TooltipContent>
        </Tooltip>
      </div>
      {owners.length === 0 ? (
        <FolderWorkspaceEmptyState
          folderWorkspace={resolution.folderWorkspace ?? null}
          showRepoActions={resolution.owners.length === 0}
          title={t(
            'auto.components.rightSidebar.FolderWorkspaceWorktreesPanel.emptyTitle',
            'No attached worktrees yet'
          )}
          copy={t(
            'auto.components.rightSidebar.FolderWorkspaceWorktreesPanel.emptyCopy',
            'Worktrees created from this workspace will show up here.'
          )}
        />
      ) : (
        <div
          ref={setScrollRoot}
          className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2"
        >
          {owners.map((owner) => (
            <SourceControlWorktreeCard
              key={attachedWorktreeOwnerKey(owner)}
              owner={owner}
              scrollRoot={scrollRoot}
              refreshers={refreshers}
            />
          ))}
        </div>
      )}
    </div>
  )
}
