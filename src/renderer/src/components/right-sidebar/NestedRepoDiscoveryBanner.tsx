import { useState } from 'react'
import { FolderGit2, X } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import type { Repo } from '../../../../shared/repo-types'
import { addNestedReposWithFeedback, type UnregisteredNestedRepo } from './nested-repo-discovery'

const dismissedContainers = new Set<string>()

/** Offers to track repos found inside the container so they get their own Source Control cards. */
export function NestedRepoDiscoveryBanner({
  container,
  unregistered
}: {
  container: Repo
  unregistered: readonly UnregisteredNestedRepo[]
}): React.JSX.Element | null {
  const t = useTranslate()
  const [adding, setAdding] = useState(false)
  const [dismissed, setDismissed] = useState(() => dismissedContainers.has(container.id))
  if (unregistered.length === 0 || dismissed) {
    return null
  }
  const add = (): Promise<void> => addNestedReposWithFeedback(container, unregistered, setAdding)
  return (
    <div className="mx-2 mt-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-xs">
      <FolderGit2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="font-medium">
          {t(
            'auto.components.rightSidebar.NestedRepoDiscovery.title',
            '{{count}} repositories inside this repo',
            {
              count: unregistered.length,
              defaultValue_one: '{{count}} repository inside this repo'
            }
          )}
        </div>
        <div
          className="truncate text-muted-foreground"
          title={unregistered.map((r) => r.relativePath).join(', ')}
        >
          {unregistered.map((repo) => repo.relativePath).join(', ')}
        </div>
        <Button size="sm" variant="outline" disabled={adding} onClick={() => void add()}>
          {adding
            ? t('auto.components.rightSidebar.NestedRepoDiscovery.adding', 'Adding…')
            : t('auto.components.rightSidebar.NestedRepoDiscovery.add', 'Show their changes here')}
        </Button>
      </div>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={t('auto.components.rightSidebar.NestedRepoDiscovery.dismiss', 'Dismiss')}
        onClick={() => {
          dismissedContainers.add(container.id)
          setDismissed(true)
        }}
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}
