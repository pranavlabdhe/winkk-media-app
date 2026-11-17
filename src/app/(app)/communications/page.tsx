import Link from "next/link";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_TYPES,
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_SENTIMENTS,
  FEEDBACK_STATUSES,
  communicationChannelLabel,
  communicationTypeLabel,
  feedbackCategoryLabel,
  feedbackSentimentLabel,
  feedbackStatusLabel,
  feedbackPriorityLabel,
} from "@/lib/constants";
import { getFeedbackForCommunication } from "@/lib/interaction-service";
import { CommunicationForm } from "./communication-form";
import {
  addFeedbackAction,
  reclassifyCommunicationAction,
  updateCommunicationAction,
  updateFeedbackAction,
} from "./actions";

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    client?: string;
    task?: string;
    communication?: string;
    error?: string;
    saved?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) return null;
  const sp = await searchParams;
  const clientFilter = sp.client ? Number(sp.client) : null;
  const taskFilter = sp.task ? Number(sp.task) : null;
  const focusId = sp.communication ? Number(sp.communication) : null;

  const clients = db
    .prepare("SELECT id,name,whatsapp_group FROM clients ORDER BY name")
    .all() as any[];
  const users = db
    .prepare("SELECT id,name,job_title FROM users WHERE is_active=1 ORDER BY name")
    .all() as any[];

  const where: string[] = [];
  const params: unknown[] = [];
  if (focusId) {
    where.push("cm.id = ?");
    params.push(focusId);
  } else if (taskFilter) {
    where.push("cm.task_id = ?");
    params.push(taskFilter);
  } else if (clientFilter) {
    where.push("cm.client_id = ?");
    params.push(clientFilter);
  }

  const rows = db
    .prepare(
      `SELECT cm.*, c.name client_name, u.name recorded_by_name,
              t.id linked_task_id, t.title linked_task_title, t.status linked_task_status,
              t.due_date linked_task_due, a.name linked_task_assignee,
              (SELECT COUNT(*) FROM feedback f WHERE f.communication_id=cm.id) feedback_count
       FROM communications cm
       JOIN clients c ON c.id=cm.client_id
       LEFT JOIN users u ON u.id=cm.recorded_by
       LEFT JOIN tasks t ON t.id=cm.task_id
       LEFT JOIN users a ON a.id=t.assigned_to
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY cm.created_at DESC`
    )
    .all(...params) as any[];

  const feedbackByCommunication: Record<number, any[]> = {};
  for (const row of rows) {
    feedbackByCommunication[row.id] = getFeedbackForCommunication(row.id);
  }

  const focused = focusId ? rows[0] : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Client Communication Tracking</h1>
        <p className="text-sm">
          Log every client interaction once. Choose <b>General Communication</b> for a conversation,
          or <b>Communication Containing Feedback</b> to create the feedback records in the same step.
        </p>
      </div>

      {sp.error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {sp.error}
        </div>
      )}
      {sp.saved && (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          Saved. The communication and its feedback are up to date.
        </div>
      )}
      {focused && (
        <div className="rounded border bg-white p-2 text-sm">
          Showing communication #{focused.id} and its feedback.{" "}
          <Link href="/communications" className="underline">
            Show all communications
          </Link>
        </div>
      )}
      {taskFilter && !focused && (
        <div className="rounded border bg-white p-2 text-sm">
          Showing communication linked to task #{taskFilter}.{" "}
          <Link href="/communications" className="underline">
            Show all communications
          </Link>
        </div>
      )}

      <CommunicationForm
        clients={clients}
        users={users}
        defaultExecutive={session.name}
        defaultClientId={clientFilter || undefined}
        currentUserId={session.id}
      />

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr>
              <th className="p-2">Client</th>
              <th className="p-2">Executive</th>
              <th className="p-2">Client msg</th>
              <th className="p-2">Response</th>
              <th className="p-2">Status</th>
              <th className="p-2">Type</th>
              <th className="p-2">Linked task</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const feedback = feedbackByCommunication[r.id] || [];

              return (
                <CommunicationRow
                  key={r.id}
                  row={r}
                  feedback={feedback}
                  users={users}
                  viewer={{ id: session.id, role: session.role }}
                />
              );
            })}
            {!rows.length && (
              <tr>
                <td className="p-4 text-zinc-500" colSpan={7}>
                  No communication logs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CommunicationRow({
  row,
  feedback,
  users,
  viewer,
}: {
  row: any;
  feedback: any[];
  users: any[];
  viewer: { id: number; role: "owner" | "employee" };
}) {
  const whatsappGroup = row.whatsapp_group && row.whatsapp_group !== row.client_name
    ? row.whatsapp_group
    : null;

  return (
    <>
      <tr className="border-t align-top">
        <td className="p-2">
          {row.client_name}
          <div className="text-xs text-zinc-500">{whatsappGroup || ""}</div>
        </td>
        <td className="p-2">{row.executive_name}</td>
        <td className="p-2">{row.client_message_at || "-"}</td>
        <td className="p-2">{row.response_at || "-"}</td>
        <td className="p-2 font-medium">{row.status}</td>
        <td className="p-2">
          <span
            className={`rounded border px-2 py-0.5 text-xs ${
              row.communication_type === "feedback" ? "border-amber-300 bg-amber-50" : "bg-white"
            }`}
          >
            {communicationTypeLabel(row.communication_type)}
          </span>
          {feedback.length > 0 && (
            <div className="mt-1 text-xs text-zinc-600">
              {feedback.length} feedback item{feedback.length === 1 ? "" : "s"}
            </div>
          )}
        </td>
        <td className="p-2">
          {row.linked_task_id ? (
            <div className="text-xs">
              <Link href={`/tasks?task=${row.linked_task_id}`} className="underline">
                {row.linked_task_title}
              </Link>
              <div>
                {row.linked_task_assignee || "Unassigned"} · {row.linked_task_status}
              </div>
              <div>Due: {row.linked_task_due || "-"}</div>
            </div>
          ) : (
            <span className="text-xs">No linked task</span>
          )}
        </td>
      </tr>

      <tr>
        <td colSpan={7} className="px-2 pb-3">
          <div className="rounded border bg-zinc-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
              <span>
                {communicationChannelLabel(row.channel)} · logged by{" "}
                {row.recorded_by_name || "team"} · {row.created_at}
              </span>
              <span>
                Communication #{row.id}
                {" · "}
                <Link href={`/communications?communication=${row.id}`} className="underline">
                  permalink
                </Link>
              </span>
            </div>

            <form action={updateCommunicationAction} className="mt-2 grid gap-2 md:grid-cols-6">
              <input type="hidden" name="id" value={row.id} />
              <label className="text-xs font-medium text-zinc-600 md:col-span-6">
                Communication note
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={row.notes || ""}
                  placeholder="No note yet — add what was said in the conversation"
                  className="mt-1 w-full rounded border bg-white px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                Channel
                <select
                  name="channel"
                  defaultValue={row.channel || "whatsapp"}
                  className="mt-1 w-full rounded border bg-white px-2 py-1"
                >
                  {COMMUNICATION_CHANNELS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Status
                <select
                  name="status"
                  defaultValue={row.status}
                  className="mt-1 w-full rounded border bg-white px-2 py-1"
                >
                  {["responded", "pending", "missed", "delayed"].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Response at
                <input
                  name="response_at"
                  type="datetime-local"
                  defaultValue={row.response_at || ""}
                  className="mt-1 w-full rounded border bg-white px-2 py-1"
                />
              </label>
              <div className="flex items-end md:col-span-3">
                <button className="rounded border bg-white px-3 py-1">Save communication</button>
              </div>
            </form>

            <div className="mt-3 border-t pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  Feedback from this communication{" "}
                  <span className="text-xs font-normal text-zinc-500">
                    {feedback.length ? `(${feedback.length})` : "(none)"}
                  </span>
                </div>
                {feedback.length === 0 && (
                  <span className="text-xs text-zinc-500">
                    {row.communication_type === "feedback"
                      ? "Classified as feedback — add the item below."
                      : "General communication: no feedback record."}
                  </span>
                )}
              </div>

              {feedback.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {feedback.map((item) => (
                    <li key={item.id} className="rounded border bg-white p-2 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link
                            href={`/feedback?feedback=${item.id}`}
                            className="font-medium underline"
                          >
                            {item.title || item.content?.slice(0, 60)}
                          </Link>
                          <div className="mt-1 flex flex-wrap gap-1 text-xs">
                            <span className="rounded bg-zinc-100 px-2 py-0.5">
                              {feedbackStatusLabel(item.status)}
                            </span>
                            <span className="rounded bg-zinc-100 px-2 py-0.5">
                              {feedbackCategoryLabel(item.category)}
                            </span>
                            <span className="rounded bg-zinc-100 px-2 py-0.5">
                              {feedbackSentimentLabel(item.sentiment)}
                            </span>
                            <span className="rounded bg-zinc-100 px-2 py-0.5">
                              {feedbackPriorityLabel(item.priority)} priority
                            </span>
                            <span className="rounded bg-zinc-100 px-2 py-0.5">
                              {item.action_required ? "Action required" : "No action required"}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-zinc-600">
                            {item.assignee_name || "Unassigned"}
                            {item.due_date ? ` · due ${item.due_date}` : ""}
                            {item.task_count ? ` · ${item.task_count} task${item.task_count === 1 ? "" : "s"}` : " · no task"}
                          </div>
                        </div>
                        {canManageFeedback(item, row, viewer) && (
                          <form action={updateFeedbackAction} className="flex flex-wrap items-end gap-1">
                            <input type="hidden" name="id" value={item.id} />
                            <select
                              name="status"
                              defaultValue={item.status}
                              className="rounded border px-2 py-1 text-xs"
                            >
                              {FEEDBACK_STATUSES.map((status) => (
                                <option key={status.value} value={status.value}>
                                  {status.label}
                                </option>
                              ))}
                            </select>
                            <button className="rounded border px-2 py-1 text-xs">Update</button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <details className="mt-2">
                <summary className="cursor-pointer text-xs underline">
                  Add another feedback item to this communication
                </summary>
                <form action={addFeedbackAction} className="mt-2 grid gap-2 rounded border bg-white p-2 md:grid-cols-4">
                  <input type="hidden" name="communication_id" value={row.id} />
                  <input
                    name="title"
                    required
                    placeholder="Feedback subject *"
                    className="rounded border px-2 py-1 md:col-span-2"
                  />
                  <select name="category" defaultValue="other" className="rounded border px-2 py-1">
                    {FEEDBACK_CATEGORIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select name="sentiment" defaultValue="neutral" className="rounded border px-2 py-1">
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
                    placeholder="What the client said *"
                    className="rounded border px-2 py-1 md:col-span-4"
                  />
                  <select name="priority" defaultValue="medium" className="rounded border px-2 py-1">
                    {FEEDBACK_PRIORITIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} priority
                      </option>
                    ))}
                  </select>
                  <select name="assigned_to" defaultValue={viewer.id} className="rounded border px-2 py-1">
                    <option value="">Assign if action needed</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  <label className="text-xs">
                    Expected resolution
                    <input name="due_date" type="date" className="mt-1 w-full rounded border px-2 py-1" />
                  </label>
                  <div className="space-y-1 text-xs">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" name="action_required" defaultChecked /> Action required
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" name="create_task" defaultChecked /> Create task
                    </label>
                  </div>
                  <div className="md:col-span-4">
                    <button className="rounded border px-3 py-1 text-sm">Add feedback</button>
                  </div>
                </form>
              </details>

              <details className="mt-2">
                <summary className="cursor-pointer text-xs underline">
                  Change communication classification
                </summary>
                <form action={reclassifyCommunicationAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={row.id} />
                  <select
                    name="communication_type"
                    defaultValue={row.communication_type}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    {COMMUNICATION_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button className="rounded border px-3 py-1 text-sm">Save classification</button>
                </form>
                <p className="mt-1 text-xs text-zinc-500">
                  A communication with feedback cannot be changed to General until its feedback is closed
                  or removed.
                </p>
              </details>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

function canManageFeedback(
  item: any,
  row: any,
  viewer: { id: number; role: "owner" | "employee" }
) {
  return (
    viewer.role === "owner" ||
    row.recorded_by === viewer.id ||
    item.assigned_to === null ||
    item.assigned_to === viewer.id
  );
}
