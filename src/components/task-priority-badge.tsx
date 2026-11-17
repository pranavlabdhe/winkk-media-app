import { taskPriorityLabel, type TaskPriorityValue } from "@/lib/constants";
import { normalizeTaskPriority } from "@/lib/task-priority";

const PRIORITY_STYLES: Record<
  TaskPriorityValue,
  { badge: string; dot: string }
> = {
  high: {
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
  medium: {
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  low: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
};

type Props = {
  priority?: string | null;
  className?: string;
  /** Hide the text and render only the coloured dot. */
  dotOnly?: boolean;
};

/**
 * The single priority badge used everywhere a task is displayed.
 * High = red, Medium = amber, Low = green.
 */
export default function TaskPriorityBadge({ priority, className = "", dotOnly = false }: Props) {
  const value = normalizeTaskPriority(priority);
  const style = PRIORITY_STYLES[value];

  if (dotOnly) {
    return (
      <span
        title={`${taskPriorityLabel(value)} priority`}
        aria-label={`${taskPriorityLabel(value)} priority`}
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${style.dot} ${className}`}
      />
    );
  }

  return (
    <span
      title={`${taskPriorityLabel(value)} priority`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${style.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {taskPriorityLabel(value)}
    </span>
  );
}
