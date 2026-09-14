import { createEffect, onCleanup } from "solid-js"
import type { ServerSync } from "@/context/server-sync"

export function createSessionPin(
  sessionID: () => string | undefined,
  session: () => Pick<ServerSync["session"], "pin" | "unpin">,
) {
  createEffect(() => {
    const id = sessionID()
    if (!id) return
    const store = session()
    store.pin(id)
    // Router params may already belong to the next route during cleanup.
    // Release the pin on its original store without re-reading route-scoped accessors.
    onCleanup(() => store.unpin(id))
  })
}
