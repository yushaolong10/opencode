import { expect, test } from "bun:test"
import { EditorState } from "@codemirror/state"
import { CompletionContext } from "@codemirror/autocomplete"
import { complete } from "./model-json-editor"

test("completes root and nested capability fields from the configuration schema", () => {
  for (const [source, expected] of [
    ['{ "con', "contextWindow"],
    ['{ "reasoningCapabilities": { "sup', "supportsReasoning"],
    ['{ "reasoningCapabilities": { "reasoningSlider": { "def', "default"],
  ]) {
    const result = complete(new CompletionContext(EditorState.create({ doc: source }), source.length, true))
    expect(result?.options.some((option) => option.label === expected)).toBe(true)
  }
})

test("completes protocol values and inserts quoted properties into empty objects", () => {
  const source = '{ "provider": { "endpoint": "res'
  expect(
    complete(new CompletionContext(EditorState.create({ doc: source }), source.length, true))?.options.map(
      (x) => x.label,
    ),
  ).toContain("responses")
  const empty = complete(new CompletionContext(EditorState.create({ doc: "{ " }), 2, true))
  expect(empty?.options.find((x) => x.label === "name")?.apply).toBe('"name": ')
})
