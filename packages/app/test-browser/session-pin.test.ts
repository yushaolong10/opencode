import { expect, test } from "bun:test"
import { MemoryRouter, Route, createMemoryHistory, useParams } from "@solidjs/router"
import { createMemo, ErrorBoundary } from "solid-js"
import { createComponent, render } from "solid-js/web"
import { ServerConnection } from "@/context/server"
import { createTerminalFocusCleanup } from "@/context/terminal-focus"
import { createSessionPin } from "@/pages/session/session-pin"
import { requireServerKey, sessionHref } from "@/utils/session-route"

for (const destination of ["/", "/new-session", "/project/session/legacy"]) {
  test(`releases the original session pin when navigating to ${destination}`, async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const history = createMemoryHistory()
    const first = ServerConnection.Key.make("http://localhost:4096")
    const second = ServerConnection.Key.make("http://localhost:4097")
    const events: string[] = []
    const errors: unknown[] = []
    const cancelled: string[] = []
    const stores = new Map(
      [first, second].map((server) => [
        server,
        {
          cancelFocus: () => {
            cancelled.push(server)
          },
          pin: (id: string) => {
            events.push(`pin:${server}:${id}`)
          },
          unpin: (id: string) => {
            events.push(`unpin:${server}:${id}`)
          },
        },
      ]),
    )
    history.set({ value: sessionHref(first, "a"), scroll: false, replace: true })

    const Session = () => {
      const params = useParams()
      const server = createMemo(() => requireServerKey(params.serverKey))
      const store = createMemo(() => stores.get(server())!)
      createSessionPin(() => params.id, store)
      createTerminalFocusCleanup(store)
      return "session"
    }
    const dispose = render(
      () =>
        createComponent(ErrorBoundary, {
          fallback: (error: unknown) => {
            errors.push(error)
            return "error"
          },
          get children() {
            return createComponent(MemoryRouter, {
              history,
              get children() {
                return [
                  createComponent(Route, { path: "/server/:serverKey/session/:id", component: Session }),
                  createComponent(Route, { path: "/", component: () => "home" }),
                  createComponent(Route, { path: "/new-session", component: () => "draft" }),
                  createComponent(Route, { path: "/:dir/session/:id", component: () => "legacy" }),
                ]
              },
            })
          },
        }),
      host,
    )

    try {
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(events).toEqual([`pin:${first}:a`])

      history.set({ value: sessionHref(first, "b"), scroll: false, replace: false })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(events).toEqual([`pin:${first}:a`, `unpin:${first}:a`, `pin:${first}:b`])

      history.set({ value: sessionHref(second, "b"), scroll: false, replace: false })
      await new Promise((resolve) => setTimeout(resolve, 0))

      history.set({ value: destination, scroll: false, replace: false })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(errors).toEqual([])
      expect(cancelled).toEqual([first, second])
      expect(events.slice(-3)).toEqual([`unpin:${first}:b`, `pin:${second}:b`, `unpin:${second}:b`])
      expect(host.textContent).toBe(destination === "/" ? "home" : destination === "/new-session" ? "draft" : "legacy")
    } finally {
      dispose()
      host.remove()
    }
  })
}
