"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { TASK_CATEGORIES, TASK_PRIORITIES, taskCategoryLabel, type TaskPriorityValue } from "@/lib/constants";
import { isTaskOverdue, taskPriority } from "@/lib/task-priority";
import TaskPriorityBadge from "@/components/task-priority-badge";

export type DashboardTask = {
  id: number;
  title: string;
  client_name: string | null;
  category: string | null;
  assigned_to: number | null;
  assignee_name: string | null;
  due_date: string | null;
  status: string;
  priority: string | null;
};

export type DashboardMember = {
  id: number;
  name: string;
  job_title: string | null;
  department: string | null;
};

export type DashboardCounts = {
  clients: number;
  feedbackOpen: number;
  commsAttention: number;
  meetingsUpcoming: number;
};

export type PostStatusCounts = {
  scheduled: number;
  published: number;
  pending: number;
  missed: number;
  total: number;
};

type StatusFilter = "open" | "overdue" | "completed" | "due_today";

type DeadlineFilter = "overdue" | "today" | "next7" | "none";

const DEADLINE_LABELS: Record<DeadlineFilter, string> = {
  overdue: "Overdue",
  today: "Due today",
  next7: "Next 7 days",
  none: "No deadline",
};

const PRIORITY_LABELS: Record<TaskPriorityValue, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

type Props = {
  tasks: DashboardTask[];
  members: DashboardMember[];
  counts: DashboardCounts;
  postStatuses: PostStatusCounts;
  isOwner: boolean;
  today: string;
};

const POST_STATUS_CARDS: Array<{
  key: keyof Omit<PostStatusCounts, "total">;
  label: string;
  badge: string;
  dot: string;
}> = [
  { key: "scheduled", label: "Scheduled", badge: "border-blue-200 bg-blue-50/60 text-blue-800", dot: "bg-blue-500" },
  { key: "published", label: "Published", badge: "border-emerald-200 bg-emerald-50/60 text-emerald-800", dot: "bg-emerald-500" },
  { key: "pending", label: "Pending Review", badge: "border-amber-200 bg-amber-50/60 text-amber-800", dot: "bg-amber-500" },
  { key: "missed", label: "Missed", badge: "border-rose-200 bg-rose-50/60 text-rose-800", dot: "bg-rose-500" },
];

const STATUS_LABELS: Record<StatusFilter, string> = {
  open: "Open Tasks",
  overdue: "Overdue",
  completed: "Completed",
  due_today: "Due Today",
};

const STATUS_BADGE: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-amber-50 text-amber-800 border-amber-200 font-semibold",
  done: "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold",
};

function statusLabel(status: string) {
  if (status === "in_progress") return "In Progress";
  if (status === "todo") return "To Do";
  if (status === "done") return "Done";
  return status.replaceAll("_", " ");
}

