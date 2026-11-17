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
  for (const path of ["/meetings", "/tasks", "/my-work", "/dashboard", "/clients"]) {
    revalidatePath(path);
  }
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

async function createMeeting(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) return;
  const client_id = Number(formData.get("client_id"));
  const title = String(formData.get("title") || "").trim();
  const meeting_at = String(formData.get("meeting_at") || "");
  if (!client_id || !title || !meeting_at) return;

  const result = db
    .prepare(
      "INSERT INTO meetings (client_id,title,meeting_at,status,discussion_notes) VALUES (?,?,?,?,?)"
    )
    .run(
      client_id,
      title,
      meeting_at,
      String(formData.get("status") || "upcoming"),
      String(formData.get("discussion_notes") || "") || null
    );
  const meetingId = Number(result.lastInsertRowid);
  const selectedTask = Number(formData.get("task_id"));
  const taskId = selectedTask
    ? (linkModuleToTask("meeting", meetingId, selectedTask, session.id), selectedTask)
    : ensureTaskForModule("meeting", meetingId, session.id);

  const ownerId = Number(formData.get("owner_id"));
  if (taskId && ownerId) {
    db.prepare("UPDATE tasks SET assigned_to=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
      ownerId,
      taskId
    );
    const owner = db.prepare("SELECT name FROM users WHERE id=?").get(ownerId) as any;
    db.prepare("INSERT INTO task_updates (task_id,user_id,note) VALUES (?,?,?)").run(
      taskId,
      session.id,
      `Meeting task assigned to ${owner?.name || "team member"} by ${session.name}.`
    );
  }

  logActivity({
    clientId: client_id,
    taskId,
    entityType: "meeting",
    entityId: meetingId,
    action: "created",
    summary: `Meeting "${title}" scheduled for ${meeting_at}.`,
    userId: session.id,
  });
  refreshUnified(client_id);
}

async function updateMeeting(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const current = db.prepare("SELECT * FROM meetings WHERE id=?").get(id) as any;
  if (!current) return;

  const nextStatus = String(formData.get("status") || "upcoming");
  db.prepare("UPDATE meetings SET status=?, discussion_notes=? WHERE id=?").run(
    nextStatus,
    String(formData.get("discussion_notes") || "") || null,
    id
  );
  const taskId = syncModuleToTask("meeting", id, session.id, {
    statusChanged: current.status !== nextStatus,
  });
  logActivity({
    clientId: current.client_id,
    taskId,
    entityType: "meeting",
    entityId: id,
    action: "updated",
    summary: `Meeting "${current.title}" updated to ${nextStatus}.`,
    userId: session.id,
  });
  refreshUnified(current.client_id);
}

