# Tasks module — NotebookLM prompt

Paste these instructions into **Studio → Video Overview → customize / instructions** after uploading the storyboard PDF and the four source documents.

## Main prompt (copy everything in the block)

```text
Create a 3–4 minute explainer video for the Tasks module of the Winkk Media Tracker.
The audience is the agency owner and new employees. Use simple, plain English. No jargon,
no marketing language, no hype.

Treat these as the only allowed sources:
1. tasks-storyboard.pdf — real screenshots of the application, in click order.
2. 01-module-brief.md — what the module is and the rules.
3. 02-step-by-step.md — the exact click path.
4. 03-example-walkthrough.md — the Solhaus Diwali Campaign Reel example.
5. 04-faq-and-mistakes.md — common questions and mistakes.

Visual rules:
- Use the screenshots from the PDF as the visual sequence. Do not redraw, restyle, rename,
  or invent any part of the interface.
- Keep the relevant screenshot on screen while explaining that step. Show the actual screen,
  not an illustration of it.
- Do not show fake buttons, fake menus, or a fictional dashboard.
- Do not read out any password, email address, or date that is not visible in the screenshots.

Story rules:
- Follow the 13 steps in the storyboard, in order.
- Use the real labels: "Client-wise Task Board", "Apply filters", "Create task",
  "Linked records", "Activity history", "Update", "Delete task (keeps linked records)".
- Explain the single idea the module is built on: create the work once as a task, and the
  connected module record follows the task status.
- Use the Solhaus example: the task "Solhaus Diwali Campaign Reel" is a Social Media task for
  Solhaus, assigned to the Social Media Executive, In progress.
- When the task is set to Done, the linked Social Post becomes Published. Say clearly that
  nobody has to open Social Posts and change it a second time.
- Mention that the activity history records the change, so the owner can review it later.

Structure:
1. What the Tasks module is for (30 seconds).
2. The task board and filters (40 seconds).
3. Creating a task and choosing the category (40 seconds).
4. The category connects the module record; link an existing record instead of duplicating.
5. Opening one task: owner, client, category, due date, status, linked records, history.
6. Moving the task to Done and the automatic sync (the key moment).
7. The three habits: create once, update the task, add a note.

Tone:
- Calm, instructional, like a senior colleague showing a new joiner the screen.
- Short sentences. Explain what the person should click and why it matters.
- End with one sentence the viewer can repeat: "Create it once as a task. Update the task,
  not five places."

Do not add features, modules, or buttons that are not in the screenshots.
```

## If the first result drifts

Regenerate with one of these narrower prompts:

```text
Keep every screenshot exactly as uploaded. Do not generate new interface elements.
Narrate only what is visible on the current screen. If a detail is unclear, skip it.
```

```text
Make this a slower walkthrough for a first-day employee. One idea per screen.
Repeat the phrase "update the task, not the module" at steps 10 and 11.
```

```text
Shorten to 90 seconds. Keep only: board overview, filters, task card, status change to Done,
and the automatic Social Post update.
```

## Optional follow-ups in the same notebook

- **Audio Overview** — a 5-minute conversation version for the owner.
- **Quiz** — 5 questions on categories, linked records, and status sync.
- **Briefing doc** — a one-page handout for new joiners.
- **Mind map** — how Tasks connects to Social Posts, Feedback, Communications, Bloggers, and Meetings.
