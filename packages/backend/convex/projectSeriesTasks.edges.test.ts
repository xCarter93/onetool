import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { triggers } from "./lib/triggers";
import { setupConvexTest } from "./test.setup";
import {
  addMemberToOrg,
  createTestClient,
  createTestIdentity,
  createTestOrg,
} from "./test.helpers";

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 6);
const NOW = START + 16 * 3_600_000;

describe("recurring project task copy-forward edges", () => {
  let t: ReturnType<typeof setupConvexTest>;
  let sequence = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    t = setupConvexTest();
    sequence = 0;
  });

  afterEach(() => vi.useRealTimers());

  async function fixture(count = 5, interval = 1) {
    const n = ++sequence;
    const org = await t.run(async (ctx) => {
      const setup = await createTestOrg(ctx, {
        clerkUserId: `task_edge_user_${n}`,
        clerkOrgId: `task_edge_org_${n}`,
      });
      await ctx.db.patch(setup.orgId, { timezone: "America/New_York" });
      return { ...setup, clientId: await createTestClient(ctx, setup.orgId) };
    });
    const user = t.withIdentity(
      createTestIdentity(org.clerkUserId, org.clerkOrgId),
    );
    const projectId = await user.mutation(api.projects.create, {
      clientId: org.clientId,
      title: "Edge series",
      projectType: "recurring",
      status: "planned",
      startDate: START,
      recurrenceRule: {
        frequency: "weekly",
        interval,
        end: { kind: "count", count },
      },
    });
    const project = await t.run((ctx) => ctx.db.get(projectId));
    const seriesId = project!.recurringSeriesId!;
    const taskId = await user.mutation(api.tasks.create, {
      clientId: org.clientId,
      projectId,
      type: "external",
      title: "Saved edge task",
      date: START,
      status: "pending",
      assigneeUserId: org.userId,
    });
    return { ...org, user, projectId, seriesId, taskId };
  }

  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function visits(f: Fixture) {
    return await t.run((ctx) =>
      ctx.db
        .query("projects")
        .withIndex("by_series_start", (q) =>
          q.eq("recurringSeriesId", f.seriesId),
        )
        .collect(),
    );
  }

  async function projectTasks(projectId: Id<"projects">) {
    return await t.run((ctx) =>
      ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
    );
  }

  async function copy(f: Fixture, taskId = f.taskId) {
    const preview = await f.user.query(api.projectSeriesTasks.previewCopy, {
      taskId,
    });
    return await f.user.mutation(api.projectSeriesTasks.copy, {
      taskId,
      expectedRevision: preview.revision,
    });
  }

  async function savedTemplate(f: Fixture) {
    const setup = await f.user.query(api.projectSeriesTasks.getSetup, {
      projectId: f.projectId,
    });
    return setup!.templates[0];
  }

  it("preserves a copy moved to another project and never refills its original slot", async () => {
    const f = await fixture(4);
    await copy(f);
    const rows = await visits(f);
    const originalProject = rows[1];
    const destinationProject = rows[2];
    const moved = (await projectTasks(originalProject._id))[0];

    await f.user.mutation(api.tasks.update, {
      id: moved._id,
      projectId: destinationProject._id,
      title: "Moved visit task",
    });
    await f.user.mutation(api.tasks.update, {
      id: f.taskId,
      title: "New setup title",
    });
    await copy(f);

    expect(await projectTasks(originalProject._id)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(moved._id))).toMatchObject({
      projectId: destinationProject._id,
      title: "Moved visit task",
    });
    const ledgers = await t.run((ctx) =>
      ctx.db
        .query("projectTaskCopies")
        .withIndex("by_task", (q) => q.eq("taskId", moved._id))
        .collect(),
    );
    expect(ledgers[0]).toMatchObject({
      projectId: originalProject._id,
      protected: true,
      state: "materialized",
    });
  });

  it("reuses provenance when a later copied task becomes the source and affects only later visits", async () => {
    const f = await fixture(5);
    await copy(f);
    const rows = await visits(f);
    const earlier = (await projectTasks(rows[1]._id))[0];
    const laterSource = (await projectTasks(rows[2]._id))[0];
    await f.user.mutation(api.tasks.update, {
      id: laterSource._id,
      title: "Only after this visit",
    });

    await copy(f, laterSource._id);
    await copy(f, laterSource._id);

    expect((await projectTasks(rows[1]._id))[0]._id).toBe(earlier._id);
    expect((await projectTasks(rows[1]._id))[0].title).toBe("Saved edge task");
    expect((await projectTasks(rows[2]._id))[0].title).toBe(
      "Only after this visit",
    );
    for (const row of rows.slice(3)) {
      const copied = await projectTasks(row._id);
      expect(copied).toHaveLength(1);
      expect(copied[0].title).toBe("Only after this visit");
    }
    expect(
      await t.run(
        async (ctx) =>
          (
            await ctx.db
              .query("projectTaskTemplates")
              .withIndex("by_series", (q) => q.eq("seriesId", f.seriesId))
              .collect()
          ).length,
      ),
    ).toBe(1);
  });

  it("removes paused copies permanently before the series resumes", async () => {
    const f = await fixture(5);
    await copy(f);
    const pause = await f.user.query(api.projectSeries.previewLifecycle, {
      seriesId: f.seriesId,
      action: "pause",
    });
    await f.user.mutation(api.projectSeries.lifecycle, {
      seriesId: f.seriesId,
      action: "pause",
      expectedVersion: pause.revision,
    });
    const template = await savedTemplate(f);
    const removal = await f.user.query(api.projectSeriesTasks.previewRemoval, {
      templateId: template._id,
    });
    expect(removal.removeCount).toBeGreaterThan(0);
    await f.user.mutation(api.projectSeriesTasks.remove, {
      templateId: template._id,
      expectedRevision: removal.revision,
    });
    const resume = await f.user.query(api.projectSeries.previewLifecycle, {
      seriesId: f.seriesId,
      action: "resume",
    });
    await f.user.mutation(api.projectSeries.lifecycle, {
      seriesId: f.seriesId,
      action: "resume",
      expectedVersion: resume.revision,
    });

    for (const row of (await visits(f)).slice(1)) {
      expect(await projectTasks(row._id)).toEqual([]);
    }
    expect((await savedTemplate(f)).active).toBe(false);
  });

  it("keeps a negative offset relative to a manually moved target start date", async () => {
    const f = await fixture(3);
    await f.user.mutation(api.tasks.update, {
      id: f.taskId,
      date: START - DAY,
    });
    const rows = await visits(f);
    const target = rows[1];
    const movedStart = target.startDate! + 2 * DAY;
    await f.user.mutation(api.projects.update, {
      id: target._id,
      startDate: movedStart,
    });

    await copy(f);

    expect((await projectTasks(target._id))[0].date).toBe(movedStart - DAY);
  });

  it("omits a departed assignee from tasks generated after membership deletion", async () => {
    const f = await fixture(4, 8);
    const assignee = await t.run((ctx) =>
      addMemberToOrg(ctx, f.orgId, { clerkUserId: "departing_task_assignee" }),
    );
    await f.user.mutation(api.tasks.update, {
      id: f.taskId,
      assigneeUserId: assignee.userId,
    });
    await copy(f);
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", f.orgId).eq("userId", assignee.userId),
        )
        .unique();
      await ctx.db.delete(membership!._id);
    });
    vi.setSystemTime(NOW + 60 * DAY);
    await t.mutation(internal.projectSeries.generate, {
      orgId: f.orgId,
      seriesId: f.seriesId,
    });
    const later = (await visits(f)).find(
      (project) => project.startDate === START + 112 * DAY,
    )!;

    expect((await projectTasks(later._id))[0].assigneeUserId).toBeUndefined();
  });

  it("protects a copied task changed through a generic wrapped database writer", async () => {
    const f = await fixture(3);
    await copy(f);
    const target = (await visits(f))[1];
    const copied = (await projectTasks(target._id))[0];
    await t.run(async (ctx) => {
      const db = triggers.wrapDB(ctx).db;
      await db.patch(copied._id, { title: "Generic writer exception" });
    });
    await f.user.mutation(api.tasks.update, {
      id: f.taskId,
      title: "New template value",
    });
    await copy(f);

    expect(await t.run((ctx) => ctx.db.get(copied._id))).toMatchObject({
      title: "Generic writer exception",
    });
    const ledger = await t.run((ctx) =>
      ctx.db
        .query("projectTaskCopies")
        .withIndex("by_task", (q) => q.eq("taskId", copied._id))
        .unique(),
    );
    expect(ledger?.protected).toBe(true);
  });

  it("allows copying with modify permission but requires delete permission for removal", async () => {
    const f = await fixture(3);
    const member = await t.run((ctx) =>
      addMemberToOrg(ctx, f.orgId, {
        clerkUserId: "task_copy_modifier",
        role: "member",
      }),
    );
    const setPermissions = async (taskLevel: "modify" | "delete") => {
      await t.run(async (ctx) => {
        const membership = await ctx.db
          .query("organizationMemberships")
          .withIndex("by_org_user", (q) =>
            q.eq("orgId", f.orgId).eq("userId", member.userId),
          )
          .unique();
        await ctx.db.patch(membership!._id, {
          permissions: {
            projects: { level: "modify", allRecords: true },
            tasks: { level: taskLevel, allRecords: true },
          },
        });
      });
    };
    const asMember = t.withIdentity(
      createTestIdentity(member.clerkUserId, f.clerkOrgId),
    );
    await setPermissions("modify");
    const preview = await asMember.query(api.projectSeriesTasks.previewCopy, {
      taskId: f.taskId,
    });
    await asMember.mutation(api.projectSeriesTasks.copy, {
      taskId: f.taskId,
      expectedRevision: preview.revision,
    });
    const template = await savedTemplate(f);
    await expect(
      asMember.query(api.projectSeriesTasks.previewRemoval, {
        templateId: template._id,
      }),
    ).rejects.toThrow();

    await setPermissions("delete");
    expect(
      await asMember.query(api.projectSeriesTasks.previewRemoval, {
        templateId: template._id,
      }),
    ).toMatchObject({ removeCount: 2 });
  });

  it("caps one generator mutation at 200 task materializations and finishes without duplicates", async () => {
    const f = await fixture(30);
    for (let index = 0; index < 50; index++) {
      const taskId = await f.user.mutation(api.tasks.create, {
        clientId: f.clientId,
        projectId: f.projectId,
        type: "external",
        title: `Generated setup ${index + 1}`,
        date: START,
        status: "pending",
      });
      await copy(f, taskId);
    }
    const before = await t.run(async (ctx) => ({
      projects: (
        await ctx.db
          .query("projects")
          .withIndex("by_series_start", (q) =>
            q.eq("recurringSeriesId", f.seriesId),
          )
          .collect()
      ).length,
      tasks: (await ctx.db.query("tasks").collect()).length,
      ledgers: (await ctx.db.query("projectTaskCopies").collect()).filter(
        (ledger) => ledger.seriesId === f.seriesId,
      ).length,
    }));
    expect(before.projects).toBe(13);

    vi.setSystemTime(NOW + 100 * DAY);
    const first = await t.mutation(internal.projectSeries.generate, {
      orgId: f.orgId,
      seriesId: f.seriesId,
    });
    expect(first.created).toBe(4);
    expect(first.remaining).toBeGreaterThan(0);
    expect(
      await t.run(
        async (ctx) => (await ctx.db.query("tasks").collect()).length,
      ),
    ).toBe(before.tasks + 200);

    let created = first.created;
    let remaining = first.remaining;
    while (remaining > 0) {
      const next = await t.mutation(internal.projectSeries.generate, {
        orgId: f.orgId,
        seriesId: f.seriesId,
      });
      created += next.created;
      remaining = next.remaining;
    }
    expect(
      await t.mutation(internal.projectSeries.generate, {
        orgId: f.orgId,
        seriesId: f.seriesId,
      }),
    ).toEqual({ created: 0, remaining: 0 });

    const result = await t.run(async (ctx) => {
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_series_start", (q) =>
          q.eq("recurringSeriesId", f.seriesId),
        )
        .collect();
      const templates = await ctx.db
        .query("projectTaskTemplates")
        .withIndex("by_series", (q) => q.eq("seriesId", f.seriesId))
        .collect();
      const ledgers = await ctx.db.query("projectTaskCopies").collect();
      const tasks = await ctx.db.query("tasks").collect();
      return {
        projects,
        templates,
        ledgers: ledgers.filter((ledger) => ledger.seriesId === f.seriesId),
        tasks,
      };
    });
    expect(result.projects).toHaveLength(before.projects + created);
    expect(result.templates).toHaveLength(50);
    expect(result.ledgers).toHaveLength(before.ledgers + created * 50);
    expect(result.tasks).toHaveLength(before.tasks + created * 50);
    expect(
      result.tasks.filter((task) => task.projectTaskTemplateId !== undefined),
    ).toHaveLength(result.ledgers.length);
    expect(
      new Set(
        result.ledgers.map(
          (ledger) => `${ledger.templateId}:${ledger.projectId}`,
        ),
      ).size,
    ).toBe(result.ledgers.length);
    expect(new Set(result.ledgers.map((ledger) => ledger.taskId)).size).toBe(
      result.ledgers.length,
    );
  }, 20_000);

  it("preserves pending copies when their project has begun or completed work", async () => {
    const f = await fixture(5);
    await copy(f);
    const rows = (await visits(f)).slice(1);
    const selectedCopies = await Promise.all(
      rows.map(async (project) => (await projectTasks(project._id))[0]),
    );
    await f.user.mutation(api.tasks.create, {
      clientId: f.clientId,
      projectId: rows[0]._id,
      type: "external",
      title: "Begun sibling",
      date: rows[0].startDate!,
      status: "in-progress",
    });
    await f.user.mutation(api.tasks.create, {
      clientId: f.clientId,
      projectId: rows[1]._id,
      type: "external",
      title: "Completed sibling",
      date: rows[1].startDate!,
      status: "completed",
    });
    await f.user.mutation(api.projects.update, {
      id: rows[2]._id,
      status: "completed",
    });

    const template = await savedTemplate(f);
    const preview = await f.user.query(api.projectSeriesTasks.previewRemoval, {
      templateId: template._id,
    });
    expect(preview).toMatchObject({ removeCount: 1, preservedCount: 3 });
    await f.user.mutation(api.projectSeriesTasks.remove, {
      templateId: template._id,
      expectedRevision: preview.revision,
    });

    for (let index = 0; index < 3; index++) {
      expect(
        await t.run((ctx) => ctx.db.get(selectedCopies[index]._id)),
      ).toMatchObject({
        status: "pending",
        projectId: rows[index]._id,
      });
    }
    expect(await t.run((ctx) => ctx.db.get(selectedCopies[3]._id))).toBeNull();
  });
});
