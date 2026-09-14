import type { ConfigProviderV1 } from "@opencode-ai/core/v1/config/provider"
import { parseModelJSON } from "./custom-model-json"

type ModelConfig = NonNullable<ConfigProviderV1.Info["models"]>[string]

const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/
const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible"
const OPENAI_RESPONSES = "@ai-sdk/github-copilot"
const REASONING_SLIDER_TYPE = "effort_slider" as const

type Translator = (key: string, vars?: Record<string, string | number | boolean>) => string

export type ModelErr = {
  id?: string
  name?: string
  capabilities?: string
}

export type HeaderErr = {
  key?: string
  value?: string
}

export type ModelRow = {
  json?: string
  savedID?: string
  row: string
  id: string
  name: string
  endpoint: "chat" | "responses"
  contextWindow?: string
  maxInputTokens?: string
  maxOutputTokens?: string
  reservedOutputTokenSpace?: string
  supportsSystemMessage?: string
  specialToolFormat?: string
  supportsFIM?: boolean
  supportsVision?: boolean
  supportsReasoning?: boolean
  canTurnOffReasoning?: boolean
  canIOReasoning?: boolean
  reasoningDefault?: string
  reasoningEfforts?: string
  supportsTemperature?: boolean
  supportsToolCalls?: boolean
  original?: ModelConfig
  err: ModelErr
}