async function createFollowUpTask(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) return;
  const meetingId = Number(formData.get("meeting_id"));
  const title = String(formData.get("title") || "").trim();
  const assignedTo = Number(formData.get("assigned_to")) || session.id;
  if (!meetingId || !title) return;

  const meeting = db.prepare("SELECT * FROM meetings WHERE id=?").get(meetingId) as any;
  if (!meeting) return;

  const result = db
    .prepare(
      `INSERT INTO tasks
        (title,description,client_id,assigned_to,assigned_by,status,category,due_date,origin_module,follow_up_of_task_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      title,
      String(formData.get("description") || "") || `Follow-up from meeting "${meeting.title}".`,
      meeting.client_id,
      assignedTo,
      session.id,
      "todo",
      "other",
      String(formData.get("due_date") || "") || null,
      "tasks",
      meeting.task_id || null
    );
  const followUpId = Number(result.lastInsertRowid);
  const assignee = db.prepare("SELECT name FROM users WHERE id=?").get(assignedTo) as any;

  db.prepare("INSERT INTO task_updates (task_id,user_id,note) VALUES (?,?,?)").run(
    followUpId,
    session.id,
    `Follow-up from meeting "${meeting.title}" assigned to ${assignee?.name || "team member"}.`
  );
  logActivity({
    clientId: meeting.client_id,
    taskId: followUpId,
    entityType: "task",
    entityId: followUpId,
    action: "created",
    summary: `Follow-up task "${title}" created from meeting "${meeting.title}".`,
    userId: session.id,
  });
  refreshUnified(meeting.client_id);
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; task?: string }>;
}) {
  const session = await getSession();
  const sp = await searchParams;
  const clientFilter = sp.client ? Number(sp.client) : null;
  const taskFilter = sp.task ? Number(sp.task) : null;
  const clients = db.prepare("SELECT id,name FROM clients ORDER BY name").all() as any[];
  const users = db
    .prepare("SELECT id,name,job_title FROM users WHERE is_active=1 ORDER BY name")
    .all() as any[];
  const linkableTasks = getLinkableTasks("meeting");

  const where: string[] = [];
  const params: unknown[] = [];
  if (taskFilter) {
    where.push("m.task_id = ?");
    params.push(taskFilter);
  } else if (clientFilter) {
    where.push("m.client_id = ?");
    params.push(clientFilter);
  }

  const rows = db
    .prepare(
      `SELECT m.*, c.name client_name,
              t.id linked_task_id, t.title linked_task_title, t.status linked_task_status,
              t.due_date linked_task_due, u.name linked_task_assignee
       FROM meetings m
       JOIN clients c ON c.id=m.client_id
       LEFT JOIN tasks t ON t.id=m.task_id
       LEFT JOIN users u ON u.id=t.assigned_to
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY m.meeting_at DESC`
    )
    .all(...params) as any[];

  const meetingTaskIds = rows.map((row) => row.linked_task_id).filter(Boolean) as number[];
  let followUps: any[] = [];
  if (meetingTaskIds.length) {
    followUps = db
      .prepare(
        `SELECT t.*, u.name assignee_name FROM tasks t JOIN users u ON u.id=t.assigned_to
         WHERE t.follow_up_of_task_id IN (${meetingTaskIds.map(() => "?").join(",")})
         ORDER BY t.created_at DESC`
      )
      .all(...meetingTaskIds) as any[];
  }
  const followUpsByParent: Record<number, any[]> = {};
  for (const task of followUps) (followUpsByParent[task.follow_up_of_task_id] ||= []).push(task);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Owner&apos;s Client Meeting Scheduler</h1>
        <p className="text-sm">
          Meetings are connected to a task, owner, status, and activity timeline. Outcomes can create
          follow-up tasks without leaving this page.
        </p>
      </div>

      {taskFilter && (
        <div className="rounded border bg-white p-2 text-sm">
          Showing meeting linked to task #{taskFilter}.{" "}
          <Link href="/meetings" className="underline">
            Show all meetings
          </Link>
        </div>
      )}

      <form action={createMeeting} className="grid gap-2 rounded-lg border bg-white p-4 md:grid-cols-4">
        <select name="client_id" required className="rounded border px-3 py-2" defaultValue={clientFilter || ""}>
          <option value="">Client *</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input name="title" required placeholder="Meeting title *" className="rounded border px-3 py-2" />
        <input name="meeting_at" type="datetime-local" required className="rounded border px-3 py-2" />
        <select name="status" className="rounded border px-3 py-2">
          {["upcoming", "completed", "cancelled"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select name="owner_id" className="rounded border px-3 py-2">
          <option value="">Task owner: automatic</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
              {user.job_title ? ` · ${user.job_title}` : ""}
            </option>
          ))}
        </select>
        <select name="task_id" className="rounded border px-3 py-2 md:col-span-3">
          <option value="">Create/link task automatically</option>
          {linkableTasks.map((task) => (
            <option key={task.id} value={task.id}>
              Link to task: {task.title} · {task.client_name || "Internal"} · {taskCategoryLabel(task.category)}
            </option>
          ))}
        </select>
        <textarea
          name="discussion_notes"
          placeholder="Agenda / discussion notes"
          className="rounded border px-3 py-2 md:col-span-4"
        />
        <button className="rounded px-3 py-2 md:col-span-4">Schedule meeting</button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((m) => (
          <div key={m.id} className="rounded-lg border bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{m.title}</div>
                <div className="text-sm">
                  {m.client_name} · {m.meeting_at}
                </div>
                <div className="mt-1 text-xs">
                  {m.linked_task_id ? (
                    <Link href={`/tasks?task=${m.linked_task_id}`} className="underline">
                      Linked task: {m.linked_task_title} · {m.linked_task_status} · Due{" "}
                      {m.linked_task_due || "-"} · {m.linked_task_assignee || "Unassigned"}
                    </Link>
                  ) : (
                    "No linked task"
                  )}
                </div>
              </div>
              <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium">{m.status}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{m.discussion_notes || "No notes yet."}</p>

            <form action={updateMeeting} className="mt-3 space-y-2">
              <input type="hidden" name="id" value={m.id} />
              <select name="status" defaultValue={m.status} className="rounded border px-2 py-1 text-sm">
                {["upcoming", "completed", "cancelled"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <textarea
                name="discussion_notes"
                defaultValue={m.discussion_notes || ""}
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder="Discussion notes / decisions"
              />
              <button className="rounded border px-2 py-1 text-sm">Update meeting</button>
            </form>

            <div className="mt-3 border-t pt-2">
              <div className="text-sm font-medium">Follow-up tasks</div>
              <ul className="mt-1 space-y-1 text-sm">
                {(followUpsByParent[m.linked_task_id] || []).map((task) => (
                  <li key={task.id}>
                    •{" "}
                    <Link href={`/tasks?task=${task.id}`} className="underline">
                      {task.title}
                    </Link>{" "}
                    — {task.assignee_name} · {task.status.replace("_", " ")}
                    {task.due_date ? ` · due ${task.due_date}` : ""}
                  </li>
                ))}
                {!(followUpsByParent[m.linked_task_id] || []).length && (
                  <li className="text-zinc-500">No follow-up tasks yet.</li>
                )}
              </ul>
              <form action={createFollowUpTask} className="mt-2 grid gap-1 md:grid-cols-2">
                <input type="hidden" name="meeting_id" value={m.id} />
                <input
                  name="title"
                  required
                  placeholder="Follow-up task title"
                  className="rounded border px-2 py-1 text-sm md:col-span-2"
                />
                <select name="assigned_to" defaultValue={session?.id || ""} className="rounded border px-2 py-1 text-sm">
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <input name="due_date" type="date" className="rounded border px-2 py-1 text-sm" />
                <button className="rounded px-2 py-1 text-sm md:col-span-2">Create follow-up task</button>
              </form>
            </div>
          </div>
        ))}
        {!rows.length && (
          <div className="rounded-lg border bg-white p-4 text-zinc-500">No meetings yet.</div>
        )}
      </div>
    </div>
  );
}