function matchesStatus(task: DashboardTask, filter: StatusFilter, today: string) {
  switch (filter) {
    case "open":
      return task.status !== "done";
    case "overdue":
      return isTaskOverdue(task, today);
    case "completed":
      return task.status === "done";
    case "due_today":
      return task.status !== "done" && task.due_date === today;
  }
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function matchesDeadline(task: DashboardTask, filter: DeadlineFilter, today: string) {
  switch (filter) {
    case "overdue":
      return !!task.due_date && task.due_date < today;
    case "today":
      return task.due_date === today;
    case "next7":
      return !!task.due_date && task.due_date > today && task.due_date <= addDays(today, 7);
    case "none":
      return !task.due_date;
  }
}

export default function DashboardFilters({
  tasks,
  members,
  counts,
  postStatuses,
  isOwner,
  today,
}: Props) {
  const [memberId, setMemberId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriorityValue | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [client, setClient] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<DeadlineFilter | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const selectedMember = members.find((member) => member.id === memberId) || null;
  const hasFilters =
    memberId !== null ||
    status !== null ||
    taskStatus !== null ||
    priority !== null ||
    category !== null ||
    client !== null ||
    deadline !== null;

  const clientOptions = useMemo(() => {
    const names = new Set<string>();
    let hasInternal = false;
    for (const task of tasks) {
      if (task.client_name) names.add(task.client_name);
      else hasInternal = true;
    }
    return {
      names: [...names].sort((a, b) => a.localeCompare(b)),
      hasInternal,
    };
  }, [tasks]);

  const categoryOptions = useMemo(() => {
    const used = new Set(tasks.map((task) => task.category || "other"));
    return TASK_CATEGORIES.filter((option) => used.has(option.value));
  }, [tasks]);

  const memberRows = useMemo(
    () =>
      members
        .map((member) => {
          const memberTasks = tasks.filter((task) => task.assigned_to === member.id);
          return {
            ...member,
            open: memberTasks.filter((task) => matchesStatus(task, "open", today)).length,
            overdue: memberTasks.filter((task) => matchesStatus(task, "overdue", today)).length,
            completed: memberTasks.filter((task) => matchesStatus(task, "completed", today)).length,
          };
        })
        .sort(
          (a, b) =>
            b.overdue - a.overdue ||
            b.open - a.open ||
            a.name.localeCompare(b.name)
        ),
    [members, tasks, today]
  );

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (memberId !== null && task.assigned_to !== memberId) return false;
        if (status !== null && !matchesStatus(task, status, today)) return false;
        if (taskStatus !== null && task.status !== taskStatus) return false;
        if (priority !== null && taskPriority(task).value !== priority) return false;
        if (category !== null && (task.category || "other") !== category) return false;
        if (client !== null && (task.client_name || "__internal") !== client) return false;
        if (deadline !== null && !matchesDeadline(task, deadline, today)) return false;
        return true;
      }),
    [tasks, memberId, status, taskStatus, priority, category, client, deadline, today]
  );

  const statusCounts = useMemo(() => {
    const memberTasks =
      memberId === null ? tasks : tasks.filter((task) => task.assigned_to === memberId);
    return {
      open: memberTasks.filter((task) => matchesStatus(task, "open", today)).length,
      overdue: memberTasks.filter((task) => matchesStatus(task, "overdue", today)).length,
      completed: memberTasks.filter((task) => matchesStatus(task, "completed", today)).length,
      due_today: memberTasks.filter((task) => matchesStatus(task, "due_today", today)).length,
    };
  }, [tasks, memberId, today]);

  function revealResults() {
    const section = resultsRef.current;
    if (!section) return;
    if (section.getBoundingClientRect().top > window.innerHeight - 120) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function toggleMember(id: number) {
    setMemberId((current) => (current === id ? null : id));
    revealResults();
  }

  function toggleStatus(next: StatusFilter) {
    setStatus((current) => (current === next ? null : next));
    revealResults();
  }

  function selectMemberStatus(id: number, next: StatusFilter) {
    if (memberId === id && status === next) {
      setStatus(null);
    } else {
      setMemberId(id);
      setStatus(next);
    }
    revealResults();
  }

  function resetFilters() {
    setMemberId(null);
    setStatus(null);
    setTaskStatus(null);
    setPriority(null);
    setCategory(null);
    setClient(null);
    setDeadline(null);
  }

  const interactiveCards: Array<{ filter: StatusFilter; label: string }> = isOwner
    ? [
        { filter: "open", label: "Open Tasks" },
        { filter: "overdue", label: "Overdue Deliverables" },
        { filter: "completed", label: "Completed Tasks" },
      ]
    : [
        { filter: "open", label: "My Open Tasks" },
        { filter: "due_today", label: "Due Today" },
        { filter: "overdue", label: "Overdue" },
        { filter: "completed", label: "Completed" },
      ];

  const linkCards = isOwner
    ? [
        { label: "Active Clients", value: counts.clients, href: "/clients" },
        { label: "Feedback Needing Action", value: counts.feedbackOpen, href: "/feedback" },
        { label: "Delayed Comms SLA", value: counts.commsAttention, href: "/communications" },
        { label: "Upcoming Meetings", value: counts.meetingsUpcoming, href: "/meetings" },
      ]
    : [
        { label: "Delayed Comms SLA", value: counts.commsAttention, href: "/communications" },
        { label: "Upcoming Meetings", value: counts.meetingsUpcoming, href: "/meetings" },
      ];

  const ownerCards = [
    { kind: "link" as const, ...linkCards[0] },
    ...interactiveCards.map((card) => ({ kind: "status" as const, ...card })),
    ...linkCards.slice(1).map((card) => ({ kind: "link" as const, ...card })),
  ];

  const cards: Array<
    | { kind: "status"; filter: StatusFilter; label: string }
    | { kind: "link"; label: string; value: number; href: string }
  > = isOwner
    ? ownerCards
    : [
        ...interactiveCards.map((card) => ({ kind: "status" as const, ...card })),
        ...linkCards.map((card) => ({ kind: "link" as const, ...card })),
      ];

  const resultsTitle = selectedMember
    ? `${selectedMember.name}'s Tasks`
    : isOwner
      ? "All Tasks Overview"
      : "My Tasks";

  const resultSummaryParts = [
    selectedMember ? selectedMember.name : isOwner ? "All Team Members" : "Assigned to Me",
  ];
  if (status) resultSummaryParts.push(STATUS_LABELS[status]);
  if (taskStatus) resultSummaryParts.push(statusLabel(taskStatus));
  if (priority) resultSummaryParts.push(`${PRIORITY_LABELS[priority]} priority`);
  if (category) resultSummaryParts.push(taskCategoryLabel(category));
  if (client) resultSummaryParts.push(client === "__internal" ? "Internal" : client);
  if (deadline) resultSummaryParts.push(DEADLINE_LABELS[deadline]);
  if (resultSummaryParts.length === 1) resultSummaryParts.push("All Tasks");
  const resultSummary = resultSummaryParts.join(" · ");

  return (
    <>
      {/* KPI Cards Grid */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          if (card.kind === "link") {
            return (
              <Link
                key={card.label}
                href={card.href}
                className="group rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-xs transition-all hover:border-[#ed8527]/50 hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {card.label}
                  </span>
                  <span className="text-xs font-semibold text-[#ed8527] opacity-0 group-hover:opacity-100 transition-opacity">
                    View →
                  </span>
                </div>
                <div className="mt-2 text-3xl font-extrabold text-[#12143d]">
                  {card.value}
                </div>
              </Link>
            );
          }

          const active = status === card.filter;
          const isOverdueCard = card.filter === "overdue";

          return (
            <button
              key={card.filter}
              type="button"
              aria-pressed={active}
              onClick={() => toggleStatus(card.filter)}
              className={`rounded-2xl border p-4.5 text-left transition-all shadow-xs cursor-pointer ${
                active
                  ? "border-[#12143d] bg-slate-50 ring-2 ring-[#12143d]/20"
                  : isOverdueCard && statusCounts[card.filter] > 0
                    ? "border-rose-200 bg-rose-50/30 hover:border-rose-300"
                    : "border-slate-200/90 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {card.label}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    active
                      ? "bg-[#12143d] text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {active ? "Filtered" : "Filter"}
                </span>
              </div>
              <div
                className={`mt-2 text-3xl font-extrabold ${
                  isOverdueCard && statusCounts[card.filter] > 0
                    ? "text-rose-600"
                    : "text-[#12143d]"
                }`}
              >
                {statusCounts[card.filter]}
              </div>
            </button>
          );
        })}
      </div>

      {/* Social Post Content Calendar Cards */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#ed8527]" />
              <h2 className="text-sm font-bold text-[#12143d]">
                Social Media Publishing Pipeline
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {isOwner ? "Consolidated across all restaurant accounts" : "Posts for assigned accounts"} ·{" "}
              <b className="text-slate-800">{postStatuses.total}</b> total posts
            </p>
          </div>
          <Link
            href="/posts"
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#12143d] hover:bg-slate-50 shadow-2xs transition-colors"
          >
            Manage Social Posts →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {POST_STATUS_CARDS.map((item) => (
            <Link
              key={item.key}
              href={`/posts?status=${item.key}`}
              className={`group rounded-xl border p-3.5 transition-all shadow-2xs hover:shadow-xs ${item.badge}`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                <span>{item.label}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold">{postStatuses[item.key]}</span>
                <span className="text-[11px] font-semibold opacity-70 group-hover:opacity-100">
                  View →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Team Workload Table (Owner view) */}
      {isOwner ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#12143d]" />
                <h2 className="text-sm font-bold text-[#12143d]">
                  Team Workload &amp; Accountability
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Click a team member or a status number to filter deliverables below.
              </p>
            </div>
            <Link
              href="/tasks"
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#12143d] hover:bg-slate-50 shadow-2xs transition-colors"
            >
              Full Task Board →
            </Link>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs sm:text-sm">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Team Member</th>
                  <th className="px-4 py-3">Role &amp; Department</th>
                  <th className="px-4 py-3 text-center">Open Tasks</th>
                  <th className="px-4 py-3 text-center">Overdue</th>
                  <th className="px-4 py-3 text-center">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {memberRows.map((member) => {
                  const active = memberId === member.id;
                  return (
                    <tr
                      key={member.id}
                      className={`transition-colors ${
                        active ? "bg-orange-50/50" : "hover:bg-slate-50/60"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleMember(member.id)}
                          className={`font-semibold cursor-pointer text-left transition-colors ${
                            active
                              ? "text-[#ed8527]"
                              : "text-[#12143d] hover:text-[#ed8527]"
                          }`}
                        >
                          {member.name} {active && "✓"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {member.job_title || member.department || "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CountButton
                          value={member.open}
                          label={`Open tasks for ${member.name}`}
                          active={active && status === "open"}
                          onClick={() => selectMemberStatus(member.id, "open")}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CountButton
                          value={member.overdue}
                          label={`Overdue tasks for ${member.name}`}
                          active={active && status === "overdue"}
                          highlight={member.overdue > 0}
                          onClick={() => selectMemberStatus(member.id, "overdue")}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CountButton
                          value={member.completed}
                          label={`Completed tasks for ${member.name}`}
                          active={active && status === "completed"}
                          onClick={() => selectMemberStatus(member.id, "completed")}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Filtered Deliverables Result Section */}
      <section
        ref={resultsRef}
        id="dashboard-tasks"
        className="scroll-mt-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-[#12143d]">{resultsTitle}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {resultSummary} · <b className="text-slate-800">{filteredTasks.length}</b>{" "}
              {filteredTasks.length === 1 ? "task" : "tasks"} matching
            </p>
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FilterSelect
            label="Status"
            value={taskStatus ?? ""}
            onChange={(value) => setTaskStatus(value || null)}
          >
            <option value="">All statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </FilterSelect>

          <FilterSelect
            label="Priority"
            value={priority ?? ""}
            onChange={(value) => setPriority((value || null) as TaskPriorityValue | null)}
          >
            <option value="">All priorities</option>
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </FilterSelect>

          {isOwner && (
            <FilterSelect
              label="Assigned to"
              value={memberId === null ? "" : String(memberId)}
              onChange={(value) => setMemberId(value ? Number(value) : null)}
            >
              <option value="">All assignees</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </FilterSelect>
          )}

          <FilterSelect
            label="Category"
            value={category ?? ""}
            onChange={(value) => setCategory(value || null)}
          >
            <option value="">All categories</option>
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Client"
            value={client ?? ""}
            onChange={(value) => setClient(value || null)}
          >
            <option value="">All clients</option>
            {clientOptions.names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {clientOptions.hasInternal && <option value="__internal">Internal</option>}
          </FilterSelect>

          <FilterSelect
            label="Deadline"
            value={deadline ?? ""}
            onChange={(value) => setDeadline((value || null) as DeadlineFilter | null)}
          >
            <option value="">All deadlines</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="next7">Next 7 days</option>
            <option value="none">No deadline</option>
          </FilterSelect>
        </div>

        {hasFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {selectedMember && (
              <FilterChip
                label={`Assignee: ${selectedMember.name}`}
                onRemove={() => setMemberId(null)}
              />
            )}
            {status && (
              <FilterChip
                label={`View: ${STATUS_LABELS[status]}`}
                onRemove={() => setStatus(null)}
              />
            )}
            {taskStatus && (
              <FilterChip
                label={`Status: ${statusLabel(taskStatus)}`}
                onRemove={() => setTaskStatus(null)}
              />
            )}
            {priority && (
              <FilterChip
                label={`Priority: ${PRIORITY_LABELS[priority]}`}
                onRemove={() => setPriority(null)}
              />
            )}
            {category && (
              <FilterChip
                label={`Category: ${taskCategoryLabel(category)}`}
                onRemove={() => setCategory(null)}
              />
            )}
            {client && (
              <FilterChip
                label={`Client: ${client === "__internal" ? "Internal" : client}`}
                onRemove={() => setClient(null)}
              />
            )}
            {deadline && (
              <FilterChip
                label={`Deadline: ${DEADLINE_LABELS[deadline]}`}
                onRemove={() => setDeadline(null)}
              />
            )}
          </div>
        )}

        {filteredTasks.length ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs sm:text-sm">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Task Deliverable</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Assigned To</th>
                  <th className="px-4 py-3">Deadline</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((task) => {
                  const overdue = isTaskOverdue(task, today);
                  return (
                    <tr key={task.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <Link
                          href={`/tasks?task=${task.id}`}
                          className="hover:text-[#ed8527] transition-colors"
                        >
                          #{task.id} {task.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">
                        {task.client_name || "Internal"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {taskCategoryLabel(task.category)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {task.assignee_name || "Unassigned"}
                      </td>
                      <td
                        className={`px-4 py-3 ${
                          overdue ? "font-bold text-rose-600" : "text-slate-600"
                        }`}
                      >
                        {task.due_date || "—"}
                        {overdue ? " (Overdue)" : ""}
                      </td>
                      <td className="px-4 py-3">
                        <TaskPriorityBadge priority={task.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${
                            STATUS_BADGE[task.status] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {statusLabel(task.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
            <p className="font-semibold text-slate-700">No tasks match these filters.</p>
            <p className="mt-1">Try clearing one or more filters above, or press Reset Filters.</p>
          </div>
        )}
      </section>
    </>
  );
}

function CountButton({
  value,
  label,
  active,
  highlight,
  onClick,
}: {
  value: number;
  label: string;
  active: boolean;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-block min-w-7 rounded-lg px-2 py-1 text-xs font-bold transition-all cursor-pointer ${
        active
          ? "bg-[#12143d] text-white shadow-2xs"
          : highlight
            ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {value}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-2xs outline-none transition-colors hover:border-slate-300 focus:border-[#ed8527] focus:ring-2 focus:ring-[#ed8527]/15 cursor-pointer"
      >
        {children}
      </select>
    </label>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="rounded-full text-slate-400 hover:text-slate-700 cursor-pointer text-sm leading-none"
      >
        ×
      </button>
    </span>
  );
}
