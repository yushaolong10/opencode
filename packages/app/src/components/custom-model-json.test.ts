import { expect, test } from "bun:test"
import { formatModelJSON, modelPreview, modelTemplate, parseModelJSON } from "./custom-model-json"
import { modelRow, validateCustomProvider } from "./dialog-custom-provider-form"

test("JSONC accepts comments and trailing commas and preserves provider-specific options", () => {
  const source = '// comment\n{"contextWindow":200000,"options":{"custom":true},}'
  expect(parseModelJSON(source).model).toMatchObject({ contextWindow: 200000, options: { custom: true } })
  const formatted = formatModelJSON(source)
  expect(formatted).toContain("// comment")
  expect(parseModelJSON(formatted)).toEqual(parseModelJSON(source))
})

test("invalid syntax and unknown fields cannot be silently saved", () => {
  expect(parseModelJSON('{"name": }').issues[0].from).toBeGreaterThan(0)
  expect(parseModelJSON('{"contextWidnow": 1000}').model).toBeUndefined()
  expect(parseModelJSON('{"maxOutputTokens": -1}').model).toBeUndefined()
  expect(parseModelJSON("[]").model).toBeUndefined()
})

test("templates require provider limits rather than inventing model capabilities", () => {
  for (const endpoint of ["chat", "responses"] as const) {
    const source = modelTemplate(endpoint, "Set limits")
    expect(parseModelJSON(source).model).toBeUndefined()
    expect(
      parseModelJSON(source.replace('"contextWindow": 0', '"contextWindow": 200000')).model?.provider?.endpoint,
    ).toBe(endpoint)
  }
})

test("JSON model payload is independent of legacy form fields", () => {
  const output = validateCustomProvider({
    form: {
      providerID: "custom",
      name: "Custom",
      baseURL: "https://example.com",
      apiKey: "",
      headers: [],
      err: {},
      models: [
        {
          ...modelRow(),
          id: "gpt-6",
          json: '{"name":"GPT-6","limit":{"context":200000,"output":64000},"options":{"textVerbosity":"low"}}',
        },
      ],
    },
    t: (key) => key,
    existingProviderIDs: new Set(),
    disabledProviders: [],
  })
  expect(output.result?.config.models["gpt-6"]).toEqual({
    name: "GPT-6",
    limit: { context: 200000, output: 64000 },
    options: { textVerbosity: "low" },
  })
})

test("preview shows connection inheritance without credentials", () => {
  const preview = modelPreview(
    "alias",
    { provider: { api: "https://model.invalid", npm: "custom" }, headers: { Authorization: "secret" } },
    {
      options: { apiKey: "secret", baseURL: "https://provider.invalid", headers: { Token: "secret" } },
    },
  )
  expect(preview.connection.baseURL).toBe("https://provider.invalid")
  expect(preview.sources.baseURL).toBe("provider.options")
  expect(JSON.stringify(preview)).not.toContain("secret")
})
