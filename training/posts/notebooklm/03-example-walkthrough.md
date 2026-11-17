# Social Posts module — example walkthrough

## The scenario

Solhaus has a Diwali offer running this week. The social team has two posts planned:

| Post | Client | Platform | Scheduled | Status | Linked task | Task owner |
|---|---|---|---|---|---|---|
| Solhaus Diwali Campaign Reel | Solhaus | Instagram | 22 Nov, 6:30 pm | scheduled | Solhaus Diwali Campaign Reel | Social Media Executive |
| Solhaus Festive Carousel | Solhaus | Instagram | 25 Nov, 12:00 pm | scheduled | Solhaus Festive Carousel | Designer 1 |

The post owns the publishing details. The task owns the work. They are two views of the same
activity, not two projects.

In the video, the team adds a third post — a story that goes out on the day of the offer — and
publishes it. That one example shows the whole workflow.

## Walkthrough

### 1. See the week

Open **Social Posts**. The board shows every client at once. The chips count what is
**scheduled**, **published**, **pending**, and **missed**.

Click **Scheduled** to answer the owner's Monday question: “What is still waiting to go out?”

### 2. Narrow to one client

Open **Clients → Solhaus → Social posts → Manage**. The board now shows only Solhaus, and the
counts narrow with it.

This is also where a client review starts: one screen, one client's calendar.

### 3. Read an existing post

The row for **Solhaus Diwali Campaign Reel** shows:

- Instagram, scheduled for 22 November at 6:30 pm.
- Status **scheduled**.
- Linked task **Solhaus Diwali Campaign Reel**, owned by **Social Media Executive**, task status
  **in progress**, due **22 November**.

The post says *when it goes out*. The task says *who is finishing it*.

### 4. Add the new post

Still on the Solhaus view, use the create form:

| Field | Value |
|---|---|
| Client | Solhaus (already selected) |
| Post title | Solhaus Diwali Offer Story |
| Status | scheduled |
| Platform | Instagram |
| Scheduled | 17 November, 9:30 am |
| Post URL | blank for now |
| Caption/notes | Diwali offer ends 24 Nov. |
| Task | Create/link task automatically |

Click **Add post**.

The row appears immediately. The screen shows **All: 3**, **Scheduled: 3**, and a new linked
task:

- **Solhaus Diwali Offer Story**, owned by the person who created the post (the owner in this
  recording), task status **in progress**, due **17 November**.

The app created the task because the task field was left on **Create/link task automatically**.
It used the post title, the client, and the schedule date, and it copied the caption into the
task description. Nobody typed the same information twice.

> If the task already existed, the same field would have been used to pick it instead. The post
> would link to that task, not create a duplicate.

### 5. Publish it

The story goes live. In the row's **Update** area:

1. Status → **published**.
2. Publish date → 17 November, 10:00 am.
3. Click **Save**.

The row now reads **published** and shows the publish date. The chips change to
**Scheduled: 2**, **Published: 1**.

### 6. Watch the task follow

The **Linked task** cell for the new row now shows **Owner · done**, due 17 November.

Open the task:

- The card title is the same: **Solhaus Diwali Offer Story**.
- It carries the badge **Created from Social Post**.
- **Linked records** shows **Social Post: Solhaus Diwali Offer Story (published)**.
- **Activity history** shows *“Status synced from Social Post: in progress → done.”*

This is the key moment in the video: the social team published in **Social Posts**, and the task
board closed the work without a second update.

### 7. Recap

- **Social Posts** answers: what goes out, where, and when?
- **Tasks** answers: who is doing it, by when, and is it done?
- One status change keeps both answers true.

## Second example: the task already exists

Sometimes the work is planned first. For example, the owner creates the task
**Solhaus Diwali Offer Story** on the Tasks board, assigns it to the Social Media Executive, and
sets the due date. Later, the social team adds the post.

In that case:

1. Open **Social Posts**.
2. Fill the post as usual.
3. Open the task field and choose **Link to task: Solhaus Diwali Offer Story · Solhaus · Social
   Media**.
4. Click **Add post**.

The post is linked to the existing task. No duplicate task is created.

When you link a post to a task, the post carries the latest state, so the task takes the post's
title, client, and schedule date. That is intentional: the published record is the truth.

## After the recording

The capture creates **Solhaus Diwali Offer Story** and its task, publishes it, and then deletes
both rows again. The seeded Solhaus posts and tasks are left exactly as they were.

If a recording is interrupted, run:

```bash
npm run seed:demo:reset
npm run seed:demo
```

## What to say in the video

> “The post is the publishing record. The task is the work record. I add the post, the app
> creates the task, and when I mark the post published the task closes itself. One update, both
> records.”
