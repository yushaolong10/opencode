import { describe, expect, test } from "bun:test"
import { configuredModelRow, modelRow, validateCustomProvider, type FormState } from "./dialog-custom-provider-form"

const t = (key: string) => key

describe("validateCustomProvider", () => {
  test("builds trimmed config payload", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: " Custom Provider ",
        baseURL: "https://api.example.com ",
        apiKey: " {env: CUSTOM_PROVIDER_KEY} ",
        models: [
          {
            row: "m0",
            id: " model-a ",
            name: " Model A ",
            endpoint: "responses",
            contextWindow: "1050000",
            reservedOutputTokenSpace: "32768",
            supportsSystemMessage: "developer-role",
            specialToolFormat: "openai-style",
            supportsFIM: false,
            supportsVision: true,
            supportsReasoning: true,
            canTurnOffReasoning: true,
            canIOReasoning: false,
            reasoningDefault: "medium",
            reasoningEfforts: "none, low, medium, high, xhigh",
            supportsTemperature: false,
            err: {},
          },
        ],
        headers: [
          { row: "h0", key: " X-Test ", value: " enabled ", err: {} },
          { row: "h1", key: "", value: "", err: {} },
        ],
        err: {},
      },
      t,
      disabledProviders: [],
      existingProviderIDs: new Set(),
    })

    expect(JSON.parse(JSON.stringify(result.result))).toEqual({
      providerID: "custom-provider",
      name: "Custom Provider",
      config: {
        npm: "@ai-sdk/openai-compatible",
        name: "Custom Provider",
        env: ["CUSTOM_PROVIDER_KEY"],
        options: {
          baseURL: "https://api.example.com",
          headers: {
            "X-Test": "enabled",
          },
        },
        models: {
          "model-a": {
            contextWindow: 1050000,
            name: "Model A",
            reasoning: true,
            temperature: false,
            tool_call: true,
            reservedOutputTokenSpace: 32768,
            supportsSystemMessage: "developer-role",
            specialToolFormat: "openai-style",
            supportsFIM: false,
            supportsVision: true,
            reasoningCapabilities: {
              supportsReasoning: true,
              canTurnOffReasoning: true,
              canIOReasoning: false,
              reasoningSlider: {
                type: "effort_slider",
                values: ["none", "low", "medium", "high", "xhigh"],
                default: "medium",
              },
            },
            provider: { npm: "@ai-sdk/github-copilot", endpoint: "responses" },
          },
        },
      },
    })
  })

  test("flags duplicate rows and allows reconnecting disabled providers", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "https://api.example.com",
        apiKey: "secret",
        models: [
          { row: "m0", id: "model-a", name: "Model A", endpoint: "chat", err: {} },
          { row: "m1", id: "model-a", name: "Model A 2", endpoint: "responses", err: {} },
        ],
        headers: [
          { row: "h0", key: "Authorization", value: "one", err: {} },
          { row: "h1", key: "authorization", value: "two", err: {} },
        ],
        err: {},
      },
      t,
      disabledProviders: ["custom-provider"],
      existingProviderIDs: new Set(["custom-provider"]),
    })

    expect(result.result).toBeUndefined()
    expect(result.err.providerID).toBeUndefined()
    expect(result.models[1]).toMatchObject({
      id: "provider.custom.error.duplicate",
      name: undefined,
    })
    expect(result.headers[1]).toEqual({
      key: "provider.custom.error.duplicate",
      value: undefined,
    })
  })

  test("keeps endpoint choices independent per model", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "https://api.example.com",
        apiKey: "",
        models: [
          { row: "m0", id: "chat-model", name: "Chat", contextWindow: "128000", endpoint: "chat", err: {} },
          {
            row: "m1",
            id: "reasoning-model",
            name: "Reasoning",
            contextWindow: "128000",
            endpoint: "responses",
            err: {},
          },
        ],
        headers: [{ row: "h0", key: "", value: "", err: {} }],
        err: {},
      },
      t,
      disabledProviders: [],
      existingProviderIDs: new Set(),
    })

    expect(JSON.parse(JSON.stringify(result.result?.config.models))).toEqual({
      "chat-model": {
        name: "Chat",
        contextWindow: 128000,
        tool_call: true,
        provider: { npm: "@ai-sdk/openai-compatible", endpoint: "chat" },
      },
      "reasoning-model": {
        name: "Reasoning",
        contextWindow: 128000,
        tool_call: true,
        provider: { npm: "@ai-sdk/github-copilot", endpoint: "responses" },
      },
    })
  })

  test("does not expose reasoning variants for a non-reasoning model", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "https://api.example.com",
        apiKey: "",
        models: [{ ...modelRow(), id: "chat-model", name: "Chat", contextWindow: "128000" }],
        headers: [{ row: "h0", key: "", value: "", err: {} }],
        err: {},
      },
      t,
      disabledProviders: [],
      existingProviderIDs: new Set(),
    })

    expect(result.result).toBeDefined()
    expect(result.result?.config.models["chat-model"].variants).toBeUndefined()
  })
})

