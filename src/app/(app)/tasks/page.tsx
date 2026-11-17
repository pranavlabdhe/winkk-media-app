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
  const assigneeFilter =
    sp.assignee === "me"
      ? session?.id || null
      : sp.assignee
        ? Number(sp.assignee) || null
        : null;
  const categoryFilter = sp.category && isTaskCategory(sp.category) ? sp.category : null;
  const statusFilter = sp.status && isTaskStatus(sp.status) ? sp.status : null;
  const taskFilter = sp.task ? Number(sp.task) || null : null;

  const users = db
    .prepare(
      "SELECT id,name,role,job_title,department,is_active FROM users ORDER BY is_active DESC, name"
    )
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

  // Statistics calculation for KPI summary bar
  const totalCount = tasks.length;
  const todoCount = tasks.filter((t) => t.status === "todo").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const overdueCount = tasks.filter(
    (t) => t.status !== "done" && t.due_date && t.due_date < today
  ).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#12143d] text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#12143d]">
              Client-wise Task Board
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Centralized hub for all client deliverables, team assignments, due dates, and cross-module connections.
          </p>
        </div>

        {/* Task KPI summary chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-2xs">
            Total: <span className="text-[#12143d] font-bold">{totalCount}</span>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800">
            In Progress: <span className="font-bold">{inProgressCount}</span>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800">
            Completed: <span className="font-bold">{doneCount}</span>
          </div>
          {overdueCount > 0 && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-rose-700 font-bold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              Overdue: {overdueCount}
            </div>
          )}
        </div>
      </div>

      {/* Single Task Filter Banner */}
      {taskFilter && (
        <div className="flex items-center justify-between rounded-xl border border-[#ed8527]/30 bg-orange-50/60 px-4 py-3 text-xs sm:text-sm text-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ed8527] text-white text-[10px] font-bold">
              i
            </span>
            Showing isolated view for Task <span className="font-bold text-[#12143d]">#{taskFilter}</span> and its linked records.
          </div>
          <Link
            href="/tasks"
            className="rounded-lg bg-white border border-slate-200 px-3 py-1 text-xs font-semibold text-[#12143d] hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs"
          >
            Show All Tasks
          </Link>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
            <svg className="h-3.5 w-3.5 text-[#ed8527]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filter & Search Tasks
          </div>
          {(sp.client || sp.assignee || sp.category || sp.status || sp.task) && (
            <Link
              href="/tasks"
              className="text-xs font-semibold text-[#ed8527] hover:underline"
            >
              Reset All Filters
            </Link>
          )}
        </div>

        <form
          key={`filters:${sp.client || ""}:${sp.assignee || ""}:${sp.category || ""}:${sp.status || ""}`}
          method="get"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Client
            </label>
            <select
              name="client"
              defaultValue={sp.client || ""}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 transition-all focus:border-[#ed8527] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
            >
              <option value="">All Clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Assignee
            </label>
            <select
              name="assignee"
              defaultValue={sp.assignee || ""}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 transition-all focus:border-[#ed8527] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
            >
              <option value="">All Team Members</option>
              <option value="me">Assigned to me ({session?.name})</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Category
            </label>
            <select
              name="category"
              defaultValue={sp.category || ""}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 transition-all focus:border-[#ed8527] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
            >
              <option value="">All Categories</option>
              {TASK_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Status
            </label>
            <select
              name="status"
              defaultValue={sp.status || ""}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 transition-all focus:border-[#ed8527] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
            >
              <option value="">All Statuses</option>
              {TASK_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="w-full rounded-xl bg-[#12143d] px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#20245e] transition-colors cursor-pointer"
            >
              Apply Filter
            </button>
            <Link
              href="/tasks"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              Clear
            </Link>
          </div>
        </form>
      </div>

      {/* Task Creation Form Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#ed8527]/10 text-[#ed8527]">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </span>
            <h2 className="text-sm font-bold text-[#12143d]">
              Create New Task
            </h2>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            * Fields marked with asterisk are mandatory
          </span>
        </div>

        <form
          key={`create:${sp.client || ""}:${defaultCategory}`}
          action={createTaskAction}
          className="space-y-4"
        >
          {/* Main info row */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Task Title <span className="text-rose-500">*</span>
              </label>
              <input
                name="title"
                required
                placeholder="e.g. Design 3 Diwali Festival Carousels"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assignee <span className="text-rose-500">*</span>
              </label>
              <select
                name="assigned_to"
                required
                defaultValue={session?.id || ""}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">Select Assignee *</option>
                {users
                  .filter((user) => user.is_active)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                      {user.job_title ? ` (${user.job_title})` : ""}
                      {session?.id === user.id ? " — (Me)" : ""}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Category
              </label>
              <select
                name="category"
                defaultValue={defaultCategory}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                {TASK_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Secondary metadata row */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client (Account)
              </label>
              <select
                name="client_id"
                defaultValue={sp.client || ""}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">Internal / No Client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Due Date
              </label>
              <input
                name="due_date"
                type="date"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Initial Status
              </label>
              <select
                name="status"
                defaultValue="todo"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                {TASK_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Blogger / Influencer
              </label>
              <select
                name="linked_blogger_id"
                defaultValue=""
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">None (Non-blogger task)</option>
                {bloggers.map((blogger) => (
                  <option key={blogger.id} value={blogger.id}>
                    {blogger.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description & Link module row */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description / Detailed Brief
              </label>
              <input
                name="description"
                placeholder="Include specifications, copy references, or deliverables..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Meeting / Activity Timestamp
              </label>
              <input
                name="activity_at"
                type="datetime-local"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>
          </div>

          {unlinkedRecords.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Link to Existing Unlinked Module Record (Optional)
              </label>
              <select
                name="linked_record"
                defaultValue=""
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">No existing record (auto-create module if applicable)</option>
                {unlinkedRecords.map((record) => (
                  <option key={`${record.type}:${record.id}`} value={`${record.type}:${record.id}`}>
                    {record.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <p className="text-xs text-slate-500">
              💡 Selecting a module category (Design, Social, Blogger, Meeting) automatically provisions linked records and records activity history.
            </p>
            <button
              type="submit"
              className="w-full sm:w-auto rounded-xl bg-[#ed8527] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 transition-all hover:bg-[#d97116] hover:shadow-lg hover:shadow-[#ed8527]/25 active:scale-[0.99] cursor-pointer"
            >
              + Create Task
            </button>
          </div>
        </form>
      </div>

      {/* Task List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Active Tasks ({tasks.length})
          </h3>
          <span className="text-xs text-slate-400">
            Sorted by status & priority deadline
          </span>
        </div>

        {tasks.map((task) => {
          const isOverdue =
            task.status !== "done" && task.due_date && task.due_date < today;

          // Status styling definitions
          const statusConfig = {
            todo: {
              label: "To Do",
              badge: "bg-slate-100 text-slate-700 border-slate-200",
            },
            in_progress: {
              label: "In Progress",
              badge: "bg-amber-50 text-amber-800 border-amber-200 font-semibold",
            },
            done: {
              label: "Completed",
              badge: "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold",
            },
          }[task.status as "todo" | "in_progress" | "done"] || {
            label: task.status,
            badge: "bg-slate-100 text-slate-700 border-slate-200",
          };

          return (
            <div
              key={task.id}
              className={`rounded-2xl border bg-white p-5 shadow-xs transition-all hover:border-slate-300 ${
                isOverdue
                  ? "border-l-4 border-l-rose-500 border-rose-200 bg-rose-50/20"
                  : "border-slate-200"
              }`}
            >
              {/* Card Header & Main Details */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-400">
                      #{task.id}
                    </span>
                    <h4 className="text-base font-bold text-slate-900">
                      {task.title}
                    </h4>

                    {task.origin_module && task.origin_module !== "tasks" && (
                      <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        Via {MODULE_LABELS[task.origin_module as keyof typeof MODULE_LABELS] || task.origin_module}
                      </span>
                    )}

                    <span className="rounded-full bg-[#12143d]/5 border border-[#12143d]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#12143d]">
                      {taskCategoryLabel(task.category)}
                    </span>
                  </div>

                  {/* Client & Assignee Context */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 font-medium">Assignee:</span>
                      <span className="font-semibold text-slate-800">
                        {task.assignee_name}
                      </span>
                      {task.assignee_title && (
                        <span className="text-slate-400">
                          ({task.assignee_title})
                        </span>
                      )}
                    </div>
                    <span>•</span>
                    <div>
                      <span className="text-slate-400">Assigned by:</span>{" "}
                      <span className="font-medium text-slate-700">
                        {task.assigner_name}
                      </span>
                    </div>
                    <span>•</span>
                    <div>
                      <span className="text-slate-400">Client:</span>{" "}
                      {task.client_name ? (
                        <Link
                          href={`/clients/${task.client_id}`}
                          className="font-semibold text-[#12143d] hover:text-[#ed8527] transition-colors"
                        >
                          {task.client_name}
                        </Link>
                      ) : (
                        <span className="italic text-slate-400">Internal Agency Task</span>
                      )}
                    </div>
                  </div>

                  {task.description && (
                    <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                      {task.description}
                    </p>
                  )}

                  {task.follow_up_of_task_id && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-medium">Follow-up of:</span>
                      <Link
                        href={`/tasks?task=${task.follow_up_of_task_id}`}
                        className="font-semibold text-[#ed8527] hover:underline"
                      >
                        {parentTitles[task.follow_up_of_task_id] || `Task #${task.follow_up_of_task_id}`}
                      </Link>
                    </div>
                  )}
                </div>

                {/* Status & Deadline Column */}
                <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusConfig.badge}`}
                  >
                    {statusConfig.label}
                  </span>

                  <div className="text-right">
                    {task.due_date ? (
                      <div
                        className={`text-xs font-semibold ${
                          isOverdue ? "text-rose-600 font-bold" : "text-slate-600"
                        }`}
                      >
                        {isOverdue && "⚠️ OVERDUE: "}
                        Due {task.due_date}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">No deadline set</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Linked Records Section */}
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                  <span className="flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Linked Module Records
                  </span>
                  <span className="text-[11px] font-normal text-slate-400">
                    Syncs status and timeline across modules
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(linkedByTask[task.id] || []).map((link) => (
                    <span
                      key={`${link.type}:${link.record_id}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-2xs"
                    >
                      <Link
                        href={`${MODULE_PATHS[link.type]}?task=${task.id}`}
                        className="font-semibold text-[#12143d] hover:text-[#ed8527] transition-colors"
                      >
                        {MODULE_LABELS[link.type as keyof typeof MODULE_LABELS]}: {link.title}
                      </Link>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 uppercase">
                        {link.status}
                      </span>
                      <form action={unlinkTaskModuleAction} className="inline">
                        <input type="hidden" name="task_id" value={task.id} />
                        <input
                          type="hidden"
                          name="record"
                          value={`${link.type}:${link.record_id}`}
                        />
                        <button
                          type="submit"
                          className="rounded text-[11px] text-rose-500 hover:text-rose-700 hover:underline cursor-pointer"
                          title="Unlink this record from task"
                        >
                          ✕ Unlink
                        </button>
                      </form>
                    </span>
                  ))}

                  {!(linkedByTask[task.id] || []).length && (
                    <span className="text-xs text-slate-400 italic">
                      No external module records currently linked.
                    </span>
                  )}
                </div>

                {/* Linked client feedback */}
                {(feedbackByTask[task.id] || []).length > 0 && (
                  <div className="mt-2.5 border-t border-slate-200/60 pt-2 space-y-1">
                    {(feedbackByTask[task.id] || []).map((f) => (
                      <div key={f.id} className="text-xs text-slate-600 flex items-center gap-2">
                        <span className="rounded-sm bg-orange-100 text-orange-800 px-1 py-0.5 text-[10px] font-bold">
                          FEEDBACK
                        </span>
                        <Link
                          href={`/feedback?feedback=${f.id}`}
                          className="font-medium text-slate-800 hover:text-[#ed8527] transition-colors"
                        >
                          {f.title || String(f.content || "").slice(0, 60)}
                        </Link>
                        <span className="text-slate-400">
                          ({feedbackStatusLabel(f.status)})
                        </span>
                        {f.communication_id ? (
                          <Link
                            href={`/communications?communication=${f.communication_id}`}
                            className="text-[#ed8527] hover:underline text-[11px]"
                          >
                            Source Conversation →
                          </Link>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick link existing record */}
                {unlinkedRecords.length > 0 && (
                  <form
                    action={linkTaskModuleAction}
                    className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 border-t border-slate-200/60 pt-2"
                  >
                    <input type="hidden" name="task_id" value={task.id} />
                    <select
                      name="record"
                      required
                      defaultValue=""
                      className="w-full sm:w-auto flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 focus:border-[#ed8527] focus:outline-none"
                    >
                      <option value="">Attach unlinked record to this task…</option>
                      {unlinkedRecords.map((record) => (
                        <option
                          key={`${record.type}:${record.id}`}
                          value={`${record.type}:${record.id}`}
                        >
                          {record.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      + Attach Record
                    </button>
                  </form>
                )}
              </div>

              {/* Quick Update Toolbar Form */}
              <form
                key={`${task.id}:${task.status}:${task.assigned_to}:${task.category}:${task.due_date || ""}`}
                action={updateTaskAction}
                className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Quick Task Update
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Last updated {task.updated_at || task.created_at}
                  </span>
                </div>

                <input type="hidden" name="id" value={task.id} />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      Status
                    </label>
                    <select
                      name="status"
                      defaultValue={task.status}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:border-[#ed8527] focus:outline-none"
                    >
                      {TASK_STATUSES.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
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
                      defaultValue={task.assigned_to}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#ed8527] focus:outline-none"
                    >
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                          {user.is_active ? "" : " (inactive)"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      Category
                    </label>
                    <select
                      name="category"
                      defaultValue={task.category}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#ed8527] focus:outline-none"
                    >
                      {TASK_CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      Due Date
                    </label>
                    <input
                      name="due_date"
                      type="date"
                      defaultValue={task.due_date || ""}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#ed8527] focus:outline-none"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-[#12143d] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer shadow-2xs"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </form>

              {/* Activity History & Note Log */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Activity & Progress Log
                </div>

                <div className="space-y-1.5 text-xs">
                  {(updatesByTask[task.id] || []).slice(0, 4).map((update) => (
                    <div
                      key={update.id}
                      className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-slate-700"
                    >
                      <span className="font-semibold text-slate-900 shrink-0">
                        {update.user_name}:
                      </span>
                      <span className="flex-1">{update.note}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {update.created_at}
                      </span>
                    </div>
                  ))}
                  {!(updatesByTask[task.id] || []).length && (
                    <div className="text-xs text-slate-400 italic">
                      No progress notes logged yet.
                    </div>
                  )}
                </div>

                {/* Add Progress Note Form */}
                <form action={addTaskUpdateAction} className="mt-2.5 flex gap-2">
                  <input type="hidden" name="task_id" value={task.id} />
                  <input
                    name="note"
                    required
                    placeholder="Add a progress update, deliverable link, or blocker note..."
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
                  />
                  <button
                    type="submit"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
                  >
                    Post Note
                  </button>
                </form>
              </div>

              {/* Danger Zone / Delete action */}
              <div className="mt-4 flex items-center justify-end border-t border-slate-100 pt-2">
                <form action={deleteTaskAction}>
                  <input type="hidden" name="id" value={task.id} />
                  <button
                    type="submit"
                    className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                  >
                    Delete task (linked records will remain intact)
                  </button>
                </form>
              </div>
            </div>
          );
        })}

        {!tasks.length && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h4 className="text-sm font-semibold text-slate-800">
              No tasks found
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              There are no tasks matching your selected filters. Try resetting the filters or create a new task above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
