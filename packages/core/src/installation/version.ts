declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
}

export const InstallationVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"

export function installationDependencyVersion(channel: string, version: string) {
  if (channel === "local") return
  if (channel === "dev") return channel
  return version
}

export const InstallationDependencyVersion = installationDependencyVersion(InstallationChannel, InstallationVersion)
