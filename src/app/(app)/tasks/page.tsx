import Link from "next/link";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  TASK_CATEGORIES,
  TASK_STATUSES,
  feedbackStatusLabel,
  isTaskCategory,
  isTaskStatus,
  taskCategoryLabel,
} from "@/lib/constants";
import {
  MODULE_LABELS,
  getLinkedModules,
  getUnlinkedModuleRecords,
} from "@/lib/activity-service";
import { getFeedbackForTasks } from "@/lib/interaction-service";
import {
  addTaskUpdateAction,
  createTaskAction,
  deleteTaskAction,
  linkTaskModuleAction,
  unlinkTaskModuleAction,
  updateTaskAction,
} from "@/lib/task-actions";

const MODULE_PATHS: Record<string, string> = {
  post: "/posts",
  feedback: "/feedback",
  communication: "/communications",
  blogger_assignment: "/bloggers",
  meeting: "/meetings",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    client?: string;
    assignee?: string;
    category?: string;
    status?: string;
    task?: string;
  }>;
}) {
  const session = await getSession();
  const sp = await searchParams;

  const clientFilter = sp.client ? Number(sp.client) || null : null;
  const assigneeFilter = sp.assignee === "me" ? session?.id || null : sp.assignee ? Number(sp.assignee) || null : null;
  const categoryFilter = sp.category && isTaskCategory(sp.category) ? sp.category : null;
  const statusFilter = sp.status && isTaskStatus(sp.status) ? sp.status : null;
  const taskFilter = sp.task ? Number(sp.task) || null : null;

  const users = db
    .prepare("SELECT id,name,role,job_title,department,is_active FROM users ORDER BY is_active DESC, name")
    .all() as any[];
  const clients = db.prepare("SELECT id,name FROM clients ORDER BY name").all() as any[];
  const bloggers = db.prepare("SELECT id,name FROM bloggers ORDER BY name").all() as any[];
  const unlinkedRecords = getUnlinkedModuleRecords();

  const where: string[] = [];
  const params: unknown[] = [];
  if (taskFilter) {
    where.push("t.id = ?");
    params.push(taskFilter);
  }
  if (clientFilter) {
    where.push("t.client_id = ?");
    params.push(clientFilter);
  }
  if (assigneeFilter) {
    where.push("t.assigned_to = ?");
    params.push(assigneeFilter);
  }
  if (categoryFilter) {
    where.push("t.category = ?");
    params.push(categoryFilter);
  }
  if (statusFilter) {
    where.push("t.status = ?");
    params.push(statusFilter);
  }

  const tasks = db
    .prepare(
      `SELECT t.*, u1.name assignee_name, u1.job_title assignee_title, u2.name assigner_name, c.name client_name
       FROM tasks t
       JOIN users u1 ON u1.id=t.assigned_to
       JOIN users u2 ON u2.id=t.assigned_by
       LEFT JOIN clients c ON c.id=t.client_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY CASE t.status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                t.due_date IS NULL, t.due_date, t.created_at DESC`
    )
    .all(...params) as any[];

  const taskIds = tasks.map((task) => task.id);
  const linkedModules = getLinkedModules(taskIds);
  const linkedByTask: Record<number, any[]> = {};
  for (const link of linkedModules) (linkedByTask[link.task_id] ||= []).push(link);

  const feedbackByTask: Record<number, any[]> = {};
  for (const row of getFeedbackForTasks(taskIds)) {
    (feedbackByTask[row.task_id] ||= []).push(row);
  }

  const parentTaskIds = tasks
    .map((task) => task.follow_up_of_task_id)
    .filter(Boolean) as number[];
  let parentTitles: Record<number, string> = {};
  if (parentTaskIds.length) {
    const parents = db
      .prepare(
        `SELECT id,title FROM tasks WHERE id IN (${parentTaskIds.map(() => "?").join(",")})`
      )
      .all(...parentTaskIds) as any[];
    parentTitles = Object.fromEntries(parents.map((row) => [row.id, row.title]));
  }

  const updates = db
    .prepare(
      `SELECT tu.*, u.name user_name FROM task_updates tu JOIN users u ON u.id=tu.user_id
       ORDER BY tu.created_at DESC`
    )
    .all() as any[];
  const updatesByTask: Record<number, any[]> = {};
  for (const update of updates) (updatesByTask[update.task_id] ||= []).push(update);

  const defaultCategory =
    session?.department === "design"
      ? "design"
      : session?.department === "social"
        ? "social_media"
        : session?.department === "strategy"
          ? "strategy"
          : "other";

  const today = new Date().toISOString().slice(0, 10);
  const currentFilters = new URLSearchParams(
    Object.entries({
      client: sp.client,
      assignee: sp.assignee,
      category: sp.category,
      status: sp.status,
      task: sp.task,
    }).filter(([, value]) => value) as [string, string][]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Client-wise Task Board</h1>
        <p className="text-sm">
          Every business activity is captured once as a task with a client, work category, owner, due
          date, status, linked module record, and activity history.
        </p>
      </div>

      {taskFilter && (
        <div className="rounded border bg-white p-2 text-sm">
          Showing task #{taskFilter} and its linked records.{" "}
          <Link href="/tasks" className="underline">
            Show all tasks
          </Link>
        </div>
      )}

      <form
        key={`filters:${sp.client || ""}:${sp.assignee || ""}:${sp.category || ""}:${sp.status || ""}`}
        method="get"
        className="grid gap-2 rounded-lg border bg-white p-3 md:grid-cols-6"
      >
        <select name="client" defaultValue={sp.client || ""} className="rounded border px-2 py-2">
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <select name="assignee" defaultValue={sp.assignee || ""} className="rounded border px-2 py-2">
          <option value="">All assignees</option>
          <option value="me">Assigned to me</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={sp.category || ""} className="rounded border px-2 py-2">
          <option value="">All categories</option>
          {TASK_CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status || ""} className="rounded border px-2 py-2">
          <option value="">All statuses</option>
          {TASK_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        <button className="rounded px-3 py-2">Apply filters</button>
        <Link href="/tasks" className="rounded border px-3 py-2 text-center">
          Clear
        </Link>
      </form>

      <form
        key={`create:${sp.client || ""}:${defaultCategory}`}
        action={createTaskAction}
        className="grid gap-2 rounded-lg border bg-white p-4 md:grid-cols-4"
      >
        <input name="title" required placeholder="Task title *" className="rounded border px-3 py-2 md:col-span-2" />
        <select name="assigned_to" required defaultValue={session?.id || ""} className="rounded border px-3 py-2">
          <option value="">Assign to *</option>
          {users.filter((user) => user.is_active).map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
              {user.job_title ? ` · ${user.job_title}` : ""}
              {session?.id === user.id ? " (me)" : ""}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={defaultCategory} className="rounded border px-3 py-2">
          {TASK_CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
        <select name="client_id" defaultValue={sp.client || ""} className="rounded border px-3 py-2">
          <option value="">Client (optional)</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <input name="due_date" type="date" className="rounded border px-3 py-2" />
        <select name="status" className="rounded border px-3 py-2">
          {TASK_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        <input name="description" placeholder="Description / instructions" className="rounded border px-3 py-2" />
        <select name="linked_blogger_id" defaultValue="" className="rounded border px-3 py-2">
          <option value="">Blogger (for blogger tasks)</option>
          {bloggers.map((blogger) => (
            <option key={blogger.id} value={blogger.id}>
              {blogger.name}
            </option>
          ))}
        </select>
        <label className="text-xs">
          Meeting / activity date
          <input name="activity_at" type="datetime-local" className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <select name="linked_record" defaultValue="" className="rounded border px-3 py-2 md:col-span-2">
          <option value="">Link an existing module record (optional)</option>
          {unlinkedRecords.map((record) => (
            <option key={`${record.type}:${record.id}`} value={`${record.type}:${record.id}`}>
              {record.label}
            </option>
          ))}
        </select>
        <button className="rounded px-3 py-2 md:col-span-4">Create task</button>
        <p className="text-xs md:col-span-4">
          Selecting a module category automatically creates the matching module record. Choosing an
          existing record links it instead of creating a duplicate.
        </p>
      </form>

      <div className="space-y-3">
        {tasks.map((task) => {
          const overdue =
            task.status !== "done" && task.due_date && task.due_date < today ? true : false;
          return (
            <div key={task.id} className={`rounded-lg border bg-white p-4 ${overdue ? "border-2" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    {task.title}
                    {task.origin_module && task.origin_module !== "tasks" && (
                      <span className="ml-2 rounded border px-1 text-xs">
                        Created from {MODULE_LABELS[task.origin_module as keyof typeof MODULE_LABELS] || task.origin_module}
                      </span>
                    )}
                  </div>
                  <div className="text-sm">
                    <b>{task.assignee_name}</b>
                    {task.assignee_title ? ` (${task.assignee_title})` : ""} · Assigned by{" "}
                    {task.assigner_name}
                    {task.client_name ? ` · Client: ${task.client_name}` : " · Internal"}
                  </div>
                  {task.description ? <p className="mt-1 text-sm whitespace-pre-wrap">{task.description}</p> : null}
                  {task.follow_up_of_task_id && (
                    <p className="mt-1 text-xs">
                      Follow-up of{" "}
                      <Link href={`/tasks?task=${task.follow_up_of_task_id}`} className="underline">
                        {parentTitles[task.follow_up_of_task_id] || `task #${task.follow_up_of_task_id}`}
                      </Link>
                    </p>
                  )}
                </div>
                <div className="text-right text-sm">
                  <div className="rounded border px-2 py-1">{task.status.replace("_", " ")}</div>
                  <div className="mt-1">{taskCategoryLabel(task.category)}</div>
                  <div className={overdue ? "font-semibold" : ""}>
                    Due: {task.due_date || "-"}
                    {overdue ? " · OVERDUE" : ""}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded border p-2">
                <div className="text-xs font-medium">Linked records</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {(linkedByTask[task.id] || []).map((link) => (
                    <span key={`${link.type}:${link.record_id}`} className="rounded border px-2 py-1">
                      <Link
                        href={`${MODULE_PATHS[link.type]}?task=${task.id}`}
                        className="underline"
                      >
                        {MODULE_LABELS[link.type as keyof typeof MODULE_LABELS]}: {link.title}
                      </Link>{" "}
                      ({link.status})
                      <form action={unlinkTaskModuleAction} className="inline">
                        <input type="hidden" name="task_id" value={task.id} />
                        <input type="hidden" name="record" value={`${link.type}:${link.record_id}`} />
                        <button className="ml-1 rounded border px-1 text-xs">unlink</button>
                      </form>
                    </span>
                  ))}
                  {!(linkedByTask[task.id] || []).length && (
                    <span className="text-zinc-500">No module record linked yet.</span>
                  )}
                </div>
                {(feedbackByTask[task.id] || []).length > 0 && (
                  <div className="mt-1 space-y-0.5 text-xs">
                    {(feedbackByTask[task.id] || []).map((f) => (
                      <div key={f.id}>
                        Client feedback:{" "}
                        <Link href={`/feedback?feedback=${f.id}`} className="underline">
                          {f.title || String(f.content || "").slice(0, 60)}
                        </Link>{" "}
                        ({feedbackStatusLabel(f.status)})
                        {f.communication_id ? (
                          <>
                            {" · "}
                            <Link
                              href={`/communications?communication=${f.communication_id}`}
                              className="underline"
                            >
                              source conversation
                            </Link>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                {unlinkedRecords.length > 0 && (
                  <form action={linkTaskModuleAction} className="mt-2 flex flex-wrap gap-1">
                    <input type="hidden" name="task_id" value={task.id} />
                    <select name="record" required defaultValue="" className="min-w-48 flex-1 rounded border px-2 py-1 text-xs">
                      <option value="">Link an unlinked record…</option>
                      {unlinkedRecords.map((record) => (
                        <option key={`${record.type}:${record.id}`} value={`${record.type}:${record.id}`}>
                          {record.label}
                        </option>
                      ))}
                    </select>
                    <button className="rounded border px-2 py-1 text-xs">Link</button>
                  </form>
                )}
              </div>

              <form
                key={`${task.id}:${task.status}:${task.assigned_to}:${task.category}:${task.due_date || ""}`}
                action={updateTaskAction}
                className="mt-3 grid gap-2 md:grid-cols-6"
              >
                <input type="hidden" name="id" value={task.id} />
                <select name="status" defaultValue={task.status} className="rounded border px-2 py-1">
                  {TASK_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
                <select name="assigned_to" defaultValue={task.assigned_to} className="rounded border px-2 py-1">
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                      {user.is_active ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
                <select name="category" defaultValue={task.category} className="rounded border px-2 py-1">
                  {TASK_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
                <input
                  name="due_date"
                  type="date"
                  defaultValue={task.due_date || ""}
                  className="rounded border px-2 py-1"
                />
                <button className="rounded px-2 py-1">Update</button>
                <div className="self-center text-xs">Updated {task.updated_at || task.created_at}</div>
              </form>

              <div className="mt-3 border-t pt-2">
                <div className="text-sm font-medium">Activity history</div>
                <ul className="mt-1 space-y-1 text-sm">
                  {(updatesByTask[task.id] || []).slice(0, 5).map((update) => (
                    <li key={update.id}>
                      • {update.note} <span className="text-xs">({update.user_name} · {update.created_at})</span>
                    </li>
                  ))}
                  {!(updatesByTask[task.id] || []).length && <li className="text-zinc-500">No activity yet.</li>}
                </ul>
                <form action={addTaskUpdateAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="task_id" value={task.id} />
                  <input
                    name="note"
                    required
                    placeholder="Add a progress note or blocker"
                    className="flex-1 rounded border px-2 py-1 text-sm"
                  />
                  <button className="rounded px-2 py-1 text-sm">Add note</button>
                </form>
              </div>

              <form action={deleteTaskAction} className="mt-2">
                <input type="hidden" name="id" value={task.id} />
                <button className="rounded px-2 py-1 text-sm">Delete task (keeps linked records)</button>
              </form>
            </div>
          );
        })}
        {!tasks.length && <div className="rounded-lg border bg-white p-4 text-zinc-500">No tasks match these filters.</div>}
      </div>

      {currentFilters.size > 0 && (
        <p className="text-xs">Filters are active. Use “Clear” to see the full board.</p>
      )}
    </div>
  );
}
