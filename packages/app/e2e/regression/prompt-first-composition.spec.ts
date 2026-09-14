import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

test("focuses the first legacy prompt before typing and preserves its first IME composition", async ({ page }) => {
  const directory = "/projects/first-composition"
  await mockOpenCodeServer(page, {
    protocol: "v1",
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
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: false } }))
  })
  await page.goto(`/${base64Encode(directory)}/session`)
  const editor = page.locator('[data-component="prompt-input"]')
  await expect(editor).toBeEditable()
  await expect(editor).toBeFocused()

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
})
