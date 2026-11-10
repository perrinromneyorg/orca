import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useTranslate } from '@/i18n/use-translate'
import { Checkbox } from '@/components/ui/checkbox'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import {
  getNestedRepos,
  selectNestedReposForCreate
} from '../../../../shared/worktree/nested-repo-worktrees'

/** Which nested repos get a worktree inside the new container worktree; the pick is saved on the container repo. */
export function NewWorkspaceComposerNestedRepos({
  repoId,
  executionHostId
}: {
  repoId: string | null
  executionHostId?: string | null
}): React.JSX.Element | null {
  const t = useTranslate()
  const repos = useAppStore((s) => s.repos)
  const container = useMemo(
    () =>
      repos.find(
        (repo) =>
          repo.id === repoId &&
          (!executionHostId || getRepoExecutionHostId(repo) === executionHostId)
      ) ?? null,
    [repos, repoId, executionHostId]
  )
  const nestedRepos = useMemo(
    () => (container ? getNestedRepos(container, repos) : []),
    [container, repos]
  )
  if (!container || nestedRepos.length === 0) {
    return null
  }
  const selectedIds = new Set(
    selectNestedReposForCreate(container, nestedRepos).map(({ repo }) => repo.id)
  )
  const toggle = (id: string, checked: boolean): void => {
    const next = nestedRepos
      .map(({ repo }) => repo.id)
      .filter((nestedId) => (nestedId === id ? checked : selectedIds.has(nestedId)))
    void useAppStore
      .getState()
      .updateRepo(
        container.id,
        { nestedWorktreeRepoIds: next },
        { hostId: getRepoExecutionHostId(container) }
      )
  }
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-xs font-medium text-muted-foreground">
        {t('auto.components.newWorkspace.NestedRepos.label', 'Nested repos')}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {nestedRepos.map(({ repo, relativePath }) => (
          <label key={repo.id} className="flex min-w-0 items-center gap-1.5 text-xs">
            <Checkbox
              checked={selectedIds.has(repo.id)}
              onCheckedChange={(checked) => toggle(repo.id, checked === true)}
            />
            <span className="truncate" title={relativePath}>
              {relativePath}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
