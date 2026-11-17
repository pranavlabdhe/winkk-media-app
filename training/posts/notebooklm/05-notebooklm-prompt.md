# Social Posts module — NotebookLM prompt

Paste these instructions into **Studio → Video Overview → customize / instructions** after
uploading the storyboard PDF and the four source documents.

## Main prompt (copy everything in the block)

```text
Create a 3–4 minute explainer video for the Social Posts module of the Winkk Media Tracker.
The audience is the agency owner and new employees, especially the social media team.
Use simple, plain English. No jargon, no marketing language, no hype.

Treat these as the only allowed sources:
1. posts-storyboard.pdf — real screenshots of the application, in click order.
2. 01-module-brief.md — what the module is and the rules.
3. 02-step-by-step.md — the exact click path.
4. 03-example-walkthrough.md — the Solhaus Diwali Offer Story example.
5. 04-faq-and-mistakes.md — common questions and mistakes.

Visual rules:
- Use the screenshots from the PDF as the visual sequence. Do not redraw, restyle, rename,
  or invent any part of the interface.
- Keep the relevant screenshot on screen while explaining that step. Show the actual screen,
  not an illustration of it.
- Do not show fake buttons, fake menus, or a fictional dashboard.
- Do not read out any password, email address, or count that is not visible in the screenshots.

Story rules:
- Follow the 14 steps in the storyboard, in order.
- Use the real labels: "Social Media Post Tracking", "All", "Scheduled", "Published",
  "Pending", "Missed", "Select client *", "Post title *", "Caption/notes",
  "Create/link task automatically", "Add post", "Linked task", "Update", "Save", "Delete",
  "Linked records", "Activity history".
- Explain the single idea the module is built on: the post is the publishing record, the task
  is the work record, and one status change keeps both true.
- Use the Solhaus example. Solhaus already has two scheduled posts, including
  "Solhaus Diwali Campaign Reel" on Instagram for 22 November, linked to a task owned by the
  Social Media Executive.
- Then add the real example in the recording: "Solhaus Diwali Offer Story" for Solhaus,
  Instagram, scheduled for 17 November at 9:30 am, caption "Diwali offer ends 24 Nov."
- The task field is left on "Create/link task automatically", so the app creates the linked
  task with the same title, client, and schedule date. Say clearly that the person does not
  type the information twice.
- Then set the post to "published" with a publish date and click "Save". Say clearly that the
  linked task becomes "done" automatically, and nobody has to open Tasks and update it again.
- Show the task card: the badge "Created from Social Post", the Social Post under
  "Linked records", and the activity line "Status synced from Social Post: in progress → done."
- Mention that the same status mapping works in reverse: marking the task done publishes the
  post, and moving the task back to in progress schedules it again.
- Say what each status means: scheduled is planned and dated, published is live, pending is
  waiting on something, missed is past its date without publishing.
- Mention that leaving a post on an old "scheduled" date is the most common mistake; mark it
  "pending" or "missed" instead.

Structure:
1. What Social Posts is for: the publishing calendar for every client (25 seconds).
2. The board: status chips, client view, and what one row contains (35 seconds).
3. Adding a post, and choosing between linking an existing task and creating one (40 seconds).
4. Publishing the post and watching the linked task become done (the key moment, 40 seconds).
5. Confirming on the task: badge, linked record, activity history (30 seconds).
6. The habit: publish in Social Posts, work in Tasks, keep the status honest (25 seconds).

Tone:
- Calm, instructional, like a senior colleague showing a new joiner the screen.
- Short sentences. Explain what the person should click and why it matters.
- End with one sentence the viewer can repeat: "The post is the publishing record. The task is
  the work record. Publish once, and both update."

Do not add features, modules, or buttons that are not in the screenshots.
Do not claim that the app posts to Instagram or any social platform. It tracks the work.
```

## If the first result drifts

Regenerate with one of these narrower prompts:

```text
Keep every screenshot exactly as uploaded. Do not generate new interface elements.
Narrate only what is visible on the current screen. If a detail is unclear, skip it.
```

```text
Make this a slower walkthrough for a first-day employee. One idea per screen.
Repeat the phrase "the post is the publishing record, the task is the work record" at the
start and at the recap.
```

```text
Shorten to 90 seconds. Keep only: the board and status chips, the Solhaus post row,
adding the Diwali Offer Story post, publishing it, and the linked task becoming done.
```

## Optional follow-ups in the same notebook

- **Audio Overview** — a 5-minute conversation version for the owner and the social team.
- **Quiz** — 5 questions on statuses, the task link, and what happens when a post is published.
- **Briefing doc** — a one-page handout for new social media executives.
- **Mind map** — how Social Posts connects to Tasks, My Work, Dashboard, and Clients.
