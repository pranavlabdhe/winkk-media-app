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
    (task) => task.status === "done" && task.updated_at >= new Date(Date.now() - 7 * 86400000).toISOString()
  );

  const summary = [
    ["Open", openTasks.length],
    ["Due today", dueToday.length],
    ["Overdue", overdue.length],
    ["Done this week", completedWeek.length],
  ] as const;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">My Work</h1>
        <p className="text-sm">
          {session.name}
          {session.job_title ? ` · ${session.job_title}` : ""} — update your tasks and leave a note for the
          team as you progress.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-white p-4">
            <div className="text-sm">{label}</div>
            <div className="mt-1 text-3xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-semibold">My clients</h2>
        <div className="flex flex-wrap gap-2">
          {myClients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`} className="rounded border px-3 py-1 text-sm">
              {client.name}
            </Link>
          ))}
          {!myClients.length && <span className="text-sm text-zinc-500">No client assignments yet.</span>}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/tasks?assignee=me" className="rounded border bg-white px-3 py-2 text-sm">
          Filter task board to me
        </Link>
        <Link href="/tasks" className="rounded border bg-white px-3 py-2 text-sm">
          Create or assign a task
        </Link>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Assigned to me</h2>
          <span className="text-sm text-zinc-500">{myTasks.length} total</span>
        </div>

        {myTasks.map((task) => {
          const isOverdue = task.status !== "done" && task.due_date && task.due_date < today;
          return (
            <div key={task.id} className={`rounded-lg border bg-white p-4 ${isOverdue ? "border-2" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{task.title}</div>
                  <div className="text-sm">
                    {task.client_name || "Internal"} · {taskCategoryLabel(task.category)} · Assigned by{" "}
                    {task.assigner_name}
                  </div>
                  {task.description ? <p className="mt-1 text-sm whitespace-pre-wrap">{task.description}</p> : null}
                </div>
                <div className="text-right text-sm">
                  <div className="rounded border px-2 py-1">{task.status.replace("_", " ")}</div>
                  <div className={isOverdue ? "font-semibold" : ""}>
                    Due: {task.due_date || "-"}{isOverdue ? " · OVERDUE" : ""}
                  </div>
                </div>
              </div>

              <form action={updateTaskAction} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={task.id} />
                <select name="status" defaultValue={task.status} className="rounded border px-2 py-1">
                  {TASK_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
                <button className="rounded px-2 py-1 text-sm">Update status</button>
              </form>

              <div className="mt-3 border-t pt-2">
                <div className="text-sm font-medium">Latest activity</div>
                <ul className="mt-1 space-y-1 text-sm">
                  {(updatesByTask[task.id] || []).slice(0, 3).map((update) => (
                    <li key={update.id}>
                      • {update.note} <span className="text-xs">({update.user_name} · {update.created_at})</span>
                    </li>
                  ))}
                  {!(updatesByTask[task.id] || []).length && <li className="text-zinc-500">No activity yet.</li>}
                </ul>
                <form action={addTaskUpdateAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="task_id" value={task.id} />
                  <input
                    name="note"
                    required
                    placeholder="Add progress, blocker, or handoff note"
                    className="flex-1 rounded border px-2 py-1 text-sm"
                  />
                  <button className="rounded px-2 py-1 text-sm">Add note</button>
                </form>
              </div>
            </div>
          );
        })}
        {!myTasks.length && (
          <div className="rounded-lg border bg-white p-4 text-zinc-500">
            No tasks assigned to you yet. Open the task board to create one for yourself.
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-semibold">Tasks I assigned to others</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left">
              <tr>
                <th className="p-2">Task</th>
                <th className="p-2">Assignee</th>
                <th className="p-2">Client</th>
                <th className="p-2">Category</th>
                <th className="p-2">Due</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {assignedByMe.map((task) => (
                <tr key={task.id} className="border-t">
                  <td className="p-2">{task.title}</td>
                  <td className="p-2">{task.assignee_name}</td>
                  <td className="p-2">{task.client_name || "Internal"}</td>
                  <td className="p-2">{taskCategoryLabel(task.category)}</td>
                  <td className="p-2">{task.due_date || "-"}</td>
                  <td className="p-2">{task.status.replace("_", " ")}</td>
                </tr>
              ))}
              {!assignedByMe.length && (
                <tr>
                  <td className="p-2 text-zinc-500" colSpan={6}>
                    No open tasks assigned by you to others.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-semibold">Upcoming client meetings</h2>
        <ul className="space-y-2 text-sm">
          {upcomingMeetings.map((meeting) => (
            <li key={meeting.id} className="rounded border p-2">
              <b>{meeting.title}</b> · {meeting.client_name} · {meeting.meeting_at}
              {meeting.discussion_notes ? <div className="text-zinc-600">{meeting.discussion_notes}</div> : null}
            </li>
          ))}
          {!upcomingMeetings.length && <li className="text-zinc-500">No upcoming meetings.</li>}
        </ul>
      </section>
    </div>
  );
}
