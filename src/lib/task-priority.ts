export type TaskPriorityValue = "high" | "medium" | "low" | "none";

export type TaskPriority = {
  value: TaskPriorityValue;
  label: string;
};

const DAY_MS = 86_400_000;

function toUtc(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * Priority is derived from the task deadline so it stays accurate when due
 * dates change. It is intentionally not stored, which avoids stale values.
 */
export function taskPriority(
  task: { status: string; due_date: string | null },
  today: string
): TaskPriority {
  if (task.status === "done") return { value: "none", label: "—" };
  if (!task.due_date) return { value: "low", label: "Low" };

  const daysUntilDue = Math.round((toUtc(task.due_date) - toUtc(today)) / DAY_MS);

  if (daysUntilDue < 0) return { value: "high", label: "High" };
  if (daysUntilDue <= 3) return { value: "medium", label: "Medium" };
  return { value: "low", label: "Low" };
}

export function isTaskOverdue(
  task: { status: string; due_date: string | null },
  today: string
) {
  return task.status !== "done" && !!task.due_date && task.due_date < today;
}
