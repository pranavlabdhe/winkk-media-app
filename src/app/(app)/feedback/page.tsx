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
import TaskPriorityBadge from "@/components/task-priority-badge";
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
      where.push(
        "(f.task_id = ? OR f.id IN (SELECT feedback_id FROM feedback_tasks WHERE task_id = ?))"
      );
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
              t.priority linked_task_priority,
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

  // KPI metrics
  const totalCount = feedbackRows.length;
  const openCount = feedbackRows.filter((f) =>
    OPEN_FEEDBACK_STATUSES.includes(f.status)
  ).length;
  const resolvedCount = feedbackRows.filter(
    (f) => f.status === "resolved" || f.status === "closed"
  ).length;
  const urgentCount = feedbackRows.filter(
    (f) => (f.priority === "urgent" || f.priority === "high") && OPEN_FEEDBACK_STATUSES.includes(f.status)
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ed8527] text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#12143d]">
              Client Feedback & Review Tracker
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Lifecycle tracking for client revisions, approvals, sentiment analysis, and follow-up work orders.
          </p>
        </div>

        {/* KPI Chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-2xs">
            Total Logged: <span className="text-[#12143d] font-bold">{totalCount}</span>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800">
            Open / Active: <span className="font-bold">{openCount}</span>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800">
            Resolved: <span className="font-bold">{resolvedCount}</span>
          </div>
          {urgentCount > 0 && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-rose-700 font-bold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              High / Urgent: {urgentCount}
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
          <span>Changes saved successfully. The feedback lifecycle and linked work records are updated.</span>
        </div>
      )}

      {/* Focus Notices */}
      {focused && (
        <div className="flex items-center justify-between rounded-xl border border-[#ed8527]/30 bg-orange-50/60 px-4 py-3 text-xs sm:text-sm text-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ed8527] text-white text-[10px] font-bold">
              i
            </span>
            Viewing Feedback <span className="font-bold text-[#12143d]">#{focused.id}</span> and its original communication log.
          </div>
          <Link
            href="/feedback"
            className="rounded-lg bg-white border border-slate-200 px-3 py-1 text-xs font-semibold text-[#12143d] hover:bg-slate-50 shadow-2xs"
          >
            Show All Feedback
          </Link>
        </div>
      )}

      {taskFilter && !focused && (
        <div className="flex items-center justify-between rounded-xl border border-[#ed8527]/30 bg-orange-50/60 px-4 py-3 text-xs sm:text-sm text-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ed8527] text-white text-[10px] font-bold">
              i
            </span>
            Filtering feedback connected to Task <span className="font-bold text-[#12143d]">#{taskFilter}</span>.
          </div>
          <Link
            href="/feedback"
            className="rounded-lg bg-white border border-slate-200 px-3 py-1 text-xs font-semibold text-[#12143d] hover:bg-slate-50 shadow-2xs"
          >
            Show All Feedback
          </Link>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
        <form method="get" className="flex flex-wrap items-end gap-3 text-xs">
          <div className="w-full sm:w-56">
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Client
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

          <div className="w-full sm:w-56">
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Lifecycle Status
            </label>
            <select
              name="status"
              defaultValue={sp.status || ""}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#ed8527] focus:bg-white focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="open">⚡ Needs Action (Open)</option>
              {FEEDBACK_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
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
              href="/feedback"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Reset
            </Link>
          </div>
        </form>
      </div>

      {/* Log New Feedback Card (Collapsible) */}
      <details
        className="group rounded-2xl border border-slate-200/90 bg-white shadow-xs transition-all overflow-hidden"
        open={!feedbackRows.length}
      >
        <summary className="cursor-pointer bg-slate-50/60 px-5 py-3.5 text-xs sm:text-sm font-bold text-[#12143d] flex items-center justify-between hover:bg-slate-100/60 transition-colors">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#ed8527]/10 text-[#ed8527]">
              +
            </span>
            <span>Record New Client Feedback &amp; Source Conversation</span>
          </div>
          <span className="text-xs text-slate-400 group-open:rotate-180 transition-transform">
            ▼
          </span>
        </summary>

        <form action={quickLogFeedbackAction} className="p-5 space-y-4 border-t border-slate-100">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
            Part 1: Communication Origin
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client <span className="text-rose-500">*</span>
              </label>
              <select
                name="client_id"
                required
                defaultValue={clientFilter || ""}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              >
                <option value="">Select Client *</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Channel
              </label>
              <select
                name="channel"
                defaultValue="whatsapp"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              >
                {COMMUNICATION_CHANNELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Handled by Executive <span className="text-rose-500">*</span>
              </label>
              <input
                name="executive_name"
                defaultValue={session.name}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                WhatsApp Group / Participants
              </label>
              <input
                name="whatsapp_group"
                placeholder="e.g. Solhaus Marketing Core"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client Message Timestamp
              </label>
              <input
                name="client_message_at"
                type="datetime-local"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Team Response Timestamp
              </label>
              <input
                name="response_at"
                type="datetime-local"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Communication Summary / Context
            </label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Background context of the conversation..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Part 2: Feedback Classification &amp; Action Plan
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Feedback Subject <span className="text-rose-500">*</span>
                </label>
                <input
                  name="title"
                  required
                  placeholder="e.g. Menu post logo size adjustment requested"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category
                </label>
                <select
                  name="category"
                  defaultValue="creative"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                >
                  {FEEDBACK_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client&apos;s Exact Feedback / Revision Notes <span className="text-rose-500">*</span>
              </label>
              <textarea
                name="description"
                required
                rows={3}
                placeholder="What exactly did the client say or ask for?"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sentiment
                </label>
                <select
                  name="sentiment"
                  defaultValue="neutral"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                >
                  {FEEDBACK_SENTIMENTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Priority
                </label>
                <select
                  name="priority"
                  defaultValue="medium"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                >
                  {FEEDBACK_PRIORITIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} Priority
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assignee for Action
                </label>
                <select
                  name="assigned_to"
                  defaultValue={session.id}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expected Resolution Date
                </label>
                <input
                  name="due_date"
                  type="date"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-6 text-xs text-slate-700">
              <label className="flex items-center gap-2 font-medium cursor-pointer">
                <input type="checkbox" name="action_required" defaultChecked className="rounded text-[#ed8527]" />
                Action required by team
              </label>
              <label className="flex items-center gap-2 font-medium cursor-pointer">
                <input type="checkbox" name="create_task" defaultChecked className="rounded text-[#ed8527]" />
                Automatically provision an execution task on the board
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              type="submit"
              className="rounded-xl bg-[#ed8527] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 transition-all hover:bg-[#d97116] hover:shadow-lg active:scale-[0.99] cursor-pointer"
            >
              + Log Feedback &amp; Conversation
            </button>
          </div>
        </form>
      </details>

      {/* Feedback Feed */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 px-1">
          Feedback Records ({feedbackRows.length})
        </h3>

        {feedbackRows.map((f) => {
          const canManage =
            session.role === "owner" ||
            f.assigned_to === session.id ||
            f.assigned_to === null ||
            f.recorded_by === session.id;
          const tasks = tasksBy[f.id] || [];

          // Badges config
          const sentimentStyles = {
            positive: "bg-emerald-50 text-emerald-800 border-emerald-200",
            negative: "bg-rose-50 text-rose-800 border-rose-200 font-semibold",
            suggestion: "bg-blue-50 text-blue-800 border-blue-200",
            neutral: "bg-slate-100 text-slate-700 border-slate-200",
          }[f.sentiment as "positive" | "negative" | "suggestion" | "neutral"] || "bg-slate-100 text-slate-700";

          const priorityStyles = {
            urgent: "bg-rose-50 text-rose-700 border-rose-300 font-bold",
            high: "bg-amber-50 text-amber-800 border-amber-200 font-semibold",
            medium: "bg-slate-100 text-slate-700 border-slate-200",
            low: "bg-slate-50 text-slate-500 border-slate-200",
          }[f.priority as "urgent" | "high" | "medium" | "low"] || "bg-slate-100 text-slate-700";

          return (
            <article
              key={f.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-slate-300"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-400">
                      #{f.id}
                    </span>
                    <h4 className="text-base font-bold text-slate-900">
                      {f.title || f.content?.slice(0, 80)}
                    </h4>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200">
                      {f.client_name}
                    </span>
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5 text-slate-700 font-medium">
                      Status: <b className="text-slate-900">{feedbackStatusLabel(f.status)}</b>
                    </span>
                    <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5 text-slate-700">
                      {feedbackCategoryLabel(f.category)}
                    </span>
                    <span className={`rounded-md border px-2 py-0.5 ${sentimentStyles}`}>
                      {feedbackSentimentLabel(f.sentiment)}
                    </span>
                    <span className={`rounded-md border px-2 py-0.5 ${priorityStyles}`}>
                      {feedbackPriorityLabel(f.priority)} Priority
                    </span>
                    {f.post_title && (
                      <span className="rounded-md bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 font-medium">
                        Post: {f.post_title}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                    {f.content}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 text-xs text-slate-500 pt-1">
                    <div>
                      Assignee:{" "}
                      <span className="font-semibold text-slate-800">
                        {f.assignee_name || "Unassigned"}
                      </span>
                    </div>
                    {f.due_date && <div>Resolution Due: <span className="font-semibold text-slate-800">{f.due_date}</span></div>}
                    {f.resolved_at && (
                      <div className="text-emerald-700 font-medium">
                        ✓ Resolved on {f.resolved_at}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Originating Communication info */}
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs text-slate-700">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Source Communication
                </div>
                {f.communication_id ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link
                        href={`/communications?communication=${f.communication_id}`}
                        className="font-bold text-[#12143d] hover:text-[#ed8527] transition-colors"
                      >
                        Communication #{f.communication_id}
                      </Link>{" "}
                      via <span className="font-medium text-slate-800">{communicationChannelLabel(f.channel)}</span>
                      {f.whatsapp_group ? ` (${f.whatsapp_group})` : ""}
                    </div>
                    <div className="text-slate-400">
                      Logged by {f.recorded_by_name || "Team"} · Handled by {f.executive_name}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400 italic">
                    Logged directly without an external communication record.
                  </div>
                )}
              </div>

              {/* Linked Tasks */}
              <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                  <span>Linked Execution Tasks ({tasks.length})</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-700"
                    >
                      <Link
                        href={`/tasks?task=${task.id}`}
                        className="font-semibold text-[#12143d] hover:text-[#ed8527]"
                      >
                        #{task.id} {task.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <TaskPriorityBadge priority={task.priority} />
                        <span>{task.assignee_name || "Unassigned"}</span>
                        <span>·</span>
                        <span className="font-medium text-slate-800">{task.status}</span>
                        {task.due_date && <span>Due {task.due_date}</span>}
                      </div>
                    </div>
                  ))}
                  {!tasks.length && (
                    <div className="text-slate-400 italic text-xs">
                      No linked execution task.
                    </div>
                  )}
                </div>

                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer font-semibold text-[#ed8527] hover:underline">
                    + Provision Follow-up Task for this Feedback
                  </summary>
                  <form
                    action={createFeedbackTaskAction}
                    className="mt-2 grid gap-2 sm:grid-cols-4 bg-slate-50 p-3 rounded-xl border border-slate-200/80"
                  >
                    <input type="hidden" name="feedback_id" value={f.id} />
                    <select
                      name="assigned_to"
                      required
                      defaultValue={f.assigned_to || ""}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                    >
                      <option value="">Select Assignee *</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                    <input
                      name="due_date"
                      type="date"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                    />
                    <select
                      name="priority"
                      defaultValue={f.priority || "medium"}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                    >
                      {FEEDBACK_PRIORITIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#12143d] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer"
                    >
                      Create Task
                    </button>
                  </form>
                </details>
              </div>

              {/* Edit Feedback Form */}
              {canManage && (
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-slate-500 font-medium hover:text-[#12143d]">
                    ⚙️ Edit Feedback Lifecycle &amp; Resolution
                  </summary>
                  <form
                    action={updateFeedbackAction}
                    className="mt-2 grid gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:grid-cols-2 lg:grid-cols-6"
                  >
                    <input type="hidden" name="id" value={f.id} />
                    <div className="lg:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Subject
                      </label>
                      <input
                        name="title"
                        defaultValue={f.title || ""}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Category
                      </label>
                      <select
                        name="category"
                        defaultValue={f.category || "other"}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                      >
                        {FEEDBACK_CATEGORIES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Sentiment
                      </label>
                      <select
                        name="sentiment"
                        defaultValue={f.sentiment || "neutral"}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                      >
                        {FEEDBACK_SENTIMENTS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Status
                      </label>
                      <select
                        name="status"
                        defaultValue={f.status}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 font-medium"
                      >
                        {FEEDBACK_STATUSES.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="lg:col-span-6">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Description / Content
                      </label>
                      <textarea
                        name="description"
                        rows={2}
                        defaultValue={f.content || ""}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Assignee
                      </label>
                      <select
                        name="assigned_to"
                        defaultValue={f.assigned_to || ""}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
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
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Expected Due Date
                      </label>
                      <input
                        name="due_date"
                        type="date"
                        defaultValue={f.due_date || ""}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Action Taken Summary
                      </label>
                      <input
                        name="action_taken"
                        defaultValue={f.action_taken || ""}
                        placeholder="Resolution steps executed..."
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-[#12143d] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer"
                      >
                        Save Feedback
                      </button>
                    </div>
                  </form>
                </details>
              )}

              {/* Progress note updates */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Update Log &amp; Progress Notes
                </div>
                <div className="space-y-1 text-xs text-slate-700">
                  {(updatesBy[f.id] || []).map((update) => (
                    <div
                      key={update.id}
                      className="flex items-start gap-2 rounded-lg bg-slate-50 p-2"
                    >
                      <span className="font-semibold text-slate-900">
                        {update.user_name || "Team"}:
                      </span>
                      <span className="flex-1">{update.note}</span>
                      <span className="text-[10px] text-slate-400">
                        {update.created_at}
                      </span>
                    </div>
                  ))}
                  {!(updatesBy[f.id] || []).length && (
                    <div className="text-slate-400 italic text-xs">
                      No progress updates logged yet.
                    </div>
                  )}
                </div>

                <form action={addFeedbackNoteAction} className="mt-2.5 flex gap-2">
                  <input type="hidden" name="feedback_id" value={f.id} />
                  <input
                    name="note"
                    required
                    placeholder="Add progress update, client approval note, or blocker..."
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
            </article>
          );
        })}

        {!feedbackRows.length && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <h4 className="text-sm font-semibold text-slate-800">
              No feedback items found
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              All client feedback is caught up or no items match your active filter.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
