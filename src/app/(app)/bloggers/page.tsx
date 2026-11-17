import Link from "next/link";
import { revalidatePath } from "next/cache";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import { taskCategoryLabel } from "@/lib/constants";
import {
  ensureTaskForModule,
  getLinkableTasks,
  linkModuleToTask,
  logActivity,
  syncModuleToTask,
} from "@/lib/activity-service";

function refreshUnified(clientId?: number | null) {
  for (const path of ["/bloggers", "/tasks", "/my-work", "/dashboard", "/clients"]) {
    revalidatePath(path);
  }
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

async function createBlogger(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) return;
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const result = db
    .prepare("INSERT INTO bloggers (name,handle,contact) VALUES (?,?,?)")
    .run(
      name,
      String(formData.get("handle") || "") || null,
      String(formData.get("contact") || "") || null
    );
  logActivity({
    entityType: "blogger",
    entityId: Number(result.lastInsertRowid),
    action: "created",
    summary: `Blogger "${name}" added to the influencer directory.`,
    userId: session.id,
  });
  revalidatePath("/bloggers");
}

async function createAssignment(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) return;
  const blogger_id = Number(formData.get("blogger_id"));
  const client_id = Number(formData.get("client_id"));
  if (!blogger_id || !client_id) return;

  const result = db
    .prepare(
      `INSERT INTO blogger_assignments (blogger_id,client_id,scheduled_date,assignment_status,completion_status,notes)
       VALUES (?,?,?,?,?,?)`
    )
    .run(
      blogger_id,
      client_id,
      String(formData.get("scheduled_date") || "") || null,
      String(formData.get("assignment_status") || "assigned"),
      String(formData.get("completion_status") || "not_started"),
      String(formData.get("notes") || "") || null
    );
  const assignmentId = Number(result.lastInsertRowid);
  const selectedTask = Number(formData.get("task_id"));
  const taskId = selectedTask
    ? (linkModuleToTask("blogger_assignment", assignmentId, selectedTask, session.id), selectedTask)
    : ensureTaskForModule("blogger_assignment", assignmentId, session.id);

  logActivity({
    clientId: client_id,
    taskId,
    entityType: "blogger_assignment",
    entityId: assignmentId,
    action: "created",
    summary: `Blogger assignment created for blogger #${blogger_id}.`,
    userId: session.id,
  });
  refreshUnified(client_id);
}

async function updateAssignment(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const current = db.prepare("SELECT * FROM blogger_assignments WHERE id=?").get(id) as any;
  if (!current) return;

  const nextAssignment = String(formData.get("assignment_status") || "assigned");
  const nextCompletion = String(formData.get("completion_status") || "not_started");
  db.prepare(
    `UPDATE blogger_assignments SET scheduled_date=?, assignment_status=?, completion_status=?, notes=? WHERE id=?`
  ).run(
    String(formData.get("scheduled_date") || "") || null,
    nextAssignment,
    nextCompletion,
    String(formData.get("notes") || "") || null,
    id
  );
  const taskId = syncModuleToTask("blogger_assignment", id, session.id, {
    statusChanged:
      current.assignment_status !== nextAssignment || current.completion_status !== nextCompletion,
  });
  logActivity({
    clientId: current.client_id,
    taskId,
    entityType: "blogger_assignment",
    entityId: id,
    action: "updated",
    summary: `Blogger assignment updated to ${nextAssignment}/${nextCompletion}.`,
    userId: session.id,
  });
  refreshUnified(current.client_id);
}

