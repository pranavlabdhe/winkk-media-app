import Link from "next/link";
import { revalidatePath } from "next/cache";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  communicationTypeLabel,
  feedbackStatusLabel,
  taskCategoryLabel,
} from "@/lib/constants";
import { MODULE_LABELS, getLinkedModules } from "@/lib/activity-service";

function Section({
  title,
  href,
  badge,
  children,
}: {
  title: string;
  href?: string;
  badge?: number | string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {title}
          </h2>
          {badge !== undefined && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {badge}
            </span>
          )}
        </div>
        {href ? (
          <Link
            href={href}
            className="text-xs font-semibold text-[#ed8527] hover:underline"
          >
            Manage All →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

async function addTeamMember(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "owner") return;
  const clientId = Number(formData.get("client_id"));
  const userId = Number(formData.get("user_id"));
  if (!clientId || !userId) return;
  db.prepare(
    "INSERT OR IGNORE INTO client_team (client_id,user_id) VALUES (?,?)"
  ).run(clientId, userId);
  revalidatePath(`/clients/${clientId}`);
}

async function removeTeamMember(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "owner") return;
  const clientId = Number(formData.get("client_id"));
  const userId = Number(formData.get("user_id"));
  if (!clientId || !userId) return;
  db.prepare("DELETE FROM client_team WHERE client_id=? AND user_id=?").run(
    clientId,
    userId
  );
  revalidatePath(`/clients/${clientId}`);
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as any;
  if (!client) return <div className="p-6 text-slate-500">Client not found.</div>;

  const posts = db
    .prepare(
      "SELECT * FROM posts WHERE client_id=? ORDER BY COALESCE(scheduled_at,published_at,created_at) DESC"
    )
    .all(id) as any[];
  const feedback = db
    .prepare(
      "SELECT f.*, p.title post_title FROM feedback f LEFT JOIN posts p ON p.id=f.post_id WHERE f.client_id=? ORDER BY f.created_at DESC"
    )
    .all(id) as any[];
  const comms = db
    .prepare("SELECT * FROM communications WHERE client_id=? ORDER BY created_at DESC")
    .all(id) as any[];
  const assigns = db
    .prepare(
      "SELECT ba.*, b.name blogger_name FROM blogger_assignments ba JOIN bloggers b ON b.id=ba.blogger_id WHERE ba.client_id=? ORDER BY ba.created_at DESC"
    )
    .all(id) as any[];
  const meetings = db
    .prepare("SELECT * FROM meetings WHERE client_id=? ORDER BY meeting_at DESC")
    .all(id) as any[];
  const tasks = db
    .prepare(
      `SELECT t.*, u.name assignee_name, u.job_title assignee_title
       FROM tasks t JOIN users u ON u.id=t.assigned_to
       WHERE t.client_id=?
       ORDER BY CASE t.status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                t.due_date IS NULL, t.due_date`
    )
    .all(id) as any[];
  const linkedModules = getLinkedModules(tasks.map((task) => task.id));
  const linkedByTask: Record<number, any[]> = {};
  for (const link of linkedModules) (linkedByTask[link.task_id] ||= []).push(link);
  const timeline = db
    .prepare(
      `SELECT al.*, u.name user_name
       FROM activity_log al LEFT JOIN users u ON u.id=al.user_id
       WHERE al.client_id=?
       ORDER BY al.created_at DESC
       LIMIT 40`
    )
    .all(id) as any[];
  const team = db
    .prepare(
      `SELECT u.id,u.name,u.email,u.job_title,u.department
       FROM client_team ct JOIN users u ON u.id=ct.user_id
       WHERE ct.client_id=? ORDER BY u.name`
    )
    .all(id) as any[];
  const availableUsers = db
    .prepare(
      `SELECT id,name,job_title FROM users
       WHERE is_active=1 AND id NOT IN (SELECT user_id FROM client_team WHERE client_id=?)
       ORDER BY name`
    )
    .all(id) as any[];

  return (
    <div className="space-y-6">
      {/* Client Overview Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <Link
              href="/clients"
              className="text-xs font-semibold text-[#ed8527] hover:underline"
            >
              ← Back to All Clients
            </Link>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#12143d]">
              {client.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/tasks?client=${client.id}`}
              className="rounded-xl bg-[#ed8527] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 hover:bg-[#d97116] transition-all cursor-pointer"
            >
              + Create Client Task
            </Link>
            <Link
              href={`/posts?client=${client.id}`}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#12143d] hover:bg-slate-50 transition-colors shadow-2xs"
            >
              + Schedule Post
            </Link>
          </div>
        </div>

        {/* Metadata Details */}
        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
            <span className="text-slate-400 font-medium">Instagram:</span>{" "}
            <span className="font-semibold text-slate-800">
              {client.instagram_handle || "None"}
            </span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
            <span className="text-slate-400 font-medium">WhatsApp Group:</span>{" "}
            <span className="font-semibold text-slate-800">
              {client.whatsapp_group || "None"}
            </span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
            <span className="text-slate-400 font-medium">Active Team:</span>{" "}
            <span className="font-semibold text-slate-800">
              {team.length} member{team.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {client.notes && (
          <p className="text-xs text-slate-600 bg-slate-50/60 p-3 rounded-xl border border-slate-100 italic">
            &quot;{client.notes}&quot;
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Timeline */}
        <div className="lg:col-span-2">
          <Section title="Unified Activity Timeline" badge={timeline.length}>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {timeline.map((item) => {
                const label =
                  item.entity_type === "task"
                    ? "Task"
                    : MODULE_LABELS[item.entity_type as keyof typeof MODULE_LABELS] ||
                      item.entity_type;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 rounded-xl bg-slate-50/70 p-3 text-xs border border-slate-100"
                  >
                    <div>
                      <span className="font-bold text-[#12143d]">{label}</span>{" "}
                      <span className="text-slate-500 font-medium">({item.action}):</span>{" "}
                      <span className="text-slate-800">{item.summary}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
                      <span>{item.user_name || "System"}</span>
                      <span>•</span>
                      <span>{item.created_at}</span>
                      {item.task_id && (
                        <Link
                          href={`/tasks?task=${item.task_id}`}
                          className="font-bold text-[#ed8527] hover:underline"
                        >
                          Task #{item.task_id}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
              {!timeline.length && (
                <p className="text-xs text-slate-400 italic">
                  No activity recorded yet for this client account.
                </p>
              )}
            </div>
          </Section>
        </div>

        {/* Assigned Team */}
        <Section title="Assigned Account Team" badge={team.length}>
          <div className="space-y-2">
            {team.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900">{member.name}</span>
                  {member.job_title && (
                    <span className="text-slate-500"> · {member.job_title}</span>
                  )}
                </div>
                {session?.role === "owner" && (
                  <form action={removeTeamMember}>
                    <input type="hidden" name="client_id" value={client.id} />
                    <input type="hidden" name="user_id" value={member.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </div>
            ))}
            {!team.length && (
              <p className="text-xs text-slate-400 italic">
                No team members assigned yet.
              </p>
            )}
          </div>

          {session?.role === "owner" && availableUsers.length > 0 && (
            <form action={addTeamMember} className="mt-3 flex gap-2">
              <input type="hidden" name="client_id" value={client.id} />
              <select
                name="user_id"
                required
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
              >
                <option value="">Add team member to this account…</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                    {user.job_title ? ` (${user.job_title})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-xl bg-[#12143d] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer shadow-2xs"
              >
                Add
              </button>
            </form>
          )}
        </Section>

        {/* Client Tasks */}
        <Section
          title="Active Client Tasks"
          href={`/tasks?client=${client.id}`}
          badge={tasks.length}
        >
          <div className="space-y-2">
            {tasks.slice(0, 5).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
              >
                <Link
                  href={`/tasks?task=${task.id}`}
                  className="font-bold text-[#12143d] hover:text-[#ed8527] line-clamp-1"
                >
                  #{task.id} {task.title}
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-slate-500">{task.assignee_name}</span>
                  <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                    {task.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            ))}
            {!tasks.length && (
              <p className="text-xs text-slate-400 italic">No tasks for this client.</p>
            )}
          </div>
        </Section>

        {/* Social Posts */}
        <Section
          title="Social Posts &amp; Reels"
          href={`/posts?client=${client.id}`}
          badge={posts.length}
        >
          <div className="space-y-2">
            {posts.slice(0, 5).map((post) => (
              <div
                key={post.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
              >
                <span className="font-bold text-[#12143d] line-clamp-1">
                  {post.title}
                </span>
                <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                  {post.status}
                </span>
              </div>
            ))}
            {!posts.length && (
              <p className="text-xs text-slate-400 italic">No posts recorded.</p>
            )}
          </div>
        </Section>

        {/* Feedback */}
        <Section
          title="Client Feedback"
          href={`/feedback?client=${client.id}`}
          badge={feedback.length}
        >
          <div className="space-y-2">
            {feedback.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
              >
                <Link
                  href={`/feedback?feedback=${item.id}`}
                  className="font-bold text-[#12143d] hover:text-[#ed8527] line-clamp-1"
                >
                  {item.title || item.content?.slice(0, 60)}
                </Link>
                <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                  {feedbackStatusLabel(item.status)}
                </span>
              </div>
            ))}
            {!feedback.length && (
              <p className="text-xs text-slate-400 italic">No feedback recorded.</p>
            )}
          </div>
        </Section>

        {/* Communications */}
        <Section
          title="Communications &amp; SLA"
          href={`/communications?client=${client.id}`}
          badge={comms.length}
        >
          <div className="space-y-2">
            {comms.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
              >
                <Link
                  href={`/communications?communication=${item.id}`}
                  className="font-bold text-[#12143d] hover:text-[#ed8527]"
                >
                  By {item.executive_name} ({communicationTypeLabel(item.communication_type)})
                </Link>
                <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                  {item.status}
                </span>
              </div>
            ))}
            {!comms.length && (
              <p className="text-xs text-slate-400 italic">No communication logs.</p>
            )}
          </div>
        </Section>

        {/* Blogger Assignments */}
        <Section
          title="Blogger Collaborations"
          href={`/bloggers?client=${client.id}`}
          badge={assigns.length}
        >
          <div className="space-y-2">
            {assigns.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
              >
                <span className="font-bold text-[#12143d]">
                  {item.blogger_name}
                </span>
                <span className="text-slate-500 text-[11px]">
                  {item.assignment_status} / {item.completion_status}
                </span>
              </div>
            ))}
            {!assigns.length && (
              <p className="text-xs text-slate-400 italic">No blogger assignments.</p>
            )}
          </div>
        </Section>

        {/* Meetings */}
        <Section
          title="Meetings &amp; Agendas"
          href={`/meetings?client=${client.id}`}
          badge={meetings.length}
        >
          <div className="space-y-2">
            {meetings.slice(0, 5).map((meeting) => (
              <div
                key={meeting.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
              >
                <span className="font-bold text-[#12143d]">
                  {meeting.title}
                </span>
                <span className="text-slate-500 text-[11px]">
                  {meeting.meeting_at} ({meeting.status})
                </span>
              </div>
            ))}
            {!meetings.length && (
              <p className="text-xs text-slate-400 italic">No meetings scheduled.</p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
