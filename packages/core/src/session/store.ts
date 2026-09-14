export * as SessionStore from "./store"

import { eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { EventV2 } from "../event"
import { makeGlobalNode } from "../effect/app-node"
import { SessionHistory } from "./history"
import { MessageDecodeError } from "./error"
import { SessionMessage } from "./message"
import { SessionSchema } from "./schema"
import { SessionMessageTable, SessionTable } from "./sql"
import { fromRow } from "./info"
import { SessionV1 } from "../v1/session"

export interface Interface {
  readonly get: (sessionID: SessionSchema.ID) => Effect.Effect<SessionSchema.Info | undefined>
  readonly context: (sessionID: SessionSchema.ID) => Effect.Effect<SessionMessage.Message[], MessageDecodeError>
  readonly runnerContext: (
    sessionID: SessionSchema.ID,
    baselineSeq: number,
  ) => Effect.Effect<SessionMessage.Message[], MessageDecodeError>
  readonly message: (
    messageID: SessionMessage.ID,
  ) => Effect.Effect<{ readonly sessionID: SessionSchema.ID; readonly message: SessionMessage.Message } | undefined>
  readonly setTitle: (input: { sessionID: SessionSchema.ID; title: string }) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SessionStore") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2.Service
    const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)

    return Service.of({
      get: Effect.fn("SessionStore.get")(function* (sessionID) {
        const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
        return row ? fromRow(row) : undefined
      }),
      context: Effect.fn("SessionStore.context")(function* (sessionID) {
        return yield* SessionHistory.load(db, sessionID)
      }),
      runnerContext: Effect.fn("SessionStore.runnerContext")(function* (sessionID, baselineSeq) {
        return yield* SessionHistory.loadForRunner(db, sessionID, baselineSeq)
      }),
      message: Effect.fn("SessionStore.message")(function* (messageID) {
        const row = yield* db
          .select()
          .from(SessionMessageTable)
          .where(eq(SessionMessageTable.id, messageID))
          .get()
          .pipe(Effect.orDie)
        return row
          ? {
              sessionID: SessionSchema.ID.make(row.session_id),
              message: yield* decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(Effect.orDie),
            }
          : undefined
      }),
      setTitle: Effect.fn("SessionStore.setTitle")(function* (input) {
        const row = yield* db
          .select()
          .from(SessionTable)
          .where(eq(SessionTable.id, input.sessionID))
          .get()
          .pipe(Effect.orDie)
        if (!row) return

        const info = Schema.decodeUnknownSync(SessionV1.SessionInfo)({
          id: row.id,
          slug: row.slug,
          projectID: row.project_id,
          ...(row.workspace_id ? { workspaceID: row.workspace_id } : {}),
          directory: row.directory,
          ...(row.path ? { path: row.path } : {}),
          ...(row.parent_id ? { parentID: row.parent_id } : {}),
          ...(row.summary_additions !== null || row.summary_deletions !== null || row.summary_files !== null
            ? {
                summary: {
                  additions: row.summary_additions ?? 0,
                  deletions: row.summary_deletions ?? 0,
                  files: row.summary_files ?? 0,
                  ...(row.summary_diffs ? { diffs: row.summary_diffs } : {}),
                },
              }
            : {}),
          cost: row.cost,
          tokens: {
            input: row.tokens_input,
            output: row.tokens_output,
            reasoning: row.tokens_reasoning,
            cache: { read: row.tokens_cache_read, write: row.tokens_cache_write },
          },
          ...(row.share_url ? { share: { url: row.share_url } } : {}),
          title: input.title,
          ...(row.agent ? { agent: row.agent } : {}),
          ...(row.model
            ? {
                model: {
                  id: row.model.id,
                  providerID: row.model.providerID,
                  ...(row.model.variant ? { variant: row.model.variant } : {}),
                },
              }
            : {}),
          version: row.version,
          ...(row.metadata ? { metadata: row.metadata } : {}),
          time: {
            created: row.time_created,
            updated: Date.now(),
            ...(row.time_archived ? { archived: row.time_archived } : {}),
          },
          ...(row.permission ? { permission: row.permission } : {}),
          ...(row.revert ? { revert: row.revert } : {}),
        })
        yield* events.publish(SessionV1.Event.Updated, { sessionID: info.id, info })
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, EventV2.node] })