export const reasoningEfforts = (model: ModelRow) =>
  [
    ...new Set(
      (model.reasoningEfforts ?? "low, medium, high")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ].filter((effort) => model.canTurnOffReasoning || effort !== "none")

export type HeaderRow = {
  row: string
  key: string
  value: string
  err: HeaderErr
}

export type FormState = {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
  models: ModelRow[]
  headers: HeaderRow[]
  err: {
    providerID?: string
    name?: string
    baseURL?: string
  }
}

type ValidateArgs = {
  form: FormState
  t: Translator
  disabledProviders: string[]
  existingProviderIDs: Set<string>
  initial?: ConfigProviderV1.Info
}

export function validateCustomProvider(input: ValidateArgs) {
  const providerID = input.form.providerID.trim()
  const name = input.form.name.trim()
  const baseURL = input.form.baseURL.trim()
  const apiKey = input.form.apiKey.trim()

  const env = apiKey.match(/^\{env:([^}]+)\}$/)?.[1]?.trim()
  const key = apiKey && !env ? apiKey : undefined

  const idError = !providerID
    ? input.t("provider.custom.error.providerID.required")
    : !PROVIDER_ID.test(providerID)
      ? input.t("provider.custom.error.providerID.format")
      : undefined

  const nameError = !name ? input.t("provider.custom.error.name.required") : undefined
  const urlError = !baseURL
    ? input.t("provider.custom.error.baseURL.required")
    : !/^https?:\/\//.test(baseURL)
      ? input.t("provider.custom.error.baseURL.format")
      : undefined

  const disabled = input.disabledProviders.includes(providerID)
  const existsError = idError
    ? undefined
    : input.existingProviderIDs.has(providerID) && !disabled
      ? input.t("provider.custom.error.providerID.exists")
      : undefined

  const seenModels = new Set<string>()
  const models = input.form.models.map((m) => {
    const id = m.id.trim()
    const idError = !id
      ? input.t("provider.custom.error.required")
      : seenModels.has(id)
        ? input.t("provider.custom.error.duplicate")
        : (() => {
            seenModels.add(id)
            return undefined
          })()
    const nameError = !m.name.trim() ? input.t("provider.custom.error.required") : undefined
    if (m.json !== undefined) {
      const parsed = parseModelJSON(m.json)
      return {
        id: idError,
        name: undefined,
        ...(!parsed.model ? { capabilities: parsed.issues.map((issue) => issue.message).join("\n") } : {}),
      }
    }
    const numbers = [m.contextWindow, m.maxInputTokens, m.maxOutputTokens, m.reservedOutputTokenSpace]
    const context = numberValue(m.contextWindow)
    const output = numberValue(m.maxOutputTokens)
    const reserved = numberValue(m.reservedOutputTokenSpace)
    const inputLimit = numberValue(m.maxInputTokens)
    const invalid =
      context === undefined ||
      numbers.some((value) => value?.trim() && numberValue(value) === undefined) ||
      [m.contextWindow, m.maxInputTokens, m.maxOutputTokens].some(
        (value) => value?.trim() && numberValue(value) === 0,
      ) ||
      (context !== undefined &&
        [output, inputLimit, reserved].some((value) => value !== undefined && value > context)) ||
      (context !== undefined && (reserved === context || output === context)) ||
      (!!m.supportsReasoning &&
        (!reasoningEfforts(m).length || !reasoningEfforts(m).includes(m.reasoningDefault ?? "medium")))
    return {
      id: idError,
      name: nameError,
      ...(invalid ? { capabilities: input.t("provider.custom.error.capabilities") } : {}),
    }
  })
  const modelsValid = models.every((m) => !m.id && !m.name && !m.capabilities)
  const modelConfig = Object.fromEntries(
    input.form.models.map((m) => [
      m.id.trim(),
      m.json !== undefined
        ? (parseModelJSON(m.json).model ?? {})
        : {
            ...m.original,
            name: m.name.trim(),
            reasoning: m.supportsReasoning ?? m.original?.reasoning,
            temperature: m.supportsTemperature ?? m.original?.temperature,
            tool_call: m.supportsToolCalls ?? m.original?.tool_call ?? true,
            contextWindow: numberValue(m.contextWindow),
            maxInputTokens: numberValue(m.maxInputTokens),
            maxOutputTokens: numberValue(m.maxOutputTokens),
            reservedOutputTokenSpace: numberValue(m.reservedOutputTokenSpace),
            // These limits are round-tripped through the explicit fields above.
            limit: undefined,
            ...(m.supportsSystemMessage ? { supportsSystemMessage: m.supportsSystemMessage } : {}),
            ...(m.specialToolFormat ? { specialToolFormat: m.specialToolFormat } : {}),
            ...(m.supportsFIM !== undefined ? { supportsFIM: m.supportsFIM } : {}),
            ...(m.supportsVision !== undefined ? { supportsVision: m.supportsVision } : {}),
            ...(m.supportsReasoning !== undefined
              ? {
                  reasoningCapabilities: {
                    supportsReasoning: m.supportsReasoning,
                    canTurnOffReasoning: m.canTurnOffReasoning ?? false,
                    canIOReasoning: m.canIOReasoning ?? false,
                    reasoningSlider: {
                      type: REASONING_SLIDER_TYPE,
                      values: reasoningEfforts(m),
                      default: m.reasoningDefault ?? "medium",
                    },
                  },
                }
              : {}),
            provider: {
              ...m.original?.provider,
              npm:
                m.original && modelEndpoint(m.original, input.initial?.npm) === m.endpoint
                  ? (m.original.provider?.npm ?? input.initial?.npm)
                  : m.endpoint === "responses"
                    ? OPENAI_RESPONSES
                    : OPENAI_COMPATIBLE,
              endpoint: m.endpoint,
            },
          },
    ]),
  )

  const seenHeaders = new Set<string>()
  const headers = input.form.headers.map((h) => {
    const key = h.key.trim()
    const value = h.value.trim()

    if (!key && !value) return {}
    const keyError = !key
      ? input.t("provider.custom.error.required")
      : seenHeaders.has(key.toLowerCase())
        ? input.t("provider.custom.error.duplicate")
        : (() => {
            seenHeaders.add(key.toLowerCase())
            return undefined
          })()
    const valueError = !value ? input.t("provider.custom.error.required") : undefined
    return { key: keyError, value: valueError }
  })
  const headersValid = headers.every((h) => !h.key && !h.value)
  const headerConfig = Object.fromEntries(
    input.form.headers
      .map((h) => ({ key: h.key.trim(), value: h.value.trim() }))
      .filter((h) => !!h.key && !!h.value)
      .map((h) => [h.key, h.value]),
  )

  const err = {
    providerID: idError ?? existsError,
    name: nameError,
    baseURL: urlError,
  }

  const ok = !idError && !existsError && !nameError && !urlError && modelsValid && headersValid
  if (!ok) return { err, models, headers }

  return {
    err,
    models,
    headers,
    result: {
      providerID,
      name,
      key,
      config: {
        ...input.initial,
        npm: input.initial?.npm ?? OPENAI_COMPATIBLE,
        name,
        ...(env ? { env: [env, ...(input.initial?.env?.slice(1) ?? [])] } : {}),
        options: {
          ...input.initial?.options,
          baseURL,
          headers: headerConfig,
        },
        models: modelConfig,
      },
    },
  }
}

