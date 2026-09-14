import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { fixture, pageMessages } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"

test("keeps sidebar and session surfaces mounted while changing presentation", async ({ page }) => {
  await setup(page)

  await page.goto(`/${base64Encode(fixture.directory)}/session/${fixture.sourceID}`)
  const sidebar = page.locator('[data-component="sidebar-nav-desktop"]')
  const shell = sidebar.locator('[data-component="sidebar-shell"]')
  const projectPanel = sidebar.locator('[data-component="sidebar-project-panel"]')
  const projectToggle = sidebar.locator('[data-action="project-toggle"]')
  const panel = page.locator('[data-component="session-panel-frame"]')
  const toggle = page.getByRole("button", { name: "Toggle sidebar" })
  await expect(shell).toHaveAttribute("data-expanded", "true")
  await expect(projectPanel).toBeVisible()
  await expect(panel).toBeVisible()
  await projectPanel.evaluate((element) => (element.dataset.lifecycle = "sidebar"))
  await panel.evaluate((element) => (element.dataset.lifecycle = "session"))

  await expect(projectToggle).toHaveAttribute("aria-expanded", "true")
  await projectToggle.click()
  await expect(projectToggle).toHaveAttribute("aria-expanded", "false")
  await expect(projectPanel).toBeAttached()
  await expect(projectPanel).toHaveAttribute("data-lifecycle", "sidebar")
  await expect(page).toHaveURL(new RegExp(`/session/${fixture.sourceID}$`))

  await projectToggle.click()
  await expect(projectToggle).toHaveAttribute("aria-expanded", "true")
  await expect(projectPanel).toBeVisible()
  await expect(projectPanel).toHaveAttribute("data-lifecycle", "sidebar")

  await toggle.click()
  await expect(shell).toHaveAttribute("data-expanded", "false")
  await expect(projectPanel).toBeAttached()
  await expect(projectPanel).toHaveAttribute("data-lifecycle", "sidebar")

  await toggle.click()
  await expect(shell).toHaveAttribute("data-expanded", "true")
  await expect(projectPanel).toBeVisible()
  await expect(projectPanel).toHaveAttribute("data-lifecycle", "sidebar")

  await sidebar.locator(`[data-session-id="${fixture.targetID}"]`).click()
  await expect(page).toHaveURL(new RegExp(`/session/${fixture.targetID}$`))
  await expect(panel).toHaveAttribute("data-lifecycle", "session")
})

test("removes a closed project without leaving a frozen sidebar row", async ({ page }) => {
  await setup(page)

  await page.goto(`/${base64Encode(fixture.directory)}/session/${fixture.sourceID}`)
  const project = page
    .locator('[data-component="sidebar-nav-desktop"]')
    .locator('[data-action="project-open"]')
  await expect(project).toBeVisible()

  await project.click({ button: "right" })
  await page.getByRole("menuitem", { name: "Close" }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(project).toHaveCount(0)
  await expect(page.locator('[data-component="home-recently-closed-row"]')).toBeVisible()
})

test("returns from provider setup to the same settings surface", async ({ page }) => {
  await setup(page)
  await page.goto(`/${base64Encode(fixture.directory)}/session/${fixture.sourceID}`)
  await page.keyboard.press("Control+,")

  const settings = page.locator(".settings-v2-dialog")
  await settings.getByRole("tab", { name: "Providers" }).click()
  await settings.evaluate((element) => (element.dataset.lifecycle = "settings"))
  await settings.locator(".settings-v2-providers-view-all").click()
  await expect(page.locator('[data-component="dialog-v2"]')).toHaveCount(2)
  await expect(settings).toHaveAttribute("data-lifecycle", "settings")

  await page.keyboard.press("Escape")
  await expect(page.locator('[data-component="dialog-v2"]')).toHaveCount(1)
  await expect(settings).toBeVisible()
  await expect(settings).toHaveAttribute("data-lifecycle", "settings")
  await expect(settings.getByRole("tab", { name: "Providers" })).toHaveAttribute("data-selected", "")
})

async function setup(page: Page) {
  await mockOpenCodeServer(page, {
    directory: fixture.directory,
    project: fixture.project,
    provider: fixture.provider,
    sessions: fixture.sessions,
    pageMessages,
  })
  await page.addInitScript((directory) => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
    localStorage.setItem(
      "opencode.global.dat:server",
      JSON.stringify({
        projects: { local: [{ worktree: directory, expanded: true }] },
        lastProject: { local: directory },
      }),
    )
    localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ sidebar: { opened: true, width: 312 } }))
  }, fixture.directory)
}
