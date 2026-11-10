import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKTREE_ADD_NESTED_COMMAND_SPEC: CommandSpec = {
  path: ['worktree', 'add-nested'],
  summary: 'Check nested repos out inside an existing container worktree',
  usage: 'orca worktree add-nested [--worktree <selector>] [--nested all|<repo>,...] [--json]',
  allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'nested'],
  notes: [
    'A container repo holds other registered Git repos (not submodules), such as api/ and web/. This adds worktrees of those repos inside the container worktree at the same relative paths, on its branch; an existing branch of that name is checked out instead of created.',
    'Defaults to the current Orca worktree and to every nested repo not yet checked out there. --nested picks repos by path, display name or repo id.',
    'Repos already checked out at their path are reported as already present; one failing repo does not stop the others.'
  ],
  examples: [
    'orca worktree add-nested',
    'orca worktree add-nested --nested allucent-api-server --json',
    'orca worktree add-nested --worktree active --nested api,web'
  ]
}