let row = 0

const nextRow = () => `row-${row++}`

export const modelRow = (): ModelRow => ({
  row: nextRow(),
  id: "",
  name: "",
  endpoint: "chat",
  contextWindow: "",
  maxInputTokens: "",
  maxOutputTokens: "",
  reservedOutputTokenSpace: "",
  supportsSystemMessage: "auto",
  supportsVision: false,
  supportsReasoning: false,
  canTurnOffReasoning: false,
  canIOReasoning: false,
  reasoningDefault: "medium",
  reasoningEfforts: "low, medium, high",
  supportsTemperature: false,
  supportsToolCalls: true,
  err: {},
})

function numberValue(value: string | undefined) {
  if (!value?.trim()) return undefined
  const number = Number(value.trim())
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined
}

function modelEndpoint(model: ModelConfig, npm?: string): ModelRow["endpoint"] {
  return (
    model.provider?.endpoint ??
    (["@ai-sdk/github-copilot", "@ai-sdk/openai"].includes(model.provider?.npm ?? npm ?? "") ? "responses" : "chat")
  )
}

export function configuredModelRow(id: string, model: ModelConfig, npm?: string): ModelRow {
  return {
    ...modelRow(),
    id,
    name: model.name ?? id,
    original: model,
    endpoint: modelEndpoint(model, npm),
    contextWindow: (model.contextWindow || model.limit?.context)?.toString() ?? "",
    maxInputTokens: (model.maxInputTokens ?? model.limit?.input)?.toString() ?? "",
    // Older forms stored the output limit in reservedOutputTokenSpace.
    maxOutputTokens: (model.maxOutputTokens || model.limit?.output || model.reservedOutputTokenSpace)?.toString() ?? "",
    reservedOutputTokenSpace: model.reservedOutputTokenSpace?.toString() ?? "",
    supportsSystemMessage: model.supportsSystemMessage ?? "auto",
    supportsVision: model.supportsVision ?? model.modalities?.input?.includes("image") ?? false,
    supportsReasoning: model.reasoningCapabilities?.supportsReasoning ?? model.reasoning ?? false,
    canTurnOffReasoning: model.reasoningCapabilities?.canTurnOffReasoning ?? false,
    canIOReasoning: model.reasoningCapabilities?.canIOReasoning ?? false,
    reasoningDefault:
      model.reasoningCapabilities?.reasoningSlider?.default ??
      (typeof model.options?.reasoningEffort === "string" ? model.options.reasoningEffort : "medium"),
    reasoningEfforts: model.reasoningCapabilities?.reasoningSlider?.values.join(", ") ?? "low, medium, high",
    supportsTemperature: model.temperature ?? false,
    supportsToolCalls: model.tool_call ?? true,
  }
}
export const headerRow = (): HeaderRow => ({ row: nextRow(), key: "", value: "", err: {} })
