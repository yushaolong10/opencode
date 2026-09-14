import { createEffect, onCleanup, onMount } from "solid-js"
import { Compartment, EditorState } from "@codemirror/state"
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { json } from "@codemirror/lang-json"
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
} from "@codemirror/autocomplete"
import { linter, lintGutter, setDiagnostics } from "@codemirror/lint"
import { getLocation } from "jsonc-parser"
import { modelSchema, parseModelJSON } from "./custom-model-json"

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function unwrap(value: unknown): Record<string, unknown> | undefined {
  if (!record(value)) return
  if (Array.isArray(value.anyOf)) return value.anyOf.map(unwrap).find((item) => item && item.type !== "null")
  return value
}

export function complete(context: CompletionContext) {
  const location = getLocation(context.state.doc.toString(), context.pos)
  const word = context.matchBefore(/[\w_-]*/)
  if (!word || (!context.explicit && word.from === word.to)) return null
  const schema = location.path.slice(0, -1).reduce<unknown>((schema, part) => {
    const node = unwrap(schema)
    if (!node) return undefined
    if (typeof part === "number") return unwrap(node.items)
    return record(node.properties) ? unwrap(node.properties[part]) : undefined
  }, modelSchema)
  if (!record(schema)) return null
  const properties = record(schema.properties) ? schema.properties : {}
  if (location.isAtPropertyKey)
    return {
      from: word.from,
      options: Object.entries(properties).map(([label, value]) => ({
        label,
        type: "property",
        detail: typeof unwrap(value)?.type === "string" ? String(unwrap(value)?.type) : undefined,
        apply: context.state.sliceDoc(word.from - 1, word.from) === '"' ? label : `"${label}": `,
      })),
    }
  const value = unwrap(properties[String(location.path.at(-1))])
  const values =
    record(value) && Array.isArray(value.enum)
      ? value.enum
      : record(value) && value.type === "boolean"
        ? [true, false]
        : []
  return {
    from: word.from,
    options: values.map((value: unknown) => ({
      label: String(value),
      type: "constant",
      apply:
        typeof value === "string" && context.state.sliceDoc(word.from - 1, word.from) !== '"'
          ? JSON.stringify(value)
          : String(value),
    })),
  }
}

export default function ModelJSONEditor(props: {
  value: string
  label: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const host = document.createElement("div")
  host.dir = "ltr"
  host.className = "overflow-hidden rounded-md border border-border-weak-base"
  let view: EditorView | undefined
  const editable = new Compartment()
  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: props.value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          closeBrackets(),
          json(),
          syntaxHighlighting(defaultHighlightStyle),
          autocompletion({ override: [complete] }),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
          lintGutter(),
          linter((view) =>
            parseModelJSON(view.state.doc.toString()).issues.map((issue) => ({ ...issue, severity: "error" as const })),
          ),
          EditorView.contentAttributes.of({ "aria-label": props.label, "aria-multiline": "true", spellcheck: "false" }),
          editable.of(EditorState.readOnly.of(props.disabled ?? false)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) props.onChange(update.state.doc.toString())
          }),
          EditorView.theme({
            "&": { height: "360px", fontSize: "13px", background: "var(--background-base)", color: "var(--text-base)" },
            ".cm-scroller": { fontFamily: "var(--font-family-mono, monospace)", overflow: "auto" },
            ".cm-content": { padding: "12px 0" },
            ".cm-gutters": { background: "transparent", color: "var(--text-weak)", border: "none" },
            ".cm-tooltip": { background: "var(--background-raised-base)", color: "var(--text-base)" },
            ".cm-cursor": { borderLeftColor: "var(--text-strong)" },
            ".cm-activeLine": { background: "var(--surface-base-hover)" },
          }),
        ],
      }),
    })
    view.dispatch(
      setDiagnostics(
        view.state,
        parseModelJSON(props.value).issues.map((issue) => ({ ...issue, severity: "error" as const })),
      ),
    )
  })
  createEffect(() => {
    const value = props.value
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  })
  createEffect(() => {
    const disabled = props.disabled ?? false
    view?.dispatch({ effects: editable.reconfigure(EditorState.readOnly.of(disabled)) })
  })
  onCleanup(() => view?.destroy())
  return host
}
