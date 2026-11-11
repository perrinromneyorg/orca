import React from 'react'
import { Layers, Plus } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { useTranslate } from '@/i18n/use-translate'
import type { Repo } from '../../../../../shared/repo-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { findWorktreeSection } from '../../../../../shared/worktree/worktree-sections'
import { isGitRepoKind } from '../../../../../shared/repo-kind'
import { moveWorktreeToSection, openWorktreeSectionNameDialog } from './worktree-section-actions'

const NO_SECTION = ''

export function WorktreeSectionSubMenu({
  repo,
  worktree,
  disabled
}: {
  repo: Repo | null | undefined
  worktree: Worktree
  disabled: boolean
}): React.JSX.Element | null {
  const t = useTranslate()
  if (!repo || !isGitRepoKind(repo)) {
    return null
  }
  const sections = repo.worktreeSections ?? []
  const currentId = findWorktreeSection(repo, worktree.path)?.id ?? NO_SECTION
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        <Layers className="size-3.5" />
        {t('auto.components.sidebar.worktreeSections.submenu', 'Section')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {sections.length > 0 ? (
          <>
            <DropdownMenuRadioGroup
              value={currentId}
              onValueChange={(sectionId) =>
                void moveWorktreeToSection(repo, worktree.path, sectionId || null)
              }
            >
              <DropdownMenuRadioItem value={NO_SECTION} disabled={disabled}>
                {t('auto.components.sidebar.worktreeSections.none', 'No Section')}
              </DropdownMenuRadioItem>
              {sections.map((section) => (
                <DropdownMenuRadioItem
                  key={section.id}
                  value={section.id}
                  textValue={section.name}
                  disabled={disabled}
                >
                  <span className="max-w-48 truncate">{section.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          disabled={disabled}
          onSelect={() =>
            openWorktreeSectionNameDialog({
              type: 'create',
              repo,
              assignWorktreePath: worktree.path
            })
          }
        >
          <Plus className="size-3.5" />
          {t('auto.components.sidebar.worktreeSections.newWithWorktree', 'New Section…')}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
