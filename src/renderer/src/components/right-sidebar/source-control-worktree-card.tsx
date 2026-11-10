import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { useTranslate } from '@/i18n/use-translate'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { OverlayActivityOwner } from '@/components/ui/use-overlay-focus-scope'
import { getWorktreeGitIdentityDisplay } from '../../../../shared/worktree/git-identity-display'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { attachedWorktreeOwnerKey } from './folder-workspace-attached-worktrees'
import { SourceControlPanel } from './source-control/panel/panel'
import {
  SourceControlScopeProvider,
  type SourceControlScope
} from './source-control/panel/worktree-scope'
import { SourceControlHeaderOverflowMenu } from './source-control/panel/header-overflow-menu'
import { SourceControlHeaderActionsSlot } from './source-control/panel/header-actions-slot'
import { useWorktreeGitStatusObservation } from './source-control/sync/use-worktree-git-status-observation'
import { useSourceControlWatchConsumer } from '@/hooks/source-control-watch-consumers'
import { useSectionOnScreen } from './source-control/panel/section-viewport-presence'
import { sourceControlFileWatchRuntimeEnvironmentId } from './source-control/sync/worktree-git-owner-target'
import {
  FOLDER_WORKTREE_CARD_CLASS,
  FolderWorktreeSectionHeader
} from './folder-worktree-section-header'

const EMPTY_ENTRIES: readonly unknown[] = []

type SectionProps = {
  owner: SourceControlScope
  /** Replaces the worktree name, e.g. a nested repo's path inside its container. */
  locationLabel?: string
  scrollRoot: Element | null
  refreshers: Set<() => void>
}

export const SourceControlWorktreeCard = memo(
  function SourceControlWorktreeCard({
    owner,
    locationLabel,
    scrollRoot,
    refreshers
  }: SectionProps) {
    const t = useTranslate()
    useUiLanguageRevision()
    const id = owner.worktreeId
    const entries = useAppStore((state) => state.gitStatusByWorktree[id] ?? EMPTY_ENTRIES)
    const statusKnown = useAppStore((state) => Object.hasOwn(state.gitStatusByWorktree, id))
    const remote = useAppStore((state) => state.remoteStatusesByWorktree[id])
    const error = useAppStore((state) => state.gitStatusReadErrorByWorktree[id])
    const huge = useAppStore((state) => state.gitStatusHugeByWorktree[id])
    const connected = useAppStore(
      (state) =>
        !owner.repo.connectionId ||
        state.sshConnectionStates.get(owner.repo.connectionId)?.status === 'connected'
    )
    const [expanded, setExpanded] = useState<boolean | undefined>()
    const isExpanded = expanded ?? (statusKnown ? entries.length > 0 : true)
    // Decide once at the first result; later agent edits update badges without undoing a user's collapse.
    if (expanded === undefined && statusKnown) {
      setExpanded(entries.length > 0)
    }
    const refreshNow = useWorktreeGitStatusObservation(owner, { enabled: true })
    useEffect(() => {
      refreshers.add(refreshNow)
      return () => {
        refreshers.delete(refreshNow)
      }
    }, [refreshNow, refreshers])
    const [sectionRef, onScreen] = useSectionOnScreen(scrollRoot)
    const bodyShown =
      isExpanded && connected && (statusKnown || error !== undefined || isFolderRepo(owner.repo))
    // Open overlays keep their section live until they close, including while off screen.
    const [openOverlays, setOpenOverlays] = useState(() => new Set<HTMLElement>())
    const onOverlayActivity = useCallback((overlay: HTMLElement, open: boolean) => {
      setOpenOverlays((current) => {
        if (current.has(overlay) === open) {
          return current
        }
        const next = new Set(current)
        if (open) {
          next.add(overlay)
        } else {
          next.delete(overlay)
        }
        return next
      })
    }, [])
    const bodyActive = (bodyShown && onScreen) || openOverlays.size > 0
    // Mount on first sight, then keep the body so selection, history view and focus survive scrolling and collapse.
    const [bodyMounted, setBodyMounted] = useState(false)
    if (bodyActive && !bodyMounted) {
      setBodyMounted(true)
    }
    const watchRuntimeEnvironmentId = useAppStore((state) =>
      sourceControlFileWatchRuntimeEnvironmentId(state, owner)
    )
    // Only local or served-runtime roots have the existing watch transport; huge repos keep their pause.
    useSourceControlWatchConsumer(
      attachedWorktreeOwnerKey(owner),
      connected && !huge && !isFolderRepo(owner.repo) && watchRuntimeEnvironmentId !== undefined
        ? {
            worktreeId: id,
            worktreePath: owner.worktree.path,
            connectionId: owner.repo.connectionId ?? undefined,
            runtimeEnvironmentId: watchRuntimeEnvironmentId
          }
        : null
    )
    const panel = useMemo(() => <SourceControlPanel />, [])
    const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null)
    const identity = getWorktreeGitIdentityDisplay(owner.worktree)
    return (
      <section
        ref={sectionRef}
        className={FOLDER_WORKTREE_CARD_CLASS}
        data-source-control-worktree={id}
      >
        <FolderWorktreeSectionHeader
          repoName={owner.repo.displayName}
          worktreeName={locationLabel ?? owner.worktree.displayName}
          branch={
            identity?.kind === 'detached'
              ? identity.sourceControlLabel
              : (identity?.branchName ?? owner.worktree.branch)
          }
          ahead={remote?.ahead}
          behind={remote?.behind}
          changeCount={entries.length}
          expanded={isExpanded}
          showBranchInHeader={!bodyShown || !bodyMounted || isFolderRepo(owner.repo)}
          actions={
            isExpanded && (!bodyShown || !bodyMounted || isFolderRepo(owner.repo)) ? (
              <SourceControlHeaderOverflowMenu worktree={owner.worktree} />
            ) : null
          }
          onToggle={() => setExpanded(!isExpanded)}
          onOpen={() => useAppStore.getState().setActiveWorktree(id, owner.executionHostId)}
          actionsSlotRef={setActionsSlot}
        />
        {isExpanded &&
          (!connected ? (
            <div className="px-4 pb-2 text-xs text-muted-foreground">
              {t(
                'auto.components.rightSidebar.FolderWorkspaceSourceControl.reconnect',
                'Reconnect to see this worktree’s changes.'
              )}
            </div>
          ) : !bodyShown ? (
            <div className="h-24 space-y-2 p-3" aria-busy="true">
              <div className="h-2 w-3/4 rounded bg-muted" />
              <div className="h-2 w-1/2 rounded bg-muted" />
            </div>
          ) : (
            !bodyMounted && <div className="h-24" aria-hidden="true" />
          ))}
        {bodyMounted && (
          // A read error renders the body's existing failure banner with Retry.
          <div hidden={!bodyShown}>
            <OverlayActivityOwner.Provider value={onOverlayActivity}>
              <SourceControlHeaderActionsSlot.Provider value={bodyShown ? actionsSlot : null}>
                <SourceControlScopeProvider owner={owner} active={bodyActive}>
                  {panel}
                </SourceControlScopeProvider>
              </SourceControlHeaderActionsSlot.Provider>
            </OverlayActivityOwner.Provider>
          </div>
        )}
      </section>
    )
  },
  (left, right) =>
    left.locationLabel === right.locationLabel &&
    left.scrollRoot === right.scrollRoot &&
    left.refreshers === right.refreshers &&
    left.owner.worktree === right.owner.worktree &&
    left.owner.repo === right.owner.repo &&
    left.owner.placementWorkspaceId === right.owner.placementWorkspaceId
)
