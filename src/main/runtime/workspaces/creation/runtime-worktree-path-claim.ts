import { join as joinPath } from 'node:path'
import type { Repo } from '../../../../shared/repository/repo-types'
import type { WorktreeNestedIn } from '../../../../shared/worktree/types'
import { resolveNestedWorktreePlacement } from '../../../../shared/worktree/nested-worktree-placement'
import { WorktreeCreateCollisionError } from '../../../../shared/new-workspace/worktree-create-collision'
import type { WorktreeCreatePathClaim } from '../../../workspaces/creation/worktree-create-in-flight'
import { isWorktreePathReserved } from '../../../workspaces/creation/reserved-worktree-path'
import { runtimePathExists } from '../catalog/runtime-worktree-filesystem'

/** How a local create claims its checkout path; a nested repo's path is fixed by its container. */
export async function openRuntimeWorktreePathClaim(args: {
  nestedUnder: WorktreeNestedIn | undefined
  pathClaim: WorktreeCreatePathClaim
  store?: Parameters<typeof isWorktreePathReserved>[0]
  repo: Pick<Repo, 'path'>
}): Promise<{ fixedPath?: string; claim: (worktreePath: string) => Promise<boolean> }> {
  if (!args.nestedUnder) {
    return {
      // Orca owns the path until background removal settles, and while it is archived.
      claim: async (worktreePath) =>
        !isWorktreePathReserved(args.store, args.repo, worktreePath) &&
        !(await runtimePathExists(worktreePath)) &&
        args.pathClaim.claim(worktreePath)
    }
  }
  const placement = resolveNestedWorktreePlacement(args.nestedUnder, joinPath)
  if (!(await runtimePathExists(placement.containerPath))) {
    throw new Error('The container workspace for this nested repo no longer exists.')
  }
  return {
    fixedPath: placement.worktreePath,
    // A suffixed sibling would break the mirrored layout, so a taken path is a collision.
    claim: async (worktreePath) => {
      if (await runtimePathExists(worktreePath)) {
        throw new WorktreeCreateCollisionError(
          `"${placement.relativePath}" already exists in this workspace.`
        )
      }
      return args.pathClaim.claim(worktreePath)
    }
  }
}
