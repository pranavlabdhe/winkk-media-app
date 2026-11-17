import Link from "next/link";
import { revalidatePath } from "next/cache";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import { communicationTypeLabel, feedbackStatusLabel, taskCategoryLabel } from "@/lib/constants";
import { MODULE_LABELS, getLinkedModules } from "@/lib/activity-service";

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        {href ? (
          <Link href={href} className="text-sm text-blue-700 hover:underline">
            Manage
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
  db.prepare("INSERT OR IGNORE INTO client_team (client_id,user_id) VALUES (?,?)").run(clientId, userId);
  revalidatePath(`/clients/${clientId}`);
}

async function removeTeamMember(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "owner") return;
  const clientId = Number(formData.get("client_id"));
  const userId = Number(formData.get("user_id"));
  if (!clientId || !userId) return;
  db.prepare("DELETE FROM client_team WHERE client_id=? AND user_id=?").run(clientId, userId);
  revalidatePath(`/clients/${clientId}`);
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as any;
  if (!client) return <div className="p-4">Client not found.</div>;

  const posts = db
    .prepare("SELECT * FROM posts WHERE client_id=? ORDER BY COALESCE(scheduled_at,published_at,created_at) DESC")
    .all(id) as any[];
  const feedback = db
    .prepare("SELECT f.*, p.title post_title FROM feedback f LEFT JOIN posts p ON p.id=f.post_id WHERE f.client_id=? ORDER BY f.created_at DESC")
    .all(id) as any[];
  const comms = db
    .prepare("SELECT * FROM communications WHERE client_id=? ORDER BY created_at DESC")
    .all(id) as any[];
  const assigns = db
    .prepare("SELECT ba.*, b.name blogger_name FROM blogger_assignments ba JOIN bloggers b ON b.id=ba.blogger_id WHERE ba.client_id=? ORDER BY ba.created_at DESC")
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
    <div className="space-y-4">
      <div>
        <Link href="/clients" className="text-sm text-blue-700 hover:underline">
          ← Clients
        </Link>
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        <p className="text-sm text-zinc-600">
          Instagram: {client.instagram_handle || "-"} · WhatsApp: {client.whatsapp_group || "-"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <Section title="Unified activity timeline">
            <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {timeline.map((item) => {
                const label =
                  item.entity_type === "task"
                    ? "Task"
                    : MODULE_LABELS[item.entity_type as keyof typeof MODULE_LABELS] ||
                      item.entity_type;
                return (
                  <li key={item.id} className="rounded border p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {label} · {item.action}
                      </span>
                      <span className="text-xs">{item.created_at}</span>
                    </div>
                    <div>{item.summary}</div>
                    <div className="text-xs">
                      {item.user_name || "System"}
                      {item.task_id ? (
                        <>
                          {" · "}
                          <Link href={`/tasks?task=${item.task_id}`} className="underline">
                            Task #{item.task_id}
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
              {!timeline.length && (
                <li className="text-zinc-500">
                  No activity recorded yet. New tasks, posts, feedback, communications, blogger
                  assignments, and meetings will appear here automatically.
                </li>
              )}
            </ul>
          </Section>
        </div>

        <Section title="Assigned team">
          <ul className="space-y-1 text-sm">
            {team.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-2 rounded border p-2">
                <span>
                  <b>{member.name}</b>
                  {member.job_title ? ` · ${member.job_title}` : ""}
                </span>
                {session?.role === "owner" && (
                  <form action={removeTeamMember}>
                    <input type="hidden" name="client_id" value={client.id} />
                    <input type="hidden" name="user_id" value={member.id} />
                    <button className="rounded px-2 py-1 text-xs">Remove</button>
                  </form>
                )}
              </li>
            ))}
            {!team.length && <li className="text-zinc-500">No team members assigned yet.</li>}
          </ul>
          {session?.role === "owner" && (
            <form action={addTeamMember} className="mt-2 flex gap-2">
              <input type="hidden" name="client_id" value={client.id} />
              <select name="user_id" required className="flex-1 rounded border px-2 py-1 text-sm">
                <option value="">Add team member…</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                    {user.job_title ? ` · ${user.job_title}` : ""}
                  </option>
                ))}
              </select>
              <button className="rounded px-2 py-1 text-sm">Add</button>
            </form>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            The assigned team is the first point of contact for this client. Owner can change it at any time.
          </p>
        </Section>

        <Section title="Social posts" href={`/posts?client=${client.id}`}>
          <ul className="space-y-1 text-sm">
            {posts.slice(0, 5).map((post) => (
              <li key={post.id}>
                {post.title} — <b>{post.status}</b>
                {post.task_id ? (
                  <>
                    {" · "}
                    <Link href={`/tasks?task=${post.task_id}`} className="text-xs underline">
                      task #{post.task_id}
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
            {!posts.length && <li className="text-zinc-500">No posts.</li>}
          </ul>
        </Section>

        <Section title="Feedback & reviews" href={`/feedback?client=${client.id}`}>
          <ul className="space-y-1 text-sm">
            {feedback.slice(0, 5).map((item) => (
              <li key={item.id}>
                <Link href={`/feedback?feedback=${item.id}`} className="underline">
                  {item.title || String(item.content || "").slice(0, 60)}
                </Link>{" "}
                — <b>{feedbackStatusLabel(item.status)}</b>
                {item.communication_id ? (
                  <>
                    {" · "}
                    <Link
                      href={`/communications?communication=${item.communication_id}`}
                      className="text-xs underline"
                    >
                      conversation #{item.communication_id}
                    </Link>
                  </>
                ) : null}
                {item.task_id ? (
                  <>
                    {" · "}
                    <Link href={`/tasks?task=${item.task_id}`} className="text-xs underline">
                      task #{item.task_id}
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
            {!feedback.length && <li className="text-zinc-500">No feedback.</li>}
          </ul>
        </Section>

        <Section title="Client communication" href={`/communications?client=${client.id}`}>
          <ul className="space-y-1 text-sm">
            {comms.slice(0, 5).map((item) => (
              <li key={item.id}>
                <Link href={`/communications?communication=${item.id}`} className="underline">
                  {item.executive_name}
                </Link>{" "}
                — <b>{item.status}</b>
                {" · "}
                <span className="text-xs">{communicationTypeLabel(item.communication_type)}</span>
                {item.task_id ? (
                  <>
                    {" · "}
                    <Link href={`/tasks?task=${item.task_id}`} className="text-xs underline">
                      task #{item.task_id}
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
            {!comms.length && <li className="text-zinc-500">No communication logs.</li>}
          </ul>
        </Section>

        <Section title="Blogger assignments" href={`/bloggers?client=${client.id}`}>
          <ul className="space-y-1 text-sm">
            {assigns.slice(0, 5).map((item) => (
              <li key={item.id}>
                {item.blogger_name} — {item.assignment_status}/{item.completion_status}
                {item.task_id ? (
                  <>
                    {" · "}
                    <Link href={`/tasks?task=${item.task_id}`} className="text-xs underline">
                      task #{item.task_id}
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
            {!assigns.length && <li className="text-zinc-500">No assignments.</li>}
          </ul>
        </Section>

        <Section title="Meetings" href={`/meetings?client=${client.id}`}>
          <ul className="space-y-1 text-sm">
            {meetings.slice(0, 5).map((meeting) => (
              <li key={meeting.id}>
                {meeting.title} — <b>{meeting.status}</b> ({meeting.meeting_at})
                {meeting.task_id ? (
                  <>
                    {" · "}
                    <Link href={`/tasks?task=${meeting.task_id}`} className="text-xs underline">
                      task #{meeting.task_id}
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
            {!meetings.length && <li className="text-zinc-500">No meetings.</li>}
          </ul>
        </Section>

        <Section title="Client tasks" href={`/tasks?client=${client.id}`}>
          <ul className="space-y-1 text-sm">
            {tasks.slice(0, 8).map((task) => (
              <li key={task.id}>
                {task.title} — {task.assignee_name}
                {task.assignee_title ? ` (${task.assignee_title})` : ""} ·{" "}
                {taskCategoryLabel(task.category)} · <b>{task.status.replace("_", " ")}</b>
                {task.due_date ? ` · due ${task.due_date}` : ""}
                {(linkedByTask[task.id] || []).length ? (
                  <span className="text-xs">
                    {" · "}
                    {(linkedByTask[task.id] || []).map((link) => (
                      <span key={`${link.type}:${link.record_id}`} className="mr-2">
                        <Link href={`/tasks?task=${task.id}`} className="underline">
                          {MODULE_LABELS[link.type as keyof typeof MODULE_LABELS]}
                        </Link>
                      </span>
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
            {!tasks.length && <li className="text-zinc-500">No tasks for this client.</li>}
          </ul>
        </Section>
      </div>
    </div>
  );
}
