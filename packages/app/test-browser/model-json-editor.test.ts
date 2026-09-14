import { expect, test } from "bun:test"
import { createComponent, render } from "solid-js/web"
import { createStore } from "solid-js/store"
import { EditorView } from "@codemirror/view"
import ModelJSONEditor from "../src/components/model-json-editor"

for (const direction of ["ltr", "rtl"]) {
  test(`JSONC editor updates, preserves comments and stays LTR inside ${direction}`, () => {
    const host = document.createElement("div")
    host.dir = direction
    document.body.append(host)
    const [state, setState] = createStore({ value: '// 注释\n{"name":"مرحبا GPT-6"}', disabled: false })
    const dispose = render(
      () =>
        createComponent(ModelJSONEditor, {
          get value() {
            return state.value
          },
          get disabled() {
            return state.disabled
          },
          label: "Model JSONC",
          onChange: (value) => setState("value", value),
        }),
      host,
    )
    try {
      const content = host.querySelector<HTMLElement>(".cm-content")
      expect(content?.getAttribute("aria-label")).toBe("Model JSONC")
      expect(host.querySelector("[dir=ltr]")).not.toBeNull()
      if (!content) throw new Error("Editor did not mount")
      const editor = EditorView.findFromDOM(content)
      if (!editor) throw new Error("Missing EditorView")
      editor.dispatch({ changes: { from: editor.state.doc.length, insert: "\n// kept" } })
      expect(state.value).toContain("// kept")
      setState("value", '{"name":"Changed"}')
      expect(editor.state.doc.toString()).toBe('{"name":"Changed"}')
      setState("disabled", true)
      expect(editor.state.readOnly).toBe(true)
    } finally {
      dispose()
      expect(host.querySelector(".cm-editor")).toBeNull()
      host.remove()
    }
  })
}
