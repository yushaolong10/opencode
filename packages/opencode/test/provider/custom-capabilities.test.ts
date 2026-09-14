import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { ConfigProviderV1 } from "@opencode-ai/core/v1/config/provider"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { Env } from "@/env"
import { Plugin } from "@/plugin"
import { usable } from "@/session/overflow"
import { testEffect } from "../lib/effect"
import { modelRow, validateCustomProvider } from "../../../app/src/components/dialog-custom-provider-form"
import { createOpenaiCompatible } from "@opencode-ai/core/github-copilot/copilot-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import { generateText, type ModelMessage } from "ai"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"

const form = validateCustomProvider({
  form: {
    providerID: "custom",
    name: "Custom",
    baseURL: "https://example.invalid/v1",
    apiKey: "",
    headers: [],
    err: {},
    models: [
      {
        ...modelRow(),
        id: "gpt-6",
        name: "GPT-6",
        endpoint: "responses",
        contextWindow: "200000",
        maxInputTokens: "160000",
        maxOutputTokens: "64000",
        reservedOutputTokenSpace: "80000",
        supportsReasoning: true,
        canIOReasoning: true,
        reasoningDefault: "high",
        reasoningEfforts: "none, high, xhigh",
        supportsVision: true,
        supportsSystemMessage: "developer",
      },
    ],
  },
  t: (key) => key,
  disabledProviders: [],
  existingProviderIDs: new Set(),
}).result
if (!form) throw new Error("Invalid custom provider test fixture")
const capabilities = form.config.models["gpt-6"].reasoningCapabilities

const it = testEffect(LayerNode.compile(LayerNode.group([Provider.node, Env.node, Plugin.node])))

it.instance(
  "custom form capabilities survive config loading and control request defaults",
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    const model = yield* provider.getModel(ProviderV2.ID.make("custom"), ModelV2.ID.make("gpt-6"))
    expect(model.limit).toEqual({ context: 200000, input: 160000, output: 64000 })
    expect(model.capabilities.input.image).toBe(true)
    expect(Object.keys(model.variants ?? {})).toEqual(["high", "xhigh"])
    expect(model.options.reasoningEffort).toBe("high")
    expect(ProviderTransform.maxOutputTokens(model)).toBe(64000)
    expect(ProviderTransform.maxOutputTokens(model, 32000)).toBe(32000)
    expect(usable({ cfg: {}, model })).toBe(120000)
    const options = ProviderTransform.providerOptions(model, {
      ...ProviderTransform.options({ model, sessionID: "test" }),
      ...model.options,
    })
    expect(options.copilot).toMatchObject({
      reasoningEffort: "high",
      forceReasoning: true,
      systemMessageMode: "developer",
    })
    expect(options.copilot.reasoningCapabilities).toBeUndefined()
    expect(options.copilot.reservedOutputTokenSpace).toBeUndefined()
  }),
  { config: { provider: { custom: { ...form.config, options: { ...form.config.options, apiKey: "test" } } } } },
)

function model(id = "gpt-6", npm = "@ai-sdk/github-copilot"): Provider.Model {
  return {
    id: ModelV2.ID.make(id),
    providerID: ProviderV2.ID.make("custom"),
    name: id,
    api: {
      id,
      npm,
      url: "https://example.invalid/v1",
      endpoint: npm === "@ai-sdk/openai-compatible" ? "chat" : "responses",
    },
    capabilities: {
      reasoning: true,
      temperature: false,
      toolcall: true,
      attachment: true,
      input: { text: true, image: true, audio: false, pdf: false, video: false },
      output: { text: true, image: false, audio: false, pdf: false, video: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 200000, output: 64000 },
    status: "active",
    headers: {},
    family: "",
    release_date: "",
    options: { reasoningCapabilities: capabilities, supportsSystemMessage: "developer" },
  }
}

async function request(item: Provider.Model, overrides: Record<string, unknown> = {}, history: ModelMessage[] = []) {
  const captured: Record<string, unknown>[] = []
  const settings = {
    name: "custom",
    baseURL: "https://example.invalid/v1",
    apiKey: "test",
    fetch: Object.assign(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        captured.push(JSON.parse(String(init?.body)))
        return Response.json(
          item.api.endpoint === "chat"
            ? {
                choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
              }
            : {
                id: "resp_test",
                created_at: 0,
                model: item.api.id,
                output: [],
                usage: { input_tokens: 1, output_tokens: 1 },
              },
        )
      },
      { preconnect: () => {} },
    ),
  }
  const language: LanguageModelV3 =
    item.api.npm === "@ai-sdk/openai-compatible"
      ? createOpenAICompatible(settings).chatModel(item.api.id)
      : item.api.npm === "@ai-sdk/openai"
        ? createOpenAI(settings).responses(item.api.id)
        : createOpenaiCompatible(settings).responses(item.api.id)
  const options = { ...ProviderTransform.options({ model: item, sessionID: "test" }), ...item.options, ...overrides }
  await generateText({
    model: language,
    messages: ProviderTransform.message(
      [{ role: "system", content: "Instructions" }, ...history, { role: "user", content: "Hello" }],
      item,
      options,
    ),
    providerOptions: ProviderTransform.providerOptions(item, options),
    maxOutputTokens: ProviderTransform.maxOutputTokens(item),
    temperature: 0.5,
  })
  return captured[0]
}

