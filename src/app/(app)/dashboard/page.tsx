import Link from "next/link";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import { MODULE_LABELS } from "@/lib/activity-service";
import { clientVisibilityScope } from "@/lib/visibility";
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
              u.name assignee_name, t.due_date, t.status
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
      `SELECT al.*, u.name user_name, c.name client_name
       FROM activity_log al
       LEFT JOIN users u ON u.id=al.user_id
       LEFT JOIN clients c ON c.id=al.client_id
       ORDER BY al.created_at DESC
       LIMIT 10`
    )
    .all() as RecentActivity[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{isOwner ? "Owner Dashboard" : "My Dashboard"}</h1>
        <p className="text-sm text-zinc-600">
          {isOwner
            ? "Team workload, client delivery, and accountability at a glance. Click a teammate or a status card to drill in."
            : `Welcome ${session.name}. Your tasks and activity are prioritised here.`}
        </p>
      </div>

      <DashboardFilters
        tasks={tasks}
        members={members}
        counts={counts}
        postStatuses={postStatuses}
        isOwner={isOwner}
        today={todayIso}
      />

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">Recent unified activity</h2>
        <ul className="space-y-2 text-sm">
          {recentActivity.map((item) => (
            <li key={item.id} className="rounded border p-2">
              <span className="font-medium">{item.user_name || "System"}</span> · {item.summary}
              <div className="text-zinc-500">
                {item.entity_type === "task"
                  ? "Task"
                  : MODULE_LABELS[item.entity_type as keyof typeof MODULE_LABELS] ||
                    item.entity_type}
                {item.client_name ? ` · ${item.client_name}` : ""} · {item.created_at}
                {item.task_id ? (
                  <>
                    {" · "}
                    <Link href={`/tasks?task=${item.task_id}`} className="underline">
                      view task
                    </Link>
                  </>
                ) : null}
              </div>
            </li>
          ))}
          {!recentActivity.length && <li className="text-zinc-500">No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}
