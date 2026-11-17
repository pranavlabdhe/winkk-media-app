import Link from "next/link";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import { MODULE_LABELS } from "@/lib/activity-service";
import { clientVisibilityScope } from "@/lib/visibility";
import TaskPriorityBadge from "@/components/task-priority-badge";
import DashboardFilters, {
  type DashboardCounts,
  type DashboardMember,
  type DashboardTask,
  type PostStatusCounts,
} from "./dashboard-filters";

function count(sql: string, ...params: unknown[]) {
  return (db.prepare(sql).get(...params) as { c: number }).c;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

type RecentActivity = {
  id: number;
  summary: string;
  entity_type: string;
  client_name: string | null;
  created_at: string;
  task_id: number | null;
  task_title: string | null;
  task_priority: string | null;
  user_name: string | null;
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const isOwner = session.role === "owner";
  const todayIso = today();

  const tasks = db
    .prepare(
      `SELECT t.id, t.title, c.name client_name, t.category, t.assigned_to,
              u.name assignee_name, t.due_date, t.status, t.priority
       FROM tasks t
       LEFT JOIN clients c ON c.id=t.client_id
       LEFT JOIN users u ON u.id=t.assigned_to
       ${isOwner ? "" : "WHERE t.assigned_to=?"}
       ORDER BY CASE t.status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                t.due_date IS NULL, t.due_date, t.created_at DESC`
    )
    .all(...(isOwner ? [] : [session.id])) as DashboardTask[];

  const members = isOwner
    ? (db
        .prepare(
          `SELECT id,name,job_title,department FROM users
           WHERE is_active=1
           ORDER BY name`
        )
        .all() as DashboardMember[])
    : [];

  const counts: DashboardCounts = {
    clients: count("SELECT COUNT(*) c FROM clients"),
    feedbackOpen: count(
      "SELECT COUNT(*) c FROM feedback WHERE status IN ('new','under_review','action_required','in_progress','awaiting_client_response')"
    ),
    commsAttention: count(
      "SELECT COUNT(*) c FROM communications WHERE status IN ('pending','missed','delayed')"
    ),
    meetingsUpcoming: count("SELECT COUNT(*) c FROM meetings WHERE status='upcoming'"),
  };

  const postScope = clientVisibilityScope(session, "p");
  const postRows = db
    .prepare(
      `SELECT p.status status, COUNT(*) c FROM posts p
       ${postScope.sql ? `WHERE ${postScope.sql}` : ""}
       GROUP BY p.status`
    )
    .all(...postScope.params) as Array<{ status: string; c: number }>;

  const postStatuses: PostStatusCounts = {
    scheduled: 0,
    published: 0,
    pending: 0,
    missed: 0,
    total: 0,
  };
  for (const row of postRows) {
    if (row.status in postStatuses && row.status !== "total") {
      postStatuses[row.status as keyof Omit<PostStatusCounts, "total">] = row.c;
    }
    postStatuses.total += row.c;
  }

  const recentActivity = db
    .prepare(
      `SELECT al.*, u.name user_name, c.name client_name,
              t.title task_title, t.priority task_priority
       FROM activity_log al
       LEFT JOIN users u ON u.id=al.user_id
       LEFT JOIN clients c ON c.id=al.client_id
       LEFT JOIN tasks t ON t.id=al.task_id
       ORDER BY al.created_at DESC
       LIMIT 10`
    )
    .all() as RecentActivity[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#12143d] text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#12143d]">
              {isOwner ? "Agency Owner Command Center" : "Team Member Dashboard"}
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            {isOwner
              ? "Comprehensive operational metrics, cross-client workload distribution, and team accountability at a glance."
              : `Hello ${session.name}. Track your daily priorities and recent agency developments.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/tasks"
            className="rounded-xl bg-[#ed8527] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 hover:bg-[#d97116] transition-all cursor-pointer"
          >
            + New Task
          </Link>
        </div>
      </div>

      <DashboardFilters
        tasks={tasks}
        members={members}
        counts={counts}
        postStatuses={postStatuses}
        isOwner={isOwner}
        today={todayIso}
      />

      {/* Unified Activity Stream */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#12143d]" />
            <h2 className="text-sm font-bold text-[#12143d]">
              Recent Unified Agency Activity
            </h2>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Real-time cross-module audit trail
          </span>
        </div>

        <div className="space-y-2">
          {recentActivity.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-slate-50/70 p-3 text-xs border border-slate-100"
            >
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#12143d] text-white text-[10px] font-bold">
                  {(item.user_name || "S").charAt(0)}
                </div>
                <div>
                  <span className="font-bold text-slate-900">
                    {item.user_name || "System"}:
                  </span>{" "}
                  <span className="text-slate-700">{item.summary}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0 pl-8 sm:pl-0">
                <span className="rounded bg-white px-2 py-0.5 text-slate-600 border border-slate-200 font-medium">
                  {item.entity_type === "task"
                    ? "Task"
                    : MODULE_LABELS[item.entity_type as keyof typeof MODULE_LABELS] ||
                      item.entity_type}
                </span>
                {item.client_name && (
                  <span className="font-medium text-slate-600">
                    {item.client_name}
                  </span>
                )}
                <span>•</span>
                <span>{item.created_at}</span>
                {item.task_id && (
                  <>
                    <Link
                      href={`/tasks?task=${item.task_id}`}
                      className="font-bold text-[#ed8527] hover:underline"
                    >
                      {item.task_title || `Task #${item.task_id}`} →
                    </Link>
                    <TaskPriorityBadge priority={item.task_priority} />
                  </>
                )}
              </div>
            </div>
          ))}

          {!recentActivity.length && (
            <p className="text-xs text-slate-400 italic">No activity recorded yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
