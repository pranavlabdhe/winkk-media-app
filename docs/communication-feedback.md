# Communication → Feedback → Task

This document describes the unified interaction architecture introduced so that a
client conversation is logged once and the feedback inside it becomes a tracked,
lifecycle-managed record. The guiding flow is:

**Log once → classify → connect automatically → track everywhere.**

## 1. Ownership of data

| Data | Owner | Notes |
| --- | --- | --- |
| Interaction history | `communications` | What was said, when, through which channel, who logged it and who took part. Never rewritten by feedback changes. |
| Feedback details and resolution | `feedback` | Subject, description, category, sentiment, priority, action required, assignee, expected resolution, lifecycle status. |
| Execution of work | `tasks` | One task per piece of work, linked back to the feedback and its conversation. |

Feedback references its communication (`feedback.communication_id`); the
communication notes are not copied into the feedback table.

## 2. Schema

`communications` (existing table, extended):

- `communication_type` — `general` | `feedback`, mandatory at entry.
- `channel` — `whatsapp` | `call` | `email` | `meeting` | `other`.
- `recorded_by` — the user who logged the interaction.
- `task_id` — the owner task of the communication (unified-task model).

`feedback` (existing table, extended):

- `communication_id` — origin conversation (nullable only for feedback created
  from the task board).
- `title` — feedback subject; `content` keeps the description.
- `category`, `sentiment`, `priority`, `action_required`.
- `assigned_to`, `due_date`.
- `status` — `new`, `under_review`, `action_required`, `in_progress`,
  `awaiting_client_response`, `resolved`, `closed`.
- `resolved_at`, `task_id` (primary execution task).
- `action_status` is retained as a legacy mirror (`pending`,
  `requires_discussion`, `implemented`, `ignored`) so older queries and
  integrations keep working. It is always written together with `status`.

`feedback_tasks` (new join table):

- `feedback_id`, `task_id`, unique per pair, cascade on either side.
- Supports several tasks per feedback item. `feedback.task_id` remains the
  primary task for the unified-task sync and is always mirrored here.

Indexes:

- `idx_feedback_communication`, `idx_feedback_status`, `idx_feedback_tasks_task`.
- `idx_feedback_comm_title_unique` — unique `lower(title)` per communication,
  the database-level duplicate guard.

Migration is one-time and guarded by `app_settings.interaction_uda_v1`
(`migrateInteractions()` in `src/lib/db.ts`). It maps legacy `action_status`
values onto the lifecycle, fills missing titles, links existing
feedback/task pairs into `feedback_tasks`, and records who logged legacy
communications.

## 3. Entry points

Both entry points call the same transaction service
(`src/lib/interaction-service.ts`), so a feedback record can never exist without
its conversation unless it comes from the task board.

1. **Communications page** — one form with a mandatory type selector.
   - *General Communication*: communication only.
   - *Communication Containing Feedback*: the feedback repeater appears and
     accepts one or many feedback items with all fields. The communication,
     every feedback row and any follow-up tasks are written in one transaction.
2. **Feedback page quick log** — captures the feedback and creates its
   communication in the same transaction. This keeps the primary entry point
   consistent for staff who start from the feedback side.

Every communication also receives an owner task through the existing
unified-task model. Feedback tasks are **optional**: they are created only when
"Create a follow-up task" is selected (and an action is required).

## 4. Navigation

- Communication → each feedback item (title, status, lifecycle controls, task
  count) and its owner task.
- Feedback → originating communication (date/time, channel, recorder, client,
  participants, handled by) and every linked task.
- Task → linked feedback with status and a link to the source conversation.
- Client page → feedback title, lifecycle status, conversation link, task link.

## 5. Lifecycle and permissions

- Authorized users: owner, the feedback assignee, or the recording employee.
  Everyone else sees the record read-only.
- Feedback lifecycle drives its primary task: `resolved`/`closed` → `done`,
  `new` → `todo`, anything else → `in_progress`.
- Feedback changes never write to `communications`. Editing a conversation later
  does not touch feedback rows.
- Feedback details (subject, description, category, sentiment) can be corrected
  after creation; a corrected title is pushed to the linked task title.

## 6. Rules for correcting, deleting and archiving

- **Correcting feedback**: edit it on the Feedback page. History is kept in
  `feedback_updates` and `activity_log`; a title change is checked against the
  duplicate index for that conversation.
- **Correcting a conversation**: edit status, channel, response time or note.
  The classification is changed with the explicit reclassification control.
- **Reclassify general → feedback**: allowed at any time; add feedback items
  afterwards.
- **Reclassify feedback → general**: blocked while feedback exists. Close the
  feedback first, or keep the classification — history is never orphaned.
- **Deleting feedback**: not offered in the UI. Resolve it and move it to
  `closed` so the client history and audit trail stay intact.
- **Deleting a task**: existing task deletion unlinks module records and keeps
  them; deleting a feedback's primary task clears `feedback.task_id` but keeps
  the feedback. A communication with feedback cannot be deleted or
  reclassified without a deliberate decision.
- **Duplicate feedback**: the same subject within one conversation is rejected
  by the service and by the unique index. The same subject on a different
  conversation is a different interaction and is allowed.

## 7. Edge cases covered

1. Multiple feedback items per communication — repeater + one-to-many FK.
2. Feedback with no action — `action_required = 0`, no task created.
3. Multiple tasks per feedback — `feedback_tasks`; primary task in
   `feedback.task_id`.
4. WhatsApp, email, call, meeting or other — `communications.channel`.
5. Feedback updated from the Feedback module — lifecycle + detail edit form.
6. Communication edited after feedback exists — only interaction fields change.
7. Feedback resolved while the communication is untouched — verified; no write
   to the communication row.
8. Misclassified communication corrected — dedicated reclassification action
   with a guard when feedback exists.
9. Conversation edited after feedback creation — feedback rows unchanged.
10. Duplicate feedback attempt — rejected with a readable error; nothing is
    written.

## 8. Verification

- `npx tsc --noEmit` passes; lint has only the repo's existing `any` warnings.
- Browser validation covered: general and feedback scenarios, two feedback items
  from one call, one without a task, lifecycle to Resolved, second task on one
  feedback, communication note edit after feedback, reclassification both ways,
  duplicate rejection, email-channel quick log, and permission gating for an
  employee who is neither assignee nor recorder.
- Demo data was restored afterwards; `npm run seed:demo:reset` followed by
  `npm run seed:demo` reproduces the dataset.
