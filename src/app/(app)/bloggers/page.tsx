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
    .run(name, String(formData.get("handle") || "") || null, String(formData.get("contact") || "") || null);
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
      `SELECT ba.*, b.name blogger_name, c.name client_name,
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Blogger Schedule Tracker</h1>
        <p className="text-sm">
          Blogger collaborations share the same task ownership, deadline, status, and activity timeline as
          the rest of the client work.
        </p>
      </div>

      {taskFilter && (
        <div className="rounded border bg-white p-2 text-sm">
          Showing blogger assignment linked to task #{taskFilter}.{" "}
          <Link href="/bloggers" className="underline">
            Show all assignments
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={createBlogger} className="space-y-2 rounded-lg border bg-white p-4">
          <h2 className="font-medium">Add blogger</h2>
          <input name="name" required placeholder="Blogger name *" className="w-full rounded border px-3 py-2" />
          <input name="handle" placeholder="Handle/profile" className="w-full rounded border px-3 py-2" />
          <input name="contact" placeholder="Contact" className="w-full rounded border px-3 py-2" />
          <button className="rounded px-3 py-2">Add blogger</button>
          <div className="text-sm">Existing: {bloggers.map((b) => b.name).join(", ") || "none"}</div>
        </form>

        <form action={createAssignment} className="space-y-2 rounded-lg border bg-white p-4">
          <h2 className="font-medium">Create assignment</h2>
          <select name="blogger_id" required className="w-full rounded border px-3 py-2">
            <option value="">Blogger *</option>
            {bloggers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            name="client_id"
            required
            className="w-full rounded border px-3 py-2"
            defaultValue={clientFilter || ""}
          >
            <option value="">Client *</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input name="scheduled_date" type="date" className="w-full rounded border px-3 py-2" />
          <div className="grid grid-cols-2 gap-2">
            <select name="assignment_status" className="rounded border px-3 py-2">
              {["assigned", "in_progress", "completed", "cancelled"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select name="completion_status" className="rounded border px-3 py-2">
              {["not_started", "in_progress", "completed"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <input name="notes" placeholder="Notes" className="w-full rounded border px-3 py-2" />
          <select name="task_id" className="w-full rounded border px-3 py-2">
            <option value="">Create/link task automatically</option>
            {linkableTasks.map((task) => (
              <option key={task.id} value={task.id}>
                Link to task: {task.title} · {task.client_name || "Internal"} · {taskCategoryLabel(task.category)}
              </option>
            ))}
          </select>
          <button className="rounded px-3 py-2">Assign blogger</button>
        </form>
      </div>

      <div className="space-y-3">
        {assigns.map((a) => (
          <div key={a.id} className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b>{a.blogger_name}</b> → {a.client_name}
              </div>
              <div className="text-sm">Scheduled: {a.scheduled_date || "-"}</div>
            </div>
            <div className="mt-1 text-xs">
              {a.linked_task_id ? (
                <Link href={`/tasks?task=${a.linked_task_id}`} className="underline">
                  Linked task: {a.linked_task_title} · {a.linked_task_status} · Due{" "}
                  {a.linked_task_due || "-"} · {a.linked_task_assignee || "Unassigned"}
                </Link>
              ) : (
                "No linked task"
              )}
            </div>
            <form action={updateAssignment} className="mt-2 grid gap-2 md:grid-cols-5">
              <input type="hidden" name="id" value={a.id} />
              <input
                name="scheduled_date"
                type="date"
                defaultValue={a.scheduled_date || ""}
                className="rounded border px-2 py-1"
              />
              <select
                name="assignment_status"
                defaultValue={a.assignment_status}
                className="rounded border px-2 py-1"
              >
                {["assigned", "in_progress", "completed", "cancelled"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                name="completion_status"
                defaultValue={a.completion_status}
                className="rounded border px-2 py-1"
              >
                {["not_started", "in_progress", "completed"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <input
                name="notes"
                defaultValue={a.notes || ""}
                placeholder="Notes"
                className="rounded border px-2 py-1"
              />
              <button className="rounded border px-2 py-1">Save</button>
            </form>
          </div>
        ))}
        {!assigns.length && (
          <div className="rounded-lg border bg-white p-4 text-zinc-500">No assignments yet.</div>
        )}
      </div>
    </div>
  );
}
