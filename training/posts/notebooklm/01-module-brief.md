# Social Posts module — module brief

## What this module is

**Social Posts** is the publishing calendar for every client. Each row is one post: what goes
out, for which client, on which platform, when it is scheduled, when it actually published, and
which task owns the work.

Each post is connected to exactly **one task**. The post owns the publishing details. The task
owns the execution: who does it, when it is due, and its status.

Think of it as:

> **Schedule the post → publish the post → the task follows.**

## Who uses it

| Person | How they use Social Posts |
|---|---|
| Owner | Reviews the week, checks what is scheduled or missed, publishes with the team |
| Social Media Executive | Adds posts, sets dates, updates status, links the task |
| Designer | Opens the linked task from the post, updates the task when the creative is ready |
| Account team | Confirms what was promised to the client and when it goes live |
| Everyone | Reads the same board; employees see the clients they are assigned to |

## What you can do

- See every post, across all clients, on one page.
- Filter by **status** using the chips, by **client** from the client page, or by a single
  **task**.
- Add a post with client, title, status, platform, schedule, publish date, URL, and caption.
- Link the post to an existing task, or let the app create the task automatically.
- Update the status, publish date, and URL later without leaving the page.
- Open the linked task to see the owner, deadline, and activity history.
- Delete a post that was created by mistake.

## The status model

Social Posts has four statuses:

| Status | Meaning |
|---|---|
| **Scheduled** | Planned and dated; not live yet |
| **Published** | Live on the platform |
| **Pending** | Waiting on something — client approval, creative, copy, or access |
| **Missed** | The planned date passed without publishing |

The status is not decoration. It drives the linked task:

| Post status | Task status |
|---|---|
| Scheduled | In progress |
| Published | Done |
| Pending | To do |
| Missed | To do |

The sync also works in reverse. If someone marks the task **Done**, the post becomes
**Published**. If the task moves back to **In progress**, the post becomes **Scheduled**. If the
task returns to **To do**, the post becomes **Pending**.

One status change, both records updated. That is the point of the connection.

## Where it connects

- **Tasks** — the post's linked task. Open it from the **Linked task** column.
- **My Work** — the assigned employee sees the task in their personal queue.
- **Dashboard** — the **Social post status** block counts scheduled, published, pending, and
  missed posts and links to the filtered list.
- **Clients** — the client page has a **Social posts** section with a **Manage** link to
  `/posts?client=<id>`.

## Rules that matter

1. **A client and a title are required.** The app will not save a post without them.
2. **One post, one task.** The post points at a single task. If a piece of work needs several
   people, create separate tasks for those pieces.
3. **Linking beats duplicating.** If the task already exists, choose it in the task field. The
   list shows tasks that are not linked to another post yet.
4. **Leaving the task field blank creates the task.** The app makes a **Social Media** task with
   the same title and client, assigns it to the person who created the post, and copies the
   caption into the task description.
5. **The post owns publishing details; the task owns the work.** Do not put deadlines or
   assignees in the caption.
6. **Deleting a post keeps the task.** The task is not destroyed; the activity log records that
   the post was deleted and the task was retained.
7. **Deleting a task keeps the post.** The post becomes unlinked and shows **No linked task**.
8. **Visibility follows the client.** Owners see everything. Employees see posts for clients
   they are assigned to, or clients where they hold a task.

## What this module is not

- It is not a design approval tool. Approvals are recorded as feedback or as a task note.
- It is not a media library. The post URL points to the published item.
- It does not post to Instagram or any platform. It tracks the work around the post.

## Where it fits in the series

Tasks taught the rule **create once, update everywhere**. Social Posts is the first module that
shows what that means in daily use: the social team works in the post, the rest of the agency
works in the task, and the two records never drift apart.
