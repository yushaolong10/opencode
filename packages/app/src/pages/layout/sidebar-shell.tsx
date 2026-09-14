import { createMemo, For, type Accessor, type JSX } from "solid-js"
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  type DragEvent,
} from "@thisbeyond/solid-dnd"
import { ConstrainDragXAxis } from "@/utils/solid-dnd"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { type LocalProject } from "@/context/layout"

export const SidebarContent = (props: {
  mobile?: boolean
  opened: Accessor<boolean>
  aimMove: (event: MouseEvent) => void
  projects: Accessor<LocalProject[]>
  renderProject: (project: Accessor<LocalProject>) => JSX.Element
  handleDragStart: (event: unknown) => void
  handleDragEnd: () => void
  handleDragOver: (event: DragEvent) => void
  openProjectLabel: JSX.Element
  projectsLabel: string
  openProjectKeybind: Accessor<string | undefined>
  onOpenProject: () => void
  renderProjectOverlay: () => JSX.Element
  settingsLabel: Accessor<string>
  settingsKeybind: Accessor<string | undefined>
  onOpenSettings: () => void
  helpLabel: Accessor<string>
  onOpenHelp: () => void
}): JSX.Element => {
  const expanded = createMemo(() => !!props.mobile || props.opened())
  const placement = () => (props.mobile ? "bottom" : "right")

  const projects = (
    <DragDropProvider
      onDragStart={props.handleDragStart}
      onDragEnd={props.handleDragEnd}
      onDragOver={props.handleDragOver}
      collisionDetector={closestCenter}
    >
      <DragDropSensors />
      <ConstrainDragXAxis />
      <SortableProvider ids={props.projects().map((project) => project.worktree)}>
        <For each={props.projects().map((project) => project.worktree)}>
          {(worktree) => <SidebarProjectSlot projects={props.projects} worktree={worktree} render={props.renderProject} />}
        </For>
      </SortableProvider>
      <DragOverlay>{props.renderProjectOverlay()}</DragOverlay>
    </DragDropProvider>
  )

  const actions = (
    <div
      classList={{
        "shrink-0 flex gap-2": true,
        "w-full items-center justify-between border-t border-border-weaker-base px-3 py-3": expanded(),
        "flex-col items-center pt-3 pb-6": !expanded(),
      }}
    >
      <TooltipKeybind placement={placement()} title={props.settingsLabel()} keybind={props.settingsKeybind() ?? ""}>
        <IconButton
          icon="settings-gear"
          variant="ghost"
          size="large"
          onClick={props.onOpenSettings}
          aria-label={props.settingsLabel()}
        />
      </TooltipKeybind>
      <Tooltip placement={placement()} value={props.helpLabel()}>
        <IconButton
          icon="help"
          variant="ghost"
          size="large"
          onClick={props.onOpenHelp}
          aria-label={props.helpLabel()}
        />
      </Tooltip>
    </div>
  )

  return (
    <div
      data-component="sidebar-shell"
      data-expanded={expanded() ? "true" : "false"}
      class="flex h-full w-full min-w-0 overflow-hidden bg-background-stronger"
    >
      <div
        data-component="sidebar-rail"
        class="flex min-w-0 flex-1 flex-col overflow-hidden"
        onMouseMove={props.aimMove}
      >
        <section
          class="flex min-h-0 flex-1 flex-col transition-[padding] duration-200 motion-reduce:transition-none"
          classList={{
            "px-3 pt-3 pb-2": expanded(),
            "px-3 py-3": !expanded(),
          }}
          aria-label={props.projectsLabel}
        >
          <div
            class="flex items-center justify-between overflow-hidden px-2 transition-[height,margin,opacity] duration-200 motion-reduce:transition-none"
            classList={{
              "mb-2 h-8 opacity-100": expanded(),
              "m-0 h-0 opacity-0 pointer-events-none": !expanded(),
            }}
            aria-hidden={!expanded()}
          >
            <span class="text-12-medium text-text-weak">{props.projectsLabel}</span>
            <Tooltip placement="bottom" value={props.openProjectLabel}>
              <IconButton
                icon="plus"
                variant="ghost"
                size="small"
                tabIndex={expanded() ? 0 : -1}
                onClick={props.onOpenProject}
                aria-label={typeof props.openProjectLabel === "string" ? props.openProjectLabel : undefined}
              />
            </Tooltip>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto no-scrollbar">
            <div
              class="flex w-full flex-col transition-[gap] duration-200 motion-reduce:transition-none"
              classList={{
                "gap-1": expanded(),
                "items-center gap-3": !expanded(),
              }}
            >
              {projects}
              <div
                class="flex justify-center overflow-hidden transition-[height,opacity] duration-200 motion-reduce:transition-none"
                classList={{
                  "h-0 opacity-0 pointer-events-none": expanded(),
                  "h-10 opacity-100": !expanded(),
                }}
                aria-hidden={expanded()}
              >
                <Tooltip placement={placement()} value={props.openProjectLabel}>
                  <IconButton
                    icon="plus"
                    variant="ghost"
                    size="large"
                    tabIndex={expanded() ? -1 : 0}
                    onClick={props.onOpenProject}
                    aria-label={typeof props.openProjectLabel === "string" ? props.openProjectLabel : undefined}
                  />
                </Tooltip>
              </div>
            </div>
          </div>
        </section>
        {actions}
      </div>
    </div>
  )
}

function SidebarProjectSlot(props: {
  projects: Accessor<LocalProject[]>
  worktree: string
  render: (project: Accessor<LocalProject>) => JSX.Element
}) {
  const initial = props.projects().find((project) => project.worktree === props.worktree)
  if (!initial) return
  const project = createMemo<LocalProject>(
    (previous) => props.projects().find((project) => project.worktree === props.worktree) ?? previous,
    initial,
  )
  return props.render(project)
}
