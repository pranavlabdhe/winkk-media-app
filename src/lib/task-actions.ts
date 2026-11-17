"use server";

import { revalidatePath } from "next/cache";
import db from "./db";
import { getSession } from "./auth";
import { DEFAULT_TASK_PRIORITY, isTaskCategory, isTaskPriority, isTaskStatus, taskPriorityLabel } from "./constants";
import {
  MODULE_LABELS,
  MODULE_TABLE,
  ModuleType,
  createLinkedModuleForTask,
  linkTaskToModule,
  logActivity,
  syncTaskToLinkedModules,
  unlinkTaskModules,
} from "./activity-service";

function refreshUnifiedViews(clientId?: number | null) {
  for (const path of [
    "/tasks",
    "/my-work",
    "/dashboard",
    "/clients",
    "/posts",
    "/feedback",
    "/communications",
    "/bloggers",
    "/meetings",
  ]) {
    revalidatePath(path);
  }
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

function parseLinkedRecord(value: string): { type: ModuleType; id: number } | null {
  const [type, rawId] = value.split(":");
  if (!type || !(type in MODULE_TABLE)) return null;
  const id = Number(rawId);
  if (!id) return null;
  return { type: type as ModuleType, id };
}

export async function createTaskAction(formData: FormData) {
  const session = await getSession();
  if (!session) return;

  const title = String(formData.get("title") || "").trim();
  const assignedTo = Number(formData.get("assigned_to"));
  if (!title || !assignedTo) return;

  const clientRaw = formData.get("client_id");
  const clientId = clientRaw ? Number(clientRaw) || null : null;
  const categoryRaw = String(formData.get("category") || "other");
  const category = isTaskCategory(categoryRaw) ? categoryRaw : "other";
  const statusRaw = String(formData.get("status") || "todo");
  const status = isTaskStatus(statusRaw) ? statusRaw : "todo";
  const priorityRaw = String(formData.get("priority") || DEFAULT_TASK_PRIORITY);
  const priority = isTaskPriority(priorityRaw) ? priorityRaw : DEFAULT_TASK_PRIORITY;
  const bloggerRaw = formData.get("linked_blogger_id");
  const linkedBloggerId = bloggerRaw ? Number(bloggerRaw) || null : null;
  const activityAt = String(formData.get("activity_at") || "") || null;

  const result = db
    .prepare(
      `INSERT INTO tasks
        (title,description,client_id,assigned_to,assigned_by,status,category,priority,due_date,origin_module,linked_blogger_id,activity_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      title,
      String(formData.get("description") || "").trim() || null,
      clientId,
      assignedTo,
      session.id,
      status,
      category,
      priority,
      String(formData.get("due_date") || "") || null,
      "tasks",
      linkedBloggerId,
      activityAt
    );

  const taskId = Number(result.lastInsertRowid);
  const assignee = db.prepare("SELECT name FROM users WHERE id=?").get(assignedTo) as any;
  db.prepare("INSERT INTO task_updates (task_id,user_id,note) VALUES (?,?,?)").run(
    taskId,
    session.id,
    `Task created by ${session.name} and assigned to ${assignee?.name || "team member"}.`
  );

  const linked = parseLinkedRecord(String(formData.get("linked_record") || ""));
  if (linked) {
    linkTaskToModule(taskId, linked.type, linked.id, session.id);
  } else {
    createLinkedModuleForTask(taskId, {
      userId: session.id,
      bloggerId: linkedBloggerId,
      activityAt,
    });
  }

  logActivity({
    clientId,
    taskId,
    entityType: "task",
    entityId: taskId,
    action: "created",
    summary: `Task "${title}" created${
      clientId
        ? ` for ${(db.prepare("SELECT name FROM clients WHERE id=?").get(clientId) as any)?.name || "client"}`
        : ""
    }.`,
    userId: session.id,
  });

  refreshUnifiedViews(clientId);
}

export async function updateTaskAction(formData: FormData) {
  const session = await getSession();
  if (!session) return;

  const id = Number(formData.get("id"));
  if (!id) return;

  const current = db.prepare("SELECT * FROM tasks WHERE id=?").get(id) as any;
  if (!current) return;

  const statusRaw = String(formData.get("status") || current.status);
  const status = isTaskStatus(statusRaw) ? statusRaw : current.status;
  const assignedTo =
    formData.get("assigned_to") !== null
      ? Number(formData.get("assigned_to")) || current.assigned_to
      : current.assigned_to;
  const categoryRaw =
    formData.get("category") !== null ? String(formData.get("category")) : current.category;
  const category = isTaskCategory(categoryRaw) ? categoryRaw : current.category;
  const priorityRaw =
    formData.get("priority") !== null ? String(formData.get("priority")) : current.priority;
  const priority = isTaskPriority(priorityRaw)
    ? priorityRaw
    : isTaskPriority(current.priority)
      ? current.priority
      : DEFAULT_TASK_PRIORITY;
  const dueRaw = formData.get("due_date");
  const dueDate = dueRaw === null ? current.due_date : String(dueRaw) || null;

  db.prepare(
    "UPDATE tasks SET status=?, assigned_to=?, category=?, priority=?, due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
  ).run(status, assignedTo, category, priority, dueDate, id);

  const changes: string[] = [];
  if (status !== current.status) changes.push(`Status moved from ${current.status} to ${status}`);
  if (assignedTo !== current.assigned_to) {
    const assignee = db.prepare("SELECT name FROM users WHERE id=?").get(assignedTo) as any;
    changes.push(`Reassigned to ${assignee?.name || "team member"}`);
  }
  if (dueDate !== current.due_date) changes.push(dueDate ? `Due date set to ${dueDate}` : "Due date cleared");
  if (category !== current.category) changes.push("Work category changed");
  if (priority !== current.priority) {
    changes.push(`Priority changed from ${taskPriorityLabel(current.priority)} to ${taskPriorityLabel(priority)}`);
  }

  if (changes.length) {
    db.prepare("INSERT INTO task_updates (task_id,user_id,note) VALUES (?,?,?)").run(
      id,
      session.id,
      `${changes.join("; ")} (by ${session.name}).`
    );
  }

  createLinkedModuleForTask(id, { userId: session.id });
  syncTaskToLinkedModules(id);

  logActivity({
    clientId: current.client_id,
    taskId: id,
    entityType: "task",
    entityId: id,
    action: "updated",
    summary: `Task "${current.title}" updated${changes.length ? `: ${changes.join("; ")}` : "."}`,
    userId: session.id,
  });

  refreshUnifiedViews(current.client_id);
}

export async function deleteTaskAction(formData: FormData) {
  const session = await getSession();
  if (!session) return;

  const id = Number(formData.get("id"));
  if (!id) return;

  const task = db.prepare("SELECT client_id,title FROM tasks WHERE id=?").get(id) as any;
  unlinkTaskModules(id);
  logActivity({
    clientId: task?.client_id,
    entityId: id,
    entityType: "task",
    action: "deleted",
    summary: `Task "${task?.title || id}" deleted. Linked module records were retained and unlinked.`,
    userId: session.id,
  });
  db.prepare("DELETE FROM tasks WHERE id=?").run(id);
  refreshUnifiedViews(task?.client_id);
}

export async function addTaskUpdateAction(formData: FormData) {
  const session = await getSession();
  if (!session) return;

  const taskId = Number(formData.get("task_id"));
  const note = String(formData.get("note") || "").trim();
  if (!taskId || !note) return;

  db.prepare("INSERT INTO task_updates (task_id,user_id,note) VALUES (?,?,?)").run(
    taskId,
    session.id,
    note
  );

  const task = db.prepare("SELECT client_id FROM tasks WHERE id=?").get(taskId) as any;
  logActivity({
    clientId: task?.client_id,
    taskId,
    entityType: "task",
    entityId: taskId,
    action: "note",
    summary: note,
    userId: session.id,
  });
  refreshUnifiedViews(task?.client_id);
}

export async function linkTaskModuleAction(formData: FormData) {
  const session = await getSession();
  if (!session) return;

  const taskId = Number(formData.get("task_id"));
  const linked = parseLinkedRecord(String(formData.get("record") || ""));
  if (!taskId || !linked) return;

  linkTaskToModule(taskId, linked.type, linked.id, session.id);
  const task = db.prepare("SELECT client_id FROM tasks WHERE id=?").get(taskId) as any;
  refreshUnifiedViews(task?.client_id);
}

export async function unlinkTaskModuleAction(formData: FormData) {
  const session = await getSession();
  if (!session) return;

  const taskId = Number(formData.get("task_id"));
  const raw = String(formData.get("record") || "");
  const [type, rawId] = raw.split(":");
  if (!taskId || !type || !(type in MODULE_TABLE)) return;
  const recordId = Number(rawId);
  if (!recordId) return;

  const moduleType = type as ModuleType;
  const record = db
    .prepare(`SELECT client_id FROM ${MODULE_TABLE[moduleType]} WHERE id=? AND task_id=?`)
    .get(recordId, taskId) as any;
  db.prepare(`UPDATE ${MODULE_TABLE[moduleType]} SET task_id=NULL WHERE id=? AND task_id=?`).run(
    recordId,
    taskId
  );
  logActivity({
    clientId: record?.client_id || null,
    taskId,
    entityType: moduleType,
    entityId: recordId,
    action: "unlinked",
    summary: `${MODULE_LABELS[moduleType]} unlinked from the task. The module record was retained.`,
    userId: session.id,
  });
  const task = db.prepare("SELECT client_id FROM tasks WHERE id=?").get(taskId) as any;
  refreshUnifiedViews(task?.client_id);
}
