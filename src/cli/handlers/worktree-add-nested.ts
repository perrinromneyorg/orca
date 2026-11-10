import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getRequiredWorktreeSelector, resolveCurrentWorktreeSelector } from '../selectors'
import type { RuntimeWorktreeRecord } from '../../shared/runtime-worktree-contracts'
import { addNestedRepoWorktreesForCli } from './worktree-create-nested'

export const WORKTREE_ADD_NESTED_HANDLERS: Record<string, CommandHandler> = {
  'worktree add-nested': async ({ flags, client, cwd, json }) => {
    const shown = await client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
      worktree: flags.has('worktree')
        ? await getRequiredWorktreeSelector(flags, 'worktree', cwd, client)
        : await resolveCurrentWorktreeSelector(cwd, client, 'current')
    })
    const container = shown.result.worktree
    const outcome = await addNestedRepoWorktreesForCli(client, container, flags, json, 'all')
    if (outcome.created.length === 0 && outcome.failed.length > 0) {
      throw new Error(
        `No nested repos were added to ${container.path}: ${outcome.failed
          .map(({ relativePath, message }) => `${relativePath}: ${message}`)
          .join('; ')}`
      )
    }
    printResult({ ...shown, result: { container: container.path, ...outcome } }, json, (value) =>
      [
        ...(value.created.length === 0 && value.failed.length === 0
          ? [`No nested repos to add in ${value.container}.`]
          : []),
        ...(value.present.length > 0 ? [`already present: ${value.present.join(', ')}`] : [])
      ].join('\n')
    )
  }
}
