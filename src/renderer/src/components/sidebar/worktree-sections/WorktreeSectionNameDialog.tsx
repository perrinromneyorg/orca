import React from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { ProjectGroupNameDialog } from '../worktree-list/rows/ProjectGroupNameDialog'
import {
  closeWorktreeSectionNameDialog,
  createWorktreeSection,
  renameSection,
  useWorktreeSectionNameDialog
} from './worktree-section-actions'

export function WorktreeSectionNameDialog(): React.JSX.Element {
  const t = useTranslate()
  const dialog = useWorktreeSectionNameDialog()
  const isRename = dialog?.type === 'rename'
  return (
    <ProjectGroupNameDialog
      open={dialog !== null}
      title={
        isRename
          ? t('auto.components.sidebar.worktreeSections.renameTitle', 'Rename Section')
          : t('auto.components.sidebar.worktreeSections.newTitle', 'New Section')
      }
      description={t(
        'auto.components.sidebar.worktreeSections.description',
        'Sections group worktrees inside {{project}} in the sidebar.',
        { project: dialog?.repo.displayName ?? '' }
      )}
      initialName={isRename ? dialog.currentName : ''}
      fieldLabel={t('auto.components.sidebar.worktreeSections.nameLabel', 'Section Name')}
      confirmLabel={
        isRename
          ? t('auto.components.sidebar.worktreeSections.rename', 'Rename')
          : t('auto.components.sidebar.worktreeSections.create', 'Create')
      }
      onOpenChange={(open) => {
        if (!open) {
          closeWorktreeSectionNameDialog()
        }
      }}
      onSubmit={async (name) => {
        if (!dialog) {
          return
        }
        await (dialog.type === 'rename'
          ? renameSection(dialog.repo, dialog.sectionId, name)
          : createWorktreeSection(dialog.repo, name, dialog.assignWorktreePath))
      }}
    />
  )
}
