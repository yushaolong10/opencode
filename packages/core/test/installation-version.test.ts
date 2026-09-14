import { describe, expect, test } from "bun:test"
import { installationDependencyVersion } from "../src/installation/version"

describe("installation dependency version", () => {
  test("uses the registry default for local builds", () => {
    expect(installationDependencyVersion("local", "local")).toBeUndefined()
  })

  test("uses the channel tag for dev builds", () => {
    expect(installationDependencyVersion("dev", "0.0.0-dev-202609140738")).toBe("dev")
  })

  test("pins release builds to their exact version", () => {
    expect(installationDependencyVersion("latest", "1.18.30")).toBe("1.18.30")
    expect(installationDependencyVersion("beta", "0.0.0-beta-19271")).toBe("0.0.0-beta-19271")
  })
})
