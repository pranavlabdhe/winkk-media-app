import Link from "next/link";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import { TASK_STATUSES, taskCategoryLabel } from "@/lib/constants";
import { addTaskUpdateAction, updateTaskAction } from "@/lib/task-actions";

export default async function MyWorkPage() {
  const session = await getSession();
  if (!session) return null;

  const today = new Date().toISOString().slice(0, 10);

  const myClients = db
    .prepare(
      `SELECT c.id,c.name FROM client_team ct JOIN clients c ON c.id=ct.client_id
       WHERE ct.user_id=? ORDER BY c.name`
    )
    .all(session.id) as any[];

  const myTasks = db
    .prepare(
      `SELECT t.*, c.name client_name, u.name assigner_name
       FROM tasks t
       LEFT JOIN clients c ON c.id=t.client_id
       JOIN users u ON u.id=t.assigned_by
       WHERE t.assigned_to=?
       ORDER BY CASE t.status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                t.due_date IS NULL, t.due_date, t.created_at DESC`
    )
    .all(session.id) as any[];

  const assignedByMe = db
    .prepare(
      `SELECT t.*, u.name assignee_name, c.name client_name
       FROM tasks t
       JOIN users u ON u.id=t.assigned_to
       LEFT JOIN clients c ON c.id=t.client_id
       WHERE t.assigned_by=? AND t.assigned_to!=? AND t.status!='done'
       ORDER BY t.due_date IS NULL, t.due_date, t.created_at DESC`
    )
    .all(session.id, session.id) as any[];

  const updates = db
    .prepare(
      `SELECT tu.*, u.name user_name FROM task_updates tu
       JOIN users u ON u.id=tu.user_id
       WHERE tu.task_id IN (SELECT id FROM tasks WHERE assigned_to=?)
       ORDER BY tu.created_at DESC`
    )
    .all(session.id) as any[];
  const updatesByTask: Record<number, any[]> = {};
  for (const update of updates) (updatesByTask[update.task_id] ||= []).push(update);

  const upcomingMeetings = db
    .prepare(
      `SELECT m.*, c.name client_name FROM meetings m JOIN clients c ON c.id=m.client_id
       WHERE m.status='upcoming' ORDER BY m.meeting_at LIMIT 5`
    )
    .all() as any[];

  const openTasks = myTasks.filter((task) => task.status !== "done");
  const dueToday = openTasks.filter((task) => task.due_date === today);
  const overdue = openTasks.filter((task) => task.due_date && task.due_date < today);
  const completedWeek = myTasks.filter(
    (task) =>
      task.status === "done" &&
      task.updated_at >= new Date(Date.now() - 7 * 86400000).toISOString()
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#12143d] text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#12143d]">
              My Work Dashboard
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Welcome, <span className="font-semibold text-slate-800">{session.name}</span>
            {session.job_title ? ` · ${session.job_title}` : ""} — your personal daily queue and active priorities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/tasks?assignee=me"
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#12143d] hover:bg-slate-50 shadow-2xs transition-colors"
          >
            Board: My Tasks Only
          </Link>
          <Link
            href="/tasks"
            className="rounded-xl bg-[#ed8527] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 hover:bg-[#d97116] transition-all cursor-pointer"
          >
            + Create / Assign Task
          </Link>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Open Tasks
            </span>
            <span className="h-2 w-2 rounded-full bg-blue-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-[#12143d]">
            {openTasks.length}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Assigned deliverables</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Due Today
            </span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-amber-900">
            {dueToday.length}
          </div>
          <p className="mt-1 text-[11px] text-amber-700">Immediate focus needed</p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
              Overdue
            </span>
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-rose-700">
            {overdue.length}
          </div>
          <p className="mt-1 text-[11px] text-rose-600">Past target deadline</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Done This Week
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-800">
            {completedWeek.length}
          </div>
          <p className="mt-1 text-[11px] text-emerald-700">Completed momentum</p>
        </div>
      </div>

      {/* Assigned Clients */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Assigned Client Accounts ({myClients.length})
          </div>
          <Link href="/clients" className="text-xs font-semibold text-[#ed8527] hover:underline">
            View All Clients →
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {myClients.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-[#12143d] hover:bg-white hover:border-[#ed8527] hover:text-[#ed8527] transition-all shadow-2xs"
            >
              <span>{client.name}</span>
              <span className="text-[10px] text-slate-400">→</span>
            </Link>
          ))}
          {!myClients.length && (
            <span className="text-xs text-slate-400 italic">
              No specific client accounts assigned to your profile yet.
            </span>
          )}
        </div>
      </div>

      {/* Main Two-Column Layout on Desktop */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Columns: Tasks Assigned to Me */}
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Tasks Assigned To Me ({myTasks.length})
            </h2>
            <span className="text-xs text-slate-400">
              Prioritized by urgency &amp; deadline
            </span>
          </div>

          <div className="space-y-3">
            {myTasks.map((task) => {
              const isOverdue =
                task.status !== "done" && task.due_date && task.due_date < today;

              const statusBadge = {
                todo: "bg-slate-100 text-slate-700 border-slate-200",
                in_progress: "bg-amber-50 text-amber-800 border-amber-200 font-semibold",
                done: "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold",
              }[task.status as "todo" | "in_progress" | "done"] || "bg-slate-100 text-slate-700";

              return (
                <div
                  key={task.id}
                  className={`rounded-2xl border bg-white p-5 shadow-xs transition-all hover:border-slate-300 ${
                    isOverdue
                      ? "border-l-4 border-l-rose-500 border-rose-200"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400">
                          #{task.id}
                        </span>
                        <h3 className="text-base font-bold text-slate-900">
                          {task.title}
                        </h3>
                        <span className="rounded-full bg-[#12143d]/5 border border-[#12143d]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#12143d]">
                          {taskCategoryLabel(task.category)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                        <div>
                          Client:{" "}
                          <span className="font-semibold text-slate-800">
                            {task.client_name || "Internal"}
                          </span>
                        </div>
                        <span>•</span>
                        <div>
                          Assigned by: <span className="font-medium text-slate-700">{task.assigner_name}</span>
                        </div>
                      </div>

                      {task.description && (
                        <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50/70 rounded-xl p-3 border border-slate-100">
                          {task.description}
                        </p>
                      )}
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0">
                      <span className={`rounded-full border px-3 py-0.5 text-xs ${statusBadge}`}>
                        {task.status.replace("_", " ")}
                      </span>
                      <div className="text-xs">
                        {task.due_date ? (
                          <span className={isOverdue ? "font-bold text-rose-600" : "text-slate-600"}>
                            {isOverdue && "⚠️ "}Due {task.due_date}
                          </span>
                        ) : (
                          <span className="text-slate-400">No deadline</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Inline Status Update Form */}
                  <form
                    action={updateTaskAction}
                    className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2.5 border border-slate-100"
                  >
                    <input type="hidden" name="id" value={task.id} />
                    <span className="text-xs font-semibold text-slate-600">Quick Status:</span>
                    <select
                      name="status"
                      defaultValue={task.status}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 font-medium focus:border-[#ed8527] focus:outline-none"
                    >
                      {TASK_STATUSES.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#12143d] px-3 py-1 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer shadow-2xs"
                    >
                      Update
                    </button>
                  </form>

                  {/* Activity History & Note Drawer */}
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Recent Activity
                    </div>
                    <div className="space-y-1 text-xs text-slate-700">
                      {(updatesByTask[task.id] || []).slice(0, 3).map((update) => (
                        <div
                          key={update.id}
                          className="flex items-start gap-2 rounded-lg bg-slate-50 p-2"
                        >
                          <span className="font-semibold text-slate-900">
                            {update.user_name}:
                          </span>
                          <span className="flex-1">{update.note}</span>
                          <span className="text-[10px] text-slate-400">
                            {update.created_at}
                          </span>
                        </div>
                      ))}
                      {!(updatesByTask[task.id] || []).length && (
                        <div className="text-slate-400 italic text-xs">
                          No notes added yet.
                        </div>
                      )}
                    </div>

                    <form action={addTaskUpdateAction} className="mt-2.5 flex gap-2">
                      <input type="hidden" name="task_id" value={task.id} />
                      <input
                        name="note"
                        required
                        placeholder="Add progress note or handoff update..."
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
                      >
                        Add Note
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}

            {!myTasks.length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <h4 className="text-sm font-semibold text-slate-800">
                  You are all caught up!
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  No active tasks are currently assigned to your profile.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Right 1 Column: Delegated Tasks & Meetings */}
        <div className="space-y-6">
          {/* Tasks assigned to teammates */}
          <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Tasks Delegated to Teammates ({assignedByMe.length})
            </h2>

            <div className="space-y-2">
              {assignedByMe.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/tasks?task=${task.id}`}
                      className="font-bold text-[#12143d] hover:text-[#ed8527] line-clamp-1"
                    >
                      {task.title}
                    </Link>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
                      {task.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 text-[11px]">
                    <span>Assigned to: <b className="text-slate-800">{task.assignee_name}</b></span>
                    <span>Due: {task.due_date || "—"}</span>
                  </div>
                </div>
              ))}
              {!assignedByMe.length && (
                <p className="text-xs text-slate-400 italic">
                  No open tasks assigned to others by you.
                </p>
              )}
            </div>
          </section>

          {/* Upcoming meetings */}
          <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Upcoming Meetings
              </h2>
              <Link href="/meetings" className="text-xs font-semibold text-[#ed8527] hover:underline">
                Calendar →
              </Link>
            </div>

            <div className="space-y-2.5">
              {upcomingMeetings.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs space-y-1"
                >
                  <div className="font-bold text-[#12143d]">{m.title}</div>
                  <div className="text-[11px] text-[#ed8527] font-semibold">
                    {m.client_name} · {m.meeting_at}
                  </div>
                  {m.discussion_notes && (
                    <p className="text-slate-500 line-clamp-2 text-[11px] pt-1">
                      {m.discussion_notes}
                    </p>
                  )}
                </div>
              ))}
              {!upcomingMeetings.length && (
                <p className="text-xs text-slate-400 italic">
                  No upcoming meetings scheduled.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
