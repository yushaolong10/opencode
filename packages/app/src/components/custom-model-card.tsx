import { createMemo, lazy, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { Select } from "@opencode-ai/ui/select"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useLanguage } from "@/context/language"
import { formatModelJSON, modelPreview, modelTemplate, parseModelJSON } from "./custom-model-json"
import { showToast } from "@/utils/toast"
import type { ConfigProviderV1 } from "@opencode-ai/core/v1/config/provider"
import type { ModelRow } from "./dialog-custom-provider-form"

const ModelJSONEditor = lazy(() => import("./model-json-editor"))

export function CustomModelCard(props: {
  model: ModelRow
  provider: ConfigProviderV1.Info
  busy: boolean
  canSave: boolean
  update: (patch: Partial<ModelRow>) => void
  copy: () => void
  remove: () => void
  save: () => void
}) {
  const language = useLanguage()
  let file: HTMLInputElement | undefined
  const [state, setState] = createStore({
    template: "responses" as "chat" | "responses",
    preview: false,
    expanded: !props.model.savedID,
    copied: false,
  })
  const parsed = createMemo(() => parseModelJSON(props.model.json ?? "{}"))
  const preview = createMemo(() => {
    const model = parsed().model
    return model ? JSON.stringify(modelPreview(props.model.id, model, props.provider), null, 2) : ""
  })
  const copyConfig = () => {
    void navigator.clipboard
      .writeText(props.model.json ?? "{}")
      .then(() => {
        setState("copied", true)
        setTimeout(() => setState("copied", false), 2000)
      })
      .catch((error: unknown) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: error instanceof Error ? error.message : String(error),
        }),
      )
  }
  return (
    <section class="flex flex-col gap-3 rounded-lg border border-border-weak-base p-3" data-row={props.model.row}>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setState("expanded", !state.expanded)}
          aria-expanded={state.expanded}
        >
          <bdi>{props.model.id || language.t("provider.custom.models.add")}</bdi>
        </Button>
        <Button type="button" variant="ghost" size="small" disabled={props.busy} onClick={props.copy}>
          {language.t("provider.custom.json.copy")}
        </Button>
        <Button type="button" variant="ghost" size="small" disabled={props.busy} onClick={props.remove}>
          {language.t("provider.custom.models.remove")}
        </Button>
      </div>
      <Show when={state.expanded}>
        <Show when={props.model.err.capabilities}>
          <p role="alert" class="text-12-regular text-text-danger-base">
            {props.model.err.capabilities}
          </p>
        </Show>
        <TextField
          label={language.t("provider.custom.models.id.label")}
          dir="ltr"
          value={props.model.id}
          disabled={!!props.model.savedID || props.busy}
          onChange={(id) => props.update({ id, err: {} })}
          validationState={props.model.err.id ? "invalid" : undefined}
          error={props.model.err.id}
        />
        <div class="flex flex-wrap items-center gap-2">
          <Select
            options={["responses", "chat"]}
            current={state.template}
            value={(value) => value}
            label={(value) =>
              value === "chat"
                ? language.t("provider.custom.field.endpoint.chat")
                : language.t("provider.custom.field.endpoint.responses")
            }
            onSelect={(value) => {
              if (value === "chat" || value === "responses") setState("template", value)
            }}
          />
          <Button
            type="button"
            size="small"
            variant="ghost"
            disabled={props.busy}
            onClick={() =>
              props.update({ json: modelTemplate(state.template, language.t("provider.custom.json.templateNote")) })
            }
          >
            {language.t("provider.custom.json.template")}
          </Button>
          <Button
            type="button"
            size="small"
            variant="ghost"
            disabled={props.busy}
            onClick={() => props.update({ json: formatModelJSON(props.model.json ?? "{}") })}
          >
            {language.t("provider.custom.json.format")}
          </Button>
          <Button type="button" size="small" variant="ghost" onClick={() => setState("preview", !state.preview)}>
            {language.t("provider.custom.json.preview")}
          </Button>
          <Show when={props.model.original}>
            <Button
              type="button"
              size="small"
              variant="ghost"
              disabled={props.busy}
              onClick={() => props.update({ json: JSON.stringify(props.model.original, null, 2), err: {} })}
            >
              {language.t("provider.custom.json.reset")}
            </Button>
          </Show>
          <Button type="button" size="small" variant="ghost" disabled={props.busy} onClick={() => file?.click()}>
            {language.t("provider.custom.json.import")}
          </Button>
          <Button
            type="button"
            size="small"
            variant="ghost"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([props.model.json ?? "{}"], { type: "application/json" }))
              const link = document.createElement("a")
              link.href = url
              link.download = `${props.model.id.replace(/[^a-zA-Z0-9._-]/g, "_") || "model"}.jsonc`
              link.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}
          >
            {language.t("provider.custom.json.export")}
          </Button>
          <input
            ref={file}
            type="file"
            accept=".json,.jsonc,application/json"
            class="hidden"
            aria-label={language.t("provider.custom.json.import")}
            onChange={(event) => {
              const selected = event.currentTarget.files?.[0]
              if (!selected) return
              void selected
                .text()
                .then((json) => props.update({ json }))
                .catch((error: unknown) =>
                  showToast({
                    title: language.t("common.requestFailed"),
                    description: error instanceof Error ? error.message : String(error),
                  }),
                )
              event.currentTarget.value = ""
            }}
          />
        </div>
        <p class="text-12-regular text-text-weak">{language.t("provider.custom.json.help")}</p>
        <div class="relative">
          <Suspense fallback={<span>{language.t("common.loading")}</span>}>
            <ModelJSONEditor
              value={props.model.json ?? "{}"}
              disabled={props.busy}
              label={language.t("provider.custom.json.label")}
              onChange={(json) => props.update({ json, err: {} })}
            />
          </Suspense>
          <Tooltip
            value={language.t(state.copied ? "ui.textField.copied" : "ui.textField.copyToClipboard")}
            placement="top"
            forceOpen={state.copied}
          >
            <IconButton
              type="button"
              icon={state.copied ? "check" : "copy"}
              size="small"
              variant="ghost"
              class="absolute right-2 top-2 z-10 bg-background-base"
              aria-label={language.t(state.copied ? "ui.textField.copied" : "ui.textField.copyToClipboard")}
              onClick={copyConfig}
            />
          </Tooltip>
        </div>
        <Show when={parsed().issues.length}>
          <pre role="status" dir="ltr" class="text-12-regular whitespace-pre-wrap text-text-danger-base">
            {parsed()
              .issues.map((issue) => issue.message)
              .join("\n")}
          </pre>
        </Show>
        <Show when={state.preview && parsed().model}>
          <p class="text-12-regular text-text-weak">{language.t("provider.custom.json.previewNote")}</p>
          <pre dir="ltr" class="text-12-regular overflow-auto max-h-64 rounded-md bg-background-base p-3">
            {preview()}
          </pre>
        </Show>
        <Show when={props.canSave}>
          <Button
            type="button"
            variant="primary"
            disabled={props.busy || !parsed().model || !props.model.id.trim()}
            onClick={props.save}
          >
            {language.t("provider.custom.json.save")}
          </Button>
        </Show>
      </Show>
    </section>
  )
}
