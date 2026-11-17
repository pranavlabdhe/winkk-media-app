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

  const totalCount = rows.length;
  const delayedCount = rows.filter(
    (r) => r.status === "delayed" || r.status === "missed"
  ).length;
  const feedbackCommsCount = rows.filter(
    (r) => r.communication_type === "feedback"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#12143d] text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#12143d]">
              Client Communication &amp; SLA Tracking
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Monitor WhatsApp groups, calls, emails, and response SLAs across all active restaurant accounts.
          </p>
        </div>

        {/* KPI Chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-2xs">
            Total Logs: <span className="text-[#12143d] font-bold">{totalCount}</span>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 text-purple-800">
            Feedback Threads: <span className="font-bold">{feedbackCommsCount}</span>
          </div>
          {delayedCount > 0 ? (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-rose-700 font-bold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              Delayed / Missed: {delayedCount}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800">
              SLA Compliant: 100%
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {sp.error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{sp.error}</span>
        </div>
      )}
      {sp.saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Saved. Communication log and feedback references updated.</span>
        </div>
      )}

      {/* Focus Notices */}
      {focused && (
        <div className="flex items-center justify-between rounded-xl border border-[#ed8527]/30 bg-orange-50/60 px-4 py-3 text-xs sm:text-sm text-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ed8527] text-white text-[10px] font-bold">
              i
            </span>
            Isolated View: Communication <span className="font-bold text-[#12143d]">#{focused.id}</span>
          </div>
          <Link
            href="/communications"
            className="rounded-lg bg-white border border-slate-200 px-3 py-1 text-xs font-semibold text-[#12143d] hover:bg-slate-50 shadow-2xs"
          >
            Show All Communications
          </Link>
        </div>
      )}

      {taskFilter && !focused && (
        <div className="flex items-center justify-between rounded-xl border border-[#ed8527]/30 bg-orange-50/60 px-4 py-3 text-xs sm:text-sm text-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ed8527] text-white text-[10px] font-bold">
              i
            </span>
            Filtering communications for Task <span className="font-bold text-[#12143d]">#{taskFilter}</span>.
          </div>
          <Link
            href="/communications"
            className="rounded-lg bg-white border border-slate-200 px-3 py-1 text-xs font-semibold text-[#12143d] hover:bg-slate-50 shadow-2xs"
          >
            Show All Communications
          </Link>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
        <form method="get" className="flex flex-wrap items-end gap-3 text-xs">
          <div className="w-full sm:w-64">
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Filter by Client
            </label>
            <select
              name="client"
              defaultValue={sp.client || ""}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#ed8527] focus:bg-white focus:outline-none"
            >
              <option value="">All Clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="rounded-xl bg-[#12143d] px-4 py-2 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer shadow-2xs"
            >
              Apply Filter
            </button>
            <Link
              href="/communications"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Clear
            </Link>
          </div>
        </form>
      </div>

      {/* Communication Log Form */}
      <CommunicationForm
        clients={clients}
        users={users}
        defaultExecutive={session.name}
        defaultClientId={clientFilter || undefined}
        currentUserId={session.id}
      />

      {/* Communications Feed */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 px-1">
          Interaction History ({rows.length})
        </h3>

        {rows.map((r) => {
          const feedback = feedbackByCommunication[r.id] || [];
          return (
            <CommunicationCard
              key={r.id}
              row={r}
              feedback={feedback}
              users={users}
              viewer={{ id: session.id, role: session.role }}
            />
          );
        })}

        {!rows.length && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <h4 className="text-sm font-semibold text-slate-800">
              No communication logs found
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Record your first WhatsApp, call, or email interaction using the form above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CommunicationCard({
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
  const statusConfig: Record<string, { label: string; badge: string; dot: string }> = {
    responded: {
      label: "Responded",
      badge: "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold",
      dot: "bg-emerald-500",
    },
    pending: {
      label: "Pending Response",
      badge: "bg-blue-50 text-blue-800 border-blue-200 font-semibold",
      dot: "bg-blue-500",
    },
    delayed: {
      label: "Delayed SLA",
      badge: "bg-amber-50 text-amber-800 border-amber-300 font-bold",
      dot: "bg-amber-500",
    },
    missed: {
      label: "Missed",
      badge: "bg-rose-50 text-rose-800 border-rose-300 font-bold",
      dot: "bg-rose-500",
    },
  };

  const statusStyle = statusConfig[row.status] || {
    label: row.status,
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-slate-300 space-y-4">
      {/* Top Meta Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono font-bold text-slate-400">
              #{row.id}
            </span>
            <Link
              href={`/clients/${row.client_id}`}
              className="text-base font-bold text-[#12143d] hover:text-[#ed8527] transition-colors"
            >
              {row.client_name}
            </Link>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200">
              {communicationChannelLabel(row.channel)}
            </span>
            {row.whatsapp_group && (
              <span className="text-xs text-slate-500">
                · {row.whatsapp_group}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
            <div>
              Handled by: <span className="font-semibold text-slate-800">{row.executive_name}</span>
            </div>
            <span>•</span>
            <div>
              Logged by: <span className="text-slate-700">{row.recorded_by_name || "Team"}</span>
            </div>
            <span>•</span>
            <div>{row.created_at}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${statusStyle.badge}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
            {statusStyle.label}
          </span>
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              row.communication_type === "feedback"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-slate-50 text-slate-700 border-slate-200"
            }`}
          >
            {communicationTypeLabel(row.communication_type)}
          </span>
        </div>
      </div>

      {/* Timestamps & Message details */}
      <div className="grid gap-3 sm:grid-cols-2 bg-slate-50/70 p-3 rounded-xl border border-slate-100 text-xs">
        <div>
          <span className="text-slate-400 font-medium">Client Message:</span>{" "}
          <span className="font-semibold text-slate-800">
            {row.client_message_at || "Not recorded"}
          </span>
        </div>
        <div>
          <span className="text-slate-400 font-medium">Team Response:</span>{" "}
          <span className="font-semibold text-slate-800">
            {row.response_at || "Pending response"}
          </span>
        </div>
      </div>

      {row.notes && (
        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-white rounded-xl p-3 border border-slate-200/80">
          {row.notes}
        </p>
      )}

      {/* Linked task if present */}
      {row.linked_task_id && (
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#12143d]">Linked Owner Task:</span>
            <Link
              href={`/tasks?task=${row.linked_task_id}`}
              className="font-medium text-[#ed8527] hover:underline"
            >
              #{row.linked_task_id} {row.linked_task_title}
            </Link>
          </div>
          <span className="text-slate-500">
            {row.linked_task_assignee} · {row.linked_task_status}
          </span>
        </div>
      )}

      {/* Feedback items attached */}
      {feedback.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-3.5 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-900">
            Attached Feedback Items ({feedback.length})
          </div>
          <div className="space-y-2">
            {feedback.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-3 text-xs shadow-2xs"
              >
                <div>
                  <Link
                    href={`/feedback?feedback=${item.id}`}
                    className="font-bold text-[#12143d] hover:text-[#ed8527]"
                  >
                    #{item.id} {item.title || item.content?.slice(0, 60)}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                      {feedbackStatusLabel(item.status)}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                      {feedbackCategoryLabel(item.category)}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                      {feedbackSentimentLabel(item.sentiment)}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                      {feedbackPriorityLabel(item.priority)} priority
                    </span>
                  </div>
                </div>

                {canManageFeedback(item, row, viewer) && (
                  <form action={updateFeedbackAction} className="flex items-center gap-1 shrink-0">
                    <input type="hidden" name="id" value={item.id} />
                    <select
                      name="status"
                      defaultValue={item.status}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800"
                    >
                      {FEEDBACK_STATUSES.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#12143d] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer"
                    >
                      Update
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accordion tools for updating communication details */}
      <div className="border-t border-slate-100 pt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-slate-600 hover:text-[#12143d]">
            ⚙️ Edit Communication &amp; Response SLA
          </summary>
          <form
            action={updateCommunicationAction}
            className="mt-2 grid gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-3"
          >
            <input type="hidden" name="id" value={row.id} />
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Communication Notes
              </label>
              <textarea
                name="notes"
                rows={2}
                defaultValue={row.notes || ""}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Channel
              </label>
              <select
                name="channel"
                defaultValue={row.channel || "whatsapp"}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800"
              >
                {COMMUNICATION_CHANNELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                SLA Status
              </label>
              <select
                name="status"
                defaultValue={row.status}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800"
              >
                {["responded", "pending", "missed", "delayed"].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Response Timestamp
              </label>
              <input
                name="response_at"
                type="datetime-local"
                defaultValue={row.response_at || ""}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-[#12143d] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer"
              >
                Save Communication
              </button>
            </div>
          </form>
        </details>

        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-[#ed8527] hover:underline">
            + Extract Another Feedback Item
          </summary>
          <form
            action={addFeedbackAction}
            className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3"
          >
            <input type="hidden" name="communication_id" value={row.id} />
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Subject *
              </label>
              <input
                name="title"
                required
                placeholder="Feedback subject..."
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Category
              </label>
              <select
                name="category"
                defaultValue="other"
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800"
              >
                {FEEDBACK_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                What did the client say? *
              </label>
              <textarea
                name="description"
                required
                rows={2}
                placeholder="Revision notes..."
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Priority
              </label>
              <select
                name="priority"
                defaultValue="medium"
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800"
              >
                {FEEDBACK_PRIORITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Assignee
              </label>
              <select
                name="assigned_to"
                defaultValue={viewer.id}
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800"
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Resolution Date
              </label>
              <input
                name="due_date"
                type="date"
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800"
              />
            </div>
            <div className="sm:col-span-3 flex items-center justify-between pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                <input type="checkbox" name="create_task" defaultChecked className="rounded text-[#ed8527]" />
                Auto-create execution task
              </label>
              <button
                type="submit"
                className="rounded-lg bg-[#ed8527] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#d97116] transition-colors cursor-pointer"
              >
                + Add Feedback
              </button>
            </div>
          </form>
        </details>
      </div>
    </article>
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
