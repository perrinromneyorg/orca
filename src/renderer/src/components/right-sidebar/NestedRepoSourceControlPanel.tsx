import { useMemo, useState } from 'react'
import { FolderPlus, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store'
import { selectWorktreesByRepo } from '@/store/workspaces/catalog/workspace-record-fields'
import { selectRepoByIdForActiveWorkspace } from '@/store/repos/active-workspace-repository'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import {
  getNestedRepos,
  getNestedWorktrees,
  type NestedRepo
} from '../../../../shared/worktree/nested-repo-worktrees'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { attachedWorktreeOwnerKey } from './folder-workspace-attached-worktrees'
import type { SourceControlScope } from './source-control/panel/worktree-scope'
import { SourceControlWorktreeCard } from './source-control-worktree-card'
import { createNestedRepoWorktree } from './nested-repo-worktree-create'
import SourceControl from './source-control/panel/SourceControl'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { useUnregisteredNestedRepos } from './nested-repo-discovery'
import { NestedRepoDiscoveryBanner } from './NestedRepoDiscoveryBanner'

function toScope(worktree: Worktree, repo: Repo, placementWorkspaceId: string): SourceControlScope {
  return {
    worktreeId: worktree.id,
    repoId: repo.id,
    executionHostId: getRepoExecutionHostId(repo),
    worktree,
    attachedAt: 0,
    repo,
    placementWorkspaceId
  }
}

/** VS Code-style Source Control for a repo that holds other repos: one card per repo checked out inside the active worktree. */
export default function NestedRepoSourceControlPanel(): React.JSX.Element {
  const container = useAppStore((s) =>
    s.activeWorktreeId
      ? (s.getKnownWorktreeById(
          s.activeWorktreeId,
          s.activeWorkspaceExecutionHostId ?? undefined
        ) ?? null)
      : null
  )
  const containerRepo = useAppStore((s) =>
    selectRepoByIdForActiveWorkspace(s, container?.repoId ?? null)
  )
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore(selectWorktreesByRepo)
  const nestedRepos = useMemo(
    () => (containerRepo ? getNestedRepos(containerRepo, repos) : []),
    [containerRepo, repos]
  )
  const nestedWorktrees = useMemo(
    () => (container ? getNestedWorktrees(container, nestedRepos, worktreesByRepo) : []),
    [container, nestedRepos, worktreesByRepo]
  )
  const unregistered = useUnregisteredNestedRepos(
    containerRepo && !isFolderRepo(containerRepo) ? containerRepo : null,
    repos,
    0
  )
  const banner = containerRepo ? (
    <NestedRepoDiscoveryBanner container={containerRepo} unregistered={unregistered} />
  ) : null
  if (!container || !containerRepo || nestedRepos.length === 0) {
    return banner ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {banner}
        <SourceControl />
      </div>
    ) : (
      <SourceControl />
    )
  }
  return (
    <NestedRepoCards
      container={container}
      containerRepo={containerRepo}
      nestedRepos={nestedRepos}
      nestedWorktrees={nestedWorktrees}
      banner={banner}
    />
  )
}

function NestedRepoCards({
  container,
  containerRepo,
  nestedRepos,
  nestedWorktrees,
  banner
}: {
  container: Worktree
  containerRepo: Repo
  nestedRepos: readonly NestedRepo[]
  nestedWorktrees: ReturnType<typeof getNestedWorktrees>
  banner: React.ReactNode
}): React.JSX.Element {
  const t = useTranslate()
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null)
  const [refreshers] = useState(() => new Set<() => void>())
  const [pendingRepoIds, setPendingRepoIds] = useState<ReadonlySet<string>>(() => new Set())
  const cards = useMemo(() => {
    const reposById = new Map(nestedRepos.map((nested) => [nested.repo.id, nested.repo]))
    return [
      { owner: toScope(container, containerRepo, container.id), label: undefined },
      ...nestedWorktrees.flatMap(({ worktree, relativePath }) => {
        const repo = reposById.get(worktree.repoId)
        return repo ? [{ owner: toScope(worktree, repo, container.id), label: relativePath }] : []
      })
    ]
  }, [container, containerRepo, nestedRepos, nestedWorktrees])
  const addable = useMemo(() => {
    const present = new Set(nestedWorktrees.map(({ relativePath }) => relativePath))
    return nestedRepos.filter((nested) => !present.has(nested.relativePath))
  }, [nestedRepos, nestedWorktrees])
  const add = async (nested: NestedRepo): Promise<void> => {
    setPendingRepoIds((current) => new Set(current).add(nested.repo.id))
    try {
      await createNestedRepoWorktree(container, nested)
    } finally {
      setPendingRepoIds((current) => {
        const next = new Set(current)
        next.delete(nested.repo.id)
        return next
      })
    }
  }
  const refresh = (): void => {
    for (const refreshNow of refreshers) {
      refreshNow()
    }
  }
  const addLabel = t('auto.components.rightSidebar.NestedRepoSourceControl.add', 'Add nested repo')
  const refreshLabel = t('auto.components.right.sidebar.SourceControl.refreshAll', 'Refresh all')
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-1 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{container.displayName}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t(
              'auto.components.rightSidebar.NestedRepoSourceControl.count',
              '{{count}} repositories',
              { count: cards.length, defaultValue_one: '{{count}} repository' }
            )}
          </div>
        </div>
        {addable.length > 0 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label={addLabel}>
                    <FolderPlus className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{addLabel}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {addable.map((nested) => (
                <DropdownMenuItem
                  key={nested.repo.id}
                  disabled={pendingRepoIds.has(nested.repo.id)}
                  onSelect={() => void add(nested)}
                >
                  <span className="truncate">{nested.repo.displayName}</span>
                  <span className="ml-auto pl-3 text-xs text-muted-foreground">
                    {nested.relativePath}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" onClick={refresh} aria-label={refreshLabel}>
              <RefreshCw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{refreshLabel}</TooltipContent>
        </Tooltip>
      </div>
      {banner}
      <div
        ref={setScrollRoot}
        className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2"
      >
        {cards.map(({ owner, label }) => (
          <SourceControlWorktreeCard
            key={attachedWorktreeOwnerKey(owner)}
            owner={owner}
            locationLabel={label}
            scrollRoot={scrollRoot}
            refreshers={refreshers}
          />
        ))}
      </div>
    </div>
  )
}
