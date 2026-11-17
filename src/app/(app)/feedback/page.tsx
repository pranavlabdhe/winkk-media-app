import Link from "next/link";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  COMMUNICATION_CHANNELS,
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_SENTIMENTS,
  FEEDBACK_STATUSES,
  OPEN_FEEDBACK_STATUSES,
  communicationChannelLabel,
  feedbackCategoryLabel,
  feedbackPriorityLabel,
  feedbackSentimentLabel,
  feedbackStatusLabel,
} from "@/lib/constants";
import { getFeedbackTasks } from "@/lib/interaction-service";
import {
  addFeedbackNoteAction,
  createFeedbackTaskAction,
  quickLogFeedbackAction,
  updateFeedbackAction,
} from "../communications/actions";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    client?: string;
    task?: string;
    feedback?: string;
    status?: string;
    error?: string;
    saved?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) return null;
  const sp = await searchParams;
  const clientFilter = sp.client ? Number(sp.client) : null;
  const taskFilter = sp.task ? Number(sp.task) : null;
  const focusId = sp.feedback ? Number(sp.feedback) : null;
  const statusFilter = sp.status && sp.status !== "open" ? sp.status : "";

  const clients = db.prepare("SELECT id,name FROM clients ORDER BY name").all() as any[];
  const users = db
    .prepare("SELECT id,name,job_title FROM users WHERE is_active=1 ORDER BY name")
    .all() as any[];

  const where: string[] = [];
  const params: unknown[] = [];
  if (focusId) {
    where.push("f.id = ?");
    params.push(focusId);
  } else {
    if (taskFilter) {
      where.push("(f.task_id = ? OR f.id IN (SELECT feedback_id FROM feedback_tasks WHERE task_id = ?))");
      params.push(taskFilter, taskFilter);
    } else if (clientFilter) {
      where.push("f.client_id = ?");
      params.push(clientFilter);
    }
    if (sp.status === "open") {
      where.push(`f.status IN (${OPEN_FEEDBACK_STATUSES.map(() => "?").join(",")})`);
      params.push(...OPEN_FEEDBACK_STATUSES);
    } else if (statusFilter) {
      where.push("f.status = ?");
      params.push(statusFilter);
    }
  }

  const feedbackRows = db
    .prepare(
      `SELECT f.*, c.name client_name, p.title post_title,
              cm.id communication_id, cm.channel, cm.client_message_at, cm.response_at,
              cm.executive_name, cm.whatsapp_group, cm.recorded_by, cm.created_at communication_created_at,
              ru.name recorded_by_name, ru.job_title recorded_by_title,
              u.name assignee_name,
              t.id linked_task_id, t.title linked_task_title, t.status linked_task_status,
              t.due_date linked_task_due
       FROM feedback f
       JOIN clients c ON c.id=f.client_id
       LEFT JOIN posts p ON p.id=f.post_id
       LEFT JOIN communications cm ON cm.id=f.communication_id
       LEFT JOIN users ru ON ru.id=cm.recorded_by
       LEFT JOIN users u ON u.id=f.assigned_to
       LEFT JOIN tasks t ON t.id=f.task_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY f.created_at DESC`
    )
    .all(...params) as any[];

  const updates = db
    .prepare(
      `SELECT fu.*, u.name user_name FROM feedback_updates fu
       LEFT JOIN users u ON u.id=fu.user_id
       ORDER BY fu.created_at DESC`
    )
    .all() as any[];
  const updatesBy: Record<number, any[]> = {};
  for (const update of updates) (updatesBy[update.feedback_id] ||= []).push(update);

  const tasksBy: Record<number, any[]> = {};
  for (const row of feedbackRows) tasksBy[row.id] = getFeedbackTasks(row.id);

  const focused = focusId ? feedbackRows[0] : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Client Feedback & Review Tracking</h1>
        <p className="text-sm">
          Feedback is created from a client communication and then owns its own lifecycle. The
          conversation stays unchanged while the feedback moves from New to Resolved.
        </p>
      </div>

      {sp.error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {sp.error}
        </div>
      )}
      {sp.saved && (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          Saved. The feedback and its linked work are up to date.
        </div>
      )}
      {focused && (
        <div className="rounded border bg-white p-2 text-sm">
          Showing feedback #{focused.id} with its originating communication.{" "}
          <Link href="/feedback" className="underline">
            Show all feedback
          </Link>
        </div>
      )}
      {taskFilter && !focused && (
        <div className="rounded border bg-white p-2 text-sm">
          Showing feedback linked to task #{taskFilter}.{" "}
          <Link href="/feedback" className="underline">
            Show all feedback
          </Link>
        </div>
      )}

      <form method="get" className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 text-sm">
        <select name="client" defaultValue={sp.client || ""} className="rounded border px-2 py-1">
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status || ""} className="rounded border px-2 py-1">
          <option value="">All statuses</option>
          <option value="open">Open (needs attention)</option>
          {FEEDBACK_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        <button className="rounded border px-3 py-1">Apply filters</button>
        <Link href="/feedback" className="rounded border px-3 py-1">
          Clear
        </Link>
      </form>

      <details className="rounded-lg border bg-white p-4" open={!feedbackRows.length}>
        <summary className="cursor-pointer text-sm font-medium">
          Log new feedback (creates the communication record too)
        </summary>
        <form action={quickLogFeedbackAction} className="mt-3 grid gap-2 md:grid-cols-4">
          <select name="client_id" required defaultValue={clientFilter || ""} className="rounded border px-3 py-2">
            <option value="">Client *</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <select name="channel" defaultValue="whatsapp" className="rounded border px-3 py-2">
            {COMMUNICATION_CHANNELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            name="executive_name"
            defaultValue={session.name}
            placeholder="Handled by *"
            className="rounded border px-3 py-2"
          />
          <input name="whatsapp_group" placeholder="Group / participants" className="rounded border px-3 py-2" />
          <label className="text-xs">
            Client message at
            <input name="client_message_at" type="datetime-local" className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-xs">
            Response at
            <input name="response_at" type="datetime-local" className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <textarea
            name="notes"
            rows={2}
            placeholder="Communication note (context for the conversation)"
            className="rounded border px-3 py-2 md:col-span-2"
          />

          <input name="title" required placeholder="Feedback subject *" className="rounded border px-3 py-2 md:col-span-2" />
          <select name="category" defaultValue="creative" className="rounded border px-3 py-2">
            {FEEDBACK_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select name="sentiment" defaultValue="neutral" className="rounded border px-3 py-2">
            {FEEDBACK_SENTIMENTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <textarea
            name="description"
            required
            rows={2}
            placeholder="What exactly did the client say? *"
            className="rounded border px-3 py-2 md:col-span-4"
          />
          <select name="priority" defaultValue="medium" className="rounded border px-3 py-2">
            {FEEDBACK_PRIORITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} priority
              </option>
            ))}
          </select>
          <select name="assigned_to" defaultValue={session.id} className="rounded border px-3 py-2">
            <option value="">Assign if action needed</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <label className="text-xs">
            Expected resolution
            <input name="due_date" type="date" className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <div className="space-y-1 self-center text-xs">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="action_required" defaultChecked /> Action required
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="create_task" defaultChecked /> Create a follow-up task
            </label>
          </div>
          <button className="rounded bg-zinc-900 px-3 py-2 font-medium text-white md:col-span-4">
            Log feedback and communication
          </button>
        </form>
      </details>

      <div className="space-y-3">
        {feedbackRows.map((f) => {
          const canManage =
            session.role === "owner" ||
            f.assigned_to === session.id ||
            f.assigned_to === null ||
            f.recorded_by === session.id;
          const tasks = tasksBy[f.id] || [];

          return (
            <article key={f.id} className="rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold">
                    {f.title || f.content?.slice(0, 80)}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                    <span className="rounded bg-zinc-100 px-2 py-0.5">{f.client_name}</span>
                    <span className="rounded bg-zinc-100 px-2 py-0.5">{feedbackStatusLabel(f.status)}</span>
                    <span className="rounded bg-zinc-100 px-2 py-0.5">{feedbackCategoryLabel(f.category)}</span>
                    <span className="rounded bg-zinc-100 px-2 py-0.5">{feedbackSentimentLabel(f.sentiment)}</span>
                    <span className="rounded bg-zinc-100 px-2 py-0.5">{feedbackPriorityLabel(f.priority)} priority</span>
                    <span className="rounded bg-zinc-100 px-2 py-0.5">
                      {f.action_required ? "Action required" : "No action required"}
                    </span>
                    {f.post_title && (
                      <span className="rounded bg-zinc-100 px-2 py-0.5">Post: {f.post_title}</span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{f.content}</p>
                  <div className="mt-1 text-xs text-zinc-600">
                    {f.assignee_name ? `Assigned to ${f.assignee_name}` : "Unassigned"}
                    {f.due_date ? ` · expected ${f.due_date}` : ""}
                    {f.resolved_at ? ` · resolved ${f.resolved_at}` : ""}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded border bg-zinc-50 p-2 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Originating communication
                </div>
                {f.communication_id ? (
                  <>
                    <div className="mt-1">
                      <Link
                        href={`/communications?communication=${f.communication_id}`}
                        className="font-medium underline"
                      >
                        Communication #{f.communication_id}
                      </Link>{" "}
                      · {communicationChannelLabel(f.channel)} ·{" "}
                      {f.client_message_at || f.communication_created_at}
                    </div>
                    <div className="text-xs text-zinc-600">
                      Logged by {f.recorded_by_name || "team"}
                      {f.recorded_by_title ? ` (${f.recorded_by_title})` : ""} · handled by{" "}
                      {f.executive_name}
                      {f.whatsapp_group ? ` · ${f.whatsapp_group}` : ""}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-xs text-zinc-600">
                    This feedback came from the task board, not a logged conversation.
                  </div>
                )}
              </div>

              <div className="mt-3">
                <div className="text-sm font-medium">Linked tasks</div>
                <ul className="mt-1 space-y-1 text-sm">
                  {tasks.map((task) => (
                    <li key={task.id} className="flex flex-wrap items-center gap-2">
                      <Link href={`/tasks?task=${task.id}`} className="underline">
                        {task.title}
                      </Link>
                      <span className="text-xs text-zinc-600">
                        {task.assignee_name || "Unassigned"} · {task.status}
                        {task.due_date ? ` · due ${task.due_date}` : ""}
                      </span>
                    </li>
                  ))}
                  {!tasks.length && (
                    <li className="text-xs text-zinc-500">
                      No task yet. Add one when this feedback needs work from someone.
                    </li>
                  )}
                </ul>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs underline">Add a follow-up task</summary>
                  <form action={createFeedbackTaskAction} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="feedback_id" value={f.id} />
                    <select name="assigned_to" required defaultValue={f.assigned_to || ""} className="rounded border px-2 py-1 text-sm">
                      <option value="">Assign to *</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                    <input name="due_date" type="date" className="rounded border px-2 py-1 text-sm" />
                    <select name="priority" defaultValue={f.priority || "medium"} className="rounded border px-2 py-1 text-sm">
                      {FEEDBACK_PRIORITIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button className="rounded border px-3 py-1 text-sm">Create task</button>
                  </form>
                </details>
              </div>

              {canManage ? (
                <form
                  action={updateFeedbackAction}
                  className="mt-3 grid gap-2 rounded border p-2 md:grid-cols-6"
                >
                  <input type="hidden" name="id" value={f.id} />
                  <label className="text-xs md:col-span-3">
                    Subject
                    <input
                      name="title"
                      defaultValue={f.title || ""}
                      className="mt-1 w-full rounded border px-2 py-1"
                    />
                  </label>
                  <label className="text-xs">
                    Category
                    <select name="category" defaultValue={f.category || "other"} className="mt-1 w-full rounded border px-2 py-1">
                      {FEEDBACK_CATEGORIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    Sentiment
                    <select name="sentiment" defaultValue={f.sentiment || "neutral"} className="mt-1 w-full rounded border px-2 py-1">
                      {FEEDBACK_SENTIMENTS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs md:col-span-6">
                    What the feedback is about
                    <textarea
                      name="description"
                      rows={2}
                      defaultValue={f.content || ""}
                      className="mt-1 w-full rounded border px-2 py-1"
                    />
                  </label>
                  <label className="text-xs">
                    Status
                    <select name="status" defaultValue={f.status} className="mt-1 w-full rounded border px-2 py-1">
                      {FEEDBACK_STATUSES.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    Priority
                    <select name="priority" defaultValue={f.priority || "medium"} className="mt-1 w-full rounded border px-2 py-1">
                      {FEEDBACK_PRIORITIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    Assignee
                    <select name="assigned_to" defaultValue={f.assigned_to || ""} className="mt-1 w-full rounded border px-2 py-1">
                      <option value="">Unassigned</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    Expected resolution
                    <input
                      name="due_date"
                      type="date"
                      defaultValue={f.due_date || ""}
                      className="mt-1 w-full rounded border px-2 py-1"
                    />
                  </label>
                  <label className="text-xs md:col-span-2">
                    Action taken
                    <input
                      name="action_taken"
                      defaultValue={f.action_taken || ""}
                      placeholder="What the team did"
                      className="mt-1 w-full rounded border px-2 py-1"
                    />
                  </label>
                  <button className="rounded border px-3 py-1 text-sm md:col-span-6 md:w-max">
                    Save feedback
                  </button>
                </form>
              ) : (
                <p className="mt-3 text-xs text-zinc-500">
                  Only the owner or the assigned employee can change this feedback.
                </p>
              )}

              <div className="mt-3 border-t pt-2">
                <div className="text-sm font-medium">History of updates & developments</div>
                <ul className="mt-1 space-y-1 text-sm text-zinc-700">
                  {(updatesBy[f.id] || []).map((update) => (
                    <li key={update.id}>
                      • {update.note}{" "}
                      <span className="text-xs text-zinc-500">
                        ({update.user_name || "team"} · {update.created_at})
                      </span>
                    </li>
                  ))}
                  {!(updatesBy[f.id] || []).length && (
                    <li className="text-zinc-500">No updates yet.</li>
                  )}
                </ul>
                <form action={addFeedbackNoteAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="feedback_id" value={f.id} />
                  <input
                    name="note"
                    required
                    placeholder="Add update/development note"
                    className="flex-1 rounded border px-2 py-1 text-sm"
                  />
                  <button className="rounded border px-2 py-1 text-sm">Add note</button>
                </form>
              </div>
            </article>
          );
        })}
        {!feedbackRows.length && (
          <div className="rounded-lg border bg-white p-4 text-zinc-500">No feedback yet.</div>
        )}
      </div>
    </div>
  );
}
