import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

const directory = "/projects/first-composition"
const sessionID = "ses_first_composition"

async function mockProject(page: Page, protocol: "v1" | "v2", existingSession = false) {
  await mockOpenCodeServer(page, {
    protocol,
    directory,
    project: {
      id: "proj_first_composition",
      worktree: directory,
      vcs: "git",
      name: "first-composition",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [{ id: "opencode", name: "OpenCode", models: { test: { id: "test", name: "Test" } } }],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "test" },
    },
    sessions:
      existingSession
        ? [
            {
              id: sessionID,
              slug: "first-composition",
              projectID: "proj_first_composition",
              directory,
              title: "First composition",
              version: "dev",
              time: { created: 1700000000000, updated: 1700000000000 },
            },
          ]
        : [],
    pageMessages: () => ({ items: [] }),
  })
}

async function enterChineseGreeting(page: Page) {
  const editor = page.locator('[data-component="prompt-input"]')
  await expect(editor).toBeEditable()
  await expect(editor).toBeFocused()

  await composeChineseGreeting(page, editor)
}

async function composeChineseGreeting(page: Page, editor: ReturnType<Page["locator"]>) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.imeSetComposition", { text: "n", selectionStart: 1, selectionEnd: 1 })
  await expect(editor).toHaveText("n")
  await cdp.send("Input.imeSetComposition", { text: "ni", selectionStart: 2, selectionEnd: 2 })
  await expect(editor).toHaveText("ni")
  await cdp.send("Input.insertText", { text: "你" })
  await expect(editor).toHaveText("你")
  await cdp.send("Input.imeSetComposition", { text: "hao", selectionStart: 3, selectionEnd: 3 })
  await cdp.send("Input.insertText", { text: "好" })
  await expect(editor).toHaveText("你好")
  await cdp.detach()
}

test("preserves the first IME composition in the legacy prompt", async ({ page }) => {
  await mockProject(page, "v1")
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: false } }))
  })
  await page.goto(`/${base64Encode(directory)}/session`)
  await enterChineseGreeting(page)
})

test("preserves the first IME composition in the V2 draft prompt", async ({ page }) => {
  await mockProject(page, "v2")
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
  })
  await page.goto(`/${base64Encode(directory)}/session`)
  await enterChineseGreeting(page)
})

test("preserves the first IME composition in the V2 session prompt", async ({ page }) => {
  await mockProject(page, "v2", true)
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
  })
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await enterChineseGreeting(page)
})

test("hands focus from the sidebar new-session action to the V2 prompt before IME input", async ({ page }) => {
  await mockProject(page, "v2", true)
  await page.addInitScript((directory) => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
    localStorage.setItem(
      "opencode.global.dat:server",
      JSON.stringify({ projects: { local: [{ worktree: directory, expanded: true }] }, lastProject: { local: directory } }),
    )
    localStorage.setItem(
      "opencode.global.dat:layout",
      JSON.stringify({ sidebar: { opened: true, width: 312, workspaces: { [directory]: true } } }),
    )
  }, directory)
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)

  const sidebar = page.locator('[data-component="sidebar-nav-desktop"]')
  await sidebar.locator('[data-action="project-open"]').hover()
  await sidebar.locator('[data-action="project-new-session"]').click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)

  const firstDraft = page.url()
  const newSession = sidebar.locator("[data-new-session-focus-source]").filter({ hasText: "New session" })
  await expect(newSession).toBeVisible()
  await newSession.click()
  const editor = page.locator('[data-component="prompt-input"]')
  await expect(editor).toBeEditable()
  await composeChineseGreeting(page, editor)
  await expect(page).toHaveURL((url) => url.href !== firstDraft && /\/new-session\?draftId=/.test(url.href))
})
