import { createEffect, createMemo, Show, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { ContextMenu } from "@opencode-ai/ui/context-menu"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { createSortable } from "@thisbeyond/solid-dnd"
import { useLayout, type LocalProject } from "@/context/layout"
import { useServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useNotification } from "@/context/notification"
import { ProjectIcon, type SessionItemProps } from "./sidebar-items"
import { displayName } from "./helpers"

export type ProjectSidebarContext = {
  currentDir: Accessor<string>
  currentProject: Accessor<LocalProject | undefined>
  sidebarOpened: Accessor<boolean>
  sidebarHovering: Accessor<boolean>
  hoverProject: Accessor<string | undefined>
  onProjectMouseEnter: (worktree: string, event: MouseEvent) => void
  onProjectMouseLeave: (worktree: string) => void
  onProjectFocus: (worktree: string) => void
  onHoverOpenChanged: (worktree: string, hovered: boolean) => void
  navigateToProject: (directory: string) => void
  navigateToNewSession: (directory: string) => void
  openSidebar: () => void
  projectExpanded: (directory: string, initial: boolean) => boolean
  setProjectExpanded: (directory: string, value: boolean) => void
  closeProject: (directory: string) => void
  showEditProjectDialog: (project: LocalProject) => void
  toggleProjectWorkspaces: (project: LocalProject) => void
  workspacesEnabled: (project: LocalProject) => boolean
  workspaceIds: (project: LocalProject) => string[]
  workspaceLabel: (directory: string, branch?: string, projectId?: string) => string
  sessionProps: Omit<SessionItemProps, "session" | "list" | "slug" | "mobile" | "dense">
}

export const ProjectDragOverlay = (props: {
  projects: Accessor<LocalProject[]>
  activeProject: Accessor<string | undefined>
}): JSX.Element => {
  const project = createMemo(() => props.projects().find((p) => p.worktree === props.activeProject()))
  return (
    <Show when={project()}>
      {(p) => (
        <div class="bg-background-base rounded-xl p-1">
          <ProjectIcon project={p()} />
        </div>
      )}
    </Show>
  )
}

const ProjectTile = (props: {
  project: LocalProject
  mobile?: boolean
  sidebarHovering: Accessor<boolean>
  sidebarOpened: Accessor<boolean>
  selected: Accessor<boolean>
  projectExpanded: Accessor<boolean>
  active: Accessor<boolean>
  isWorking: Accessor<boolean>
  overlay: Accessor<boolean>
  suppressHover: Accessor<boolean>
  dirs: Accessor<string[]>
  onProjectMouseEnter: (worktree: string, event: MouseEvent) => void
  onProjectMouseLeave: (worktree: string) => void
  onProjectFocus: (worktree: string) => void
  navigateToProject: (directory: string) => void
  navigateToNewSession: (directory: string) => void
  toggleProject: () => void
  showEditProjectDialog: (project: LocalProject) => void
  toggleProjectWorkspaces: (project: LocalProject) => void
  workspacesEnabled: (project: LocalProject) => boolean
  closeProject: (directory: string) => void
  setMenu: (value: boolean) => void
  setOpen: (value: boolean) => void
  setSuppressHover: (value: boolean) => void
  language: ReturnType<typeof useLanguage>
}): JSX.Element => {
  const notification = useNotification()
  const layout = useLayout()
  const expanded = createMemo(() => !!props.mobile || props.sidebarOpened())
  const unseenCount = createMemo(() =>
    props.dirs().reduce((total, directory) => total + notification.project.unseenCount(directory), 0),
  )

  const clear = () =>
    props
      .dirs()
      .filter((directory) => notification.project.unseenCount(directory) > 0)
      .forEach((directory) => notification.project.markViewed(directory))

  return (
    <div class="group/project relative min-w-0">
      <ContextMenu
        modal={!props.sidebarHovering()}
        onOpenChange={(value) => {
          props.setMenu(value)
          props.setSuppressHover(value)
          if (value) props.setOpen(false)
        }}
      >
        <Tooltip placement="right" value={displayName(props.project)} gutter={10} inactive={expanded()}>
          <ContextMenu.Trigger
            as="button"
            type="button"
            aria-label={displayName(props.project)}
            data-action="project-open"
            data-project={base64Encode(props.project.worktree)}
            classList={{
              "flex items-center rounded-lg overflow-hidden transition-colors cursor-default": true,
              "h-10 w-full justify-start gap-1 ps-7 pe-9": expanded(),
              "size-10 justify-center p-1": !expanded(),
              "bg-surface-base-active text-text-strong": props.selected() && expanded(),
              "bg-transparent border-2 border-icon-strong-base hover:bg-surface-base-hover":
                props.selected() && !expanded(),
              "bg-transparent border border-transparent hover:bg-surface-base-hover":
                !props.selected() && !props.active(),
              "bg-surface-base-hover border border-border-weak-base": !props.selected() && props.active(),
            }}
            onPointerDown={(event) => {
              if (event.button === 0 && !event.ctrlKey) {
                props.setOpen(false)
                props.setSuppressHover(true)
                return
              }
              if (!props.overlay()) return
              if (event.button !== 2 && !(event.button === 0 && event.ctrlKey)) return
              props.setOpen(false)
              props.setSuppressHover(true)
              event.preventDefault()
            }}
            onMouseEnter={(event: MouseEvent) => {
              if (!props.overlay()) return
              if (props.suppressHover()) return
              props.onProjectMouseEnter(props.project.worktree, event)
            }}
            onMouseLeave={() => {
              if (props.suppressHover()) props.setSuppressHover(false)
              if (!props.overlay()) return
              props.onProjectMouseLeave(props.project.worktree)
            }}
            onFocus={() => {
              if (!props.overlay()) return
              if (props.suppressHover()) return
              props.onProjectFocus(props.project.worktree)
            }}
            onClick={() => {
              props.setOpen(false)
              if (!expanded()) layout.sidebar.open()
              props.navigateToProject(props.project.worktree)
            }}
            onBlur={() => props.setOpen(false)}
          >
            <ProjectIcon project={props.project} notify working={props.isWorking()} class={expanded() ? "!size-7" : ""} />
            <Show when={expanded()}>
              <span class="min-w-0 flex-1 truncate text-start text-14-medium">{displayName(props.project)}</span>
            </Show>
          </ContextMenu.Trigger>
        </Tooltip>
        <Show when={expanded()}>
          <IconButtonV2
            data-action="project-toggle"
            data-project={base64Encode(props.project.worktree)}
            icon={
              <IconV2
                name="chevron-down"
                size="small"
                class="transition-transform duration-150 motion-reduce:transition-none"
                classList={{ "-rotate-90": !props.projectExpanded() }}
              />
            }
            variant="ghost-muted"
            size="small"
            class="absolute start-1 top-1/2 z-10 size-6 -translate-y-1/2 rounded-md"
            aria-label={
              props.projectExpanded()
                ? props.language.t("sidebar.project.collapse")
                : props.language.t("sidebar.project.expand")
            }
            aria-expanded={props.projectExpanded()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              props.toggleProject()
            }}
          />
        </Show>
        <ContextMenu.Portal>
          <ContextMenu.Content>
            <ContextMenu.Item onSelect={() => props.showEditProjectDialog(props.project)}>
              <ContextMenu.ItemLabel>{props.language.t("common.edit")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <ContextMenu.Item
              data-action="project-workspaces-toggle"
              data-project={base64Encode(props.project.worktree)}
              disabled={props.project.vcs !== "git" && !props.workspacesEnabled(props.project)}
              onSelect={() => props.toggleProjectWorkspaces(props.project)}
            >
              <ContextMenu.ItemLabel>
                {props.workspacesEnabled(props.project)
                  ? props.language.t("sidebar.workspaces.disable")
                  : props.language.t("sidebar.workspaces.enable")}
              </ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <ContextMenu.Item
              data-action="project-clear-notifications"
              data-project={base64Encode(props.project.worktree)}
              disabled={unseenCount() === 0}
              onSelect={clear}
            >
              <ContextMenu.ItemLabel>{props.language.t("sidebar.project.clearNotifications")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item
              data-action="project-close-menu"
              data-project={base64Encode(props.project.worktree)}
              onSelect={() => props.closeProject(props.project.worktree)}
            >
              <ContextMenu.ItemLabel>{props.language.t("common.close")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu>
      <Show when={expanded()}>
        <Tooltip value={props.language.t("command.session.new")} placement="top">
          <IconButtonV2
            icon={<IconV2 name="plus" size="small" />}
            variant="ghost-muted"
            size="small"
            class="absolute end-1 top-2 size-6 rounded-md opacity-0 pointer-events-none group-hover/project:opacity-100 group-hover/project:pointer-events-auto group-focus-within/project:opacity-100 group-focus-within/project:pointer-events-auto"
            aria-label={props.language.t("command.session.new")}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              props.navigateToNewSession(props.project.worktree)
            }}
          />
        </Tooltip>
      </Show>
    </div>
  )
}

export const SortableProject = (props: {
  project: Accessor<LocalProject>
  mobile?: boolean
  ctx: ProjectSidebarContext
  sortNow: Accessor<number>
  renderPanel?: () => JSX.Element
}): JSX.Element => {
  const serverSync = useServerSync()
  const language = useLanguage()
  const sortable = createSortable(props.project().worktree)
  const selected = createMemo(() => props.ctx.currentProject()?.worktree === props.project().worktree)
  const dirs = createMemo(() => props.ctx.workspaceIds(props.project()))
  const projectExpanded = createMemo(() =>
    props.ctx.projectExpanded(props.project().worktree, props.project().expanded),
  )
  const [state, setState] = createStore({
    menu: false,
    suppressHover: false,
    panelMounted: projectExpanded(),
  })

  const isHoverProject = () => props.ctx.hoverProject() === props.project().worktree
  const expanded = createMemo(() => !!props.mobile || props.ctx.sidebarOpened())
  const overlay = createMemo(() => !props.mobile && !props.ctx.sidebarOpened())
  const active = createMemo(() => state.menu || (overlay() && isHoverProject()))
  const isWorking = createMemo(() =>
    dirs().some((directory) => {
      return Object.keys(serverSync().session.data.session_status).some((id) => {
        if (serverSync().session.get(id)?.directory !== directory) return false
        return serverSync().session.data.session_working(id)
      })
    }),
  )
  const toggleProject = () => {
    props.ctx.setProjectExpanded(props.project().worktree, !projectExpanded())
  }

  createEffect(() => {
    if (!projectExpanded()) return
    setState("panelMounted", true)
  })

  const tile = () => (
    <ProjectTile
      project={props.project()}
      mobile={props.mobile}
      sidebarHovering={props.ctx.sidebarHovering}
      sidebarOpened={props.ctx.sidebarOpened}
      selected={selected}
      projectExpanded={projectExpanded}
      active={active}
      isWorking={isWorking}
      overlay={overlay}
      suppressHover={() => state.suppressHover}
      dirs={dirs}
      onProjectMouseEnter={props.ctx.onProjectMouseEnter}
      onProjectMouseLeave={props.ctx.onProjectMouseLeave}
      onProjectFocus={props.ctx.onProjectFocus}
      navigateToProject={props.ctx.navigateToProject}
      navigateToNewSession={props.ctx.navigateToNewSession}
      toggleProject={toggleProject}
      showEditProjectDialog={props.ctx.showEditProjectDialog}
      toggleProjectWorkspaces={props.ctx.toggleProjectWorkspaces}
      workspacesEnabled={props.ctx.workspacesEnabled}
      closeProject={props.ctx.closeProject}
      setMenu={(value) => setState("menu", value)}
      setOpen={(value) => props.ctx.onHoverOpenChanged(props.project().worktree, value)}
      setSuppressHover={(value) => setState("suppressHover", value)}
      language={language}
    />
  )

  return (
    // @ts-ignore
    <div use:sortable class="w-full min-w-0" classList={{ "opacity-30": sortable.isActiveDraggable }}>
      {tile()}
      <Show when={state.panelMounted}>
        <div
          classList={{
            block: expanded() && projectExpanded(),
            hidden: !expanded() || !projectExpanded(),
          }}
          aria-hidden={!expanded() || !projectExpanded()}
        >
          {props.renderPanel?.()}
        </div>
      </Show>
    </div>
  )
}
