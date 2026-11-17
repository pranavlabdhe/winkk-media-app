import Link from "next/link";
import { revalidatePath } from "next/cache";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import { taskCategoryLabel } from "@/lib/constants";
import {
  ensureTaskForModule,
  linkModuleToTask,
  logActivity,
  syncModuleToTask,
} from "@/lib/activity-service";
import { clientVisibilityScope } from "@/lib/visibility";

const POST_STATUSES = ["scheduled", "published", "pending", "missed"] as const;
type PostStatus = (typeof POST_STATUSES)[number];

function isPostStatus(value: string | undefined): value is PostStatus {
  return POST_STATUSES.includes(value as PostStatus);
}

type ClientOption = { id: number; name: string };

type LinkableTask = {
  id: number;
  title: string;
  category: string | null;
  client_id: number | null;
  client_name: string | null;
};

type PostRow = {
  id: number;
  client_id: number;
  title: string;
  platform: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  status: PostStatus;
  caption: string | null;
  post_url: string | null;
  created_at: string;
  task_id: number | null;
};

type PostWithLinks = PostRow & {
  client_name: string;
  linked_task_id: number | null;
  linked_task_title: string | null;
  linked_task_status: string | null;
  linked_task_due: string | null;
  linked_task_assignee: string | null;
};

