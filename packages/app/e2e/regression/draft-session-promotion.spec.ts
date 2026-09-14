import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const draftID = "draft_session_promotion"
const directory = "C:/OpenCode/DraftSessionPromotion"
const sessionID = "ses_draft_session_promotion"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

test("promotes an active draft without falling back to home", async ({ page }) => {
  const sessions: ({ id: string } & Record<string, unknown>)[] = []
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "proj_draft_session_promotion",
      worktree: directory,
      vcs: "git",
      name: "draft-session-promotion",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [{ id: "opencode", name: "OpenCode", models: { test: { id: "test", name: "Test" } } }],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "test" },
    },
    sessions,
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === "POST" && url.pathname === "/session") {
      const session = {
        id: sessionID,
        projectID: "proj_draft_session_promotion",
        directory,
        title: "New session",
        time: { created: 1700000000000, updated: 1700000000000 },
      }
      sessions.push(session)
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) })
    }
    if (route.request().method() === "POST" && url.pathname === `/session/${sessionID}/prompt_async`) {
      return route.fulfill({ status: 204 })
    }
    return route.fallback()
  })
  await page.addInitScript(
    ({ directory, draftID, server }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({ projects: { local: [{ worktree: directory, expanded: true }] }, lastProject: { local: directory } }),
      )
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "draft", draftID, server, directory }]),
      )
    },
    { directory, draftID, server },
  )

  await page.goto(`/new-session?draftId=${draftID}`)
  const composer = page.locator('[data-component="prompt-input-v2"]')
  await expectAppVisible(composer)
  await composer.locator('[data-component="prompt-input"]').fill("hello")
  await composer.locator('[data-action="prompt-submit"]').click()

  await expect(page).toHaveURL(new RegExp(`/session/${sessionID}$`))
  await expect(page.locator('[data-component="session-panel-frame"]')).toBeVisible()
})
