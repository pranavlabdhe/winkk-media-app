# Winkk Media Task Tracker

A client-wise task and activity tracker for the Winkk Media team. Built with Next.js, TypeScript, Tailwind CSS, and SQLite.

## Recommended way to work

1. **Every activity is a task.** Link each task to a client, a work category, an assignee, a due date, and a status (`To do`, `In progress`, `Done`).
2. **Employees start from My Work.** It shows only their tasks, due dates, activity history, and the tasks they have assigned to teammates.
3. **Owner starts from Dashboard.** It shows team workload, overdue tasks, posts needing attention, client feedback, communication delays, and upcoming meetings.
4. **Use client teams.** Each client page lists the assigned team so everyone knows who owns that account.
5. **Update as you go.** Change task status and add a short note. This creates a permanent activity history.
6. **Review exceptions weekly.** Owner should review overdue tasks, missed posts, pending feedback, and delayed WhatsApp responses.

## Seeded team accounts

All seeded accounts use `password123` initially. Change passwords from **Team** after first login.

| Person | Email | Role |
|---|---|---|
| Owner | `owner@winkk.media` | Owner |
| Social Media Executive | `social@winkk.media` | Employee |
| Designer 1 | `designer1@winkk.media` | Employee |
| Designer 2 | `designer2@winkk.media` | Employee |
| Marketing Strategist | `strategy@winkk.media` | Employee |

Existing real accounts are preserved. Owners can rename seeded accounts, change job titles/departments, reset passwords, or deactivate accounts from **Team**.

## Seeded clients

- Solhaus
- Grill Master
- Rasraj

The Social Media Executive and Marketing Strategist are initially assigned to all three clients. Designers can be assigned per client from each client page.

## Demo data

The app ships with a demo seeder that builds a fully connected dataset so you can try every workflow immediately. It is idempotent, so running it again does not create duplicates.

```bash
npm run seed:demo          # create the demo dataset
npm run seed:demo:reset    # remove only the demo records
```

The seeded scenario covers:

- **Task → modules:** a Solhaus Diwali reel task with a linked Instagram post and a client communication.
- **Post → task:** a Solhaus festive carousel created in Social Posts with its own linked task.
- **Task only:** an overdue Grill Master photoshoot assigned to a designer.
- **Post → feedback + communication:** a published Grill Master menu post with client feedback and a weekly check-in thread.
- **Blogger collaboration:** a StyleByNeha assignment linked to a blogger task.
- **Meetings:** an upcoming Solhaus review and a completed Grill Master debrief, each with a follow-up task linked back to the meeting.
- **Feedback on an existing post:** logo-size feedback on the Rasraj Christmas post, plus a related communication.

Every record is linked through the same task, so status, ownership, deadline, and activity appear in both the module page and the task board. Use the **Linked records** badges and **?task=** filters to jump between them, and open **Clients → Solhaus** or **Dashboard** to see the unified activity timeline.

## Modules

- **My Work** — personal task queue and activity updates
- **Dashboard** — owner overview or employee personal summary
- **Clients** — client hub with assigned team, tasks, posts, feedback, communication, bloggers, and meetings
- **Tasks** — client-wise task board with category, assignee, due date, status, and activity history
- **Social Posts** — scheduled, published, pending, and missed Instagram posts
- **Feedback** — client feedback/reviews, action status, and update history
- **Communications** — WhatsApp group response tracking and missed/delayed response visibility
- **Bloggers** — blogger assignments, collaboration dates, and completion status
- **Meetings** — owner’s client meeting calendar and discussion notes
- **Team** — owner-only team management, workload, roles, job titles, departments, and account status

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Data is stored in `data.sqlite` in the project root and is ignored by git.

## Build

```bash
npm run build
```
