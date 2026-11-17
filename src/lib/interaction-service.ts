import db from "./db";
import { ensureTaskForModule, logActivity } from "./activity-service";
import {
  COMMUNICATION_TYPES,
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_SENTIMENTS,
  FEEDBACK_STATUSES,
  isCommunicationChannel,
  isCommunicationType,
  isFeedbackCategory,
  isFeedbackPriority,
  isFeedbackSentiment,
  isFeedbackStatus,
  legacyActionStatusForFeedback,
  taskStatusForFeedback,
  type CommunicationChannel,
  type CommunicationType,
  type FeedbackCategory,
  type FeedbackPriority,
  type FeedbackSentiment,
  type FeedbackStatus,
} from "./constants";

/**
 * Interaction architecture
 * ------------------------
 * `communications` owns the interaction: when it happened, through which channel,
 * who logged it, who took part, and what was said.
 * `feedback` owns the feedback itself: what it is about, its sentiment, priority,
 * lifecycle and resolution.
 * `feedback_tasks` links a feedback item to any number of execution tasks.
 *
 * A feedback row always keeps `communication_id` when it originated from a
 * conversation, and `feedback_tasks` is the only place task links are written.
 * `feedback.task_id` remains the primary task for the existing unified-task
 * sync and is always mirrored into `feedback_tasks`.
 */

export class InteractionError extends Error {}

export type FeedbackDraft = {
  title: string;
  description?: string | null;
  category?: string;
  sentiment?: string;
  priority?: string;
  actionRequired?: boolean;
  assignedTo?: number | null;
  dueDate?: string | null;
  createTask?: boolean;
  postId?: number | null;
};

export type CommunicationDraft = {
  clientId: number;
  executiveName: string;
  channel: string;
  whatsappGroup?: string | null;
  clientMessageAt?: string | null;
  responseAt?: string | null;
  status?: string;
  notes?: string | null;
  communicationType: string;
  taskId?: number | null;
  feedback: FeedbackDraft[];
};

export type CreatedInteraction = {
  communicationId: number;
  feedbackIds: number[];
  taskId: number | null;
};

function requireClient(clientId: number) {
  const client = db.prepare("SELECT id,name FROM clients WHERE id=?").get(clientId) as any;
  if (!client) throw new InteractionError("Choose a valid client.");
  return client;
}

function requireUser(userId: number) {
  const user = db.prepare("SELECT id,name FROM users WHERE id=? AND is_active=1").get(userId) as any;
  if (!user) throw new InteractionError("This user is not active.");
  return user;
}

function cleanFeedbackDraft(draft: FeedbackDraft, clientName: string) {
  const title = String(draft.title || "").trim();
  if (!title) {
    throw new InteractionError(`Every feedback item needs a subject for ${clientName}.`);
  }
  const description = String(draft.description || "").trim();
  if (!description) {
    throw new InteractionError(`Feedback "${title}" needs a description of what the client said.`);
  }
  const category = isFeedbackCategory(String(draft.category)) ? String(draft.category) : "other";
  const sentiment = isFeedbackSentiment(String(draft.sentiment)) ? String(draft.sentiment) : "neutral";
  const priority = isFeedbackPriority(String(draft.priority)) ? String(draft.priority) : "medium";
  return {
    title: title.slice(0, 160),
    description,
    category: category as FeedbackCategory,
    sentiment: sentiment as FeedbackSentiment,
    priority: priority as FeedbackPriority,
    actionRequired: draft.actionRequired !== false,
    assignedTo: draft.assignedTo ? Number(draft.assignedTo) : null,
    dueDate: draft.dueDate ? String(draft.dueDate) : null,
    createTask: draft.createTask !== false,
    postId: draft.postId ? Number(draft.postId) : null,
  };
}

/** Prevent an identical feedback subject being logged twice on one conversation. */
function assertUniqueFeedback(communicationId: number, title: string, excludeId?: number) {
  const existing = db
    .prepare(
      `SELECT id FROM feedback
       WHERE communication_id=? AND lower(title)=lower(?)
         AND (? IS NULL OR id!=?)`
    )
    .get(communicationId, title, excludeId || null, excludeId || null) as any;
  if (existing) {
    throw new InteractionError(`Feedback "${title}" is already recorded on this communication.`);
  }
}

