# Tasks module — publishing pack

Everything needed to publish the Tasks training video: title, description, chapters, and a final checklist.

## Title options

1. **Tasks module — Winkk Media Tracker training**
2. **How to run client work in Tasks | Winkk Media Tracker**
3. **Create once, update everywhere: the Tasks module**

Use option 1 for the internal library. Use option 2 for a public or client-facing link.

## Description (copy-paste)

```text
This is a short walkthrough of the Tasks module in the Winkk Media Tracker, recorded from the
real application using demo data.

Tasks is where every piece of client work begins. You create the work once as a task, choose a
category, and the tracker connects the matching module record — a social post, feedback item,
client communication, blogger assignment, or meeting. When you update the task, the connected
record follows. You do not update the same work twice.

What you will see:
• The Client-wise Task Board and what each task shows
• Filtering by client, teammate, category, and status
• Creating a task and choosing the right category
• Linking an existing record instead of creating a duplicate
• Reading a task: owner, client, due date, status, linked records, activity history
• Moving a task to Done and watching the linked Social Post become Published automatically

Example used: "Solhaus Diwali Campaign Reel" — a Social Media task for the client Solhaus,
owned by the Social Media Executive.

Three habits to keep:
1. Create the work once as a task.
2. Update the task, not five different modules.
3. Add a short note whenever the status changes.

This recording uses demo data only. No client data or credentials are shown.

Next in the series: Dashboard, Social Posts, My Work.
```

## Chapters

| Time | Chapter |
|---|---|
| 0:07 | What the Tasks module is |
| 0:14 | Filtering the board |
| 0:36 | Creating a task and choosing a category |
| 0:43 | Linking an existing record |
| 0:51 | Opening one task |
| 0:57 | Linked records |
| 1:04 | Activity history |
| 1:11 | Marking work Done |
| 1:20 | The automatic module update |
| 1:36 | Three habits and recap |

Adjust the seconds from `storyboard/timings.json` if the recording pauses were longer than the
read.

## Attach to the same post

- `tasks-storyboard.pdf` — the annotated screenshot storyboard (also the NotebookLM source).
- `video/tasks-walkthrough.mp4` — the real screen recording.
- `notebooklm/06-voiceover-script.md` — the narration, if someone wants to re-record.

## Publishing checklist

- [ ] Video uses real screenshots, not AI-redrawn interface.
- [ ] All labels match the current app: **Client-wise Task Board**, **Apply filters**,
      **Create task**, **Linked records**, **Activity history**, **Update**.
- [ ] The Solhaus example matches the seeded demo data.
- [ ] The Social Post is shown as Published after the task is set to Done.
- [ ] Narration says the update is automatic and does not require a second edit.
- [ ] No password, email, token, real client contact, or private note is visible.
- [ ] Demo data was restored after recording — run `npm run seed:demo` if unsure.
- [ ] Description and chapters are pasted below the video.
- [ ] Storyboard PDF is attached or linked.
- [ ] Video is added to the training folder and shared with the owner plus all employees.

## Re-recording triggers

Re-run `npm run training:tasks` and regenerate the NotebookLM video if any of these change:

- The Tasks page layout, labels, or filter fields.
- The category list or category-to-module mapping.
- The task status names or the status sync rules.
- The demo dataset (Solhaus task, post, or communication).
- The navigation (a module is renamed or added).

## Where this sits in the series

| # | Module | Video focus |
|---|---|---|
| 1 | Tasks | Create once, update everywhere — *this kit* |
| 2 | Dashboard | Reading the week: overdue work, workload, and posts to approve |
| 3 | Social Posts | From scheduled to published, approvals, client feedback |
| 4 | My Work | The employee’s personal queue |
| 5 | Clients | The unified timeline |
| 6 | Feedback | Logging and closing client feedback |
| 7 | Communications | Client requests and responses |
| 8 | Bloggers | Assignments and completion |
| 9 | Meetings | Agendas, notes, and follow-up tasks |
| 10 | Team | Owner-only: users, roles, and access |
| 11 | End-to-end | One client request, every module it touches |

Keep the same 13-step structure so employees learn the rhythm: board → filter → create →
connect → open → update → verify → recap.