function refreshUnified(clientId?: number | null) {
  for (const path of ["/posts", "/tasks", "/my-work", "/dashboard", "/clients"]) {
    revalidatePath(path);
  }
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

async function createPost(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) return;
  const client_id = Number(formData.get("client_id"));
  const title = String(formData.get("title") || "").trim();
  if (!client_id || !title) return;

  const result = db
    .prepare(
      `INSERT INTO posts (client_id,title,platform,scheduled_at,published_at,status,caption,post_url)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      client_id,
      title,
      String(formData.get("platform") || "Instagram"),
      String(formData.get("scheduled_at") || "") || null,
      String(formData.get("published_at") || "") || null,
      String(formData.get("status") || "scheduled"),
      String(formData.get("caption") || "") || null,
      String(formData.get("post_url") || "") || null
    );
  const postId = Number(result.lastInsertRowid);
  const selectedTask = Number(formData.get("task_id"));
  const taskId = selectedTask
    ? (linkModuleToTask("post", postId, selectedTask, session.id), selectedTask)
    : ensureTaskForModule("post", postId, session.id);

  logActivity({
    clientId: client_id,
    taskId,
    entityType: "post",
    entityId: postId,
    action: "created",
    summary: `Social post "${title}" recorded.`,
    userId: session.id,
  });
  refreshUnified(client_id);
}

async function updatePost(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const current = db.prepare("SELECT * FROM posts WHERE id=?").get(id) as PostRow | undefined;
  if (!current) return;

  const nextStatus = String(formData.get("status") || "pending");
  db.prepare("UPDATE posts SET status=?, published_at=?, post_url=? WHERE id=?").run(
    nextStatus,
    String(formData.get("published_at") || "") || null,
    String(formData.get("post_url") || "") || null,
    id
  );
  const taskId = syncModuleToTask("post", id, session.id, {
    statusChanged: current.status !== nextStatus,
  });
  logActivity({
    clientId: current.client_id,
    taskId,
    entityType: "post",
    entityId: id,
    action: "updated",
    summary: `Social post "${current.title}" updated to ${nextStatus}.`,
    userId: session.id,
  });
  refreshUnified(current.client_id);
}

async function deletePost(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const post = db.prepare("SELECT * FROM posts WHERE id=?").get(id) as PostRow | undefined;
  if (!post) return;
  db.prepare("DELETE FROM posts WHERE id=?").run(id);
  logActivity({
    clientId: post.client_id,
    taskId: post.task_id,
    entityType: "post",
    entityId: id,
    action: "deleted",
    summary: `Social post "${post.title}" deleted. Linked task was retained.`,
    userId: session.id,
  });
  refreshUnified(post.client_id);
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; task?: string; status?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;

  const sp = await searchParams;
  const clientFilter = sp.client ? Number(sp.client) : null;
  const taskFilter = sp.task ? Number(sp.task) : null;
  const statusFilter = isPostStatus(sp.status) ? sp.status : null;
  const clients = db.prepare("SELECT id,name FROM clients ORDER BY name").all() as ClientOption[];
  const linkableTasks = db
    .prepare(
      `SELECT t.id,t.title,t.category,t.client_id,c.name client_name
       FROM tasks t LEFT JOIN clients c ON c.id=t.client_id
       WHERE t.id NOT IN (SELECT task_id FROM posts WHERE task_id IS NOT NULL)
       ORDER BY t.created_at DESC LIMIT 50`
    )
    .all() as LinkableTask[];

  const where: string[] = [];
  const params: unknown[] = [];
  const scope = clientVisibilityScope(session, "p");
  if (scope.sql) {
    where.push(scope.sql);
    params.push(...scope.params);
  }
  if (taskFilter) {
    where.push("p.task_id = ?");
    params.push(taskFilter);
  } else if (clientFilter) {
    where.push("p.client_id = ?");
    params.push(clientFilter);
  }

  const posts = db
    .prepare(
      `SELECT p.*, c.name client_name,
              t.id linked_task_id, t.title linked_task_title, t.status linked_task_status,
              t.due_date linked_task_due, u.name linked_task_assignee
       FROM posts p
       JOIN clients c ON c.id=p.client_id
       LEFT JOIN tasks t ON t.id=p.task_id
       LEFT JOIN users u ON u.id=t.assigned_to
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY COALESCE(p.scheduled_at,p.published_at,p.created_at) DESC`
    )
    .all(...params) as PostWithLinks[];

  const counts = {
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
    pending: posts.filter((p) => p.status === "pending").length,
    missed: posts.filter((p) => p.status === "missed").length,
  };
  const visiblePosts = statusFilter
    ? posts.filter((p) => p.status === statusFilter)
    : posts;

  function statusHref(next: PostStatus | null) {
    const query = new URLSearchParams();
    if (clientFilter) query.set("client", String(clientFilter));
    if (taskFilter) query.set("task", String(taskFilter));
    if (next) query.set("status", next);
    const qs = query.toString();
    return qs ? `/posts?${qs}` : "/posts";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Social Media Post Tracking</h1>
        <p className="text-sm">
          Each post is connected to a task, owner, deadline, status, and shared activity timeline.
        </p>
      </div>
      {taskFilter && (
        <div className="rounded border bg-white p-2 text-sm">
          Showing the post linked to task #{taskFilter}. <Link href="/posts" className="underline">Show all posts</Link>
        </div>
      )}
      {statusFilter && (
        <div className="rounded border bg-white p-2 text-sm">
          Showing <b>{statusFilter}</b> posts ({visiblePosts.length}).{" "}
          <Link href={statusHref(null)} className="underline">
            Show all posts
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={statusHref(null)}
          aria-current={statusFilter ? undefined : "page"}
          className={`rounded border px-2 py-1 transition hover:bg-zinc-50 ${
            statusFilter ? "bg-white" : "border-zinc-900 bg-zinc-100 font-semibold"
          }`}
        >
          All: <b>{posts.length}</b>
        </Link>
        {POST_STATUSES.map((status) => {
          const active = statusFilter === status;
          const label = status.charAt(0).toUpperCase() + status.slice(1);
          return (
            <Link
              key={status}
              href={statusHref(active ? null : status)}
              aria-current={active ? "page" : undefined}
              className={`rounded border px-2 py-1 transition hover:bg-zinc-50 ${
                active ? "border-zinc-900 bg-zinc-100 font-semibold" : "bg-white"
              }`}
            >
              {label}: <b>{counts[status]}</b>
              {active ? " ×" : ""}
            </Link>
          );
        })}
      </div>
      <form action={createPost} className="grid gap-2 rounded-lg border bg-white p-4 md:grid-cols-4">
        <select name="client_id" required className="rounded border px-3 py-2" defaultValue={clientFilter || ""}>
          <option value="">Select client *</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input name="title" required placeholder="Post title *" className="rounded border px-3 py-2" />
        <select name="status" className="rounded border px-3 py-2">
          {["scheduled", "published", "pending", "missed"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input name="platform" defaultValue="Instagram" className="rounded border px-3 py-2" />
        <input name="scheduled_at" type="datetime-local" className="rounded border px-3 py-2" />
        <input name="published_at" type="datetime-local" className="rounded border px-3 py-2" />
        <input name="post_url" placeholder="Post URL" className="rounded border px-3 py-2" />
        <input name="caption" placeholder="Caption/notes" className="rounded border px-3 py-2" />
        <select name="task_id" className="rounded border px-3 py-2 md:col-span-2">
          <option value="">Create/link task automatically</option>
          {linkableTasks.map((task) => (
            <option key={task.id} value={task.id}>
              Link to task: {task.title} · {task.client_name || "Internal"} · {taskCategoryLabel(task.category)}
            </option>
          ))}
        </select>
        <div className="self-center text-xs md:col-span-2">
          Leaving this blank creates a linked task automatically.
        </div>
        <button className="rounded px-3 py-2 md:col-span-4">Add post</button>
      </form>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr>
              <th className="p-2">Client</th>
              <th className="p-2">Title</th>
              <th className="p-2">Scheduled</th>
              <th className="p-2">Published</th>
              <th className="p-2">Status</th>
              <th className="p-2">Linked task</th>
              <th className="p-2">Update</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {visiblePosts.map((p) => (
              <tr key={p.id} className="border-t align-top">
                <td className="p-2">{p.client_name}</td>
                <td className="p-2">
                  {p.title}
                  <div className="text-xs text-zinc-500">{p.platform}</div>
                  {p.post_url && (
                    <a className="text-xs text-blue-700" href={p.post_url} target="_blank">link</a>
                  )}
                </td>
                <td className="p-2">{p.scheduled_at || "-"}</td>
                <td className="p-2">{p.published_at || "-"}</td>
                <td className="p-2 font-medium">{p.status}</td>
                <td className="p-2">
                  {p.linked_task_id ? (
                    <div className="text-xs">
                      <Link href={`/tasks?task=${p.linked_task_id}`} className="underline">
                        {p.linked_task_title}
                      </Link>
                      <div>{p.linked_task_assignee || "Unassigned"} · {p.linked_task_status}</div>
                      <div>Due: {p.linked_task_due || "-"}</div>
                    </div>
                  ) : (
                    <span className="text-xs">No linked task</span>
                  )}
                </td>
                <td className="p-2">
                  <form
                    key={`${p.id}:${p.status}:${p.published_at || ""}`}
                    action={updatePost}
                    className="flex flex-wrap gap-1"
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <select name="status" defaultValue={p.status} className="rounded border px-1 py-1">
                      {["scheduled", "published", "pending", "missed"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <input name="published_at" type="datetime-local" defaultValue={p.published_at || ""} className="rounded border px-1 py-1" />
                    <input name="post_url" placeholder="URL" defaultValue={p.post_url || ""} className="w-28 rounded border px-1 py-1" />
                    <button className="rounded border px-2 py-1">Save</button>
                  </form>
                </td>
                <td className="p-2">
                  <form action={deletePost}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="rounded px-2 py-1 text-xs">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {!visiblePosts.length && (
              <tr>
                <td className="p-4 text-zinc-500" colSpan={8}>
                  {statusFilter ? `No ${statusFilter} posts.` : "No posts yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