function insertFeedbackTaskLink(feedbackId: number, taskId: number) {
  db.prepare(
    "INSERT OR IGNORE INTO feedback_tasks (feedback_id, task_id) VALUES (?,?)"
  ).run(feedbackId, taskId);
}

function createTaskForFeedback(options: {
  feedbackId: number;
  feedbackTitle: string;
  feedbackDescription: string;
  clientId: number;
  clientName: string;
  communicationId: number;
  communicationAt: string | null;
  channel: string;
  assignedTo: number | null;
  dueDate: string | null;
  priority: string;
  actorId: number;
  extraContext?: string | null;
}) {
  const assignee = options.assignedTo
    ? (db.prepare("SELECT id FROM users WHERE id=? AND is_active=1").get(options.assignedTo) as any)
    : null;
  const actor = requireUser(options.actorId);
  const owner = assignee?.id || actor.id;

  const description = [
    `Client feedback from ${options.clientName}.`,
    `Feedback: ${options.feedbackDescription}`,
    options.extraContext || "",
    `Priority: ${options.priority}.`,
    `Source communication: #${options.communicationId}${
      options.communicationAt ? ` on ${options.communicationAt}` : ""
    } (${options.channel}).`,
    `Open feedback: /feedback?feedback=${options.feedbackId}`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = db
    .prepare(
      `INSERT INTO tasks
        (title,description,client_id,assigned_to,assigned_by,status,category,due_date,origin_module)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      `Client feedback – ${options.clientName}: ${options.feedbackTitle.slice(0, 80)}`,
      description,
      options.clientId,
      owner,
      actor.id,
      taskStatusForFeedback("new"),
      "feedback",
      options.dueDate,
      "feedback"
    );

  const taskId = Number(result.lastInsertRowid);
  db.prepare("UPDATE feedback SET task_id=COALESCE(task_id,?) WHERE id=?").run(
    taskId,
    options.feedbackId
  );
  insertFeedbackTaskLink(options.feedbackId, taskId);
  db.prepare("INSERT INTO task_updates (task_id,user_id,note) VALUES (?,?,?)").run(
    taskId,
    actor.id,
    `Task created from client feedback "${options.feedbackTitle}".`
  );
  logActivity({
    clientId: options.clientId,
    taskId,
    entityType: "feedback",
    entityId: options.feedbackId,
    action: "task_created",
    summary: `Task "${options.feedbackTitle}" created from feedback.`,
    userId: actor.id,
  });
  return taskId;
}

/**
 * Create a communication and every feedback item it contains in one transaction.
 * The employee fills the form once; the communication, feedback records and any
 * follow-up tasks are created together or not at all.
 */
export function createCommunication(
  draft: CommunicationDraft,
  actorId: number
): CreatedInteraction {
  const type: CommunicationType = isCommunicationType(String(draft.communicationType))
    ? (draft.communicationType as CommunicationType)
    : "general";
  if (!isCommunicationType(String(draft.communicationType))) {
    throw new InteractionError("Select whether this communication contains feedback.");
  }
  const channel: CommunicationChannel = isCommunicationChannel(String(draft.channel))
    ? (draft.channel as CommunicationChannel)
    : "whatsapp";
  const client = requireClient(Number(draft.clientId));
  const actor = requireUser(actorId);
  const executiveName = String(draft.executiveName || "").trim();
  if (!executiveName) throw new InteractionError("Add who handled the conversation.");

  const feedbackDrafts = (draft.feedback || []).filter(
    (item) => String(item.title || "").trim() || String(item.description || "").trim()
  );
  if (type === "feedback" && !feedbackDrafts.length) {
    throw new InteractionError(
      "Communication containing feedback needs at least one feedback item."
    );
  }
  const cleanFeedback =
    type === "feedback" ? feedbackDrafts.map((item) => cleanFeedbackDraft(item, client.name)) : [];

  const run = db.transaction((): CreatedInteraction => {
    const result = db
      .prepare(
        `INSERT INTO communications
          (client_id,executive_name,whatsapp_group,client_message_at,response_at,status,notes,
           communication_type,channel,recorded_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        client.id,
        executiveName,
        String(draft.whatsappGroup || "") || null,
        String(draft.clientMessageAt || "") || null,
        String(draft.responseAt || "") || null,
        String(draft.status || "responded"),
        String(draft.notes || "") || null,
        type,
        channel,
        actor.id
      );
    const communicationId = Number(result.lastInsertRowid);

    // The existing unified-task model gives every module record an owner task.
    // Reuse an explicitly chosen task, otherwise let the shared service create one.
    const taskId = draft.taskId
      ? (db
          .prepare("UPDATE communications SET task_id=? WHERE id=?")
          .run(Number(draft.taskId), communicationId),
        Number(draft.taskId))
      : ensureTaskForModule("communication", communicationId, actor.id);

    logActivity({
      clientId: client.id,
      taskId,
      entityType: "communication",
      entityId: communicationId,
      action: "created",
      summary:
        type === "feedback"
          ? `Communication logged with ${cleanFeedback.length} feedback item${
              cleanFeedback.length === 1 ? "" : "s"
            }.`
          : "Client communication logged.",
      userId: actor.id,
    });

    const feedbackIds: number[] = [];
    const seen = new Set<string>();
    cleanFeedback.forEach((item) => {
      const key = item.title.toLowerCase();
      if (seen.has(key)) {
        throw new InteractionError(
          `Feedback "${item.title}" appears twice in this communication.`
        );
      }
      seen.add(key);

      const feedback = db
        .prepare(
          `INSERT INTO feedback
            (client_id,post_id,task_id,content,action_status,action_taken,communication_id,title,
             category,sentiment,priority,action_required,assigned_to,due_date,status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          client.id,
          item.postId,
          null,
          item.description,
          legacyActionStatusForFeedback("new"),
          null,
          communicationId,
          item.title,
          item.category,
          item.sentiment,
          item.priority,
          item.actionRequired ? 1 : 0,
          item.assignedTo,
          item.dueDate,
          "new" satisfies FeedbackStatus
        );
      const feedbackId = Number(feedback.lastInsertRowid);
      feedbackIds.push(feedbackId);

      if (item.actionRequired && item.createTask) {
        createTaskForFeedback({
          feedbackId,
          feedbackTitle: item.title,
          feedbackDescription: item.description,
          clientId: client.id,
          clientName: client.name,
          communicationId,
          communicationAt: String(draft.clientMessageAt || draft.responseAt || "") || null,
          channel,
          assignedTo: item.assignedTo,
          dueDate: item.dueDate,
          priority: item.priority,
          actorId: actor.id,
        });
      }

      logActivity({
        clientId: client.id,
        taskId: (db.prepare("SELECT task_id FROM feedback WHERE id=?").get(feedbackId) as any)
          ?.task_id,
        entityType: "feedback",
        entityId: feedbackId,
        action: "created",
        summary: `Feedback recorded from communication #${communicationId}: ${item.title}`,
        userId: actor.id,
      });
    });

    return { communicationId, feedbackIds, taskId };
  });

  return run();
}

