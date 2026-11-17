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

  const statusBadges: Record<
    PostStatus,
    { label: string; badge: string; dot: string }
  > = {
    scheduled: {
      label: "Scheduled",
      badge: "bg-blue-50 text-blue-700 border-blue-200",
      dot: "bg-blue-500",
    },
    published: {
      label: "Published",
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold",
      dot: "bg-emerald-500",
    },
    pending: {
      label: "Pending Review",
      badge: "bg-amber-50 text-amber-800 border-amber-200 font-semibold",
      dot: "bg-amber-500",
    },
    missed: {
      label: "Missed Deadline",
      badge: "bg-rose-50 text-rose-700 border-rose-200 font-bold",
      dot: "bg-rose-500",
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ed8527] text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#12143d]">
              Social Media Content & Posts
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Publishing pipeline for Instagram reels, carousels, and client campaigns linked to production tasks.
          </p>
        </div>

        {/* Status Pipeline Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Link
            href={statusHref(null)}
            className={`rounded-xl border px-3 py-1.5 font-semibold transition-all ${
              !statusFilter
                ? "bg-[#12143d] text-white border-[#12143d] shadow-2xs"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            All Posts ({posts.length})
          </Link>
          {POST_STATUSES.map((st) => {
            const active = statusFilter === st;
            const cfg = statusBadges[st];
            return (
              <Link
                key={st}
                href={statusHref(active ? null : st)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-semibold transition-all ${
                  active
                    ? "bg-[#12143d] text-white border-[#12143d] shadow-2xs"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    active ? "bg-[#ed8527]" : cfg.dot
                  }`}
                />
                <span>{cfg.label}</span>
                <span className="font-bold opacity-80">({counts[st]})</span>
                {active && <span className="ml-1 text-[10px]">✕</span>}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Task isolation notice */}
      {taskFilter && (
        <div className="flex items-center justify-between rounded-xl border border-[#ed8527]/30 bg-orange-50/60 px-4 py-3 text-xs sm:text-sm text-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ed8527] text-white text-[10px] font-bold">
              i
            </span>
            Filtering posts linked to Task <span className="font-bold text-[#12143d]">#{taskFilter}</span>.
          </div>
          <Link
            href="/posts"
            className="rounded-lg bg-white border border-slate-200 px-3 py-1 text-xs font-semibold text-[#12143d] hover:bg-slate-50 shadow-2xs"
          >
            Show All Posts
          </Link>
        </div>
      )}

      {/* Schedule / Add Post Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#ed8527]/10 text-[#ed8527]">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </span>
            <h2 className="text-sm font-bold text-[#12143d]">
              Schedule or Record a Social Post
            </h2>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Automatically synchronizes with task board & activity history
          </span>
        </div>

        <form action={createPost} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client Account <span className="text-rose-500">*</span>
              </label>
              <select
                name="client_id"
                required
                defaultValue={clientFilter || ""}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">Select client *</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Post Title / Theme <span className="text-rose-500">*</span>
              </label>
              <input
                name="title"
                required
                placeholder="e.g. Special Festive Menu Reel Launch"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Initial Status
              </label>
              <select
                name="status"
                defaultValue="scheduled"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                {POST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusBadges[s].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Platform
              </label>
              <input
                name="platform"
                defaultValue="Instagram"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Scheduled Publishing Date
              </label>
              <input
                name="scheduled_at"
                type="datetime-local"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Actual Published Date (if published)
              </label>
              <input
                name="published_at"
                type="datetime-local"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Live Post URL
              </label>
              <input
                name="post_url"
                type="url"
                placeholder="https://instagram.com/p/..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Caption & Production Notes
              </label>
              <input
                name="caption"
                placeholder="Copy draft, audio track name, tags to mention..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Linked Task (Optional)
              </label>
              <select
                name="task_id"
                defaultValue=""
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">Create new linked task automatically</option>
                {linkableTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    Link to #{task.id}: {task.title} · {task.client_name || "Internal"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <p className="text-xs text-slate-500">
              💡 Leaving &quot;Linked Task&quot; empty will automatically provision an execution task for the social media executive.
            </p>
            <button
              type="submit"
              className="w-full sm:w-auto rounded-xl bg-[#ed8527] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 transition-all hover:bg-[#d97116] hover:shadow-lg hover:shadow-[#ed8527]/25 active:scale-[0.99] cursor-pointer"
            >
              + Add & Schedule Post
            </button>
          </div>
        </form>
      </div>

      {/* Posts Table / Responsive List */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs sm:text-sm">
            <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Post Info & Platform</th>
                <th className="px-4 py-3">Scheduled Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Linked Task</th>
                <th className="px-4 py-3">Quick Update</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visiblePosts.map((p) => {
                const cfg = statusBadges[p.status];
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Client */}
                    <td className="px-4 py-3 font-semibold text-[#12143d] whitespace-nowrap">
                      <Link
                        href={`/clients/${p.client_id}`}
                        className="hover:text-[#ed8527] transition-colors"
                      >
                        {p.client_name}
                      </Link>
                    </td>

                    {/* Post Info */}
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-bold text-slate-900 leading-snug">
                        {p.title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">
                          {p.platform || "Instagram"}
                        </span>
                        {p.post_url && (
                          <a
                            href={p.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-[#ed8527] hover:underline flex items-center gap-1"
                          >
                            <span>Open URL</span>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                      </div>
                      {p.caption && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-400 italic">
                          &quot;{p.caption}&quot;
                        </p>
                      )}
                    </td>

                    {/* Scheduled */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                      <div>{p.scheduled_at || "—"}</div>
                      {p.published_at && (
                        <div className="text-[11px] text-emerald-600 font-medium">
                          Published: {p.published_at}
                        </div>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${cfg.badge}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </td>

                    {/* Linked Task */}
                    <td className="px-4 py-3 max-w-[180px]">
                      {p.linked_task_id ? (
                        <div className="rounded-lg bg-slate-50 p-2 border border-slate-100 text-xs">
                          <Link
                            href={`/tasks?task=${p.linked_task_id}`}
                            className="font-semibold text-[#12143d] hover:text-[#ed8527] transition-colors line-clamp-1"
                          >
                            #{p.linked_task_id} {p.linked_task_title}
                          </Link>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {p.linked_task_assignee || "Unassigned"} · {p.linked_task_status}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          No task attached
                        </span>
                      )}
                    </td>

                    {/* Quick Update */}
                    <td className="px-4 py-3">
                      <form
                        key={`${p.id}:${p.status}:${p.published_at || ""}`}
                        action={updatePost}
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        <input type="hidden" name="id" value={p.id} />
                        <select
                          name="status"
                          defaultValue={p.status}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-[#ed8527] focus:outline-none"
                        >
                          {POST_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {statusBadges[s].label}
                            </option>
                          ))}
                        </select>
                        <input
                          name="post_url"
                          placeholder="Post URL"
                          defaultValue={p.post_url || ""}
                          className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-[#ed8527] focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-[#12143d] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer shadow-2xs"
                        >
                          Save
                        </button>
                      </form>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <form action={deletePost}>
                        <input type="hidden" name="id" value={p.id} />
                        <button
                          type="submit"
                          className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}

              {!visiblePosts.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <p className="text-sm font-semibold text-slate-700">
                      No social posts found
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {statusFilter
                        ? `There are no posts with status "${statusFilter}".`
                        : "Schedule your first social post using the form above."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
