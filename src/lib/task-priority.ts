import {
  DEFAULT_TASK_PRIORITY,
  TASK_PRIORITIES,
  isTaskPriority,
  type TaskPriorityValue,
} from "./constants";

export type { TaskPriorityValue };

export type TaskPriority = {
  value: TaskPriorityValue;
  label: string;
};

/**
 * Priority is a stored task property. Records created before the column
 * existed (or with an unknown value) fall back to Medium so a task is never
 * displayed without a priority.
 */
export function normalizeTaskPriority(value: unknown): TaskPriorityValue {
  return typeof value === "string" && isTaskPriority(value) ? value : DEFAULT_TASK_PRIORITY;
}

export function taskPriority(task: { priority?: string | null }): TaskPriority {
  const value = normalizeTaskPriority(task.priority);
  return {
    value,
    label: TASK_PRIORITIES.find((item) => item.value === value)?.label || "Medium",
  };
}

/** Sort helper: High (0) before Medium (1) before Low (2). */
export function taskPriorityRank(value: string | null | undefined) {
  const priority = normalizeTaskPriority(value);
  return TASK_PRIORITIES.findIndex((item) => item.value === priority);
}

export function isTaskOverdue(
  task: { status: string; due_date: string | null },
  today: string
) {
  return task.status !== "done" && !!task.due_date && task.due_date < today;
}