/**
 * Add another feedback item to an existing communication. Used when a general
 * communication is reclassified, or when a conversation later turns out to
 * contain more feedback.
 */
export function addFeedbackToCommunication(
  communicationId: number,
  draft: FeedbackDraft,
  actorId: number
) {
  const communication = db
    .prepare("SELECT * FROM communications WHERE id=?")
    .get(communicationId) as any;
  if (!communication) throw new InteractionError("Communication not found.");
  const client = requireClient(Number(communication.client_id));
  const actor = requireUser(actorId);
  const item = cleanFeedbackDraft(draft, client.name);

  const run = db.transaction(() => {
    assertUniqueFeedback(communicationId, item.title);

    const result = db
      .prepare(
        `INSERT INTO feedback
          (client_id,post_id,task_id,content,action_status,action_taken,communication_id,title,
           category,sentiment,priority,action_required,assigned_to,due_date,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        client.id,
        item.postId,
        null,
        item.description,
        legacyActionStatusForFeedback("new"),
        null,
        communicationId,
        item.title,
        item.category,
        item.sentiment,
        item.priority,
        item.actionRequired ? 1 : 0,
        item.assignedTo,
        item.dueDate,
        "new"
      );
    const feedbackId = Number(result.lastInsertRowid);

    db.prepare("UPDATE communications SET communication_type='feedback' WHERE id=?").run(
      communicationId
    );

    let taskId: number | null = communication.task_id || null;
    if (item.actionRequired && item.createTask) {
      taskId = createTaskForFeedback({
        feedbackId,
        feedbackTitle: item.title,
        feedbackDescription: item.description,
        clientId: client.id,
        clientName: client.name,
        communicationId,
        communicationAt: communication.client_message_at || communication.response_at || null,
        channel: communication.channel,
        assignedTo: item.assignedTo,
        dueDate: item.dueDate,
        priority: item.priority,
        actorId: actor.id,
      });
    }

    logActivity({
      clientId: client.id,
      taskId,
      entityType: "feedback",
      entityId: feedbackId,
      action: "created",
      summary: `Feedback added to communication #${communicationId}: ${item.title}`,
      userId: actor.id,
    });
    return feedbackId;
  });

  return run();
}

