import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { getOptionalOrgId, emptyListResult } from "./lib/queries";
import { optionalUserQuery, userMutation } from "./lib/factories";

/**
 * Unified Inbox backend.
 *
 * Reads the first-class `emailThreads` table (see schema.ts) and enriches each
 * row with the linked client's name and the resolved external counterparty
 * contact for display in the inbox list / detail views.
 *
 * Every export is org-scoped: threads are only ever read or patched after
 * verifying `thread.orgId === callerOrgId`.
 */

export type InboxThread = {
  threadDocId: Id<"emailThreads">;
  subject: string;
  preview: string;
  lastMessageAt: number;
  lastMessageDirection: "inbound" | "outbound" | null;
  unreadCount: number;
  messageCount: number;
  status: "open" | "archived";
  clientId: Id<"clients"> | null;
  clientName: string | null;
  contact: {
    contactId: Id<"clientContacts"> | null;
    name: string;
    email: string;
  } | null;
  participantEmails: string[];
};

// ============================================================================
// Enrichment helpers
// ============================================================================

/**
 * Build a lookup of the org's client contacts keyed by lowercased email.
 * `clientContacts` has no email index, so we scan the org's contacts once
 * (via `by_org`) and reuse the map across every thread in the request.
 */
async function buildContactIndex(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
): Promise<Map<string, Doc<"clientContacts">>> {
  const contacts = await ctx.db
    .query("clientContacts")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();

  const byEmail = new Map<string, Doc<"clientContacts">>();
  for (const contact of contacts) {
    if (!contact.email) continue;
    const key = contact.email.trim().toLowerCase();
    if (!key || byEmail.has(key)) continue;
    byEmail.set(key, contact);
  }
  return byEmail;
}

/**
 * Resolve the external counterparty contact for a thread from its
 * participant emails (which hold only external addresses, never the org's own).
 */
function resolveContact(
  participantEmails: string[],
  contactIndex: Map<string, Doc<"clientContacts">>,
): InboxThread["contact"] {
  if (participantEmails.length === 0) return null;

  const email = participantEmails[0];
  const contact = contactIndex.get(email.trim().toLowerCase());
  if (contact) {
    return {
      contactId: contact._id,
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      email,
    };
  }
  return { contactId: null, name: email, email };
}

/**
 * Resolve a linked client's display name, caching lookups across threads.
 */
async function resolveClientName(
  ctx: QueryCtx | MutationCtx,
  clientCache: Map<Id<"clients">, Doc<"clients"> | null>,
  clientId: Id<"clients"> | null,
): Promise<string | null> {
  if (!clientId) return null;
  if (!clientCache.has(clientId)) {
    clientCache.set(clientId, await ctx.db.get(clientId));
  }
  return clientCache.get(clientId)?.companyName ?? null;
}

/**
 * Map an `emailThreads` row into the client-facing `InboxThread` shape.
 */
async function enrichThread(
  ctx: QueryCtx | MutationCtx,
  thread: Doc<"emailThreads">,
  contactIndex: Map<string, Doc<"clientContacts">>,
  clientCache: Map<Id<"clients">, Doc<"clients"> | null>,
): Promise<InboxThread> {
  const clientName = await resolveClientName(ctx, clientCache, thread.clientId);
  return {
    threadDocId: thread._id,
    subject: thread.subject ?? thread.subjectNormalized ?? "(no subject)",
    preview: thread.lastMessagePreview ?? "",
    lastMessageAt: thread.lastMessageAt,
    lastMessageDirection: thread.lastMessageDirection ?? null,
    unreadCount: thread.unreadCount,
    messageCount: thread.messageCount,
    status: thread.status,
    clientId: thread.clientId,
    clientName,
    contact: resolveContact(thread.participantEmails, contactIndex),
    participantEmails: thread.participantEmails,
  };
}

// ============================================================================
// Queries
// ============================================================================

/**
 * List open inbox threads for the org, newest-first, with an optional filter.
 * Archived threads are always excluded.
 */
// Bound the org-wide inbox scan; shows the most-recent open conversations.
const INBOX_LIST_LIMIT = 300;

export const listThreadsByOrg = optionalUserQuery({
  args: {
    filter: v.optional(
      v.union(v.literal("all"), v.literal("unread"), v.literal("unlinked")),
    ),
  },
  handler: async (ctx, args): Promise<InboxThread[]> => {
    const orgId = await getOptionalOrgId(ctx);
    if (!orgId) return emptyListResult<InboxThread>();

    const openThreads = await ctx.db
      .query("emailThreads")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgId).eq("status", "open"),
      )
      .order("desc")
      .take(INBOX_LIST_LIMIT);

    const filter = args.filter ?? "all";
    const visibleThreads = openThreads.filter((t) => {
      if (filter === "unread") return t.unreadCount > 0;
      if (filter === "unlinked") return t.clientId === null;
      return true;
    });

    const contactIndex = await buildContactIndex(ctx, orgId);
    const clientCache = new Map<Id<"clients">, Doc<"clients"> | null>();

    return await Promise.all(
      visibleThreads.map((thread) =>
        enrichThread(ctx, thread, contactIndex, clientCache),
      ),
    );
  },
});

