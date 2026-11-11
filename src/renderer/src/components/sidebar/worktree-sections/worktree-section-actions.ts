import { toast } from 'sonner'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { findRepoForHost } from '@/store/repos/repo-host-identity'
import { getRepoExecutionHostId } from '../../../../../shared/execution-host'
import { createNonSecureContextUuid } from '../../../../../shared/non-secure-context-uuid'
import type { Repo, WorktreeSubgroupBy } from '../../../../../shared/repo-types'
import {
  assignWorktreeToSection,
  removeWorktreeSection,
  renameWorktreeSection
} from '../../../../../shared/worktree/worktree-sections'

export type WorktreeSectionNameDialogState =
  | { type: 'create'; repo: Repo; assignWorktreePath?: string }
  | { type: 'rename'; repo: Repo; sectionId: string; currentName: string }

const nameDialogStore = createStore<{ dialog: WorktreeSectionNameDialogState | null }>(() => ({
  dialog: null
}))

export function openWorktreeSectionNameDialog(dialog: WorktreeSectionNameDialogState): void {
  nameDialogStore.setState({ dialog })
}

export function closeWorktreeSectionNameDialog(): void {
  nameDialogStore.setState({ dialog: null })
}

export function useWorktreeSectionNameDialog(): WorktreeSectionNameDialogState | null {
  return useStore(nameDialogStore, (state) => state.dialog)
}

// Menus capture a repo at render; read the live one so concurrent edits are not overwritten.
function liveRepo(repo: Repo): Repo {
  const state = useAppStore.getState()
  return findRepoForHost(state.repos, repo.id, { hostId: getRepoExecutionHostId(repo) }) ?? repo
}

async function updateSectionFields(
  repo: Repo,
  updates: Partial<Pick<Repo, 'worktreeSections' | 'worktreeSubgroupBy'>>
): Promise<void> {
  const saved = await useAppStore
    .getState()
    .updateRepo(repo.id, updates, { hostId: getRepoExecutionHostId(repo) })
  if (!saved) {
    toast.error(
      translate(
        'auto.components.sidebar.worktreeSections.saveFailed',
        'Could not update worktree sections'
      )
    )
  }
}

export async function createWorktreeSection(
  repo: Repo,
  name: string,
  assignWorktreePath?: string
): Promise<void> {
  const current = liveRepo(repo)
  const id = createNonSecureContextUuid()
  const added = [...(current.worktreeSections ?? []), { id, name, worktreePaths: [] }]
  await updateSectionFields(current, {
    worktreeSections: assignWorktreePath
      ? assignWorktreeToSection(added, assignWorktreePath, id)
      : added,
    // A new section is only visible while the project splits by section.
    worktreeSubgroupBy: 'sections'
  })
}

export async function renameSection(repo: Repo, sectionId: string, name: string): Promise<void> {
  const current = liveRepo(repo)
  await updateSectionFields(current, {
    worktreeSections: renameWorktreeSection(current.worktreeSections ?? [], sectionId, name)
  })
}

export async function deleteWorktreeSection(repo: Repo, sectionId: string): Promise<void> {
  const current = liveRepo(repo)
  await updateSectionFields(current, {
    worktreeSections: removeWorktreeSection(current.worktreeSections ?? [], sectionId)
  })
}

export async function moveWorktreeToSection(
  repo: Repo,
  worktreePath: string,
  sectionId: string | null
): Promise<void> {
  const current = liveRepo(repo)
  await updateSectionFields(current, {
    worktreeSections: assignWorktreeToSection(
      current.worktreeSections ?? [],
      worktreePath,
      sectionId
    ),
    ...(sectionId ? { worktreeSubgroupBy: 'sections' as const } : {})
  })
}

export async function setWorktreeSubgroupBy(
  repo: Repo,
  subgroupBy: WorktreeSubgroupBy
): Promise<void> {
  await updateSectionFields(liveRepo(repo), { worktreeSubgroupBy: subgroupBy })
}
