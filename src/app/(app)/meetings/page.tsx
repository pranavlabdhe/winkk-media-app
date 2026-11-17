import Link from "next/link";
import { revalidatePath } from "next/cache";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import { taskCategoryLabel, taskPriorityLabel } from "@/lib/constants";
import {
  ensureTaskForModule,
  getLinkableTasks,
  linkModuleToTask,
  logActivity,
  syncModuleToTask,
} from "@/lib/activity-service";
import TaskPriorityBadge from "@/components/task-priority-badge";

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
              t.priority linked_task_priority,
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

  const statusBadges: Record<string, { label: string; badge: string }> = {
    upcoming: { label: "Upcoming", badge: "bg-blue-50 text-blue-800 border-blue-200 font-semibold" },
    completed: { label: "Completed", badge: "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold" },
    cancelled: { label: "Cancelled", badge: "bg-slate-100 text-slate-500 border-slate-200" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#12143d] text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#12143d]">
              Client Meetings &amp; Strategy Reviews
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Schedule reviews, record agenda notes, and provision follow-up execution tasks directly from meetings.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-2xs">
            Total Meetings: <b className="text-[#12143d]">{rows.length}</b>
          </div>
        </div>
      </div>

      {taskFilter && (
        <div className="flex items-center justify-between rounded-xl border border-[#ed8527]/30 bg-orange-50/60 px-4 py-3 text-xs sm:text-sm text-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ed8527] text-white text-[10px] font-bold">
              i
            </span>
            Filtering meeting linked to Task <span className="font-bold text-[#12143d]">#{taskFilter}</span>.
          </div>
          <Link
            href="/meetings"
            className="rounded-lg bg-white border border-slate-200 px-3 py-1 text-xs font-semibold text-[#12143d] hover:bg-slate-50 shadow-2xs"
          >
            Show All Meetings
          </Link>
        </div>
      )}

      {/* Schedule Meeting Form Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#ed8527]/10 text-[#ed8527]">
              +
            </span>
            <h2 className="text-sm font-bold text-[#12143d]">
              Schedule a Client Meeting
            </h2>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Automatically connects to task board &amp; activity timeline
          </span>
        </div>

        <form action={createMeeting} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Meeting Title / Subject <span className="text-rose-500">*</span>
              </label>
              <input
                name="title"
                required
                placeholder="e.g. Monthly Performance & Diwali Campaign Review"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Meeting Date &amp; Time <span className="text-rose-500">*</span>
              </label>
              <input
                name="meeting_at"
                type="datetime-local"
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Status
              </label>
              <select
                name="status"
                defaultValue="upcoming"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              >
                {["upcoming", "completed", "cancelled"].map((s) => (
                  <option key={s} value={s}>
                    {statusBadges[s]?.label || s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Meeting Task Owner
              </label>
              <select
                name="owner_id"
                defaultValue={session?.id || ""}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              >
                <option value="">Auto-assign to session user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                    {user.job_title ? ` · ${user.job_title}` : ""}
                  </option>
                ))}
              </select>
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
                <option value="">Auto-provision meeting task</option>
                {linkableTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    #{task.id}: {task.title} · {task.client_name || "Internal"} · {taskPriorityLabel(task.priority)} priority
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Agenda &amp; Discussion Points
            </label>
            <textarea
              name="discussion_notes"
              rows={2}
              placeholder="Key discussion topics, review slides, decisions..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="w-full sm:w-auto rounded-xl bg-[#ed8527] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 hover:bg-[#d97116] transition-all cursor-pointer"
            >
              + Schedule Meeting
            </button>
          </div>
        </form>
      </div>

      {/* Meetings List */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 px-1">
          Meetings Schedule ({rows.length})
        </h3>

        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((m) => {
            const st = statusBadges[m.status] || {
              label: m.status,
              badge: "bg-slate-100 text-slate-700 border-slate-200",
            };

            return (
              <div
                key={m.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-slate-300 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">{m.title}</h4>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Client: <b className="text-[#12143d]">{m.client_name}</b> ·{" "}
                      <span className="font-medium text-slate-700">{m.meeting_at}</span>
                    </div>
                  </div>

                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${st.badge}`}
                  >
                    {st.label}
                  </span>
                </div>

                {m.discussion_notes && (
                  <p className="text-xs sm:text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap">
                    {m.discussion_notes}
                  </p>
                )}

                {/* Linked Meeting Task */}
                {m.linked_task_id && (
                  <div className="text-xs rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 flex items-center justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-600">Meeting Task:</span>{" "}
                        <Link
                          href={`/tasks?task=${m.linked_task_id}`}
                          className="font-bold text-[#12143d] hover:text-[#ed8527]"
                        >
                          #{m.linked_task_id} {m.linked_task_title}
                        </Link>
                        <TaskPriorityBadge priority={m.linked_task_priority} />
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {m.linked_task_assignee} · {m.linked_task_status}
                    </span>
                  </div>
                )}

                {/* Follow-up Tasks */}
                <div className="rounded-xl border border-slate-100 bg-white p-3 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Follow-up Action Items ({(followUpsByParent[m.linked_task_id] || []).length})
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {(followUpsByParent[m.linked_task_id] || []).map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-slate-700"
                      >
                        <Link
                          href={`/tasks?task=${task.id}`}
                          className="font-semibold text-[#12143d] hover:text-[#ed8527]"
                        >
                          #{task.id} {task.title}
                        </Link>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <TaskPriorityBadge priority={task.priority} />
                          <span>
                            {task.assignee_name} · {task.status.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                    ))}
                    {!(followUpsByParent[m.linked_task_id] || []).length && (
                      <p className="text-xs text-slate-400 italic">
                        No follow-up action tasks created yet.
                      </p>
                    )}
                  </div>

                  {/* Create follow-up action form */}
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer font-semibold text-[#ed8527] hover:underline">
                      + Add Follow-up Action Item
                    </summary>
                    <form
                      action={createFollowUpTask}
                      className="mt-2 grid gap-2 rounded-xl bg-slate-50 p-3 border border-slate-200/80 sm:grid-cols-3"
                    >
                      <input type="hidden" name="meeting_id" value={m.id} />
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                          Follow-up Task Title *
                        </label>
                        <input
                          name="title"
                          required
                          placeholder="e.g. Revise menu pricing deck based on discussion"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                          Assignee
                        </label>
                        <select
                          name="assigned_to"
                          defaultValue={session?.id || ""}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                        >
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                          Due Date
                        </label>
                        <input
                          name="due_date"
                          type="date"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-[#12143d] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer"
                        >
                          Create Follow-up
                        </button>
                      </div>
                    </form>
                  </details>
                </div>

                {/* Inline Meeting Update Form */}
                <form
                  action={updateMeeting}
                  className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs"
                >
                  <input type="hidden" name="id" value={m.id} />
                  <select
                    name="status"
                    defaultValue={m.status}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium"
                  >
                    {["upcoming", "completed", "cancelled"].map((s) => (
                      <option key={s} value={s}>
                        {statusBadges[s]?.label || s}
                      </option>
                    ))}
                  </select>
                  <input
                    name="discussion_notes"
                    defaultValue={m.discussion_notes || ""}
                    placeholder="Update discussion minutes..."
                    className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[#12143d] px-3 py-1 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer"
                  >
                    Save
                  </button>
                </form>
              </div>
            );
          })}

          {!rows.length && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-xs text-slate-500">
              No meetings scheduled yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
