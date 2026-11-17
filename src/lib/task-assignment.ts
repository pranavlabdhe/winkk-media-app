export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The day the task was handed to its current assignee (created or reassigned). */
export function taskAssignedDate(task: {
  assigned_at?: string | null;
  created_at?: string | null;
}) {
  return String(task.assigned_at || task.created_at || "").slice(0, 10);
}

export function addDaysIso(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function assignmentRangeLabel(from: string | null, to: string | null) {
  if (from && to) {
    return from === to
      ? `Assigned ${formatIsoDate(from)}`
      : `Assigned ${formatIsoDate(from)} – ${formatIsoDate(to)}`;
  }
  if (from) return `Assigned on or after ${formatIsoDate(from)}`;
  if (to) return `Assigned on or before ${formatIsoDate(to)}`;
  return "All assignment dates";
}
