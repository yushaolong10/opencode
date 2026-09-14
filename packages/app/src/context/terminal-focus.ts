import { createEffect, onCleanup } from "solid-js"

export function createTerminalFocusCleanup(workspace: () => { cancelFocus: () => void }) {
  createEffect(() => {
    const current = workspace()
    // Cleanup runs after router params may have switched to a different route.
    onCleanup(() => current.cancelFocus())
  })
}
