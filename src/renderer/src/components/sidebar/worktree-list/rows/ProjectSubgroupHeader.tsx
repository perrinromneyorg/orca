import React from 'react'
import { ChevronDown, Ellipsis, Layers, Pencil, Trash2 } from 'lucide-react'
import type { VirtualItem } from '@tanstack/react-virtual'
import { cn } from '@/lib/class-names'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useTranslate } from '@/i18n/use-translate'
import type { ProjectSubgroupHeaderRow } from '../../../../../../shared/sidebar-list/row-types'
import type { WorkspaceStatusDefinition } from '../../../../../../shared/worktree/types'
import { getVirtualRowTransform } from '../viewport/virtual-rows'
import { getSidebarHeaderVisual } from './header-visuals'
import { getProjectGroupHeaderPaddingLeft } from './indentation'
import { ProjectHeaderActions } from './ProjectHeaderActions'
import { REPO_HEADER_ACTION_BUTTON_CLASS } from './repo-header-action-button-class'
import { stopRepoHeaderMenuEvent } from './header-event-guards'
import {
  deleteWorktreeSection,
  openWorktreeSectionNameDialog
} from '../../worktree-sections/worktree-section-actions'

function SectionMenu({ row }: { row: ProjectSubgroupHeaderRow }): React.JSX.Element | null {
  const t = useTranslate()
  const sectionId = row.sectionId
  if (!sectionId) {
    return null
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={REPO_HEADER_ACTION_BUTTON_CLASS}
          aria-label={t(
            'auto.components.sidebar.worktreeSections.actionsFor',
            'Section actions for {{name}}',
            { name: row.label }
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <Ellipsis className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onPointerDown={stopRepoHeaderMenuEvent}
        onClick={stopRepoHeaderMenuEvent}
        onKeyDown={stopRepoHeaderMenuEvent}
      >
        <DropdownMenuItem
          onSelect={() =>
            openWorktreeSectionNameDialog({
              type: 'rename',
              repo: row.repo,
              sectionId,
              currentName: row.label
            })
          }
        >
          <Pencil className="size-3.5" />
          {t('auto.components.sidebar.worktreeSections.renameItem', 'Rename Section…')}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void deleteWorktreeSection(row.repo, sectionId)}
        >
          <Trash2 className="size-3.5" />
          {t('auto.components.sidebar.worktreeSections.deleteItem', 'Delete Section')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProjectSubgroupHeader({
  row,
  collapsed,
  workspaceStatuses,
  onToggle
}: {
  row: ProjectSubgroupHeaderRow
  collapsed: boolean
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  onToggle: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const visual =
    row.icon.kind === 'workspace-status'
      ? getSidebarHeaderVisual(row.icon, workspaceStatuses, t)
      : { icon: Layers, tone: 'text-muted-foreground' }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      className="group relative flex h-6 w-full cursor-pointer items-center gap-1.5 pr-2 text-left"
      style={{ paddingLeft: getProjectGroupHeaderPaddingLeft(row.groupDepth + 1) }}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
    >
      <div className={cn('flex size-4 shrink-0 items-center justify-center', visual.tone)}>
        <visual.icon className="size-3" />
      </div>
      <div className="min-w-0 truncate text-xs font-medium text-muted-foreground">{row.label}</div>
      <div className="text-xs text-muted-foreground/70">{row.count}</div>
      <div className="flex-1" />
      <ProjectHeaderActions>
        <SectionMenu row={row} />
        <div className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground">
          <ChevronDown className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')} />
        </div>
      </ProjectHeaderActions>
    </div>
  )
}

export function renderProjectSubgroupHeaderRow(args: {
  row: ProjectSubgroupHeaderRow
  vItem: VirtualItem
  collapsed: boolean
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  onToggle: () => void
  measureVirtualRowElement: (element: HTMLDivElement | null) => void
}): React.JSX.Element {
  const { vItem } = args
  return (
    <div
      key={vItem.key}
      role="presentation"
      data-worktree-virtual-row
      data-worktree-virtual-row-key={String(vItem.key)}
      data-worktree-virtual-row-start={vItem.start}
      data-index={vItem.index}
      ref={args.measureVirtualRowElement}
      className="absolute left-0 right-0 top-0"
      style={{ transform: getVirtualRowTransform(vItem.start) }}
    >
      <ProjectSubgroupHeader
        row={args.row}
        collapsed={args.collapsed}
        workspaceStatuses={args.workspaceStatuses}
        onToggle={args.onToggle}
      />
    </div>
  )
}
