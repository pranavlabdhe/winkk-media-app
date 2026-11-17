import Link from "next/link";
import type { ReactNode } from "react";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  isTaskCategory,
  isTaskPriority,
  isTaskStatus,
  taskCategoryLabel,
} from "@/lib/constants";
import { addTaskUpdateAction, updateTaskAction } from "@/lib/task-actions";
import { taskPriority } from "@/lib/task-priority";
import TaskPriorityBadge from "@/components/task-priority-badge";
import {
  addDaysIso,
  formatIsoDate,
  taskAssignedDate,
  todayIso,
} from "@/lib/task-assignment";

type DueFilter = "overdue" | "today" | "next7" | "none";
type AssignedFilter = "today" | "last7" | "last30";

type WorkTask = {
  status: string;
  due_date: string | null;
  title: string;
  description: string | null;
  client_id: number | null;
  client_name: string | null;
  category: string | null;
  priority: string | null;
  assigned_at: string | null;
  created_at: string;
  assignee_name?: string | null;
  assigner_name?: string | null;
};

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    due?: string;
    assigned?: string;
    category?: string;
    client?: string;
    q?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) return null;

  const sp = await searchParams;
  const today = todayIso();

  const statusFilter = sp.status && isTaskStatus(sp.status) ? sp.status : null;
  const priorityFilter = sp.priority && isTaskPriority(sp.priority) ? sp.priority : null;
  const dueFilter =
    sp.due && ["overdue", "today", "next7", "none"].includes(sp.due)
      ? (sp.due as DueFilter)
      : null;
  const assignedFilter =
    sp.assigned && ["today", "last7", "last30"].includes(sp.assigned)
      ? (sp.assigned as AssignedFilter)
      : null;
  const categoryFilter = sp.category && isTaskCategory(sp.category) ? sp.category : null;
  const clientFilter =
    sp.client === "__internal" ? "__internal" : sp.client ? Number(sp.client) || null : null;
  const searchQuery = (sp.q || "").trim();
  const hasFilters = !!(
    statusFilter ||
    priorityFilter ||
    dueFilter ||
    assignedFilter ||
    categoryFilter ||
    clientFilter ||
    searchQuery
  );

  const myClients = db
    .prepare(
      `SELECT c.id,c.name FROM client_team ct JOIN clients c ON c.id=ct.client_id
       WHERE ct.user_id=? ORDER BY c.name`
    )
    .all(session.id) as any[];

  const myTasks = db
    .prepare(
      `SELECT t.*, c.name client_name, u.name assigner_name
       FROM tasks t
       LEFT JOIN clients c ON c.id=t.client_id
       JOIN users u ON u.id=t.assigned_by
       WHERE t.assigned_to=?
       ORDER BY CASE t.status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                t.due_date IS NULL, t.due_date, t.created_at DESC`
    )
    .all(session.id) as any[];

  const assignedByMe = db
    .prepare(
      `SELECT t.*, u.name assignee_name, c.name client_name
       FROM tasks t
       JOIN users u ON u.id=t.assigned_to
       LEFT JOIN clients c ON c.id=t.client_id
       WHERE t.assigned_by=? AND t.assigned_to!=? AND t.status!='done'
       ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                t.due_date IS NULL, t.due_date, t.created_at DESC`
    )
    .all(session.id, session.id) as any[];

  // Filter options are derived from the tasks actually on this dashboard.
  const clientOptions = (() => {
    const map = new Map<number, string>();
    for (const task of [...myTasks, ...assignedByMe]) {
      if (task.client_id) {
        map.set(task.client_id, task.client_name || `Client #${task.client_id}`);
      }
    }
    return {
      options: [...map.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      hasInternal: [...myTasks, ...assignedByMe].some((task) => !task.client_id),
    };
  })();

  function matchesFilters(task: WorkTask) {
    if (statusFilter && task.status !== statusFilter) return false;

    if (priorityFilter && taskPriority(task).value !== priorityFilter) return false;

    if (dueFilter) {
      if (dueFilter === "none") {
        if (task.due_date) return false;
      } else {
        if (task.status === "done") return false;
        if (dueFilter === "overdue" && !(task.due_date && task.due_date < today)) return false;
        if (dueFilter === "today" && task.due_date !== today) return false;
        if (
          dueFilter === "next7" &&
          !(task.due_date && task.due_date > today && task.due_date <= addDaysIso(today, 7))
        ) {
          return false;
        }
      }
    }

    if (assignedFilter) {
      const assignedDate = taskAssignedDate(task);
      if (!assignedDate) return false;
      if (assignedFilter === "today" && assignedDate !== today) return false;
      if (assignedFilter === "last7" && !(assignedDate >= addDaysIso(today, -6))) return false;
      if (assignedFilter === "last30" && !(assignedDate >= addDaysIso(today, -29))) return false;
    }

    if (categoryFilter && (task.category || "other") !== categoryFilter) return false;

    if (clientFilter) {
      if (clientFilter === "__internal") {
        if (task.client_id) return false;
      } else if (task.client_id !== clientFilter) {
        return false;
      }
    }

    if (searchQuery) {
      const haystack = [
        task.title,
        task.description,
        task.client_name,
        task.assignee_name,
        task.assigner_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchQuery.toLowerCase())) return false;
    }

    return true;
  }

  const filteredMyTasks = myTasks.filter(matchesFilters);
  const filteredAssignedByMe = assignedByMe.filter(matchesFilters);

  const updates = db
    .prepare(
      `SELECT tu.*, u.name user_name FROM task_updates tu
       JOIN users u ON u.id=tu.user_id
       WHERE tu.task_id IN (SELECT id FROM tasks WHERE assigned_to=?)
       ORDER BY tu.created_at DESC`
    )
    .all(session.id) as any[];
  const updatesByTask: Record<number, any[]> = {};
  for (const update of updates) (updatesByTask[update.task_id] ||= []).push(update);

  const upcomingMeetings = db
    .prepare(
      `SELECT m.*, c.name client_name FROM meetings m JOIN clients c ON c.id=m.client_id
       WHERE m.status='upcoming' ORDER BY m.meeting_at LIMIT 5`
    )
    .all() as any[];

  const openTasks = filteredMyTasks.filter((task) => task.status !== "done");
  const dueToday = openTasks.filter((task) => task.due_date === today);
  const overdue = openTasks.filter((task) => task.due_date && task.due_date < today);
  const completedWeek = filteredMyTasks.filter(
    (task) =>
      task.status === "done" &&
      task.updated_at &&
      task.updated_at.slice(0, 10) >= addDaysIso(today, -6)
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#12143d] text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#12143d]">
              My Work Dashboard
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Welcome, <span className="font-semibold text-slate-800">{session.name}</span>
            {session.job_title ? ` · ${session.job_title}` : ""} — your personal daily queue and active priorities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/tasks?assignee=me"
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#12143d] hover:bg-slate-50 shadow-2xs transition-colors"
          >
            Board: My Tasks Only
          </Link>
          <Link
            href="/tasks"
            className="rounded-xl bg-[#ed8527] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 hover:bg-[#d97116] transition-all cursor-pointer"
          >
            + Create / Assign Task
          </Link>
        </div>
      </div>

      {/* My Work Filters */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
            <svg className="h-3.5 w-3.5 text-[#ed8527]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filter My Work
          </div>
          {hasFilters && (
            <Link
              href="/my-work"
              className="text-xs font-semibold text-[#ed8527] hover:underline"
            >
              Reset Filters
            </Link>
          )}
        </div>

        <form method="get" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <FilterField label="Status">
              <select
                name="status"
                defaultValue={statusFilter || ""}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 transition-all focus:border-[#ed8527] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">All statuses</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Priority">
              <select
                name="priority"
                defaultValue={priorityFilter || ""}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 transition-all focus:border-[#ed8527] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">All priorities</option>
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Due Date">
              <select
                name="due"
                defaultValue={dueFilter || ""}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 transition-all focus:border-[#ed8527] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">All deadlines</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due today</option>
                <option value="next7">Next 7 days</option>
                <option value="none">No deadline</option>
              </select>
            </FilterField>

            <FilterField label="Assigned On">
              <select
                name="assigned"
                defaultValue={assignedFilter || ""}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 transition-all focus:border-[#ed8527] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">Any assignment date</option>
                <option value="today">Today</option>
                <option value="last7">Last 7 days</option>
                <option value="last30">Last 30 days</option>
              </select>
            </FilterField>

            <FilterField label="Category">
              <select
                name="category"
                defaultValue={categoryFilter || ""}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 transition-all focus:border-[#ed8527] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">All categories</option>
                {TASK_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Client">
              <select
                name="client"
                defaultValue={
                  clientFilter === "__internal" ? "__internal" : clientFilter ? String(clientFilter) : ""
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 transition-all focus:border-[#ed8527] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              >
                <option value="">All clients</option>
                {clientOptions.options.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
                {clientOptions.hasInternal && <option value="__internal">Internal</option>}
              </select>
            </FilterField>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <input
                name="q"
                defaultValue={searchQuery}
                placeholder="Search tasks, clients, descriptions…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs font-medium text-slate-800 placeholder-slate-400 transition-all focus:border-[#ed8527] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="rounded-xl bg-[#12143d] px-4 py-2 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-[#20245e] cursor-pointer"
              >
                Apply Filters
              </button>
              <Link
                href="/my-work"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                Clear
              </Link>
            </div>
          </div>
        </form>

        {hasFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            <span className="font-bold uppercase tracking-wider text-slate-400">Filtered</span>
            <span>
              <b className="text-[#12143d]">{filteredMyTasks.length}</b> of {myTasks.length} assigned tasks
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <b className="text-[#12143d]">{filteredAssignedByMe.length}</b> of {assignedByMe.length} delegated tasks
            </span>
          </div>
        )}
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Open Tasks
            </span>
            <span className="h-2 w-2 rounded-full bg-blue-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-[#12143d]">
            {openTasks.length}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Assigned deliverables</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Due Today
            </span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-amber-900">
            {dueToday.length}
          </div>
          <p className="mt-1 text-[11px] text-amber-700">Immediate focus needed</p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
              Overdue
            </span>
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-rose-700">
            {overdue.length}
          </div>
          <p className="mt-1 text-[11px] text-rose-600">Past target deadline</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Done This Week
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-800">
            {completedWeek.length}
          </div>
          <p className="mt-1 text-[11px] text-emerald-700">Completed momentum</p>
        </div>
      </div>

      {/* Assigned Clients */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Assigned Client Accounts ({myClients.length})
          </div>
          <Link href="/clients" className="text-xs font-semibold text-[#ed8527] hover:underline">
            View All Clients →
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {myClients.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-[#12143d] hover:bg-white hover:border-[#ed8527] hover:text-[#ed8527] transition-all shadow-2xs"
            >
              <span>{client.name}</span>
              <span className="text-[10px] text-slate-400">→</span>
            </Link>
          ))}
          {!myClients.length && (
            <span className="text-xs text-slate-400 italic">
              No specific client accounts assigned to your profile yet.
            </span>
          )}
        </div>
      </div>

      {/* Main Two-Column Layout on Desktop */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Columns: Tasks Assigned to Me */}
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Tasks Assigned To Me ({filteredMyTasks.length}
              {hasFilters ? ` of ${myTasks.length}` : ""})
            </h2>
            <span className="text-xs text-slate-400">
              Sorted by status, priority &amp; deadline
            </span>
          </div>

          <div className="space-y-3">
            {filteredMyTasks.map((task) => {
              const isOverdue =
                task.status !== "done" && task.due_date && task.due_date < today;

              const statusBadge = {
                todo: "bg-slate-100 text-slate-700 border-slate-200",
                in_progress: "bg-amber-50 text-amber-800 border-amber-200 font-semibold",
                done: "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold",
              }[task.status as "todo" | "in_progress" | "done"] || "bg-slate-100 text-slate-700";

              return (
                <div
                  key={task.id}
                  className={`rounded-2xl border bg-white p-5 shadow-xs transition-all hover:border-slate-300 ${
                    isOverdue
                      ? "border-l-4 border-l-rose-500 border-rose-200"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400">
                          #{task.id}
                        </span>
                        <h3 className="text-base font-bold text-slate-900">
                          {task.title}
                        </h3>
                        <TaskPriorityBadge priority={task.priority} />
                        <span className="rounded-full bg-[#12143d]/5 border border-[#12143d]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#12143d]">
                          {taskCategoryLabel(task.category)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                        <div>
                          Client:{" "}
                          <span className="font-semibold text-slate-800">
                            {task.client_name || "Internal"}
                          </span>
                        </div>
                        <span>•</span>
                        <div>
                          Assigned by: <span className="font-medium text-slate-700">{task.assigner_name}</span>
                        </div>
                        <span>•</span>
                        <div>
                          Assigned:{" "}
                          <span className="font-medium text-slate-700">
                            {formatIsoDate(taskAssignedDate(task))}
                          </span>
                        </div>
                      </div>

                      {task.description && (
                        <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50/70 rounded-xl p-3 border border-slate-100">
                          {task.description}
                        </p>
                      )}
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0">
                      <span className={`rounded-full border px-3 py-0.5 text-xs ${statusBadge}`}>
                        {task.status.replace("_", " ")}
                      </span>
                      <div className="text-xs">
                        {task.due_date ? (
                          <span className={isOverdue ? "font-bold text-rose-600" : "text-slate-600"}>
                            {isOverdue && "⚠️ "}Due {task.due_date}
                          </span>
                        ) : (
                          <span className="text-slate-400">No deadline</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Inline Status Update Form */}
                  <form
                    action={updateTaskAction}
                    className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2.5 border border-slate-100"
                  >
                    <input type="hidden" name="id" value={task.id} />
                    <span className="text-xs font-semibold text-slate-600">Quick Status:</span>
                    <select
                      name="status"
                      defaultValue={task.status}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 font-medium focus:border-[#ed8527] focus:outline-none"
                    >
                      {TASK_STATUSES.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#12143d] px-3 py-1 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer shadow-2xs"
                    >
                      Update
                    </button>
                  </form>

                  {/* Activity History & Note Drawer */}
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Recent Activity
                    </div>
                    <div className="space-y-1 text-xs text-slate-700">
                      {(updatesByTask[task.id] || []).slice(0, 3).map((update) => (
                        <div
                          key={update.id}
                          className="flex items-start gap-2 rounded-lg bg-slate-50 p-2"
                        >
                          <span className="font-semibold text-slate-900">
                            {update.user_name}:
                          </span>
                          <span className="flex-1">{update.note}</span>
                          <span className="text-[10px] text-slate-400">
                            {update.created_at}
                          </span>
                        </div>
                      ))}
                      {!(updatesByTask[task.id] || []).length && (
                        <div className="text-slate-400 italic text-xs">
                          No notes added yet.
                        </div>
                      )}
                    </div>

                    <form action={addTaskUpdateAction} className="mt-2.5 flex gap-2">
                      <input type="hidden" name="task_id" value={task.id} />
                      <input
                        name="note"
                        required
                        placeholder="Add progress note or handoff update..."
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
                </div>
              );
            })}

            {!filteredMyTasks.length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <h4 className="text-sm font-semibold text-slate-800">
                  {myTasks.length ? "No tasks match these filters." : "You are all caught up!"}
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  {myTasks.length
                    ? "Try clearing one or more filters to see the rest of your queue."
                    : "No active tasks are currently assigned to your profile."}
                </p>
                {hasFilters && (
                  <Link
                    href="/my-work"
                    className="mt-3 inline-flex rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#12143d] shadow-2xs transition-colors hover:bg-slate-50"
                  >
                    Clear filters
                  </Link>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right 1 Column: Delegated Tasks & Meetings */}
        <div className="space-y-6">
          {/* Tasks assigned to teammates */}
          <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Tasks Delegated to Teammates ({filteredAssignedByMe.length}
              {hasFilters ? ` of ${assignedByMe.length}` : ""})
            </h2>

            <div className="space-y-2">
              {filteredAssignedByMe.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/tasks?task=${task.id}`}
                        className="font-bold text-[#12143d] hover:text-[#ed8527] line-clamp-1"
                      >
                        {task.title}
                      </Link>
                      <TaskPriorityBadge priority={task.priority} />
                    </div>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200 shrink-0">
                      {task.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 text-[11px]">
                    <span>Assigned to: <b className="text-slate-800">{task.assignee_name}</b></span>
                    <span>Due: {task.due_date || "—"}</span>
                  </div>
                </div>
              ))}
              {!filteredAssignedByMe.length && (
                <p className="text-xs text-slate-400 italic">
                  {assignedByMe.length
                    ? "No delegated tasks match these filters."
                    : "No open tasks assigned to others by you."}
                </p>
              )}
            </div>
          </section>

          {/* Upcoming meetings */}
          <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Upcoming Meetings
              </h2>
              <Link href="/meetings" className="text-xs font-semibold text-[#ed8527] hover:underline">
                Calendar →
              </Link>
            </div>

            <div className="space-y-2.5">
              {upcomingMeetings.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs space-y-1"
                >
                  <div className="font-bold text-[#12143d]">{m.title}</div>
                  <div className="text-[11px] text-[#ed8527] font-semibold">
                    {m.client_name} · {m.meeting_at}
                  </div>
                  {m.discussion_notes && (
                    <p className="text-slate-500 line-clamp-2 text-[11px] pt-1">
                      {m.discussion_notes}
                    </p>
                  )}
                </div>
              ))}
              {!upcomingMeetings.length && (
                <p className="text-xs text-slate-400 italic">
                  No upcoming meetings scheduled.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-bold uppercase text-slate-600">{label}</span>
      {children}
    </label>
  );
}
