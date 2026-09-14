export * as ConfigProviderV1 from "./provider"

import { Schema } from "effect"
import { PositiveInt } from "../../schema"

export const ModelStatus = Schema.Literals(["alpha", "beta", "deprecated", "active"])

const InterleavedField = Schema.Union([
  Schema.Literals(["reasoning", "reasoning_content", "reasoning_text"]),
  Schema.String,
])

export const ReasoningCapabilities = Schema.Struct({
  supportsReasoning: Schema.Boolean,
  canTurnOffReasoning: Schema.Boolean,
  canIOReasoning: Schema.Boolean,
  reasoningSlider: Schema.optional(
    Schema.Struct({
      type: Schema.Literal("effort_slider"),
      values: Schema.mutable(Schema.Array(Schema.String)),
      default: Schema.String,
    }),
  ),
}).check(
  Schema.makeFilter(
    (value) =>
      !value.supportsReasoning ||
      !value.reasoningSlider ||
      (value.reasoningSlider.values.length > 0 &&
        value.reasoningSlider.values.every((effort) => effort.trim().length > 0) &&
        value.reasoningSlider.values.includes(value.reasoningSlider.default) &&
        (value.canTurnOffReasoning || value.reasoningSlider.default !== "none")) ||
      "The default reasoning effort must be supported and cannot disable reasoning unless allowed",
  ),
)

export const Model = Schema.Struct({
  id: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  family: Schema.optional(Schema.String),
  release_date: Schema.optional(Schema.String),
  attachment: Schema.optional(Schema.Boolean),
  reasoning: Schema.optional(Schema.Boolean),
  temperature: Schema.optional(Schema.Boolean),
  tool_call: Schema.optional(Schema.Boolean),
  contextWindow: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  maxInputTokens: Schema.optional(PositiveInt),
  maxOutputTokens: Schema.optional(PositiveInt),
  reservedOutputTokenSpace: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  supportsSystemMessage: Schema.optional(Schema.String),
  specialToolFormat: Schema.optional(Schema.String),
  supportsFIM: Schema.optional(Schema.Boolean),
  supportsVision: Schema.optional(Schema.Boolean),
  reasoningCapabilities: Schema.optional(ReasoningCapabilities),
  interleaved: Schema.optional(
    Schema.Union([
      Schema.Boolean,
      InterleavedField,
      Schema.Struct({
        field: InterleavedField,
      }),
    ]),
  ),
  cost: Schema.optional(
    Schema.Struct({
      input: Schema.Finite,
      output: Schema.Finite,
      cache_read: Schema.optional(Schema.Finite),
      cache_write: Schema.optional(Schema.Finite),
      context_over_200k: Schema.optional(
        Schema.Struct({
          input: Schema.Finite,
          output: Schema.Finite,
          cache_read: Schema.optional(Schema.Finite),
          cache_write: Schema.optional(Schema.Finite),
        }),
      ),
    }),
  ),
  limit: Schema.optional(
    Schema.Struct({
      context: Schema.Finite,
      input: Schema.optional(Schema.Finite),
      output: Schema.Finite,
    }),
  ),
  modalities: Schema.optional(
    Schema.Struct({
      input: Schema.optional(Schema.mutable(Schema.Array(Schema.Literals(["text", "audio", "image", "video", "pdf"])))),
      output: Schema.optional(
        Schema.mutable(Schema.Array(Schema.Literals(["text", "audio", "image", "video", "pdf"]))),
      ),
    }),
  ),
  experimental: Schema.optional(Schema.Boolean),
  status: Schema.optional(ModelStatus),
  provider: Schema.optional(
    Schema.Struct({
      npm: Schema.optional(Schema.String),
      api: Schema.optional(Schema.String),
      endpoint: Schema.optional(Schema.Literals(["chat", "responses"])),
    }),
  ),
  options: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  variants: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.StructWithRest(
        Schema.Struct({
          disabled: Schema.optional(Schema.Boolean).annotate({ description: "Disable this variant for the model" }),
        }),
        [Schema.Record(Schema.String, Schema.Any)],
      ),
    ).annotate({ description: "Variant-specific configuration" }),
  ),
}).check(
  Schema.makeFilter((value) => {
    const context = value.contextWindow || value.limit?.context
    if (!context) return true
    if (value.maxInputTokens !== undefined && value.maxInputTokens > context)
      return "Input limit exceeds context window"
    if (value.maxOutputTokens !== undefined && value.maxOutputTokens >= context)
      return "Output limit must leave room for input"
    if (value.reservedOutputTokenSpace !== undefined && value.reservedOutputTokenSpace >= context)
      return "Reserved output space must leave room for input"
    return true
  }),
)

export const Info = Schema.Struct({
  api: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  env: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  id: Schema.optional(Schema.String),
  npm: Schema.optional(Schema.String),
  whitelist: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  blacklist: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  options: Schema.optional(
    Schema.StructWithRest(
      Schema.Struct({
        apiKey: Schema.optional(Schema.String),
        baseURL: Schema.optional(Schema.String),
        enterpriseUrl: Schema.optional(Schema.String).annotate({
          description: "GitHub Enterprise URL for copilot authentication",
        }),
        setCacheKey: Schema.optional(Schema.Boolean).annotate({
          description: "Enable promptCacheKey for this provider (default false)",
        }),
        timeout: Schema.optional(
          Schema.Union([PositiveInt, Schema.Literal(false)]).annotate({
            description: "Timeout in milliseconds for full requests to this provider. Set to false to disable timeout.",
          }),
        ).annotate({
          description: "Timeout in milliseconds for full requests to this provider. Set to false to disable timeout.",
        }),
        headerTimeout: Schema.optional(
          Schema.Union([PositiveInt, Schema.Literal(false)]).annotate({
            description:
              "Timeout in milliseconds to wait for response headers (default: 300000). Set to false to disable timeout.",
          }),
        ).annotate({
          description:
            "Timeout in milliseconds to wait for response headers (default: 300000). Set to false to disable timeout.",
        }),
        chunkTimeout: Schema.optional(
          Schema.Union([PositiveInt, Schema.Literal(false)]).annotate({
            description:
              "Timeout in milliseconds between streamed SSE chunks for this provider (default: 300000). If no chunk arrives within this window, the request is aborted. Set to false to disable timeout.",
          }),
        ).annotate({
          description:
            "Timeout in milliseconds between streamed SSE chunks for this provider (default: 300000). If no chunk arrives within this window, the request is aborted. Set to false to disable timeout.",
        }),
      }),
      [Schema.Record(Schema.String, Schema.Any)],
    ),
  ),
  models: Schema.optional(Schema.Record(Schema.String, Model)),
}).annotate({ identifier: "ProviderConfig" })
export type Info = Schema.Schema.Type<typeof Info>

export const Update = Schema.Struct({
  settings: Schema.optional(Schema.Struct({ ...Info.fields, models: Schema.optional(Schema.Never) })),
  models: Schema.optional(Schema.Record(Schema.String, Model)),
  remove: Schema.optional(Schema.Array(Schema.String)),
}).annotate({ identifier: "ProviderConfigUpdate" })
export type Update = Schema.Schema.Type<typeof Update>