export default async function BloggersPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; task?: string }>;
}) {
  const sp = await searchParams;
  const clientFilter = sp.client ? Number(sp.client) : null;
  const taskFilter = sp.task ? Number(sp.task) : null;
  const bloggers = db.prepare("SELECT * FROM bloggers ORDER BY name").all() as any[];
  const clients = db.prepare("SELECT id,name FROM clients ORDER BY name").all() as any[];
  const linkableTasks = getLinkableTasks("blogger_assignment");

  const where: string[] = [];
  const params: unknown[] = [];
  if (taskFilter) {
    where.push("ba.task_id = ?");
    params.push(taskFilter);
  } else if (clientFilter) {
    where.push("ba.client_id = ?");
    params.push(clientFilter);
  }

  const assigns = db
    .prepare(
      `SELECT ba.*, b.name blogger_name, b.handle blogger_handle, c.name client_name,
              t.id linked_task_id, t.title linked_task_title, t.status linked_task_status,
              t.due_date linked_task_due, u.name linked_task_assignee
       FROM blogger_assignments ba
       JOIN bloggers b ON b.id=ba.blogger_id
       JOIN clients c ON c.id=ba.client_id
       LEFT JOIN tasks t ON t.id=ba.task_id
       LEFT JOIN users u ON u.id=t.assigned_to
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY ba.scheduled_date DESC, ba.created_at DESC`
    )
    .all(...params) as any[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#12143d] text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#12143d]">
              Influencer &amp; Blogger Collaborations
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Manage food blogger outreach, scheduled tasting visits, deliverables, and linked task deadlines.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-2xs">
            Influencers: <b className="text-[#12143d]">{bloggers.length}</b>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-2xs">
            Campaigns: <b className="text-[#12143d]">{assigns.length}</b>
          </div>
        </div>
      </div>

      {taskFilter && (
        <div className="flex items-center justify-between rounded-xl border border-[#ed8527]/30 bg-orange-50/60 px-4 py-3 text-xs sm:text-sm text-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ed8527] text-white text-[10px] font-bold">
              i
            </span>
            Filtering assignment linked to Task <span className="font-bold text-[#12143d]">#{taskFilter}</span>.
          </div>
          <Link
            href="/bloggers"
            className="rounded-lg bg-white border border-slate-200 px-3 py-1 text-xs font-semibold text-[#12143d] hover:bg-slate-50 shadow-2xs"
          >
            Show All Assignments
          </Link>
        </div>
      )}

      {/* Forms Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Add Blogger Profile */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-[#12143d]">
              + Add Influencer to Directory
            </h2>
            <span className="text-[11px] text-slate-400">Roster management</span>
          </div>

          <form action={createBlogger} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Influencer / Blogger Name <span className="text-rose-500">*</span>
              </label>
              <input
                name="name"
                required
                placeholder="e.g. Neha Sharma (FoodieVibes)"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Social Handle / URL
                </label>
                <input
                  name="handle"
                  placeholder="@stylebyneha"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact / Phone / Email
                </label>
                <input
                  name="contact"
                  placeholder="+91 9876543210"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400 line-clamp-1">
                Existing: {bloggers.map((b) => b.name).join(", ") || "None"}
              </span>
              <button
                type="submit"
                className="rounded-xl bg-[#12143d] px-4 py-2 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer shadow-2xs shrink-0"
              >
                Save Influencer
              </button>
            </div>
          </form>
        </div>

        {/* Schedule Assignment */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-[#12143d]">
              + Schedule Client Collaboration
            </h2>
            <span className="text-[11px] text-slate-400">Links to client task</span>
          </div>

          <form action={createAssignment} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Influencer <span className="text-rose-500">*</span>
                </label>
                <select
                  name="blogger_id"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                >
                  <option value="">Select influencer *</option>
                  {bloggers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client Account <span className="text-rose-500">*</span>
                </label>
                <select
                  name="client_id"
                  required
                  defaultValue={clientFilter || ""}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                >
                  <option value="">Select client *</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Visit / Collab Date
                </label>
                <input
                  name="scheduled_date"
                  type="date"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assignment Status
                </label>
                <select
                  name="assignment_status"
                  defaultValue="assigned"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                >
                  {["assigned", "in_progress", "completed", "cancelled"].map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Deliverable Status
                </label>
                <select
                  name="completion_status"
                  defaultValue="not_started"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                >
                  {["not_started", "in_progress", "completed"].map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Campaign Deliverables &amp; Notes
              </label>
              <input
                name="notes"
                placeholder="e.g. 1 Reel, 2 Stories covering the new chef tasting menu"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Link to Existing Task (Optional)
              </label>
              <select
                name="task_id"
                defaultValue=""
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              >
                <option value="">Auto-create linked task for collaboration</option>
                {linkableTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    #{task.id}: {task.title} · {task.client_name || "Internal"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="rounded-xl bg-[#ed8527] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 hover:bg-[#d97116] transition-all cursor-pointer"
              >
                + Schedule Collaboration
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Assignments List */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 px-1">
          Active Blogger Campaigns ({assigns.length})
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          {assigns.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-slate-300 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    {a.blogger_name}
                  </h4>
                  <div className="text-xs text-slate-500">
                    Client: <b className="text-[#12143d]">{a.client_name}</b>
                    {a.blogger_handle && <span> · {a.blogger_handle}</span>}
                  </div>
                </div>

                <div className="text-right">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                    {a.assignment_status.replace("_", " ")}
                  </span>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Visit: {a.scheduled_date || "Not set"}
                  </div>
                </div>
              </div>

              {a.notes && (
                <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {a.notes}
                </p>
              )}

              {/* Linked Task Context */}
              {a.linked_task_id && (
                <div className="text-xs rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-600">Task:</span>{" "}
                    <Link
                      href={`/tasks?task=${a.linked_task_id}`}
                      className="font-bold text-[#12143d] hover:text-[#ed8527]"
                    >
                      #{a.linked_task_id} {a.linked_task_title}
                    </Link>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {a.linked_task_assignee} · {a.linked_task_status}
                  </span>
                </div>
              )}

              {/* Inline Update Form */}
              <form
                action={updateAssignment}
                className="grid gap-2 sm:grid-cols-3 pt-2 border-t border-slate-100 text-xs"
              >
                <input type="hidden" name="id" value={a.id} />
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                    Date
                  </label>
                  <input
                    name="scheduled_date"
                    type="date"
                    defaultValue={a.scheduled_date || ""}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                    Assignment
                  </label>
                  <select
                    name="assignment_status"
                    defaultValue={a.assignment_status}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  >
                    {["assigned", "in_progress", "completed", "cancelled"].map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                    Deliverables
                  </label>
                  <select
                    name="completion_status"
                    defaultValue={a.completion_status}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  >
                    {["not_started", "in_progress", "completed"].map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <input
                    name="notes"
                    defaultValue={a.notes || ""}
                    placeholder="Update notes..."
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-[#12143d] px-3 py-1 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer"
                >
                  Save
                </button>
              </form>
            </div>
          ))}

          {!assigns.length && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-xs text-slate-500">
              No blogger collaboration assignments yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