/**
 * Reclassify an existing communication.
 * - general → feedback: allowed, the user can then add feedback items.
 * - feedback → general: only when no feedback exists, so history is never orphaned.
 */
export function reclassifyCommunication(
  communicationId: number,
  nextType: string,
  actorId: number
) {
  if (!isCommunicationType(nextType)) {
    throw new InteractionError("Select a valid communication type.");
  }
  const communication = db
    .prepare("SELECT * FROM communications WHERE id=?")
    .get(communicationId) as any;
  if (!communication) throw new InteractionError("Communication not found.");

  if (nextType === communication.communication_type) return;

  if (nextType === "general") {
    const linked = db
      .prepare("SELECT COUNT(*) c FROM feedback WHERE communication_id=?")
      .get(communicationId) as any;
    if (linked.c > 0) {
      throw new InteractionError(
        "This communication already has feedback. Close or remove the feedback before changing it to General."
      );
    }
  }

  db.prepare("UPDATE communications SET communication_type=? WHERE id=?").run(
    nextType,
    communicationId
  );
  logActivity({
    clientId: communication.client_id,
    taskId: communication.task_id,
    entityType: "communication",
    entityId: communicationId,
    action: "reclassified",
    summary: `Communication reclassified to ${
      COMMUNICATION_TYPES.find((item) => item.value === nextType)?.label || nextType
    }.`,
    userId: actorId,
  });
}

/**
 * Move a feedback item through its lifecycle. Only the owner, the assignee or the
 * person who recorded the conversation may change it. The originating
 * communication is never modified.
 */
