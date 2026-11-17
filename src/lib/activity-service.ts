import db from "./db";
import {
  feedbackStatusForTask,
  legacyActionStatusForFeedback,
} from "./constants";

export type ModuleType = "post" | "feedback" | "communication" | "blogger_assignment" | "meeting";

export const MODULE_LABELS: Record<ModuleType, string> = {
  post: "Social Post",
  feedback: "Client Feedback",
  communication: "Client Communication",
  blogger_assignment: "Blogger Assignment",
  meeting: "Client Meeting",
};

export const MODULE_TABLE: Record<ModuleType, string> = {
  post: "posts",
  feedback: "feedback",
  communication: "communications",
  blogger_assignment: "blogger_assignments",
  meeting: "meetings",
};

export const CATEGORY_MODULE: Record<string, ModuleType | null> = {
  social_media: "post",
  feedback: "feedback",
  client_communication: "communication",
  blogger: "blogger_assignment",
  meeting: "meeting",
  design: null,
  strategy: null,
  operations: null,
  other: null,
};

export const MODULE_CATEGORY: Record<ModuleType, string> = {
  post: "social_media",
  feedback: "feedback",
  communication: "client_communication",
  blogger_assignment: "blogger",
  meeting: "meeting",
};

function firstOwnerId(): number | null {
  const owner = db
    .prepare("SELECT id FROM users WHERE role='owner' AND is_active=1 ORDER BY id LIMIT 1")
    .get() as any;
  return owner?.id || null;
}

function clientName(clientId: number | null | undefined): string {
  if (!clientId) return "Internal";
  const client = db.prepare("SELECT name FROM clients WHERE id=?").get(clientId) as any;
  return client?.name || "Client";
}

function recordFor(type: ModuleType, id: number): any {
  return db.prepare(`SELECT * FROM ${MODULE_TABLE[type]} WHERE id=?`).get(id);
}

function datePart(value: unknown): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function moduleStatusFromTask(
  type: ModuleType,
  status: string
): Record<string, string> {
  if (type === "post") {
    return { status: status === "done" ? "published" : status === "in_progress" ? "scheduled" : "pending" };
  }
  if (type === "feedback") {
    return { status: feedbackStatusForTask(status) };
  }
  if (type === "communication") {
    return { status: status === "done" ? "responded" : "pending" };
  }
  if (type === "blogger_assignment") {
    return {
      assignment_status: status === "done" ? "completed" : status === "in_progress" ? "in_progress" : "assigned",
      completion_status: status === "done" ? "completed" : status === "in_progress" ? "in_progress" : "not_started",
    };
  }
  return { status: status === "done" ? "completed" : "upcoming" };
}

function taskStatusFromModule(type: ModuleType, record: any): string {
  if (type === "post") {
    if (record.status === "published") return "done";
    if (record.status === "scheduled") return "in_progress";
    return "todo";
  }
  if (type === "feedback") {
    const status = (record.status || "").toString();
    if (status === "resolved" || status === "closed") return "done";
    if (status === "new") return "todo";
    if (status) return "in_progress";
    // Legacy rows that predate the lifecycle column.
    if (record.action_status === "implemented" || record.action_status === "ignored") return "done";
    if (record.action_status === "requires_discussion") return "in_progress";
    return "todo";
  }
  if (type === "communication") {
    if (record.status === "responded") return "done";
    if (record.status === "delayed") return "in_progress";
    return "todo";
  }
  if (type === "blogger_assignment") {
    if (record.completion_status === "completed" || record.assignment_status === "completed") return "done";
    if (record.assignment_status === "in_progress" || record.completion_status === "in_progress") return "in_progress";
    return "todo";
  }
  if (record.status === "completed") return "done";
  return "todo";
}

function moduleDueDate(type: ModuleType, record: any): string | null {
  if (type === "post") return datePart(record.scheduled_at);
  if (type === "blogger_assignment") return datePart(record.scheduled_date);
  if (type === "meeting") return datePart(record.meeting_at);
  return null;
}