/**
 * Get a single enriched inbox thread. Returns null when missing or wrong org.
 */
export const getThread = optionalUserQuery({
  args: {
    threadDocId: v.id("emailThreads"),
  },
  handler: async (ctx, args): Promise<InboxThread | null> => {
    const orgId = await getOptionalOrgId(ctx);
    if (!orgId) return null;

    const thread = await ctx.db.get(args.threadDocId);
    if (!thread || thread.orgId !== orgId) return null;

    const contactIndex = await buildContactIndex(ctx, orgId);
    const clientCache = new Map<Id<"clients">, Doc<"clients"> | null>();

    return await enrichThread(ctx, thread, contactIndex, clientCache);
  },
});

/**
 * Count open threads with unread messages for the org.
 */
export const countUnreadThreads = optionalUserQuery({
  args: {},
  handler: async (ctx): Promise<number> => {
    const orgId = await getOptionalOrgId(ctx);
    if (!orgId) return 0;

    // Bounded to the same recency window the inbox list renders, so the badge
    // (a) never exceeds what the list can actually show and (b) stays cheap on
    // this globally-mounted sidebar subscription.
    const openThreads = await ctx.db
      .query("emailThreads")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgId).eq("status", "open"),
      )
      .order("desc")
      .take(INBOX_LIST_LIMIT);

    return openThreads.filter((t) => t.unreadCount > 0).length;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Mark a thread read: zero its unread count and stamp `openedAt` on any of its
 * inbound messages that haven't been opened yet.
 */
export const markRead = userMutation({
  args: {
    threadDocId: v.id("emailThreads"),
  },
  handler: async (ctx, args): Promise<null> => {
    const thread = await ctx.db.get(args.threadDocId);
    if (!thread || thread.orgId !== ctx.orgId) {
      throw new Error("Thread not found");
    }

    await ctx.db.patch(args.threadDocId, { unreadCount: 0 });

    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_thread_doc", (q) => q.eq("threadDocId", args.threadDocId))
      .collect();

    const now = Date.now();
    for (const message of messages) {
      if (
        message.orgId === ctx.orgId &&
        message.direction === "inbound" &&
        message.openedAt === undefined
      ) {
        await ctx.db.patch(message._id, { openedAt: now });
      }
    }

    return null;
  },
});

/**
 * Mark a thread unread: bump its unread count to at least 1.
 */
export const markUnread = userMutation({
  args: {
    threadDocId: v.id("emailThreads"),
  },
  handler: async (ctx, args): Promise<null> => {
    const thread = await ctx.db.get(args.threadDocId);
    if (!thread || thread.orgId !== ctx.orgId) {
      throw new Error("Thread not found");
    }

    await ctx.db.patch(args.threadDocId, {
      unreadCount: Math.max(1, thread.unreadCount),
    });

    return null;
  },
});

/**
 * Archive or unarchive a thread. Defaults to archiving.
 */
export const archiveThread = userMutation({
  args: {
    threadDocId: v.id("emailThreads"),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<null> => {
    const thread = await ctx.db.get(args.threadDocId);
    if (!thread || thread.orgId !== ctx.orgId) {
      throw new Error("Thread not found");
    }

    await ctx.db.patch(args.threadDocId, {
      status: args.archived === false ? "open" : "archived",
    });

    return null;
  },
});

/**
 * Link a thread to a client and backfill that client onto the thread's
 * still-unlinked messages. Both the thread and the client must belong to the
 * caller's org.
 */
export const linkThreadToClient = userMutation({
  args: {
    threadDocId: v.id("emailThreads"),
    clientId: v.id("clients"),
  },
  handler: async (ctx, args): Promise<null> => {
    const thread = await ctx.db.get(args.threadDocId);
    if (!thread || thread.orgId !== ctx.orgId) {
      throw new Error("Thread not found");
    }

    const client = await ctx.db.get(args.clientId);
    if (!client || client.orgId !== ctx.orgId) {
      throw new Error("Client not found");
    }

    await ctx.db.patch(args.threadDocId, { clientId: args.clientId });

    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_thread_doc", (q) => q.eq("threadDocId", args.threadDocId))
      .collect();

    for (const message of messages) {
      if (message.orgId === ctx.orgId && message.clientId === null) {
        await ctx.db.patch(message._id, { clientId: args.clientId });
      }
    }

    return null;
  },
});