export function updateFeedbackLifecycle(
  feedbackId: number,
  input: {
    status?: string;
    title?: string;
    description?: string;
    category?: string;
    sentiment?: string;
    actionTaken?: string | null;
    assignedTo?: number | null;
    dueDate?: string | null;
    priority?: string;
    note?: string | null;
  },
  actor: { id: number; role: "owner" | "employee" }
) {
  const feedback = db.prepare("SELECT * FROM feedback WHERE id=?").get(feedbackId) as any;
  if (!feedback) throw new InteractionError("Feedback not found.");

  const communication = feedback.communication_id
    ? (db.prepare("SELECT * FROM communications WHERE id=?").get(feedback.communication_id) as any)
    : null;

  const allowed =
    actor.role === "owner" ||
    feedback.assigned_to === actor.id ||
    feedback.assigned_to === null ||
    communication?.recorded_by === actor.id;
  if (!allowed) {
    throw new InteractionError(
      "Only the owner or the assigned employee can change this feedback."
    );
  }

  const nextStatus = isFeedbackStatus(String(input.status)) ? String(input.status) : feedback.status;
  const statusChanged = nextStatus !== feedback.status;
  const nextTitle =
    input.title !== undefined
      ? String(input.title).trim()
      : String(feedback.title || feedback.content || "").slice(0, 160);
  if (!nextTitle) throw new InteractionError("Feedback needs a subject.");
  const nextDescription =
    input.description !== undefined ? String(input.description).trim() : String(feedback.content || "");
  if (!nextDescription) throw new InteractionError("Feedback needs a description.");
  if (
    feedback.communication_id &&
    nextTitle.toLowerCase() !== String(feedback.title || "").toLowerCase()
  ) {
    assertUniqueFeedback(Number(feedback.communication_id), nextTitle, feedbackId);
  }
  const nextCategory = isFeedbackCategory(String(input.category))
    ? String(input.category)
    : feedback.category;
  const nextSentiment = isFeedbackSentiment(String(input.sentiment))
    ? String(input.sentiment)
    : feedback.sentiment;
  const nextAssigned =
    input.assignedTo !== undefined
      ? input.assignedTo || null
      : (feedback.assigned_to as number | null);
  const nextDue = input.dueDate !== undefined ? input.dueDate || null : feedback.due_date;
  const nextPriority = isFeedbackPriority(String(input.priority))
    ? String(input.priority)
    : feedback.priority;

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE feedback
         SET status=?, action_status=?, action_taken=?, assigned_to=?, due_date=?, priority=?,
             title=?, content=?, category=?, sentiment=?,
             resolved_at=CASE WHEN ? IN ('resolved','closed') THEN COALESCE(resolved_at,CURRENT_TIMESTAMP) ELSE NULL END
       WHERE id=?`
    ).run(
      nextStatus,
      legacyActionStatusForFeedback(nextStatus),
      input.actionTaken !== undefined ? String(input.actionTaken || "") || null : feedback.action_taken,
      nextAssigned,
      nextDue,
      nextPriority,
      nextTitle,
      nextDescription,
      nextCategory,
      nextSentiment,
      nextStatus,
      feedbackId
    );

    // Keep the execution task in step without touching the communication.
    const taskId = feedback.task_id as number | null;
    if (taskId) {
      const task = db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
      const taskStatus = taskStatusForFeedback(nextStatus);
      if (task && String(feedback.title || "") !== nextTitle) {
        const client = db.prepare("SELECT name FROM clients WHERE id=?").get(feedback.client_id) as any;
        db.prepare("UPDATE tasks SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
          `Client feedback – ${client?.name || "Client"}: ${nextTitle.slice(0, 80)}`,
          taskId
        );
      }
      if (task && task.status !== taskStatus) {
        db.prepare("UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
          taskStatus,
          taskId
        );
        db.prepare("INSERT INTO task_updates (task_id,user_id,note) VALUES (?,?,?)").run(
          taskId,
          actor.id,
          `Feedback status moved to ${nextStatus.replaceAll("_", " ")}.`
        );
      }
      if (nextAssigned && task && task.assigned_to !== nextAssigned) {
        db.prepare("UPDATE tasks SET assigned_to=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
          nextAssigned,
          taskId
        );
      }
      if (nextDue && task && task.due_date !== nextDue) {
        db.prepare("UPDATE tasks SET due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
          nextDue,
          taskId
        );
      }
    }

    logActivity({
      clientId: feedback.client_id,
      taskId,
      entityType: "feedback",
      entityId: feedbackId,
      action: "updated",
      summary: statusChanged
        ? `Feedback moved to ${nextStatus.replaceAll("_", " ")}.`
        : "Feedback details updated.",
      userId: actor.id,
    });
  });

  run();
}

/** Link an additional execution task to a feedback item. */
export function createFeedbackTask(
  feedbackId: number,
  input: { assignedTo: number; dueDate?: string | null; priority?: string },
  actorId: number
) {
  const feedback = db.prepare("SELECT * FROM feedback WHERE id=?").get(feedbackId) as any;
  if (!feedback) throw new InteractionError("Feedback not found.");
  const client = requireClient(Number(feedback.client_id));
  const assignee = db
    .prepare("SELECT id,name FROM users WHERE id=? AND is_active=1")
    .get(Number(input.assignedTo)) as any;
  if (!assignee) throw new InteractionError("Choose an active team member for the task.");

  const communication = feedback.communication_id
    ? (db.prepare("SELECT * FROM communications WHERE id=?").get(feedback.communication_id) as any)
    : null;

  const run = db.transaction(() => {
    const taskId = createTaskForFeedback({
      feedbackId,
      feedbackTitle: feedback.title || String(feedback.content || "").slice(0, 60),
      feedbackDescription: feedback.content,
      clientId: client.id,
      clientName: client.name,
      communicationId: Number(feedback.communication_id || 0),
      communicationAt: communication?.client_message_at || communication?.response_at || null,
      channel: communication?.channel || "whatsapp",
      assignedTo: assignee.id,
      dueDate: input.dueDate || null,
      priority: input.priority || feedback.priority,
      actorId,
    });
    logActivity({
      clientId: client.id,
      taskId,
      entityType: "feedback",
      entityId: feedbackId,
      action: "task_linked",
      summary: `Additional task "${assignee.name}" linked to feedback.`,
      userId: actorId,
    });
    return taskId;
  });

  return run();
}

export function getFeedbackForCommunication(communicationId: number) {
  return db
    .prepare(
      `SELECT f.*, u.name assignee_name,
              (SELECT COUNT(*) FROM feedback_tasks ft WHERE ft.feedback_id=f.id) task_count
       FROM feedback f
       LEFT JOIN users u ON u.id=f.assigned_to
       WHERE f.communication_id=?
       ORDER BY f.created_at ASC, f.id ASC`
    )
    .all(communicationId) as any[];
}

export function getCommunicationForFeedback(communicationId: number | null) {
  if (!communicationId) return null;
  return db
    .prepare(
      `SELECT cm.*, c.name client_name, u.name recorded_by_name, u.job_title recorded_by_title
       FROM communications cm
       JOIN clients c ON c.id=cm.client_id
       LEFT JOIN users u ON u.id=cm.recorded_by
       WHERE cm.id=?`
    )
    .get(communicationId) as any;
}

export function getFeedbackTasks(feedbackId: number) {
  return db
    .prepare(
      `SELECT t.*, u.name assignee_name, c.name client_name
       FROM feedback_tasks ft
       JOIN tasks t ON t.id=ft.task_id
       LEFT JOIN users u ON u.id=t.assigned_to
       LEFT JOIN clients c ON c.id=t.client_id
       WHERE ft.feedback_id=?
       ORDER BY ft.created_at ASC, ft.id ASC`
    )
    .all(feedbackId) as any[];
}

/** Feedback for a task, whichever way it was linked. */
export function getFeedbackForTask(taskId: number) {
  return db
    .prepare(
      `SELECT DISTINCT f.*, cm.id communication_id, cm.channel, cm.client_message_at,
              cm.response_at, cm.recorded_by, cm.executive_name, u.name assignee_name
       FROM feedback f
       LEFT JOIN communications cm ON cm.id=f.communication_id
       LEFT JOIN users u ON u.id=f.assigned_to
       WHERE f.task_id=? OR f.id IN (SELECT feedback_id FROM feedback_tasks WHERE task_id=?)
       ORDER BY f.created_at DESC`
    )
    .all(taskId, taskId) as any[];
}

/** Batch version used by the task board. */
export function getFeedbackForTasks(taskIds: number[]) {
  if (!taskIds.length) return [] as any[];
  const placeholders = taskIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT f.id,f.title,f.content,f.status,f.communication_id,ft.task_id
       FROM feedback f JOIN feedback_tasks ft ON ft.feedback_id=f.id
       WHERE ft.task_id IN (${placeholders})
       UNION
       SELECT f.id,f.title,f.content,f.status,f.communication_id,f.task_id
       FROM feedback f WHERE f.task_id IN (${placeholders})`
    )
    .all(...taskIds, ...taskIds) as any[];
}

export function listFeedbackLifecycle() {
  return FEEDBACK_STATUSES;
}

export function feedbackReferenceTitle(feedback: any) {
  return feedback.title || String(feedback.content || "").slice(0, 80);
}

export const FEEDBACK_CATEGORY_OPTIONS = FEEDBACK_CATEGORIES;
export const FEEDBACK_SENTIMENT_OPTIONS = FEEDBACK_SENTIMENTS;
export const FEEDBACK_PRIORITY_OPTIONS = FEEDBACK_PRIORITIES;