function taskTitleFromModule(type: ModuleType, record: any): string {
  if (type === "post" || type === "meeting") return record.title;
  if (type === "feedback") {
    const client = clientName(record.client_id);
    const subject = record.title || String(record.content || "").slice(0, 80);
    return `Client feedback – ${client}: ${subject}`;
  }
  if (type === "communication") {
    return `Client communication – ${clientName(record.client_id)}`;
  }
  const blogger = db.prepare("SELECT name FROM bloggers WHERE id=?").get(record.blogger_id) as any;
  return `Blogger collaboration – ${blogger?.name || "Blogger"} × ${clientName(record.client_id)}`;
}

function taskDescriptionFromModule(type: ModuleType, record: any): string | null {
  if (type === "feedback") {
    const communication = record.communication_id
      ? (db
          .prepare("SELECT client_message_at,response_at,channel FROM communications WHERE id=?")
          .get(record.communication_id) as any)
      : null;
    return [
      record.title ? `Feedback: ${record.title}` : "",
      record.content,
      record.action_taken ? `Action taken: ${record.action_taken}` : "",
      communication
        ? `Source: communication #${record.communication_id} (${communication.channel || "whatsapp"})`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (type === "communication") return record.notes || null;
  if (type === "blogger_assignment") return record.notes || null;
  if (type === "meeting") return record.discussion_notes || null;
  return record.caption || null;
}

function findMatchingUnlinkedTask(type: ModuleType, record: any): any {
  if (type !== "post" && type !== "meeting") return null;
  return db
    .prepare(
      `SELECT * FROM tasks
       WHERE client_id=? AND title=? AND category=?
         AND id NOT IN (SELECT task_id FROM ${MODULE_TABLE[type]} WHERE task_id IS NOT NULL)
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(record.client_id, record.title, MODULE_CATEGORY[type]);
}

function findMatchingUnlinkedModule(type: ModuleType, task: any): any {
  if (type !== "post" && type !== "meeting") return null;
  return db
    .prepare(
      `SELECT * FROM ${MODULE_TABLE[type]}
       WHERE client_id=? AND title=? AND task_id IS NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(task.client_id, task.title);
}

function rememberModuleContext(type: ModuleType, taskId: number, record: any) {
  if (!record) return;
  if (type === "blogger_assignment" && record.blogger_id) {
    db.prepare(
      "UPDATE tasks SET linked_blogger_id=COALESCE(linked_blogger_id,?) WHERE id=?"
    ).run(record.blogger_id, taskId);
  }
  if (type === "meeting" && record.meeting_at) {
    db.prepare("UPDATE tasks SET activity_at=COALESCE(activity_at,?) WHERE id=?").run(
      record.meeting_at,
      taskId
    );
  }
}

export type LinkedModuleRow = {
  task_id: number;
  type: ModuleType;
  record_id: number;
  title: string;
  status: string;
};

export function getLinkedModules(taskIds: number[]): LinkedModuleRow[] {
  if (!taskIds.length) return [];
  const placeholders = taskIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT task_id,'post' type,id record_id,title,status FROM posts WHERE task_id IN (${placeholders})
       UNION
       SELECT f.task_id,'feedback',f.id,
              COALESCE(NULLIF(f.title,''),substr(f.content,1,100)),f.status
       FROM feedback f WHERE f.task_id IN (${placeholders})
       UNION
       SELECT ft.task_id,'feedback',f.id,
              COALESCE(NULLIF(f.title,''),substr(f.content,1,100)),f.status
       FROM feedback_tasks ft JOIN feedback f ON f.id=ft.feedback_id
       WHERE ft.task_id IN (${placeholders})
       UNION
       SELECT task_id,'communication',id,'Communication · ' || executive_name,status FROM communications WHERE task_id IN (${placeholders})
       UNION
       SELECT task_id,'blogger_assignment',id,'Blogger assignment #' || id,assignment_status FROM blogger_assignments WHERE task_id IN (${placeholders})
       UNION
       SELECT task_id,'meeting',id,title,status FROM meetings WHERE task_id IN (${placeholders})`
    )
    .all(
      ...taskIds,
      ...taskIds,
      ...taskIds,
      ...taskIds,
      ...taskIds,
      ...taskIds
    ) as LinkedModuleRow[];
}

export function getUnlinkedModuleRecords(): Array<{
  type: ModuleType;
  id: number;
  label: string;
}> {
  const rows = db
    .prepare(
      `SELECT 'post' type,p.id,p.title,c.name client_name FROM posts p LEFT JOIN clients c ON c.id=p.client_id WHERE p.task_id IS NULL
       UNION ALL
       SELECT 'feedback',f.id,COALESCE(NULLIF(f.title,''),substr(f.content,1,90)),c.name FROM feedback f LEFT JOIN clients c ON c.id=f.client_id WHERE f.task_id IS NULL AND f.action_required=1
       UNION ALL
       SELECT 'communication',cm.id,'Communication · ' || cm.executive_name,c.name FROM communications cm LEFT JOIN clients c ON c.id=cm.client_id WHERE cm.task_id IS NULL
       UNION ALL
       SELECT 'blogger_assignment',ba.id,'Blogger × ' || COALESCE(c.name,'Client'),c.name FROM blogger_assignments ba LEFT JOIN clients c ON c.id=ba.client_id WHERE ba.task_id IS NULL
       UNION ALL
       SELECT 'meeting',m.id,m.title,c.name FROM meetings m LEFT JOIN clients c ON c.id=m.client_id WHERE m.task_id IS NULL`
    )
    .all() as any[];
  return rows.map((row) => ({
    type: row.type as ModuleType,
    id: Number(row.id),
    label: `${MODULE_LABELS[row.type as ModuleType]} · ${row.client_name || "Internal"} · ${row.title}`,
  }));
}

export function getLinkableTasks(type: ModuleType) {
  return db
    .prepare(
      `SELECT t.id,t.title,t.category,t.status,c.name client_name
       FROM tasks t LEFT JOIN clients c ON c.id=t.client_id
       WHERE t.id NOT IN (SELECT task_id FROM ${MODULE_TABLE[type]} WHERE task_id IS NOT NULL)
       ORDER BY t.created_at DESC LIMIT 100`
    )
    .all() as Array<{
    id: number;
    title: string;
    category: string;
    status: string;
    client_name: string | null;
  }>;
}

export function logActivity(input: {
  clientId?: number | null;
  taskId?: number | null;
  entityType: string;
  entityId?: number | null;
  action: string;
  summary: string;
  userId?: number | null;
}) {
  db.prepare(
    `INSERT INTO activity_log (client_id,task_id,entity_type,entity_id,action,summary,user_id)
     VALUES (?,?,?,?,?,?,?)`
  ).run(
    input.clientId || null,
    input.taskId || null,
    input.entityType,
    input.entityId || null,
    input.action,
    input.summary,
    input.userId || null
  );
}

export function ensureTaskForModule(
  type: ModuleType,
  recordId: number,
  userId?: number | null
): number | null {
  const record = recordFor(type, recordId);
  if (!record) return null;
  if (record.task_id) {
    const existing = db.prepare("SELECT id FROM tasks WHERE id=?").get(record.task_id) as any;
    if (existing) return Number(record.task_id);
  }

  // Feedback with no action required deliberately has no task: the feedback
  // lifecycle owns it. A task is created only when someone asks for one.
  if (type === "feedback" && Number(record.action_required) === 0) return null;

  const actor = userId || firstOwnerId();
  if (!actor) return null;

  const matching = findMatchingUnlinkedTask(type, record);
  if (matching) {
    db.prepare(`UPDATE ${MODULE_TABLE[type]} SET task_id=? WHERE id=?`).run(matching.id, recordId);
    rememberModuleContext(type, Number(matching.id), record);
    logActivity({
      clientId: record.client_id,
      taskId: matching.id,
      entityType: type,
      entityId: recordId,
      action: "linked",
      summary: `${MODULE_LABELS[type]} linked to existing task "${matching.title}".`,
      userId: actor,
    });
    return Number(matching.id);
  }

  const category = MODULE_CATEGORY[type];
  const title = taskTitleFromModule(type, record);
  const status = taskStatusFromModule(type, record);
  const result = db
    .prepare(
      `INSERT INTO tasks
        (title,description,client_id,assigned_to,assigned_by,status,category,due_date,origin_module,linked_blogger_id,activity_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      title,
      taskDescriptionFromModule(type, record),
      record.client_id,
      actor,
      actor,
      status,
      category,
      moduleDueDate(type, record),
      type,
      type === "blogger_assignment" ? record.blogger_id || null : null,
      type === "meeting" ? record.meeting_at : null
    );

  const taskId = Number(result.lastInsertRowid);
  db.prepare(`UPDATE ${MODULE_TABLE[type]} SET task_id=? WHERE id=?`).run(taskId, recordId);
  db.prepare("INSERT INTO task_updates (task_id,user_id,note) VALUES (?,?,?)").run(
    taskId,
    actor,
    `Task created automatically from ${MODULE_LABELS[type]} #${recordId}.`
  );
  logActivity({
    clientId: record.client_id,
    taskId,
    entityType: type,
    entityId: recordId,
    action: "task_created",
    summary: `Task "${title}" created automatically from ${MODULE_LABELS[type]}.`,
    userId: actor,
  });
  return taskId;
}

export function createLinkedModuleForTask(
  taskId: number,
  options: { userId?: number | null; bloggerId?: number | null; activityAt?: string | null } = {}
): { type: ModuleType; id: number } | null {
  const task = db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
  if (!task) return null;
  const type = CATEGORY_MODULE[task.category];
  if (!type) return null;
  if (!task.client_id) return null;

  const existing = db
    .prepare(`SELECT id FROM ${MODULE_TABLE[type]} WHERE task_id=? LIMIT 1`)
    .get(taskId) as any;
  if (existing) return { type, id: Number(existing.id) };

  const matching = findMatchingUnlinkedModule(type, task);
  if (matching) {
    db.prepare(`UPDATE ${MODULE_TABLE[type]} SET task_id=? WHERE id=?`).run(taskId, matching.id);
    rememberModuleContext(type, taskId, matching);
    logActivity({
      clientId: task.client_id,
      taskId,
      entityType: type,
      entityId: matching.id,
      action: "linked",
      summary: `Task "${task.title}" linked to existing ${MODULE_LABELS[type]}.`,
      userId: options.userId || task.assigned_by,
    });
    return { type, id: Number(matching.id) };
  }

  const status = moduleStatusFromTask(type, task.status);
  let result: any = null;

  if (type === "post") {
    result = db
      .prepare(
        `INSERT INTO posts (client_id,task_id,title,platform,scheduled_at,status,caption)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(
        task.client_id,
        taskId,
        task.title,
        "Instagram",
        task.due_date ? `${datePart(task.due_date)}T10:00` : null,
        status.status,
        task.description || null
      );
  } else if (type === "feedback") {
    result = db
      .prepare(
        `INSERT INTO feedback
          (client_id,task_id,content,action_status,action_taken,title,status,action_required,
           assigned_to,due_date)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        task.client_id,
        taskId,
        task.description || task.title,
        legacyActionStatusForFeedback(feedbackStatusForTask(task.status)),
        null,
        task.title,
        feedbackStatusForTask(task.status),
        1,
        task.assigned_to || null,
        task.due_date || null
      );
  } else if (type === "communication") {
    const assignee = db.prepare("SELECT name FROM users WHERE id=?").get(task.assigned_to) as any;
    const client = db.prepare("SELECT whatsapp_group FROM clients WHERE id=?").get(task.client_id) as any;
    result = db
      .prepare(
        `INSERT INTO communications
          (client_id,task_id,executive_name,whatsapp_group,status,notes,communication_type,channel,recorded_by)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        task.client_id,
        taskId,
        assignee?.name || "Team",
        client?.whatsapp_group || null,
        status.status,
        task.description || null,
        "general",
        "whatsapp",
        options.userId || task.assigned_by
      );
  } else if (type === "blogger_assignment") {
    const bloggerId = options.bloggerId || task.linked_blogger_id;
    if (!bloggerId) return null;
    result = db
      .prepare(
        `INSERT INTO blogger_assignments (blogger_id,client_id,task_id,scheduled_date,assignment_status,completion_status,notes)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(
        bloggerId,
        task.client_id,
        taskId,
        task.due_date || null,
        status.assignment_status,
        status.completion_status,
        task.description || null
      );
  } else if (type === "meeting") {
    const meetingAt =
      options.activityAt ||
      task.activity_at ||
      (task.due_date ? `${datePart(task.due_date)}T10:00` : new Date().toISOString().slice(0, 16));
    result = db
      .prepare(
        `INSERT INTO meetings (client_id,task_id,title,meeting_at,status,discussion_notes)
         VALUES (?,?,?,?,?,?)`
      )
      .run(
        task.client_id,
        taskId,
        task.title,
        meetingAt,
        status.status,
        task.description || null
      );
  }

  if (!result) return null;
  const recordId = Number(result.lastInsertRowid);
  logActivity({
    clientId: task.client_id,
    taskId,
    entityType: type,
    entityId: recordId,
    action: "module_created",
    summary: `${MODULE_LABELS[type]} created automatically from task "${task.title}".`,
    userId: options.userId || task.assigned_by,
  });
  return { type, id: recordId };
}

export function syncTaskToLinkedModules(
  taskId: number,
  skip?: { type: ModuleType; id: number }
) {
  const task = db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
  if (!task) return;
  const assignee = db.prepare("SELECT name FROM users WHERE id=?").get(task.assigned_to) as any;

  for (const type of Object.keys(MODULE_TABLE) as ModuleType[]) {
    const records = db
      .prepare(`SELECT * FROM ${MODULE_TABLE[type]} WHERE task_id=?`)
      .all(taskId) as any[];
    for (const record of records) {
      if (skip && skip.type === type && skip.id === Number(record.id)) continue;
      const status = moduleStatusFromTask(type, task.status);
      if (type === "post") {
        db.prepare(
          `UPDATE posts SET title=?, client_id=COALESCE(?,client_id), status=?,
           scheduled_at=CASE
             WHEN ? IS NOT NULL AND substr(COALESCE(scheduled_at,''),1,10) <> ? THEN ? || 'T10:00'
             ELSE scheduled_at END
           WHERE id=?`
        ).run(
          task.title,
          task.client_id,
          status.status,
          task.due_date,
          task.due_date,
          task.due_date,
          record.id
        );
      } else if (type === "feedback") {
        const feedbackStatus = feedbackStatusForTask(task.status);
        db.prepare(
          `UPDATE feedback SET client_id=COALESCE(?,client_id), status=?, action_status=?,
             resolved_at=CASE WHEN ? IN ('resolved','closed') THEN COALESCE(resolved_at,CURRENT_TIMESTAMP) ELSE NULL END
           WHERE id=?`
        ).run(
          task.client_id,
          feedbackStatus,
          legacyActionStatusForFeedback(feedbackStatus),
          feedbackStatus,
          record.id
        );
      } else if (type === "communication") {
        db.prepare(
          `UPDATE communications SET client_id=COALESCE(?,client_id), executive_name=?, status=? WHERE id=?`
        ).run(task.client_id, assignee?.name || record.executive_name, status.status, record.id);
      } else if (type === "blogger_assignment") {
        db.prepare(
          `UPDATE blogger_assignments SET client_id=COALESCE(?,client_id), scheduled_date=COALESCE(?,scheduled_date),
           assignment_status=?, completion_status=? WHERE id=?`
        ).run(
          task.client_id,
          task.due_date,
          status.assignment_status,
          status.completion_status,
          record.id
        );
      } else if (type === "meeting") {
        db.prepare(
          `UPDATE meetings SET title=?, client_id=COALESCE(?,client_id), status=?,
           meeting_at=COALESCE(?,meeting_at) WHERE id=?`
        ).run(task.title, task.client_id, status.status, task.activity_at, record.id);
      }
    }
  }
}

export function syncModuleToTask(
  type: ModuleType,
  recordId: number,
  userId?: number | null,
  options: { statusChanged?: boolean } = {}
): number | null {
  const record = recordFor(type, recordId);
  if (!record) return null;
  // Feedback tasks are explicit: never spawn a task just because feedback exists
  // or its lifecycle moved.
  if (type === "feedback" && !record.task_id) return null;
  const taskId = record.task_id || ensureTaskForModule(type, recordId, userId);
  if (!taskId) return null;

  const task = db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
  if (!task) return null;

  const mappedStatus = taskStatusFromModule(type, record);
  const status = options.statusChanged === false ? task.status : mappedStatus;
  const title = type === "post" || type === "meeting" ? record.title : task.title;
  const due = moduleDueDate(type, record);

  db.prepare(
    `UPDATE tasks SET title=?, client_id=?, status=?,
       due_date=COALESCE(?,due_date),
       linked_blogger_id=CASE WHEN ? IS NOT NULL THEN ? ELSE linked_blogger_id END,
       activity_at=CASE WHEN ? IS NOT NULL THEN ? ELSE activity_at END,
       updated_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).run(
    title,
    record.client_id,
    status,
    due,
    type === "blogger_assignment" ? record.blogger_id || null : null,
    type === "blogger_assignment" ? record.blogger_id || null : null,
    type === "meeting" ? record.meeting_at || null : null,
    type === "meeting" ? record.meeting_at || null : null,
    taskId
  );

  if (status !== task.status) {
    db.prepare("INSERT INTO task_updates (task_id,user_id,note) VALUES (?,?,?)").run(
      taskId,
      userId || firstOwnerId(),
      `Status synced from ${MODULE_LABELS[type]}: ${task.status.replace("_", " ")} → ${status.replace("_", " ")}.`
    );
  }
  syncTaskToLinkedModules(taskId, { type, id: recordId });
  return taskId;
}

export function linkTaskToModule(
  taskId: number,
  type: ModuleType,
  recordId: number,
  userId?: number | null
) {
  db.prepare(`UPDATE ${MODULE_TABLE[type]} SET task_id=? WHERE id=?`).run(taskId, recordId);
  const linkedRecord = recordFor(type, recordId);
  rememberModuleContext(type, taskId, linkedRecord);
  syncTaskToLinkedModules(taskId);
  const task = db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
  const record = linkedRecord;
  logActivity({
    clientId: record?.client_id || task?.client_id,
    taskId,
    entityType: type,
    entityId: recordId,
    action: "linked",
    summary: `${MODULE_LABELS[type]} linked to task "${task?.title || taskId}".`,
    userId,
  });
}

export function linkModuleToTask(
  type: ModuleType,
  recordId: number,
  taskId: number,
  userId?: number | null
) {
  db.prepare(`UPDATE ${MODULE_TABLE[type]} SET task_id=? WHERE id=?`).run(taskId, recordId);
  // The new module record carries the latest state, so let it drive the task
  // before the task synchronises every other linked module.
  syncModuleToTask(type, recordId, userId);
  const task = db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
  const record = recordFor(type, recordId);
  logActivity({
    clientId: record?.client_id || task?.client_id,
    taskId,
    entityType: type,
    entityId: recordId,
    action: "linked",
    summary: `${MODULE_LABELS[type]} linked to task "${task?.title || taskId}".`,
    userId,
  });
}

export function unlinkTaskModules(taskId: number) {
  for (const type of Object.keys(MODULE_TABLE) as ModuleType[]) {
    db.prepare(`UPDATE ${MODULE_TABLE[type]} SET task_id=NULL WHERE task_id=?`).run(taskId);
  }
}

export function ensureUnifiedLinks() {
  const claim = db
    .prepare("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('uda_backfilled_v1','done')")
    .run();
  if (claim.changes === 0) return;

  const ownerId = firstOwnerId();
  if (!ownerId) {
    db.prepare("DELETE FROM app_settings WHERE key='uda_backfilled_v1'").run();
    return;
  }

  try {
    const backfill = db.transaction(() => {
      for (const type of Object.keys(MODULE_TABLE) as ModuleType[]) {
        const rows = db
          .prepare(`SELECT id FROM ${MODULE_TABLE[type]} WHERE task_id IS NULL ORDER BY id`)
          .all() as any[];
        for (const row of rows) ensureTaskForModule(type, Number(row.id), ownerId);
      }

      const tasks = db
        .prepare(
          `SELECT * FROM tasks
           WHERE category IN ('social_media','feedback','client_communication','blogger','meeting')
             AND client_id IS NOT NULL
           ORDER BY id`
        )
        .all() as any[];
      for (const task of tasks) {
        const type = CATEGORY_MODULE[task.category];
        if (!type) continue;
        const linked = db
          .prepare(`SELECT id FROM ${MODULE_TABLE[type]} WHERE task_id=? LIMIT 1`)
          .get(task.id) as any;
        if (!linked) createLinkedModuleForTask(Number(task.id), { userId: ownerId });
      }
    });
    backfill();
  } catch (error) {
    db.prepare("DELETE FROM app_settings WHERE key='uda_backfilled_v1'").run();
    console.error("Unified activity backfill failed", error);
  }
}
