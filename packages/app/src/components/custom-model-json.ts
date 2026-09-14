import { Result, Schema } from "effect"
import { ConfigProviderV1 } from "@opencode-ai/core/v1/config/provider"
import { applyEdits, format, parse, printParseErrorCode, type ParseError } from "jsonc-parser"

export type ModelConfig = NonNullable<ConfigProviderV1.Info["models"]>[string]
export type ModelIssue = { message: string; from: number; to: number }
const decode = Schema.decodeUnknownResult(ConfigProviderV1.Model, { onExcessProperty: "error", errors: "all" })
export const modelSchema = Schema.toJsonSchemaDocument(ConfigProviderV1.Model).schema

export function parseModelJSON(source: string): { model?: ModelConfig; issues: ModelIssue[] } {
  const errors: ParseError[] = []
  const value: unknown = parse(source, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length)
    return {
      issues: errors.map((error) => ({
        message: printParseErrorCode(error.error),
        from: error.offset,
        to: error.offset + error.length,
      })),
    }
  const decoded = decode(value)
  if (Result.isFailure(decoded)) return { issues: [{ message: decoded.failure.message, from: 0, to: source.length }] }
  if ((decoded.success.contextWindow ?? decoded.success.limit?.context) === 0)
    return {
      issues: [
        {
          message: "contextWindow > 0",
          from: Math.max(0, source.indexOf("contextWindow")),
          to: Math.min(source.length, Math.max(0, source.indexOf("contextWindow")) + 13),
        },
      ],
    }
  return { model: decoded.success, issues: [] }
}

export function formatModelJSON(source: string) {
  return applyEdits(source, format(source, undefined, { insertSpaces: true, tabSize: 2, eol: "\n" }))
}

export function modelTemplate(endpoint: "chat" | "responses", comment: string) {
  return (
    `// ${comment}\n` +
    JSON.stringify(
      {
        name: "",
        provider: { endpoint, npm: endpoint === "responses" ? "@ai-sdk/github-copilot" : "@ai-sdk/openai-compatible" },
        contextWindow: 0,
        temperature: false,
        tool_call: true,
        supportsSystemMessage: "auto",
        supportsVision: false,
        ...(endpoint === "responses"
          ? {
              reasoningCapabilities: {
                supportsReasoning: true,
                canTurnOffReasoning: false,
                canIOReasoning: true,
                reasoningSlider: { type: "effort_slider", values: ["low", "medium", "high"], default: "medium" },
              },
            }
          : {}),
      },
      null,
      2,
    )
  )
}

export function modelPreview(id: string, model: ModelConfig, provider?: ConfigProviderV1.Info) {
  return {
    model: { ...model, id: model.id ?? id, headers: undefined, options: undefined },
    connection: {
      baseURL: provider?.options?.baseURL || model.provider?.api || provider?.api,
      npm: model.provider?.npm ?? provider?.npm ?? "@ai-sdk/openai-compatible",
      endpoint: model.provider?.endpoint,
    },
    // Header values and credentials are intentionally absent from the preview.
    headerNames: [...new Set([...Object.keys(provider?.options?.headers ?? {}), ...Object.keys(model.headers ?? {})])],
    limits: {
      context: model.contextWindow || model.limit?.context || 0,
      input: model.maxInputTokens ?? model.limit?.input,
      output: model.maxOutputTokens ?? Math.min(model.limit?.output || 32000, 32000),
      reserved: model.reservedOutputTokenSpace,
    },
    reasoning: model.reasoningCapabilities ?? { supportsReasoning: model.reasoning ?? false },
    sources: {
      npm: model.provider?.npm ? "model" : provider?.npm ? "provider" : "default",
      baseURL: provider?.options?.baseURL ? "provider.options" : model.provider?.api ? "model.provider" : "provider",
    },
  }
}
