"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { taskCategoryLabel } from "@/lib/constants";
import {
  isTaskOverdue,
  taskPriority,
  type TaskPriorityValue,
} from "@/lib/task-priority";

export type DashboardTask = {
  id: number;
  title: string;
  client_name: string | null;
  category: string | null;
  assigned_to: number | null;
  assignee_name: string | null;
  due_date: string | null;
  status: string;
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
}> = [
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "pending", label: "Pending" },
  { key: "missed", label: "Missed" },
];

const STATUS_LABELS: Record<StatusFilter, string> = {
  open: "Open",
  overdue: "Overdue",
  completed: "Completed",
  due_today: "Due today",
};

const STATUS_BADGE: Record<string, string> = {
  todo: "bg-zinc-100 text-zinc-700",
  in_progress: "bg-blue-50 text-blue-700",
  done: "bg-emerald-50 text-emerald-700",
};

const PRIORITY_BADGE: Record<TaskPriorityValue, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-zinc-100 text-zinc-600",
  none: "text-zinc-400",
};

function statusLabel(status: string) {
  if (status === "in_progress") return "In progress";
  if (status === "todo") return "To do";
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
  const resultsRef = useRef<HTMLElement>(null);

  const selectedMember = members.find((member) => member.id === memberId) || null;
  const hasFilters = memberId !== null || status !== null;

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
      tasks.filter(
        (task) =>
          (memberId === null || task.assigned_to === memberId) &&
          (status === null || matchesStatus(task, status, today))
      ),
    [tasks, memberId, status, today]
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
  }

  const interactiveCards: Array<{ filter: StatusFilter; label: string }> = isOwner
    ? [
        { filter: "open", label: "Open tasks" },
        { filter: "overdue", label: "Overdue tasks" },
        { filter: "completed", label: "Completed tasks" },
      ]
    : [
        { filter: "open", label: "My open tasks" },
        { filter: "due_today", label: "Due today" },
        { filter: "overdue", label: "Overdue" },
        { filter: "completed", label: "Completed" },
      ];

  const linkCards = isOwner
    ? [
        { label: "Clients", value: counts.clients, href: "/clients" },
        { label: "Feedback needing action", value: counts.feedbackOpen, href: "/feedback" },
        { label: "Comms needing attention", value: counts.commsAttention, href: "/communications" },
        { label: "Upcoming meetings", value: counts.meetingsUpcoming, href: "/meetings" },
      ]
    : [
        { label: "Comms needing attention", value: counts.commsAttention, href: "/communications" },
        { label: "Upcoming meetings", value: counts.meetingsUpcoming, href: "/meetings" },
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
    ? `${selectedMember.name}'s tasks`
    : isOwner
      ? "All tasks"
      : "My tasks";

  const resultSummary = [
    selectedMember ? selectedMember.name : isOwner ? "Everyone" : "Assigned to me",
    status ? STATUS_LABELS[status] : "All statuses",
  ].join(" · ");

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          if (card.kind === "link") {
            return (
              <Link
                key={card.label}
                href={card.href}
                className="rounded-lg border bg-white p-4 transition hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
              >
                <div className="text-sm text-zinc-500">{card.label}</div>
                <div className="mt-1 text-3xl font-semibold">{card.value}</div>
              </Link>
            );
          }

          const active = status === card.filter;
          return (
            <button
              key={card.filter}
              type="button"
              aria-pressed={active}
              onClick={() => toggleStatus(card.filter)}
              className={`rounded-lg border bg-white p-4 text-left transition hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
                active ? "border-zinc-900 ring-2 ring-zinc-900" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-zinc-500">{card.label}</span>
                <span
                  className={`text-xs ${active ? "font-medium text-zinc-900" : "text-zinc-400"}`}
                >
                  {active ? "Filtering" : "Filter"}
                </span>
              </div>
              <div className="mt-1 text-3xl font-semibold">{statusCounts[card.filter]}</div>
            </button>
          );
        })}
      </div>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Social post status</h2>
            <p className="text-xs text-zinc-500">
              {isOwner ? "Across all clients" : "Posts for your assigned clients"} ·{" "}
              {postStatuses.total} {postStatuses.total === 1 ? "post" : "posts"} · click a
              status to open the filtered list
            </p>
          </div>
          <Link href="/posts" className="text-sm text-blue-700 hover:underline">
            View all posts
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {POST_STATUS_CARDS.map((item) => (
            <Link
              key={item.key}
              href={`/posts?status=${item.key}`}
              className="rounded-lg border bg-white p-3 transition hover:bg-zinc-50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
            >
              <div className="text-sm text-zinc-500">{item.label}</div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-semibold">{postStatuses[item.key]}</span>
                <span className="text-xs text-zinc-500">View →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {isOwner ? (
        <section className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Team workload</h2>
              <p className="text-xs text-zinc-500">
                Click a name, or a count, to filter the task list below.
              </p>
            </div>
            <Link href="/tasks" className="text-sm text-blue-700 hover:underline">
              View all tasks
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="p-2">Team member</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Open</th>
                  <th className="p-2">Overdue</th>
                  <th className="p-2">Completed</th>
                </tr>
              </thead>
              <tbody>
                {memberRows.map((member) => {
                  const active = memberId === member.id;
                  return (
                    <tr
                      key={member.id}
                      className={`border-t transition ${active ? "bg-blue-50" : "hover:bg-zinc-50"}`}
                    >
                      <td className="p-2">
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleMember(member.id)}
                          className={`text-left font-medium hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
                            active ? "text-blue-700 underline" : ""
                          }`}
                        >
                          {member.name}
                        </button>
                      </td>
                      <td className="p-2">{member.job_title || member.department || "-"}</td>
                      <td className="p-2">
                        <CountButton
                          value={member.open}
                          label={`Open tasks for ${member.name}`}
                          active={active && status === "open"}
                          onClick={() => selectMemberStatus(member.id, "open")}
                        />
                      </td>
                      <td className="p-2">
                        <CountButton
                          value={member.overdue}
                          label={`Overdue tasks for ${member.name}`}
                          active={active && status === "overdue"}
                          highlight={member.overdue > 0}
                          onClick={() => selectMemberStatus(member.id, "overdue")}
                        />
                      </td>
                      <td className="p-2">
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
                {!memberRows.length && (
                  <tr>
                    <td className="p-2 text-zinc-500" colSpan={5}>
                      No active team members yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section
        ref={resultsRef}
        id="dashboard-tasks"
        className="scroll-mt-4 rounded-lg border bg-white p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{resultsTitle}</h2>
            <p className="text-sm text-zinc-500">
              {resultSummary} · {filteredTasks.length}{" "}
              {filteredTasks.length === 1 ? "task" : "tasks"}
            </p>
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded border px-3 py-1 text-sm transition hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
            >
              Reset filters
            </button>
          ) : null}
        </div>

        {hasFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {selectedMember ? (
              <FilterChip
                label={selectedMember.name}
                onRemove={() => setMemberId(null)}
              />
            ) : null}
            {status ? (
              <FilterChip
                label={STATUS_LABELS[status]}
                onRemove={() => setStatus(null)}
              />
            ) : null}
          </div>
        ) : null}

        {filteredTasks.length ? (
          <>
            <div className="mt-3 hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-left">
                  <tr>
                    <th className="p-2">Task</th>
                    <th className="p-2">Client</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Assigned to</th>
                    <th className="p-2">Due date</th>
                    <th className="p-2">Priority</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => {
                    const overdue = isTaskOverdue(task, today);
                    const priority = taskPriority(task, today);
                    return (
                      <tr key={task.id} className="border-t align-top hover:bg-zinc-50">
                        <td className="p-2">
                          <Link
                            href={`/tasks?task=${task.id}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {task.title}
                          </Link>
                        </td>
                        <td className="p-2">{task.client_name || "Internal"}</td>
                        <td className="p-2">{taskCategoryLabel(task.category)}</td>
                        <td className="p-2">{task.assignee_name || "Unassigned"}</td>
                        <td className={`p-2 ${overdue ? "font-semibold text-red-700" : ""}`}>
                          {task.due_date || "-"}
                          {overdue ? " · Overdue" : ""}
                        </td>
                        <td className="p-2">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs ${PRIORITY_BADGE[priority.value]}`}
                          >
                            {priority.label}
                          </span>
                        </td>
                        <td className="p-2">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs ${
                              STATUS_BADGE[task.status] || "bg-zinc-100 text-zinc-700"
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

            <div className="mt-3 space-y-2 md:hidden">
              {filteredTasks.map((task) => {
                const overdue = isTaskOverdue(task, today);
                const priority = taskPriority(task, today);
                return (
                  <div key={task.id} className="rounded border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/tasks?task=${task.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {task.title}
                      </Link>
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                          STATUS_BADGE[task.status] || "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {statusLabel(task.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-zinc-600">
                      {task.client_name || "Internal"} · {taskCategoryLabel(task.category)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-600">
                      <span>{task.assignee_name || "Unassigned"}</span>
                      <span className={overdue ? "font-semibold text-red-700" : ""}>
                        Due {task.due_date || "-"}
                        {overdue ? " · Overdue" : ""}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${PRIORITY_BADGE[priority.value]}`}
                      >
                        {priority.label} priority
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="mt-3 rounded border border-dashed p-6 text-center text-sm text-zinc-500">
            <p className="font-medium text-zinc-700">No tasks match these filters.</p>
            <p className="mt-1">
              {selectedMember && status
                ? `${selectedMember.name} has no ${STATUS_LABELS[status].toLowerCase()} tasks.`
                : selectedMember
                  ? `${selectedMember.name} has no tasks yet.`
                  : "There are no tasks in this view yet."}
            </p>
            {hasFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-3 rounded border bg-white px-3 py-1 transition hover:bg-zinc-50"
              >
                Clear filters
              </button>
            ) : null}
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
      className={`rounded px-2 py-0.5 transition hover:bg-zinc-100 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
        active
          ? "bg-zinc-200 font-semibold ring-1 ring-zinc-900"
          : highlight
            ? "font-semibold text-red-700"
            : ""
      }`}
    >
      {value}
    </button>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-900 bg-white px-3 py-1 text-xs font-medium">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="rounded-full px-1 leading-none hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
      >
        ×
      </button>
    </span>
  );
}