describe("custom Responses wire requests", () => {
  test("API schema rejects invalid capabilities and token budgets", () => {
    const valid = Schema.is(ConfigProviderV1.Model)
    expect(valid({ contextWindow: 100, maxOutputTokens: 101 })).toBe(false)
    expect(valid({ maxOutputTokens: -1 })).toBe(false)
    expect(valid({ reservedOutputTokenSpace: 1.5 })).toBe(false)
    expect(
      valid({
        reasoningCapabilities: {
          supportsReasoning: true,
          canTurnOffReasoning: false,
          canIOReasoning: false,
          reasoningSlider: { type: "effort_slider", values: ["high"], default: "low" },
        },
      }),
    ).toBe(false)
  })
  test.each(["gpt-5.6", "gpt-6", "gateway-alias"])("explicit reasoning works for %s", async (id) => {
    const body = await request(model(id))
    expect(body.reasoning).toEqual({ effort: "high", summary: "auto" })
    expect(body.input).toMatchObject([{ role: "developer" }, { role: "user" }])
    expect(body.include).toContain("reasoning.encrypted_content")
    expect(body.temperature).toBeUndefined()
  })
  test("explicit non-reasoning overrides a known reasoning model", async () => {
    const item = model("gpt-5.6")
    item.capabilities.reasoning = false
    item.options.reasoningCapabilities = { supportsReasoning: false, canTurnOffReasoning: false, canIOReasoning: false }
    const body = await request(item, { reasoningEffort: "high" })
    expect(body.reasoning).toBeUndefined()
  })
  test("variants override defaults but disallowed none falls back", async () => {
    expect((await request(model(), { reasoningEffort: "xhigh" })).reasoning).toMatchObject({ effort: "xhigh" })
    expect((await request(model(), { reasoningEffort: "none" })).reasoning).toMatchObject({ effort: "high" })
  })
  test("reasoning IO and system roles are explicit", async () => {
    const item = model()
    item.options.reasoningCapabilities = {
      supportsReasoning: true,
      canTurnOffReasoning: true,
      canIOReasoning: false,
      reasoningSlider: { type: "effort_slider", values: ["none", "high"], default: "none" },
    }
    item.options.supportsSystemMessage = "system"
    item.capabilities.temperature = true
    const body = await request(item)
    expect(body.reasoning).toEqual({ effort: "none" })
    expect(body.input).toMatchObject([{ role: "system" }, { role: "user" }])
    expect(body.include).toBeUndefined()
    expect(body.temperature).toBe(0.5)
    item.options.supportsSystemMessage = "remove"
    expect((await request(item)).input).toMatchObject([{ role: "user" }])
  })
  test("native OpenAI SDK also receives explicit capabilities", async () => {
    const body = await request(model("gateway-alias", "@ai-sdk/openai"))
    expect(body.reasoning).toMatchObject({ effort: "high", summary: "auto" })
    expect(body.input).toMatchObject([{ role: "developer" }, { role: "user" }])
  })
  test("chat requests never leak local capability fields", async () => {
    const body = await request(model("gpt-6", "@ai-sdk/openai-compatible"))
    expect(body.reasoning_effort).toBe("high")
    expect(body.reasoningCapabilities).toBeUndefined()
    expect(body.supportsSystemMessage).toBeUndefined()
    expect(body.forceReasoning).toBeUndefined()
    expect(body.messages).toMatchObject([{ role: "developer" }, { role: "user" }])
  })
  test("reasoning IO controls replay of reasoning text on Chat", async () => {
    const item = model("gateway", "@ai-sdk/openai-compatible")
    const history: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Reasoning" },
          { type: "text", text: "Answer" },
        ],
      },
    ]
    expect((await request(item, {}, history)).messages).toMatchObject([{}, { reasoning_content: "Reasoning" }, {}])
    item.options.reasoningCapabilities = { supportsReasoning: true, canTurnOffReasoning: false, canIOReasoning: false }
    const body = await request(item, {}, history)
    expect(body.messages).toEqual([
      { role: "developer", content: "Instructions" },
      { role: "assistant", content: "Answer" },
      { role: "user", content: "Hello" },
    ])
  })
  test("encrypted Responses reasoning survives stateless multi-turn replay", async () => {
    const body = await request(model(), {}, [
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "Summary",
            providerOptions: { copilot: { itemId: "rs_old", reasoningEncryptedContent: "encrypted" } },
          },
          { type: "text", text: "Answer" },
        ],
      },
    ])
    expect(body.input).toMatchObject([
      {},
      { type: "reasoning", encrypted_content: "encrypted", summary: [{ type: "summary_text", text: "Summary" }] },
      {},
      {},
    ])
    expect(JSON.stringify(body.input)).not.toContain("rs_old")
  })
  test("reservation changes the compaction threshold without capping the response", () => {
    const item = model()
    item.options.maxOutputTokens = 64000
    item.options.reservedOutputTokenSpace = 80000
    expect(usable({ cfg: {}, model: item })).toBe(120000)
    expect(ProviderTransform.maxOutputTokens(item)).toBe(64000)
    item.options.reservedOutputTokenSpace = 10000
    expect(usable({ cfg: {}, model: item })).toBe(136000)
    expect(ProviderTransform.maxOutputTokens(item)).toBe(64000)
    delete item.options.reservedOutputTokenSpace
    item.limit.input = 190000
    expect(usable({ cfg: {}, model: item })).toBe(136000)
  })
})
