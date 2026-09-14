import { OpenAIResponsesLanguageModel } from "@opencode-ai/core/github-copilot/responses/openai-responses-language-model"
import { convertToOpenAIResponsesInput } from "@opencode-ai/core/github-copilot/responses/convert-to-openai-responses-input"
import { describe, test, expect, mock } from "bun:test"
import type { LanguageModelV3Prompt } from "@ai-sdk/provider"

const TEST_PROMPT: LanguageModelV3Prompt = [{ role: "user", content: [{ type: "text", text: "Hello" }] }]

async function convertReadableStreamToArray<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader()
  const result: T[] = []
  while (true) {
    const item = await reader.read()
    if (item.done) return result
    result.push(item.value)
  }
}

function createMockFetch(body: unknown) {
  return mock(
    async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
  )
}

function createModel(fetchFn: ReturnType<typeof mock>) {
  return new OpenAIResponsesLanguageModel("test-model", {
    provider: "copilot",
    url: () => "https://api.test.com/responses",
    headers: () => ({ Authorization: "Bearer test-token" }),
    fetch: fetchFn as any,
  })
}

// GitHub Copilot's Responses model echoes item metadata (itemId, reasoningEncryptedContent,
// responseId, ...) under the "copilot" providerOptions/providerMetadata namespace, matching the
// namespace request options already use. It used to echo this metadata under "openai" (a leftover
// from forking the OpenAI Responses model), which left it unreachable by anything reading the
// "copilot" namespace and let stale itemIds slip past stripping meant for that namespace.
describe("doGenerate", () => {
  test("attaches item metadata under the copilot namespace, not openai", async () => {
    const mockFetch = createMockFetch({
      id: "resp_1",
      created_at: 0,
      model: "gpt-5.5",
      output: [
        {
          type: "reasoning",
          id: "rs_1",
          encrypted_content: "enc_1",
          summary: [{ type: "summary_text", text: "thinking..." }],
        },
        {
          type: "message",
          role: "assistant",
          id: "msg_1",
          content: [{ type: "output_text", text: "Hello there", annotations: [] }],
        },
        {
          type: "function_call",
          call_id: "call_1",
          name: "bash",
          arguments: "{}",
          id: "fc_1",
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    const model = createModel(mockFetch)

    const { content, providerMetadata } = await model.doGenerate({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    } as any)

    const reasoning = content.find((part: any) => part.type === "reasoning") as any
    expect(reasoning.providerMetadata?.copilot?.itemId).toBe("rs_1")
    expect(reasoning.providerMetadata?.copilot?.reasoningEncryptedContent).toBe("enc_1")
    expect(reasoning.providerMetadata?.openai).toBeUndefined()

    const text = content.find((part: any) => part.type === "text") as any
    expect(text.providerMetadata?.copilot?.itemId).toBe("msg_1")
    expect(text.providerMetadata?.openai).toBeUndefined()

    const toolCall = content.find((part: any) => part.type === "tool-call") as any
    expect(toolCall.providerMetadata?.copilot?.itemId).toBe("fc_1")
    expect(toolCall.providerMetadata?.openai).toBeUndefined()

    expect(providerMetadata?.copilot?.responseId).toBe("resp_1")
    expect(providerMetadata?.openai).toBeUndefined()
  })

  test("allows compatible providers to omit usage", async () => {
    const model = createModel(
      createMockFetch({
        id: "resp_1",
        created_at: 0,
        model: "gpt-5.6-sol",
        output: [{ type: "message", role: "assistant", id: "msg_1", content: [] }],
      }),
    )

    const result = await model.doGenerate({ prompt: TEST_PROMPT, includeRawChunks: false } as any)

    expect(result.usage.inputTokens.total).toBeUndefined()
    expect(result.usage.outputTokens.total).toBeUndefined()
    expect(result.usage.raw).toBeUndefined()
  })
})

describe("doStream", () => {
  test("finishes when a compatible provider omits usage", async () => {
    const mockFetch = mock(async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"type":"response.completed","response":{"incomplete_details":null,"service_tier":null}}\n\n',
            ),
          )
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
          controller.close()
        },
      })
      return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } })
    })
    const model = createModel(mockFetch)

    const result = await model.doStream({ prompt: TEST_PROMPT, includeRawChunks: false } as any)
    const parts = await convertReadableStreamToArray(result.stream)
    const finish = parts.find((part) => part.type === "finish")

    expect(finish).toMatchObject({
      type: "finish",
      finishReason: { unified: "stop" },
      usage: {
        inputTokens: { total: undefined },
        outputTokens: { total: undefined },
      },
    })
  })
})

describe("convertToOpenAIResponsesInput", () => {
  test("replays encrypted reasoning without a stale item ID in stateless requests", async () => {
    const result = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: "assistant",
          content: [
            {
              type: "reasoning",
              text: "Summary",
              providerOptions: { copilot: { reasoningEncryptedContent: "encrypted" } },
            },
          ],
        },
      ],
      systemMessageMode: "developer",
      store: false,
    })
    expect(result.warnings).toEqual([])
    expect(result.input).toEqual([
      { type: "reasoning", encrypted_content: "encrypted", summary: [{ type: "summary_text", text: "Summary" }] },
    ])
  })
  test("echoes a stale tool-call itemId from the copilot namespace as the function_call id", async () => {
    const { input } = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "bash",
              input: { command: "ls" },
              providerOptions: { copilot: { itemId: "fc_999" } },
            },
          ],
        },
      ],
      systemMessageMode: "system",
      store: false,
    })

    expect(input).toEqual([
      {
        type: "function_call",
        call_id: "call_1",
        name: "bash",
        arguments: JSON.stringify({ command: "ls" }),
        id: "fc_999",
      },
    ])
  })

  test("omits the function_call id once the stale copilot itemId has been stripped", async () => {
    const { input } = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "bash",
              input: { command: "ls" },
              providerOptions: {},
            },
          ],
        },
      ],
      systemMessageMode: "system",
      store: false,
    })

    expect((input[0] as any).id).toBeUndefined()
  })

  test("preserves reasoning items keyed by the copilot namespace instead of dropping them", async () => {
    const { input, warnings } = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: "assistant",
          content: [
            {
              type: "reasoning",
              text: "thinking...",
              providerOptions: { copilot: { itemId: "rs_1", reasoningEncryptedContent: "enc_1" } },
            },
          ],
        },
      ],
      systemMessageMode: "system",
      store: false,
    })

    expect(warnings).toEqual([])
    expect(input).toEqual([
      {
        type: "reasoning",
        id: "rs_1",
        encrypted_content: "enc_1",
        summary: [{ type: "summary_text", text: "thinking..." }],
      },
    ])
  })

  test("drops reasoning items with no copilot itemId and warns, as before", async () => {
    const { input, warnings } = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: "assistant",
          content: [{ type: "reasoning", text: "thinking...", providerOptions: {} }],
        },
      ],
      systemMessageMode: "system",
      store: false,
    })

    expect(input).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      message: expect.stringContaining("Non-OpenAI reasoning parts are not supported"),
    })
  })

  test("reads imageDetail from the copilot namespace on user file parts", async () => {
    const { input } = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: "user",
          content: [
            {
              type: "file",
              mediaType: "image/png",
              data: "aGVsbG8=",
              providerOptions: { copilot: { imageDetail: "high" } },
            },
          ],
        },
      ],
      systemMessageMode: "system",
      store: false,
    })

    expect((input[0] as any).content[0].detail).toBe("high")
  })
})
