export const TASK_CATEGORIES = [
  { value: "social_media", label: "Social Media" },
  { value: "design", label: "Design" },
  { value: "client_communication", label: "Client Communication" },
  { value: "feedback", label: "Client Feedback" },
  { value: "strategy", label: "Strategy" },
  { value: "blogger", label: "Blogger Collaboration" },
  { value: "meeting", label: "Meeting / Prep" },
  { value: "operations", label: "Operations" },
  { value: "other", label: "Other" },
] as const;

export const DEPARTMENTS = [
  { value: "management", label: "Management" },
  { value: "social", label: "Social Media" },
  { value: "design", label: "Design" },
  { value: "strategy", label: "Strategy" },
  { value: "other", label: "Other" },
] as const;

export const TASK_STATUSES = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
] as const;

/** Stored task priority. Every task always has one of these values. */
export const TASK_PRIORITIES = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number]["value"];

export const DEFAULT_TASK_PRIORITY: TaskPriorityValue = "medium";

export function taskPriorityLabel(value: string | null | undefined) {
  return TASK_PRIORITIES.find((item) => item.value === value)?.label || "Medium";
}

export function isTaskPriority(value: string): value is TaskPriorityValue {
  return TASK_PRIORITIES.some((item) => item.value === value);
}

export function taskCategoryLabel(value: string | null | undefined) {
  return TASK_CATEGORIES.find((item) => item.value === value)?.label || value || "Other";
}

export function departmentLabel(value: string | null | undefined) {
  return DEPARTMENTS.find((item) => item.value === value)?.label || value || "-";
}

export function isTaskCategory(value: string): value is (typeof TASK_CATEGORIES)[number]["value"] {
  return TASK_CATEGORIES.some((item) => item.value === value);
}

export function isDepartment(value: string): value is (typeof DEPARTMENTS)[number]["value"] {
  return DEPARTMENTS.some((item) => item.value === value);
}

export function isTaskStatus(value: string): value is (typeof TASK_STATUSES)[number]["value"] {
  return TASK_STATUSES.some((item) => item.value === value);
}

/* ------------------------------------------------------------------ *
 * Unified interactions: Communication is the interaction record.
 * Feedback is a specialised record that may be created from it.
 * ------------------------------------------------------------------ */

export const COMMUNICATION_TYPES = [
  { value: "general", label: "General Communication" },
  { value: "feedback", label: "Communication Containing Feedback" },
] as const;

export const COMMUNICATION_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "call", label: "Phone call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "other", label: "Other" },
] as const;

export const FEEDBACK_STATUSES = [
  { value: "new", label: "New" },
  { value: "under_review", label: "Under Review" },
  { value: "action_required", label: "Action Required" },
  { value: "in_progress", label: "In Progress" },
  { value: "awaiting_client_response", label: "Awaiting Client Response" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
] as const;

export const FEEDBACK_CATEGORIES = [
  { value: "creative", label: "Creative / Design" },
  { value: "social_post", label: "Social Post" },
  { value: "blog", label: "Blog / Content" },
  { value: "website", label: "Website" },
  { value: "campaign", label: "Campaign" },
  { value: "deliverable", label: "Deliverable" },
  { value: "complaint", label: "Complaint" },
  { value: "suggestion", label: "Suggestion" },
  { value: "other", label: "Other" },
] as const;

export const FEEDBACK_SENTIMENTS = [
  { value: "positive", label: "Positive" },
  { value: "negative", label: "Negative" },
  { value: "neutral", label: "Neutral" },
  { value: "suggestion", label: "Suggestion" },
] as const;

export const FEEDBACK_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

export type CommunicationType = (typeof COMMUNICATION_TYPES)[number]["value"];
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number]["value"];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]["value"];
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]["value"];
export type FeedbackSentiment = (typeof FEEDBACK_SENTIMENTS)[number]["value"];
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number]["value"];

function labelOf(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
  fallback: string
) {
  return options.find((item) => item.value === value)?.label || value || fallback;
}

export function communicationTypeLabel(value: string | null | undefined) {
  return labelOf(COMMUNICATION_TYPES, value, "General Communication");
}

export function communicationChannelLabel(value: string | null | undefined) {
  return labelOf(COMMUNICATION_CHANNELS, value, "WhatsApp");
}

export function feedbackStatusLabel(value: string | null | undefined) {
  return labelOf(FEEDBACK_STATUSES, value, "New");
}

export function feedbackCategoryLabel(value: string | null | undefined) {
  return labelOf(FEEDBACK_CATEGORIES, value, "Other");
}

export function feedbackSentimentLabel(value: string | null | undefined) {
  return labelOf(FEEDBACK_SENTIMENTS, value, "Neutral");
}

export function feedbackPriorityLabel(value: string | null | undefined) {
  return labelOf(FEEDBACK_PRIORITIES, value, "Medium");
}

export function isCommunicationType(value: string): value is CommunicationType {
  return COMMUNICATION_TYPES.some((item) => item.value === value);
}

export function isCommunicationChannel(value: string): value is CommunicationChannel {
  return COMMUNICATION_CHANNELS.some((item) => item.value === value);
}

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return FEEDBACK_STATUSES.some((item) => item.value === value);
}

export function isFeedbackCategory(value: string): value is FeedbackCategory {
  return FEEDBACK_CATEGORIES.some((item) => item.value === value);
}

export function isFeedbackSentiment(value: string): value is FeedbackSentiment {
  return FEEDBACK_SENTIMENTS.some((item) => item.value === value);
}

export function isFeedbackPriority(value: string): value is FeedbackPriority {
  return FEEDBACK_PRIORITIES.some((item) => item.value === value);
}

/** Feedback statuses that still need work from the team. */
export const OPEN_FEEDBACK_STATUSES: FeedbackStatus[] = [
  "new",
  "under_review",
  "action_required",
  "in_progress",
  "awaiting_client_response",
];

/** Task status implied by a feedback lifecycle status. */
export function taskStatusForFeedback(status: string): "todo" | "in_progress" | "done" {
  if (status === "resolved" || status === "closed") return "done";
  if (status === "new") return "todo";
  return "in_progress";
}

/** Legacy `action_status` mirror, kept for older queries and integrations. */
export function legacyActionStatusForFeedback(status: string): string {
  if (status === "resolved") return "implemented";
  if (status === "closed") return "ignored";
  if (status === "under_review") return "requires_discussion";
  return "pending";
}

/** Feedback lifecycle status implied by a task status (task-driven sync). */
export function feedbackStatusForTask(status: string): FeedbackStatus {
  if (status === "done") return "resolved";
  if (status === "in_progress") return "in_progress";
  return "new";
}

