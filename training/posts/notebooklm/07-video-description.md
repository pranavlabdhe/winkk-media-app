# Social Posts module — publishing pack

Everything needed to publish the Social Posts training video: title, description, chapters, and
a final checklist.

## Title options

1. **Social Posts module — Winkk Media Tracker training**
2. **How to schedule and publish client posts | Winkk Media Tracker**
3. **Publish once, update everywhere: the Social Posts module**

Use option 1 for the internal library. Use option 2 for a public or client-facing link.

## Description (copy-paste)

```text
This is a short walkthrough of the Social Posts module in the Winkk Media Tracker, recorded from
the real application using demo data.

Social Posts is the publishing calendar for every client. Each row is one post: the platform, the
schedule, the publish date, the status, and the task that owns the work. When you publish the
post, the linked task becomes Done automatically. You do not update the same work twice.

What you will see:
• The Social Media Post Tracking board and the status chips
• Filtering by status and by client
• Reading one row: schedule, publish date, status, and linked task
• Adding the "Solhaus Diwali Offer Story" post
• Letting the app create the linked task, or linking an existing one
• Publishing the post and watching the linked task become Done
• Confirming the sync on the task card and in the activity history

Example used: Solhaus, an Instagram story scheduled for 17 November with the caption
"Diwali offer ends 24 Nov." The existing demo posts, including the Solhaus Diwali Campaign Reel,
show how a scheduled post points at the task that owns the work.

Three habits to keep:
1. The post is the publishing record; the task is the work record.
2. Link an existing task instead of creating a duplicate.
3. Keep the status honest — mark a slipped post pending or missed.

This recording uses demo data only. No client data or credentials are shown.

Next in the series: Dashboard, My Work, Feedback.
```

## Chapters

| Time | Chapter |
|---|---|
| 0:07 | What Social Posts is |
| 0:14 | Status chips and the week at a glance |
| 0:21 | Filtering by status |
| 0:28 | One client's calendar |
| 0:34 | What one post row contains |
| 0:41 | The linked task |
| 0:48 | Adding a post |
| 0:54 | Linking a task, or creating one |
| 1:01 | The Solhaus Diwali Offer Story example |
| 1:09 | Post and task created together |
| 1:16 | Publishing the post |
| 1:24 | The task becomes Done automatically |
| 1:33 | Confirming on the task |
| 1:40 | Recap and the habit |

Adjust the seconds from `storyboard/timings.json` if the recording pauses were longer than the
read.

## Attach to the same post

- `posts-storyboard.pdf` — the annotated screenshot storyboard (also the NotebookLM source).
- `video/posts-walkthrough.mp4` — the real screen recording.
- `notebooklm/06-voiceover-script.md` — the narration, if someone wants to re-record.

## Publishing checklist

- [ ] Video uses real screenshots, not an AI-redrawn interface.
- [ ] All labels match the current app: **Social Media Post Tracking**, **Add post**,
      **Linked task**, **Update**, **Save**, **Delete**, **Linked records**, **Activity history**.
- [ ] The Solhaus example matches the seeded demo data.
- [ ] The new post is shown with its automatically created task.
- [ ] The task is shown as Done after the post is published.
- [ ] Narration says the sync is automatic and does not require a second edit.
- [ ] Narration does not claim the app posts to Instagram.
- [ ] No password, email, token, real client contact, or private note is visible.
- [ ] Demo data was restored after recording — the recording creates and removes its own post.
- [ ] Description and chapters are pasted below the video.
- [ ] Storyboard PDF is attached or linked.
- [ ] Video is added to the training folder and shared with the owner plus all employees.

## Re-recording triggers

Re-run `npm run training:posts` and regenerate the NotebookLM video if any of these change:

- The Posts page layout, labels, status chips, or form fields.
- The post status names or the post-to-task status mapping.
- The task link behaviour (auto-create, matching, or the unlinked task list).
- The demo dataset (Solhaus posts, tasks, or the client list).
- The navigation (a module is renamed or added).

## Where this sits in the series

| # | Module | Video focus |
|---|---|---|
| 1 | Tasks | Create once, update everywhere |
| 2 | Dashboard | Reading the week: overdue work, workload, and posts to approve |
| 3 | Social Posts | From scheduled to published, and the task that follows — *this kit* |
| 4 | My Work | The employee’s personal queue |
| 5 | Clients | The unified timeline |
| 6 | Feedback | Logging and closing client feedback |
| 7 | Communications | Client requests and responses |
| 8 | Bloggers | Assignments and completion |
| 9 | Meetings | Agendas, notes, and follow-up tasks |
| 10 | Team | Owner-only: users, roles, and access |
| 11 | End-to-end | One client request, every module it touches |

Keep the same rhythm so employees learn the pattern: board → filter → create → connect → open →
update → verify → recap.
