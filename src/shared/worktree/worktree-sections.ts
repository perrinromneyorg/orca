import { isRecord } from '../agent-status/child-work/agent-status-child-work-value-guards'
import type { Repo, WorktreeSection, WorktreeSubgroupBy } from '../repo-types'

const SECTION_NAME_MAX_LENGTH = 80

/** Drops malformed entries at the IPC/RPC boundary instead of persisting them. */
export function normalizeWorktreeSections(value: unknown): WorktreeSection[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const seen = new Set<string>()
  const sections: WorktreeSection[] = []
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue
    }
    const { id, name, worktreePaths } = entry
    if (typeof id !== 'string' || id === '' || seen.has(id) || typeof name !== 'string') {
      continue
    }
    const trimmed = name.trim().slice(0, SECTION_NAME_MAX_LENGTH)
    if (trimmed === '') {
      continue
    }
    seen.add(id)
    sections.push({
      id,
      name: trimmed,
      worktreePaths: Array.isArray(worktreePaths)
        ? [...new Set(worktreePaths.filter((path): path is string => typeof path === 'string'))]
        : []
    })
  }
  return sections
}

export function normalizeWorktreeSubgroupBy(value: unknown): WorktreeSubgroupBy | undefined {
  return value === 'sections' || value === 'status' ? value : undefined
}

export function getWorktreeSubgroupBy(repo: Pick<Repo, 'worktreeSubgroupBy'>): WorktreeSubgroupBy {
  return repo.worktreeSubgroupBy ?? 'sections'
}

export function findWorktreeSection(
  repo: Pick<Repo, 'worktreeSections'>,
  worktreePath: string
): WorktreeSection | undefined {
  return repo.worktreeSections?.find((section) => section.worktreePaths.includes(worktreePath))
}

/** A worktree belongs to at most one section; null moves it back to the unsectioned rows. */
export function assignWorktreeToSection(
  sections: readonly WorktreeSection[],
  worktreePath: string,
  sectionId: string | null
): WorktreeSection[] {
  return sections.map((section) => {
    const without = section.worktreePaths.filter((path) => path !== worktreePath)
    return {
      ...section,
      worktreePaths: section.id === sectionId ? [...without, worktreePath] : without
    }
  })
}

export function renameWorktreeSection(
  sections: readonly WorktreeSection[],
  sectionId: string,
  name: string
): WorktreeSection[] {
  return sections.map((section) => (section.id === sectionId ? { ...section, name } : section))
}

export function removeWorktreeSection(
  sections: readonly WorktreeSection[],
  sectionId: string
): WorktreeSection[] {
  return sections.filter((section) => section.id !== sectionId)
}
