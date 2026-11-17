# Social Posts module — step by step

Use this as the click path for the video. Labels match the application.

## 1. Open the post board

1. Sign in.
2. In the top navigation, choose **Social Posts**.
3. The page title is **Social Media Post Tracking**.

You will see:

- A row of status chips: **All**, **Scheduled**, **Published**, **Pending**, **Missed**, each
  with a live count.
- A create form: **Select client \***, **Post title \***, status, platform, schedule, publish
  date, **Post URL**, **Caption/notes**, a task field, and **Add post**.
- A table with one row per post: **Client**, **Title**, **Scheduled**, **Published**, **Status**,
  **Linked task**, **Update**, and **Delete**.

## 2. Read the status picture

The chips count the posts in the current view.

1. Start with **All** to see the whole calendar.
2. Click **Scheduled** to see only posts that are planned and dated.
3. Click the active chip again, or **All**, to go back.

The filter is stored in the URL (`/posts?status=scheduled`), so the view can be shared or
bookmarked.

## 3. Filter to one client

1. Open **Clients** and choose the client.
2. In the **Social posts** section, click **Manage**.

The list opens at `/posts?client=<id>` and shows only that client's posts. The status chips then
count only that client's posts as well.

## 4. Read one row

Each row answers five questions:

- **Client** — who the post is for.
- **Title** and platform — what is going out.
- **Scheduled** and **Published** — when it is planned and when it went live.
- **Status** — scheduled, published, pending, or missed.
- **Linked task** — the task title, owner, task status, and due date. Click the title to open the
  task.

## 5. Add a post

1. Choose the **client**.
2. Type the **post title** — the same words the team uses in conversation.
3. Choose the **status**: usually **scheduled**.
4. Leave the platform as **Instagram**, or change it.
5. Set the **schedule** date and time.
6. Add the **caption or notes** if they help the team.
7. Choose a task (next step).
8. Click **Add post**.

The client is pre-selected when you start from a client-filtered view.

## 6. Choose the task

The task field has two uses:

- **Link an existing task** — pick a task from the list. Only tasks not already linked to a post
  are shown, so one task cannot quietly own two posts.
- **Create/link task automatically** — leave the field on the default option. The app creates a
  **Social Media** task with the same title and client, and copies the caption into the task
  description.

The same submission saves the post and connects the task. There is no second form to fill in.

## 7. Publish the post

When the post goes live:

1. In the row's **Update** area, change the status to **published**.
2. Add the **publish date** and time.
3. Paste the live **URL** if you have it.
4. Click **Save**.

The row updates. So does the linked task: it becomes **Done**.

## 8. Confirm on the task

1. Click the task title in the **Linked task** column, or open **Tasks** and choose the task.
2. The card shows the same title, client, and due date.
3. It carries the badge **Created from Social Post** when the app created it for the post.
4. **Linked records** shows the Social Post and its current status.
5. **Activity history** shows the sync, for example
   “Status synced from Social Post: in progress → done.”

That is the audit trail. Nobody needs to update the task by hand after publishing.

## 9. Correct a post

- **Wrong status or date** — change it in the row and click **Save**. The task follows.
- **Wrong URL** — replace it in the row and click **Save**.
- **Wrong title, platform, or caption** — these are set when the post is created. Fix the linked
  task title on the Tasks board, or delete the post and add it again if the record is still
  wrong.
- **Created by mistake** — use **Delete**. The task is kept, and the activity log records that
  the post was removed.

## 10. The habit

Use **Social Posts** for publishing. Use **Tasks** for the work.

- The social team sets the schedule, publishes, and keeps the status honest.
- The rest of the team works from the task and its notes.
- The dashboard and the client page read the same records.

If a post slips, mark it **pending** or **missed** rather than leaving an old **scheduled** date
in place. The status is what the owner reads in the weekly review.
