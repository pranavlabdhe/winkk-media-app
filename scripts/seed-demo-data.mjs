/**
 * Demo/test data for the unified activity model.
 *
 * Usage:
 *   npm run seed:demo          # create demo data (safe to run more than once)
 *   npm run seed:demo:reset    # remove only the demo records created by this script
 *
 * The script talks to the same data.sqlite database as the app. Start the app
 * at least once first so the schema exists.
 */
import path from "node:path";
import Database from "libsql";

const db = new Database(path.join(process.cwd(), "data.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const hasTasks = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
  .get();
if (!hasTasks) {
  console.error("Database schema not found. Start the app once, then run this script again.");
  process.exit(1);
}

const DEMO = {
  tasks: [
    "Solhaus Diwali Campaign Reel",
    "Solhaus Festive Carousel",
    "Grill Master Menu Photoshoot",
    "Grill Master Festive Menu Post",
    "Client feedback – Grill Master: Loved the new menu reel. Please add a vegetarian combo highlight next time.",
    "Grill Master Weekly Check-in",
    "Blogger collaboration – StyleByNeha × Solhaus",
    "Solhaus Monthly Review",
    "Finalize Solhaus December content calendar",
    "Client feedback – Rasraj: Logo size update for Christmas creative",
    "Grill Master Campaign Debrief",
    "Shoot Grill Master veg combo",
  ],
  posts: ["Solhaus Diwali Campaign Reel", "Solhaus Festive Carousel", "Grill Master Festive Menu Post"],
  feedback: [
    "Loved the new menu reel. Please add a vegetarian combo highlight next time.",
    "Client approved the Christmas creative but wants the logo slightly larger.",
  ],
  communications: [
    "Demo: Solhaus asked to highlight the Diwali offer end date in the reel caption.",
    "Demo: Shared the weekly report and next week's content plan with Grill Master.",
    "Demo: Client requested a larger logo on the Christmas post; awaiting the updated design.",
    "Demo: Client loved the festive menu reel and asked for a vegetarian combo highlight in the next post.",
  ],
  blogger: "StyleByNeha",
  assignments: ["Demo: Reel collaboration for the Solhaus Diwali collection."],
  meetings: ["Solhaus Monthly Review", "Grill Master Campaign Debrief"],
};

function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

function one(sql, ...params) {
  return db.prepare(sql).get(...params);
}

function byEmail(email) {
  return one("SELECT * FROM users WHERE email=?", email);
}

function byClient(name) {
  return one("SELECT * FROM clients WHERE name=?", name);
}

function log({
  clientId = null,
  taskId = null,
  entityType,
  entityId = null,
  action,
  summary,
  userId = null,
}) {
  db.prepare(
    `INSERT INTO activity_log (client_id,task_id,entity_type,entity_id,action,summary,user_id)
     VALUES (?,?,?,?,?,?,?)`
  ).run(clientId, taskId, entityType, entityId, action, summary, userId);
}

function ensureTask({
  title,
  description = null,
  clientId = null,
  assignedTo,
  assignedBy,
  status = "todo",
  category = "other",
  dueDate = null,
  originModule = "tasks",
  linkedBloggerId = null,
  activityAt = null,
  followUpOfTaskId = null,
  note = null,
}) {
  const existing = one(
    "SELECT id FROM tasks WHERE title=? AND client_id IS ?",
    title,
    clientId
  );
  if (existing) return Number(existing.id);

  const client = clientId ? one("SELECT name FROM clients WHERE id=?", clientId) : null;
  const result = db
    .prepare(
      `INSERT INTO tasks
        (title,description,client_id,assigned_to,assigned_by,status,category,due_date,origin_module,linked_blogger_id,activity_at,follow_up_of_task_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      title,
      description,
      clientId,
      assignedTo,
      assignedBy,
      status,
      category,
      dueDate,
      originModule,
      linkedBloggerId,
      activityAt,
      followUpOfTaskId
    );

  const taskId = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO task_updates (task_id,user_id,note) VALUES (?,?,?)").run(
    taskId,
    assignedBy,
    note || `Demo task created for ${client?.name || "internal work"}.`
  );
  log({
    clientId,
    taskId,
    entityType: "task",
    entityId: taskId,
    action: "created",
    summary: `Task "${title}" created${client ? ` for ${client.name}` : ""}.`,
    userId: assignedBy,
  });
  return taskId;
}

function addTaskUpdate(taskId, userId, note) {
  const exists = one("SELECT id FROM task_updates WHERE task_id=? AND note=?", taskId, note);
  if (exists) return;
  db.prepare("INSERT INTO task_updates (task_id,user_id,note) VALUES (?,?,?)").run(
    taskId,
    userId,
    note
  );
  const task = one("SELECT client_id FROM tasks WHERE id=?", taskId);
  log({
    clientId: task?.client_id || null,
    taskId,
    entityType: "task",
    entityId: taskId,
    action: "note",
    summary: note,
    userId,
  });
}

function linkModule({ table, type, moduleId, taskId, clientId, userId }) {
  const row = one(`SELECT task_id FROM ${table} WHERE id=?`, moduleId);
  if (!row || Number(row.task_id) === Number(taskId)) return;
  db.prepare(`UPDATE ${table} SET task_id=? WHERE id=?`).run(taskId, moduleId);
  const task = one("SELECT title FROM tasks WHERE id=?", taskId);
  log({
    clientId,
    taskId,
    entityType: type,
    entityId: moduleId,
    action: "linked",
    summary: `${type.replace("_", " ")} linked to task "${task?.title || taskId}".`,
    userId,
  });
}

function ensurePost({
  title,
  clientId,
  taskId = null,
  platform = "Instagram",
  scheduledAt = null,
  publishedAt = null,
  status = "scheduled",
  caption = null,
  postUrl = null,
  userId,
}) {
  let post = one("SELECT id FROM posts WHERE title=? AND client_id=?", title, clientId);
  if (!post) {
    const result = db
      .prepare(
        `INSERT INTO posts (client_id,title,platform,scheduled_at,published_at,status,caption,post_url)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(clientId, title, platform, scheduledAt, publishedAt, status, caption, postUrl);
    post = { id: Number(result.lastInsertRowid) };
    log({
      clientId,
      taskId,
      entityType: "post",
      entityId: post.id,
      action: "created",
      summary: `Social post "${title}" created.`,
      userId,
    });
  }
  if (taskId) linkModule({ table: "posts", type: "post", moduleId: post.id, taskId, clientId, userId });
  return Number(post.id);
}

function ensureFeedback({
  clientId,
  postId = null,
  taskId = null,
  content,
  title = null,
  communicationId = null,
  actionStatus = "pending",
  status = null,
  category = "other",
  sentiment = "neutral",
  priority = "medium",
  actionRequired = 1,
  assignedTo = null,
  dueDate = null,
  actionTaken = null,
  userId,
}) {
  const lifecycle =
    status ||
    (actionStatus === "implemented"
      ? "resolved"
      : actionStatus === "ignored"
        ? "closed"
        : actionStatus === "requires_discussion"
          ? "under_review"
          : "new");

  let feedback = one(
    "SELECT id FROM feedback WHERE client_id=? AND content=?",
    clientId,
    content
  );
  if (!feedback) {
    const result = db
      .prepare(
        `INSERT INTO feedback
          (client_id,post_id,content,action_status,action_taken,communication_id,title,category,
           sentiment,priority,action_required,assigned_to,due_date,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        clientId,
        postId,
        content,
        actionStatus,
        actionTaken,
        communicationId,
        title || content.slice(0, 80),
        category,
        sentiment,
        priority,
        actionRequired,
        assignedTo,
        dueDate,
        lifecycle
      );
    feedback = { id: Number(result.lastInsertRowid) };
    log({
      clientId,
      taskId,
      entityType: "feedback",
      entityId: feedback.id,
      action: "created",
      summary: `Client feedback recorded: ${content.slice(0, 120)}`,
      userId,
    });
  } else {
    // Keep re-runs idempotent while filling in the interaction columns.
    db.prepare(
      `UPDATE feedback
         SET title=?,
             communication_id=COALESCE(communication_id,?),
             status=?,
             action_status=?,
             category=CASE WHEN category IS NULL OR category='other' THEN ? ELSE category END,
             sentiment=COALESCE(sentiment,'neutral'),
             priority=COALESCE(priority,'medium'),
             action_required=?,
             assigned_to=COALESCE(assigned_to,?),
             due_date=COALESCE(due_date,?)
       WHERE id=?`
    ).run(
      title || content.slice(0, 80),
      communicationId,
      lifecycle,
      actionStatus,
      category,
      actionRequired,
      assignedTo,
      dueDate,
      feedback.id
    );
  }
  if (taskId) {
    linkModule({
      table: "feedback",
      type: "feedback",
      moduleId: feedback.id,
      taskId,
      clientId,
      userId,
    });
  }
  return Number(feedback.id);
}

/** Point a seeded feedback row at the conversation it came from. */
function linkFeedbackToCommunication({ feedbackId, communicationId, userId, clientId }) {
  db.prepare(
    "UPDATE feedback SET communication_id=? WHERE id=? AND communication_id IS NULL"
  ).run(communicationId, feedbackId);
  db.prepare(
    "UPDATE communications SET communication_type='feedback' WHERE id=?"
  ).run(communicationId);
  db.prepare(
    `INSERT OR IGNORE INTO feedback_tasks (feedback_id,task_id)
     SELECT id, task_id FROM feedback WHERE id=? AND task_id IS NOT NULL`
  ).run(feedbackId);
  log({
    clientId,
    entityType: "feedback",
    entityId: feedbackId,
    action: "linked",
    summary: `Feedback linked to communication #${communicationId}.`,
    userId,
  });
}

function ensureCommunication({
  clientId,
  taskId = null,
  executiveName,
  whatsappGroup = null,
  clientMessageAt = null,
  responseAt = null,
  status = "pending",
  notes,
  communicationType = "general",
  channel = "whatsapp",
  recordedBy = null,
  userId,
}) {
  let communication = one(
    "SELECT id FROM communications WHERE client_id=? AND notes=?",
    clientId,
    notes
  );
  if (!communication) {
    const result = db
      .prepare(
        `INSERT INTO communications
          (client_id,executive_name,whatsapp_group,client_message_at,response_at,status,notes,
           communication_type,channel,recorded_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        clientId,
        executiveName,
        whatsappGroup,
        clientMessageAt,
        responseAt,
        status,
        notes,
        communicationType,
        channel,
        recordedBy
      );
    communication = { id: Number(result.lastInsertRowid) };
    log({
      clientId,
      taskId,
      entityType: "communication",
      entityId: communication.id,
      action: "created",
      summary: `Client communication logged by ${executiveName}.`,
      userId,
    });
  } else {
    db.prepare(
      `UPDATE communications
         SET recorded_by=COALESCE(recorded_by,?),
             channel=COALESCE(NULLIF(channel,''),?),
             communication_type=?
       WHERE id=?`
    ).run(recordedBy, channel, communicationType, communication.id);
  }
  if (taskId) {
    linkModule({
      table: "communications",
      type: "communication",
      moduleId: communication.id,
      taskId,
      clientId,
      userId,
    });
  }
  return Number(communication.id);
}

function ensureBlogger({ name, handle = null, contact = null, userId }) {
  let blogger = one("SELECT id FROM bloggers WHERE name=?", name);
  if (!blogger) {
    const result = db
      .prepare("INSERT INTO bloggers (name,handle,contact) VALUES (?,?,?)")
      .run(name, handle, contact);
    blogger = { id: Number(result.lastInsertRowid) };
    log({
      entityType: "blogger",
      entityId: blogger.id,
      action: "created",
      summary: `Blogger "${name}" added to the influencer directory.`,
      userId,
    });
  }
  return Number(blogger.id);
}

function ensureAssignment({
  bloggerId,
  clientId,
  taskId = null,
  scheduledDate = null,
  assignmentStatus = "assigned",
  completionStatus = "not_started",
  notes,
  userId,
}) {
  let assignment = one(
    "SELECT id FROM blogger_assignments WHERE client_id=? AND notes=?",
    clientId,
    notes
  );
  if (!assignment) {
    const result = db
      .prepare(
        `INSERT INTO blogger_assignments (blogger_id,client_id,scheduled_date,assignment_status,completion_status,notes)
         VALUES (?,?,?,?,?,?)`
      )
      .run(bloggerId, clientId, scheduledDate, assignmentStatus, completionStatus, notes);
    assignment = { id: Number(result.lastInsertRowid) };
    log({
      clientId,
      taskId,
      entityType: "blogger_assignment",
      entityId: assignment.id,
      action: "created",
      summary: "Blogger assignment created.",
      userId,
    });
  }
  if (taskId) {
    linkModule({
      table: "blogger_assignments",
      type: "blogger_assignment",
      moduleId: assignment.id,
      taskId,
      clientId,
      userId,
    });
  }
  return Number(assignment.id);
}

function ensureMeeting({
  clientId,
  taskId = null,
  title,
  meetingAt,
  status = "upcoming",
  discussionNotes = null,
  userId,
}) {
  let meeting = one("SELECT id FROM meetings WHERE client_id=? AND title=?", clientId, title);
  if (!meeting) {
    const result = db
      .prepare(
        `INSERT INTO meetings (client_id,title,meeting_at,status,discussion_notes)
         VALUES (?,?,?,?,?)`
      )
      .run(clientId, title, meetingAt, status, discussionNotes);
    meeting = { id: Number(result.lastInsertRowid) };
    log({
      clientId,
      taskId,
      entityType: "meeting",
      entityId: meeting.id,
      action: "created",
      summary: `Meeting "${title}" scheduled for ${meetingAt}.`,
      userId,
    });
  }
  if (taskId) {
    linkModule({
      table: "meetings",
      type: "meeting",
      moduleId: meeting.id,
      taskId,
      clientId,
      userId,
    });
  }
  return Number(meeting.id);
}

function addFeedbackUpdate(feedbackId, note) {
  const exists = one("SELECT id FROM feedback_updates WHERE feedback_id=? AND note=?", feedbackId, note);
  if (exists) return;
  db.prepare("INSERT INTO feedback_updates (feedback_id,note) VALUES (?,?)").run(feedbackId, note);
}

const owner = byEmail("owner@winkk.media");
const social = byEmail("social@winkk.media");
const designer1 = byEmail("designer1@winkk.media");
const designer2 = byEmail("designer2@winkk.media");
const bhagyashree = byEmail("bha@gmail.com");

if (!owner || !social || !designer1 || !designer2 || !bhagyashree) {
  console.error("Required demo users are missing. Start the app once so it seeds the team.");
  process.exit(1);
}

const solhaus = byClient("Solhaus");
const grillMaster = byClient("Grill Master");
const rasraj = byClient("Rasraj");
if (!solhaus || !grillMaster || !rasraj) {
  console.error("Required demo clients are missing. Start the app once so it seeds clients.");
  process.exit(1);
}

const seed = db.transaction(() => {
  // 1) Task -> post + communication, one activity with two linked modules.
  const diwaliTask = ensureTask({
    title: "Solhaus Diwali Campaign Reel",
    description:
      "Create and schedule the Solhaus Diwali reel. Include offer end date, product close-ups, and the new festive collection.",
    clientId: solhaus.id,
    assignedTo: social.id,
    assignedBy: owner.id,
    status: "in_progress",
    category: "social_media",
    dueDate: "2026-11-22",
  });
  ensurePost({
    title: "Solhaus Diwali Campaign Reel",
    clientId: solhaus.id,
    taskId: diwaliTask,
    platform: "Instagram",
    scheduledAt: "2026-11-22T18:30",
    status: "scheduled",
    caption: "Diwali lights, Solhaus style. Shop the festive collection before the offer ends.",
    userId: social.id,
  });
  ensureCommunication({
    clientId: solhaus.id,
    taskId: diwaliTask,
    executiveName: bhagyashree.name,
    whatsappGroup: "Solhaus – Content",
    clientMessageAt: "2026-11-16T10:15",
    status: "pending",
    notes: DEMO.communications[0],
    communicationType: "general",
    channel: "whatsapp",
    recordedBy: bhagyashree.id,
    userId: bhagyashree.id,
  });
  addTaskUpdate(diwaliTask, social.id, "Reel storyboard approved by the client.");
  addTaskUpdate(diwaliTask, social.id, "Awaiting final export from the design team.");

  // 2) Post -> task (created directly in Social Posts).
  const carouselPost = ensurePost({
    title: "Solhaus Festive Carousel",
    clientId: solhaus.id,
    platform: "Instagram",
    scheduledAt: "2026-11-25T12:00",
    status: "scheduled",
    caption: "Five festive corners worth recreating at home.",
    userId: designer1.id,
  });
  const carouselTask = ensureTask({
    title: "Solhaus Festive Carousel",
    description: "Design a five-slide festive carousel for Solhaus.",
    clientId: solhaus.id,
    assignedTo: designer1.id,
    assignedBy: social.id,
    status: "in_progress",
    category: "social_media",
    dueDate: "2026-11-25",
    originModule: "post",
  });
  linkModule({
    table: "posts",
    type: "post",
    moduleId: carouselPost,
    taskId: carouselTask,
    clientId: solhaus.id,
    userId: social.id,
  });

  // 3) Task-only work (design) with an overdue due date.
  const photoshootTask = ensureTask({
    title: "Grill Master Menu Photoshoot",
    description:
      "Photograph the new winter menu items for Instagram and the website. Deliver edited images to the social team.",
    clientId: grillMaster.id,
    assignedTo: designer1.id,
    assignedBy: owner.id,
    status: "in_progress",
    category: "design",
    dueDate: "2026-11-12",
  });
  addTaskUpdate(photoshootTask, designer1.id, "Shot the first batch; reshooting the desserts on Monday.");

  // 4) Published post + feedback + communication.
  const menuPost = ensurePost({
    title: "Grill Master Festive Menu Post",
    clientId: grillMaster.id,
    platform: "Instagram",
    publishedAt: "2026-11-14T19:00",
    status: "published",
    caption: "The winter menu is here. Swipe for the new favourites.",
    userId: social.id,
  });
  const menuPostTask = ensureTask({
    title: "Grill Master Festive Menu Post",
    description: "Publish the Grill Master winter menu post and monitor engagement.",
    clientId: grillMaster.id,
    assignedTo: social.id,
    assignedBy: owner.id,
    status: "done",
    category: "social_media",
    dueDate: "2026-11-14",
    originModule: "post",
  });
  linkModule({
    table: "posts",
    type: "post",
    moduleId: menuPost,
    taskId: menuPostTask,
    clientId: grillMaster.id,
    userId: social.id,
  });

  const menuFeedbackContent = DEMO.feedback[0];
  const menuFeedbackTask = ensureTask({
    title: DEMO.tasks[4],
    description: menuFeedbackContent,
    clientId: grillMaster.id,
    assignedTo: bhagyashree.id,
    assignedBy: owner.id,
    status: "in_progress",
    category: "feedback",
    dueDate: "2026-11-19",
  });
  const menuFeedbackCommunication = ensureCommunication({
    clientId: grillMaster.id,
    executiveName: bhagyashree.name,
    whatsappGroup: "Grill Master – Daily",
    clientMessageAt: "2026-11-14T19:40",
    responseAt: "2026-11-14T20:05",
    status: "responded",
    notes: DEMO.communications[3],
    communicationType: "feedback",
    channel: "whatsapp",
    recordedBy: bhagyashree.id,
    userId: bhagyashree.id,
  });
  const menuFeedback = ensureFeedback({
    clientId: grillMaster.id,
    postId: menuPost,
    taskId: menuFeedbackTask,
    communicationId: menuFeedbackCommunication,
    content: menuFeedbackContent,
    title: "Veg combo highlight for the festive menu",
    actionStatus: "requires_discussion",
    status: "under_review",
    category: "social_post",
    sentiment: "positive",
    priority: "medium",
    actionRequired: 1,
    assignedTo: bhagyashree.id,
    dueDate: "2026-11-19",
    actionTaken: "Adding a vegetarian combo highlight to the next shoot list.",
    userId: bhagyashree.id,
  });
  linkFeedbackToCommunication({
    feedbackId: menuFeedback,
    communicationId: menuFeedbackCommunication,
    clientId: grillMaster.id,
    userId: bhagyashree.id,
  });
  addFeedbackUpdate(menuFeedback, "Client feedback logged from an Instagram DM.");
  addFeedbackUpdate(menuFeedback, "Discussed with the design team; veg combo will be added to the next shoot.");

  const weeklyTask = ensureTask({
    title: "Grill Master Weekly Check-in",
    description: "Share the weekly report and agree on next week's content plan.",
    clientId: grillMaster.id,
    assignedTo: bhagyashree.id,
    assignedBy: owner.id,
    status: "done",
    category: "client_communication",
    dueDate: "2026-11-15",
  });
  ensureCommunication({
    clientId: grillMaster.id,
    taskId: weeklyTask,
    executiveName: bhagyashree.name,
    whatsappGroup: "Grill Master – Daily",
    clientMessageAt: "2026-11-15T09:30",
    responseAt: "2026-11-15T09:50",
    status: "responded",
    notes: DEMO.communications[1],
    communicationType: "general",
    channel: "whatsapp",
    recordedBy: bhagyashree.id,
    userId: bhagyashree.id,
  });
  addTaskUpdate(weeklyTask, bhagyashree.id, "Weekly report sent to the client.");
  addTaskUpdate(weeklyTask, bhagyashree.id, "Client confirmed receipt and approved next week's plan.");

  // 5) Blogger / influencer collaboration.
  const neha = ensureBlogger({
    name: DEMO.blogger,
    handle: "@stylebyneha",
    contact: "neha@example.com",
    userId: social.id,
  });
  const bloggerTask = ensureTask({
    title: DEMO.tasks[6],
    description: "Coordinate the Solhaus Diwali reel with StyleByNeha, including brief, shoot date, and approval.",
    clientId: solhaus.id,
    assignedTo: social.id,
    assignedBy: owner.id,
    status: "in_progress",
    category: "blogger",
    dueDate: "2026-11-28",
    originModule: "blogger_assignment",
    linkedBloggerId: neha,
  });
  ensureAssignment({
    bloggerId: neha,
    clientId: solhaus.id,
    taskId: bloggerTask,
    scheduledDate: "2026-11-28",
    assignmentStatus: "in_progress",
    completionStatus: "in_progress",
    notes: DEMO.assignments[0],
    userId: social.id,
  });
  addTaskUpdate(bloggerTask, social.id, "Brief shared with StyleByNeha; shoot confirmed for 28 November.");

  // 6) Meeting -> follow-up task.
  const reviewTask = ensureTask({
    title: DEMO.meetings[0],
    description: "Review November performance, finalize the December calendar, and confirm Diwali learnings.",
    clientId: solhaus.id,
    assignedTo: owner.id,
    assignedBy: owner.id,
    status: "todo",
    category: "meeting",
    dueDate: "2026-11-18",
    originModule: "meeting",
    activityAt: "2026-11-18T15:00",
  });
  ensureMeeting({
    clientId: solhaus.id,
    taskId: reviewTask,
    title: DEMO.meetings[0],
    meetingAt: "2026-11-18T15:00",
    status: "upcoming",
    discussionNotes:
      "Review November performance, finalize the December calendar, and confirm Diwali learnings.",
    userId: owner.id,
  });
  const calendarFollowUp = ensureTask({
    title: DEMO.tasks[8],
    description: "Follow-up from the Solhaus Monthly Review. Prepare and share the December content calendar.",
    clientId: solhaus.id,
    assignedTo: social.id,
    assignedBy: owner.id,
    status: "todo",
    category: "other",
    dueDate: "2026-11-21",
    followUpOfTaskId: reviewTask,
  });
  addTaskUpdate(calendarFollowUp, owner.id, "Created from the Solhaus Monthly Review meeting.");

  // 7) Rasraj example: feedback on the existing Christmas post + a second module on its existing task.
  const rasrajTask = one("SELECT id FROM tasks WHERE title='Rasraj Christmas Post'");
  const rasrajPost = one("SELECT id FROM posts WHERE title='Rasraj Christmas Post'");
  const logoFeedbackContent = DEMO.feedback[1];
  const logoFeedbackTask = ensureTask({
    title: DEMO.tasks[9],
    description: logoFeedbackContent,
    clientId: rasraj.id,
    assignedTo: designer2.id,
    assignedBy: owner.id,
    status: "todo",
    category: "feedback",
    dueDate: "2026-11-17",
  });
  const logoCommunication = ensureCommunication({
    clientId: rasraj.id,
    taskId: rasrajTask ? Number(rasrajTask.id) : null,
    executiveName: bhagyashree.name,
    whatsappGroup: "Rasraj – Christmas Campaign",
    clientMessageAt: "2026-11-15T12:10",
    status: "pending",
    notes: DEMO.communications[2],
    communicationType: "feedback",
    channel: "whatsapp",
    recordedBy: bhagyashree.id,
    userId: bhagyashree.id,
  });
  const logoFeedback = ensureFeedback({
    clientId: rasraj.id,
    postId: rasrajPost?.id || null,
    taskId: logoFeedbackTask,
    communicationId: logoCommunication,
    content: logoFeedbackContent,
    title: "Logo size on the Christmas creative",
    actionStatus: "pending",
    status: "action_required",
    category: "creative",
    sentiment: "negative",
    priority: "high",
    actionRequired: 1,
    assignedTo: designer2.id,
    dueDate: "2026-11-17",
    actionTaken: "Designer reviewing the logo size.",
    userId: bhagyashree.id,
  });
  linkFeedbackToCommunication({
    feedbackId: logoFeedback,
    communicationId: logoCommunication,
    clientId: rasraj.id,
    userId: bhagyashree.id,
  });
  addFeedbackUpdate(logoFeedback, "Client approved the overall creative; only the logo size needs a change.");

  // 8) Completed meeting with a follow-up task.
  const debriefTask = ensureTask({
    title: DEMO.meetings[1],
    description: "Review the festive menu campaign performance and agree on next steps.",
    clientId: grillMaster.id,
    assignedTo: owner.id,
    assignedBy: owner.id,
    status: "done",
    category: "meeting",
    dueDate: "2026-11-10",
    originModule: "meeting",
    activityAt: "2026-11-10T11:00",
  });
  ensureMeeting({
    clientId: grillMaster.id,
    taskId: debriefTask,
    title: DEMO.meetings[1],
    meetingAt: "2026-11-10T11:00",
    status: "completed",
    discussionNotes:
      "Reviewed festive menu performance. Agreed to shoot a vegetarian combo reel and reuse the top-performing creative.",
    userId: owner.id,
  });
  const vegFollowUp = ensureTask({
    title: DEMO.tasks[11],
    description: "Follow-up from the Grill Master Campaign Debrief. Shoot and edit a vegetarian combo reel.",
    clientId: grillMaster.id,
    assignedTo: designer1.id,
    assignedBy: owner.id,
    status: "todo",
    category: "other",
    dueDate: "2026-11-20",
    followUpOfTaskId: debriefTask,
  });
  addTaskUpdate(vegFollowUp, owner.id, "Created from the Grill Master Campaign Debrief meeting.");
});

function resetDemoData() {
  const taskRows = all(
    `SELECT id FROM tasks WHERE title IN (${DEMO.tasks.map(() => "?").join(",")})`,
    ...DEMO.tasks
  );
  const taskIds = taskRows.map((row) => Number(row.id));

  const postRows = all(
    `SELECT id FROM posts WHERE title IN (${DEMO.posts.map(() => "?").join(",")})`,
    ...DEMO.posts
  );
  const postIds = postRows.map((row) => Number(row.id));

  const feedbackRows = all(
    `SELECT id FROM feedback WHERE content IN (${DEMO.feedback.map(() => "?").join(",")})`,
    ...DEMO.feedback
  );
  const feedbackIds = feedbackRows.map((row) => Number(row.id));

  const communicationRows = all(
    `SELECT id FROM communications WHERE notes IN (${DEMO.communications.map(() => "?").join(",")})`,
    ...DEMO.communications
  );
  const communicationIds = communicationRows.map((row) => Number(row.id));

  const assignmentRows = all(
    `SELECT id FROM blogger_assignments WHERE notes IN (${DEMO.assignments.map(() => "?").join(",")})`,
    ...DEMO.assignments
  );
  const assignmentIds = assignmentRows.map((row) => Number(row.id));

  const meetingRows = all(
    `SELECT id FROM meetings WHERE title IN (${DEMO.meetings.map(() => "?").join(",")})`,
    ...DEMO.meetings
  );
  const meetingIds = meetingRows.map((row) => Number(row.id));

  const reset = db.transaction(() => {
    if (feedbackIds.length) {
      db.prepare(
        `DELETE FROM feedback_updates WHERE feedback_id IN (${feedbackIds.map(() => "?").join(",")})`
      ).run(...feedbackIds);
    }
    if (taskIds.length) {
      db.prepare(
        `DELETE FROM task_updates WHERE task_id IN (${taskIds.map(() => "?").join(",")})`
      ).run(...taskIds);
    }
    db.prepare(
      `DELETE FROM activity_log
       WHERE summary LIKE 'Task "%' AND task_id IS NULL`
    ).run();

    if (postIds.length) {
      db.prepare(`DELETE FROM posts WHERE id IN (${postIds.map(() => "?").join(",")})`).run(...postIds);
    }
    if (feedbackIds.length) {
      db.prepare(`DELETE FROM feedback WHERE id IN (${feedbackIds.map(() => "?").join(",")})`).run(
        ...feedbackIds
      );
    }
    if (communicationIds.length) {
      db.prepare(
        `DELETE FROM communications WHERE id IN (${communicationIds.map(() => "?").join(",")})`
      ).run(...communicationIds);
    }
    if (assignmentIds.length) {
      db.prepare(
        `DELETE FROM blogger_assignments WHERE id IN (${assignmentIds.map(() => "?").join(",")})`
      ).run(...assignmentIds);
    }
    if (meetingIds.length) {
      db.prepare(`DELETE FROM meetings WHERE id IN (${meetingIds.map(() => "?").join(",")})`).run(
        ...meetingIds
      );
    }

    const demoBlogger = one("SELECT id FROM bloggers WHERE name=?", DEMO.blogger);
    if (demoBlogger) {
      db.prepare("DELETE FROM bloggers WHERE id=?").run(demoBlogger.id);
    }

    if (taskIds.length) {
      db.prepare(`DELETE FROM activity_log WHERE task_id IN (${taskIds.map(() => "?").join(",")})`).run(
        ...taskIds
      );
      db.prepare(`DELETE FROM tasks WHERE id IN (${taskIds.map(() => "?").join(",")})`).run(...taskIds);
    }
  });
  reset();
  console.log("Demo data removed.");
}

const reset = process.argv.includes("--reset");
if (reset) {
  resetDemoData();
  process.exit(0);
}

seed();
console.log("Demo data seeded successfully.\n");

for (const title of DEMO.tasks) {
  const task = one("SELECT id,title,status FROM tasks WHERE title=? ORDER BY id LIMIT 1", title);
  if (!task) continue;
  const client = one(
    "SELECT c.name FROM tasks t LEFT JOIN clients c ON c.id=t.client_id WHERE t.id=?",
    task.id
  );
  console.log(`- ${task.title} → task #${task.id} (${task.status}, ${client?.name || "Internal"})`);
}

const diwali = one("SELECT id FROM tasks WHERE title='Solhaus Diwali Campaign Reel'");
const menuFeedback = one(
  "SELECT id FROM tasks WHERE title=?",
  DEMO.tasks[4]
);
const blogger = one("SELECT id FROM tasks WHERE title=?", DEMO.tasks[6]);
const review = one("SELECT id FROM tasks WHERE title=?", DEMO.tasks[7]);

console.log("\nTry these pages:");
console.log("- /tasks");
console.log(`- /posts?task=${diwali?.id ?? ""}`);
console.log(`- /communications?task=${diwali?.id ?? ""}`);
console.log(`- /feedback?task=${menuFeedback?.id ?? ""}`);
console.log(`- /bloggers?task=${blogger?.id ?? ""}`);
console.log(`- /meetings?task=${review?.id ?? ""}`);
console.log("- /clients/1 (Solhaus unified timeline)");
console.log("- /dashboard");
console.log("\nRemove demo data with: npm run seed:demo:reset");
