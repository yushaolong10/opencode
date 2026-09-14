import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { useMutation } from "@tanstack/solid-query"
import { TextField } from "@opencode-ai/ui/text-field"
import { CustomModelCard } from "./custom-model-card"
import { modelTemplate, parseModelJSON } from "./custom-model-json"
import { Persist, persisted } from "@/utils/persist"
import { showToast } from "@/utils/toast"
import { batch, createEffect, createSignal, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { ExternalLink } from "@/components/external-link"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import {
  type FormState,
  configuredModelRow,
  headerRow,
  modelRow,
  validateCustomProvider,
} from "./dialog-custom-provider-form"

type Props = {
  onBack: () => void
  providerID?: string
}

export function DialogCustomProvider(props: Props) {
  const language = useLanguage()

  return (
    <Dialog
      class="h-full"
      title={
        <IconButton
          tabIndex={-1}
          icon="arrow-left"
          variant="ghost"
          onClick={props.onBack}
          aria-label={language.t("common.goBack")}
        />
      }
      transition
    >
      <CustomProviderForm providerID={props.providerID} />
    </Dialog>
  )
}

export function DialogDeleteCustomProvider(props: { providerID: string; name: string }) {
  const dialog = useDialog()
  const language = useLanguage()
  const settings = useSettings()
  const serverSDK = useServerSDK()
  const [deleting, setDeleting] = createSignal(false)

  const remove = async () => {
    if (deleting()) return
    setDeleting(true)
    await serverSDK()
      .client.global.config.provider.remove({ providerID: props.providerID }, { throwOnError: true })
      .then(() => {
        dialog.close()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.custom.delete.success.title", { provider: props.name }),
          description: language.t("provider.custom.delete.success.description", { provider: props.name }),
        })
      })
      .catch((error: unknown) => {
        setDeleting(false)
        showToast({
          title: language.t("common.requestFailed"),
          description: error instanceof Error ? error.message : String(error),
        })
      })
  }

  if (settings.general.newLayoutDesigns())
    return (
      <DialogV2 fit>
        <DialogHeader hideClose>
          <DialogTitleGroup
            title={language.t("provider.custom.delete.title")}
            description={language.t("provider.custom.delete.confirm", { provider: props.name })}
          />
        </DialogHeader>
        <DialogFooter>
          <ButtonV2 variant="ghost" disabled={deleting()} onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </ButtonV2>
          <ButtonV2 variant="danger" disabled={deleting()} onClick={() => void remove()}>
            {language.t("common.delete")}
          </ButtonV2>
        </DialogFooter>
      </DialogV2>
    )

  return (
    <Dialog title={language.t("provider.custom.delete.title")} fit>
      <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
        <span class="text-14-regular text-text-strong">
          {language.t("provider.custom.delete.confirm", { provider: props.name })}
        </span>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="large" disabled={deleting()} onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button variant="primary" size="large" disabled={deleting()} onClick={() => void remove()}>
            {language.t("common.delete")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export function CustomProviderForm(props: { autofocus?: boolean; providerID?: string } = {}) {
  const dialog = useDialog()
  const serverSync = useServerSync()
  const serverSDK = useServerSDK()
  const language = useLanguage()

  const initial = props.providerID ? serverSync().data.config.provider?.[props.providerID] : undefined
  const [drafts, setDrafts, , draftsReady] = persisted(
    Persist.serverGlobal(serverSDK().scope, "custom-provider-model-drafts"),
    createStore<{ providers: Record<string, FormState["models"] | undefined> }>({ providers: {} }),
  )
  const draftKey = props.providerID ?? ""
  const [form, setForm] = createStore<FormState>({
    providerID: props.providerID ?? "",
    name: initial?.name ?? "",
    baseURL: initial?.options?.baseURL ?? initial?.api ?? "",
    apiKey: initial?.env?.[0] ? `{env:${initial.env[0]}}` : "",
    models: initial?.models
      ? Object.entries(initial.models).map(([id, model]) => ({
          ...configuredModelRow(id, model, initial.npm),
          savedID: id,
          json: JSON.stringify(model, null, 2),
        }))
      : [{ ...modelRow(), json: modelTemplate("responses", language.t("provider.custom.json.templateNote")) }],
    headers: initial?.options?.headers
      ? Object.entries(initial.options.headers).map(([key, value]) => ({ row: headerRow().row, key, value, err: {} }))
      : [headerRow()],
    err: {},
  })
  const [modelState, setModelState] = createStore({ busy: false, restored: false, finished: false })
  createEffect(() => {
    if (!draftsReady() || modelState.restored) return
    const saved = drafts.providers[draftKey]
    if (saved) {
      const live = form.models
      setForm("models", [
        ...saved.map((model) => ({
          ...model,
          row: modelRow().row,
          savedID: model.savedID && initial?.models?.[model.savedID] ? model.savedID : undefined,
        })),
        ...live.filter((model) => !saved.some((draft) => draft.savedID === model.savedID)),
      ])
    }
    setModelState("restored", true)
  })
  createEffect(() => {
    if (!modelState.restored || modelState.finished) return
    setDrafts(
      "providers",
      draftKey,
      form.models.map((model) => ({ ...model })),
    )
  })

  const addModel = () => {
    setForm(
      "models",
      produce((rows) => {
        rows.push({ ...modelRow(), json: modelTemplate("responses", language.t("provider.custom.json.templateNote")) })
      }),
    )
  }

  const removeModel = async (index: number) => {
    if (modelState.busy) return
    const id = form.models[index].savedID
    if (props.providerID && id) {
      setModelState("busy", true)
      const ok = await serverSDK()
        .client.global.config.provider.patch(
          { providerID: props.providerID, providerConfigUpdate: { remove: [id] } },
          { throwOnError: true },
        )
        .then(() => true)
        .catch((error: unknown) => {
          showToast({
            title: language.t("common.requestFailed"),
            description: error instanceof Error ? error.message : String(error),
          })
          return false
        })
        .finally(() => setModelState("busy", false))
      if (!ok) return
    }
    setForm(
      "models",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

  const addHeader = () => {
    setForm(
      "headers",
      produce((rows) => {
        rows.push(headerRow())
      }),
    )
  }

  const removeHeader = (index: number) => {
    if (form.headers.length <= 1) return
    setForm(
      "headers",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

  const setField = (key: "providerID" | "name" | "baseURL" | "apiKey", value: string) => {
    setForm(key, value)
    if (key === "apiKey") return
    setForm("err", key, undefined)
  }

  const saveModel = async (index: number) => {
    if (!props.providerID || modelState.busy) return
    const row = form.models[index]
    const id = row.id.trim()
    const model = parseModelJSON(row.json ?? "{}").model
    if (!model || !id) return
    if (
      form.models.some((other, i) => i !== index && other.id.trim() === id) ||
      (!row.savedID && serverSync().data.config.provider?.[props.providerID]?.models?.[id])
    ) {
      setForm("models", index, "err", "id", language.t("provider.custom.error.duplicate"))
      return
    }
    setModelState("busy", true)
    const source = row.json
    await serverSDK()
      .client.global.config.provider.patch(
        { providerID: props.providerID, providerConfigUpdate: { models: { [id]: model } } },
        { throwOnError: true },
      )
      .then(() => {
        setForm("models", index, { savedID: id, id, original: model, json: source })
        showToast({ variant: "success", title: language.t("provider.custom.json.saved") })
      })
      .catch((error: unknown) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: error instanceof Error ? error.message : String(error),
        }),
      )
      .finally(() => setModelState("busy", false))
  }

  const setHeader = (index: number, key: "key" | "value", value: string) => {
    batch(() => {
      setForm("headers", index, key, value)
      setForm("headers", index, "err", key, undefined)
    })
  }

  const validate = () => {
    const output = validateCustomProvider({
      form: props.providerID ? { ...form, models: [] } : form,
      initial,
      t: language.t,
      disabledProviders: serverSync().data.config.disabled_providers ?? [],
      existingProviderIDs: new Set(
        serverSync()
          .data.provider.all.keys()
          .filter((id) => id !== props.providerID),
      ),
    })
    batch(() => {
      setForm("err", output.err)
      output.models.forEach((err, index) => setForm("models", index, "err", err))
      output.headers.forEach((err, index) => setForm("headers", index, "err", err))
    })
    return output.result
  }

  const saveMutation = useMutation(() => ({
    mutationFn: async (result: NonNullable<ReturnType<typeof validate>>) => {
      if ((await serverSDK().protocol) !== "v1") throw new Error(language.t("provider.custom.unavailable"))

      if (result.key) {
        await serverSDK().client.auth.set(
          {
            providerID: result.providerID,
            auth: {
              type: "api",
              key: result.key,
            },
          },
          { throwOnError: true },
        )
      }

      if (props.providerID) {
        const { models, ...settings } = result.config
        await serverSDK().client.global.config.provider.patch(
          { providerID: props.providerID, providerConfigUpdate: { settings } },
          { throwOnError: true },
        )
        return result
      }
      await serverSDK().client.global.config.provider.set(
        { providerID: result.providerID, providerConfig: result.config },
        { throwOnError: true },
      )
      return result
    },
    onSuccess: (result) => {
      if (!props.providerID) {
        setModelState("finished", true)
        setDrafts(
          "providers",
          result.providerID,
          form.models.map((model) => ({ ...model, savedID: model.id.trim() })),
        )
        setDrafts("providers", draftKey, undefined)
      }
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.connect.toast.connected.title", { provider: result.name }),
        description: language.t("provider.connect.toast.connected.description", { provider: result.name }),
      })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const save = (e: SubmitEvent) => {
    e.preventDefault()
    if (saveMutation.isPending || modelState.busy || !draftsReady()) return

    const result = validate()
    if (!result) return
    saveMutation.mutate(result)
  }

  return (
    <div class="flex flex-col gap-6 px-2.5 pb-3 overflow-y-auto max-h-[75vh]">
      <div class="px-2.5 flex gap-4 items-center">
        <ProviderIcon id="synthetic" class="size-5 shrink-0 icon-strong-base" />
        <div class="text-16-medium text-text-strong">{language.t("provider.custom.title")}</div>
      </div>

      <form onSubmit={save} class="px-2.5 pb-6 flex flex-col gap-6">
        <p class="text-14-regular text-text-base">
          {language.t("provider.custom.description.prefix")}
          <ExternalLink href="https://opencode.ai/docs/providers/#custom-provider" tabIndex={-1}>
            {language.t("provider.custom.description.link")}
          </ExternalLink>
          {language.t("provider.custom.description.suffix")}
        </p>

        <div class="flex flex-col gap-4">
          <Show when={props.providerID}>
            <TextField
              label={language.t("provider.custom.field.providerID.label")}
              value={form.providerID}
              disabled
              onChange={() => undefined}
            />
          </Show>
          <Show when={!props.providerID}>
            <TextField
              autofocus={props.autofocus ?? true}
              label={language.t("provider.custom.field.providerID.label")}
              placeholder={language.t("provider.custom.field.providerID.placeholder")}
              description={language.t("provider.custom.field.providerID.description")}
              value={form.providerID}
              onChange={(v) => setField("providerID", v)}
              validationState={form.err.providerID ? "invalid" : undefined}
              error={form.err.providerID}
            />
          </Show>
          <TextField
            label={language.t("provider.custom.field.name.label")}
            placeholder={language.t("provider.custom.field.name.placeholder")}
            value={form.name}
            onChange={(v) => setField("name", v)}
            validationState={form.err.name ? "invalid" : undefined}
            error={form.err.name}
          />
          <TextField
            label={language.t("provider.custom.field.baseURL.label")}
            placeholder={language.t("provider.custom.field.baseURL.placeholder")}
            value={form.baseURL}
            onChange={(v) => setField("baseURL", v)}
            validationState={form.err.baseURL ? "invalid" : undefined}
            error={form.err.baseURL}
          />
          <TextField
            label={language.t("provider.custom.field.apiKey.label")}
            placeholder={language.t("provider.custom.field.apiKey.placeholder")}
            description={language.t("provider.custom.field.apiKey.description")}
            value={form.apiKey}
            onChange={(v) => setField("apiKey", v)}
          />
        </div>

        <Show when={draftsReady()}>
          <div class="flex flex-col gap-3">
            <label class="text-12-medium text-text-weak">{language.t("provider.custom.models.label")}</label>
            <For each={form.models}>
              {(m, i) => (
                <CustomModelCard
                  model={m}
                  provider={{ ...initial, options: { ...initial?.options, baseURL: form.baseURL } }}
                  busy={modelState.busy || saveMutation.isPending}
                  canSave={!!props.providerID}
                  update={(patch) => setForm("models", i(), patch)}
                  save={() => void saveModel(i())}
                  remove={() => void removeModel(i())}
                  copy={() =>
                    setForm(
                      "models",
                      produce((rows) => {
                        rows.push({ ...modelRow(), json: m.json })
                      }),
                    )
                  }
                />
              )}
            </For>
            <Button
              type="button"
              size="small"
              variant="ghost"
              icon="plus-small"
              disabled={modelState.busy || saveMutation.isPending}
              onClick={addModel}
              class="self-start"
            >
              {language.t("provider.custom.models.add")}
            </Button>
          </div>
        </Show>

        <div class="flex flex-col gap-3">
          <label class="text-12-medium text-text-weak">{language.t("provider.custom.headers.label")}</label>
          <For each={form.headers}>
            {(h, i) => (
              <div class="flex gap-2 items-start" data-row={h.row}>
                <div class="flex-1">
                  <TextField
                    label={language.t("provider.custom.headers.key.label")}
                    hideLabel
                    placeholder={language.t("provider.custom.headers.key.placeholder")}
                    value={h.key}
                    onChange={(v) => setHeader(i(), "key", v)}
                    validationState={h.err.key ? "invalid" : undefined}
                    error={h.err.key}
                  />
                </div>
                <div class="flex-1">
                  <TextField
                    label={language.t("provider.custom.headers.value.label")}
                    hideLabel
                    placeholder={language.t("provider.custom.headers.value.placeholder")}
                    value={h.value}
                    onChange={(v) => setHeader(i(), "value", v)}
                    validationState={h.err.value ? "invalid" : undefined}
                    error={h.err.value}
                  />
                </div>
                <IconButton
                  type="button"
                  icon="trash"
                  variant="ghost"
                  class="mt-1.5"
                  onClick={() => removeHeader(i())}
                  disabled={form.headers.length <= 1}
                  aria-label={language.t("provider.custom.headers.remove")}
                />
              </div>
            )}
          </For>
          <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addHeader} class="self-start">
            {language.t("provider.custom.headers.add")}
          </Button>
        </div>

        <Button
          class="w-auto self-start"
          type="submit"
          size="large"
          variant="primary"
          disabled={saveMutation.isPending || modelState.busy || !draftsReady()}
        >
          {saveMutation.isPending
            ? language.t("common.saving")
            : props.providerID
              ? language.t("provider.custom.json.saveProvider")
              : language.t("common.connect")}
        </Button>
      </form>
    </div>
  )
}