const form = (): FormState => ({
  providerID: "custom",
  name: "Custom",
  baseURL: "https://example.com/v1",
  apiKey: "",
  models: [{ ...modelRow(), id: "gpt-6", name: "GPT-6", contextWindow: "200000" }],
  headers: [],
  err: {},
})
const validate = (value: FormState) =>
  validateCustomProvider({ form: value, t, disabledProviders: [], existingProviderIDs: new Set() })

test("empty optional limits remain absent and a new model requires a context window", () => {
  const input = form()
  const model = validate(input).result?.config.models["gpt-6"]
  expect(model?.maxOutputTokens).toBeUndefined()
  expect(model?.reservedOutputTokenSpace).toBeUndefined()
  input.models[0].contextWindow = " "
  expect(validate(input).result).toBeUndefined()
  expect(validate(input).models[0].capabilities).toBeDefined()
})

test.each(["-1", "0", "1.5", "NaN", "Infinity", "9007199254740992", "200001"])(
  "rejects invalid output limit %s",
  (value) => {
    const input = form()
    input.models[0].maxOutputTokens = value
    expect(validate(input).result).toBeUndefined()
  },
)

test("reasoning defaults must belong to the allowed efforts", () => {
  const input = form()
  Object.assign(input.models[0], {
    supportsReasoning: true,
    reasoningEfforts: "none, high, xhigh",
    reasoningDefault: "none",
  })
  expect(validate(input).result).toBeUndefined()
  input.models[0].reasoningDefault = "high"
  expect(validate(input).result?.config.models["gpt-6"].reasoningCapabilities?.reasoningSlider?.values).toEqual([
    "high",
    "xhigh",
  ])
  input.models[0].canTurnOffReasoning = true
  input.models[0].reasoningDefault = "none"
  expect(validate(input).result).toBeDefined()
})

test("legacy output space is migrated to an explicit output limit when editing", () => {
  const row = configuredModelRow("gpt-6", { contextWindow: 200000, reservedOutputTokenSpace: 32768 })
  expect(row.maxOutputTokens).toBe("32768")
  expect(row.reservedOutputTokenSpace).toBe("32768")
  const input = form()
  input.models = [row]
  expect(validate(input).result?.config.models["gpt-6"].maxOutputTokens).toBe(32768)
})

test("editing preserves hidden provider and model settings while removing deleted models and headers", () => {
  const initial = {
    npm: "@ai-sdk/openai",
    env: ["PRIMARY", "SECONDARY"],
    whitelist: ["gpt-6"],
    options: { timeout: 90000, headers: { "X-Remove": "yes" } },
    models: {
      "gpt-6": {
        id: "gateway-alias",
        limit: { context: 200000, input: 150000, output: 50000 },
        options: { textVerbosity: "low", reasoningEffort: "high" },
        variants: { fast: { reasoningEffort: "high", serviceTier: "priority" } },
        cost: { input: 1, output: 2 },
        headers: { "X-Model": "yes" },
      },
      removed: { name: "Removed" },
    },
  }
  const input = form()
  input.models = [configuredModelRow("gpt-6", initial.models["gpt-6"], initial.npm)]
  input.models[0].name = "Renamed"
  const saved = validateCustomProvider({
    form: input,
    initial,
    t,
    disabledProviders: [],
    existingProviderIDs: new Set(),
  }).result?.config
  expect(saved?.env).toEqual(initial.env)
  expect(saved?.options.timeout).toBe(90000)
  expect(saved?.options.headers).toEqual({})
  expect(Object.keys(saved?.models ?? {})).toEqual(["gpt-6"])
  expect(saved?.models["gpt-6"]).toMatchObject({
    id: "gateway-alias",
    name: "Renamed",
    maxInputTokens: 150000,
    maxOutputTokens: 50000,
    options: initial.models["gpt-6"].options,
    variants: initial.models["gpt-6"].variants,
    cost: initial.models["gpt-6"].cost,
    headers: initial.models["gpt-6"].headers,
    provider: { npm: "@ai-sdk/openai", endpoint: "responses" },
  })
})
