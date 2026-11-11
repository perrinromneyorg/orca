import React from 'react'
import { Layers, Plus } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { useTranslate } from '@/i18n/use-translate'
import type { Repo } from '../../../../../shared/repo-types'
import {
  getWorktreeSubgroupBy,
  normalizeWorktreeSubgroupBy
} from '../../../../../shared/worktree/worktree-sections'
import { openWorktreeSectionNameDialog, setWorktreeSubgroupBy } from './worktree-section-actions'

export function ProjectWorktreeSectionMenuItems({ repo }: { repo: Repo }): React.JSX.Element {
  const t = useTranslate()
  return (
    <>
      <DropdownMenuItem onSelect={() => openWorktreeSectionNameDialog({ type: 'create', repo })}>
        <Plus className="size-3.5" />
        {t('auto.components.sidebar.worktreeSections.newSection', 'New Worktree Section…')}
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Layers className="size-3.5" />
          {t('auto.components.sidebar.worktreeSections.groupBy', 'Group Worktrees By')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={getWorktreeSubgroupBy(repo)}
            onValueChange={(value) => {
              const subgroupBy = normalizeWorktreeSubgroupBy(value)
              if (subgroupBy) {
                void setWorktreeSubgroupBy(repo, subgroupBy)
              }
            }}
          >
            <DropdownMenuRadioItem value="sections">
              {t('auto.components.sidebar.worktreeSections.bySections', 'Sections')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="status">
              {t('auto.components.sidebar.worktreeSections.byStatus', 'Status')}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  )
}
