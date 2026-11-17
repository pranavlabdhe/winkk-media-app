/**
 * Tasks module training capture.
 *
 * Produces:
 *   training/tasks/storyboard/*.png       annotated screenshots
 *   training/tasks/tasks-storyboard.pdf   NotebookLM-ready storyboard
 *   training/tasks/video/tasks-walkthrough.mp4
 *   training/tasks/storyboard/timings.json
 *
 * Run the app first (`npm run dev`), then:
 *   npm run training:tasks
 *
 * Optional environment variables:
 *   TRAINING_BASE_URL   default http://localhost:3000
 *   TRAINING_EMAIL      default owner@winkk.media
 *   TRAINING_PASSWORD   default password123
 *   TRAINING_TASK       default "Solhaus Diwali Campaign Reel"
 *   HEADED=1            watch the browser while it records
 */
import path from "node:path";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import Database from "better-sqlite3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT_DIR = HERE;
const SHOT_DIR = path.join(OUT_DIR, "storyboard");
const VIDEO_DIR = path.join(OUT_DIR, "video");
const RAW_VIDEO_DIR = path.join(VIDEO_DIR, "raw");

const BASE_URL = process.env.TRAINING_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.TRAINING_EMAIL || "owner@winkk.media";
const PASSWORD = process.env.TRAINING_PASSWORD || "password123";
const HEADLESS = process.env.HEADED !== "1";
const DEMO_TASK_TITLE = process.env.TRAINING_TASK || "Solhaus Diwali Campaign Reel";

const VIEWPORT = { width: 1440, height: 900 };
const TOTAL_STEPS = 13;
const PAUSE = 6500;

const db = new Database(path.join(ROOT, "data.sqlite"));
db.pragma("journal_mode = WAL");

function pickDemoTask() {
  let task = db
    .prepare("SELECT * FROM tasks WHERE title=? ORDER BY id LIMIT 1")
    .get(DEMO_TASK_TITLE);
  let post = task
    ? db.prepare("SELECT * FROM posts WHERE task_id=? ORDER BY id LIMIT 1").get(task.id)
    : null;

  if (!task || !post) {
    const fallback = db
      .prepare(
        `SELECT t.* FROM tasks t
         JOIN posts p ON p.task_id=t.id
         ORDER BY t.id LIMIT 1`
      )
      .get();
    if (fallback) {
      task = fallback;
      post = db.prepare("SELECT * FROM posts WHERE task_id=? ORDER BY id LIMIT 1").get(task.id);
    }
  }

  return { task, post };
}

const { task, post } = pickDemoTask();
if (!task || !post) {
  console.error(
    "No task with a linked Social Post was found.\n" +
      "Run `npm run seed:demo` first, or set TRAINING_TASK to a task title that has a linked post."
  );
  process.exit(1);
}

// Remember the original state so the walkthrough can be reverted after recording.
const original = {
  task: { status: task.status, updated_at: task.updated_at },
  posts: db.prepare("SELECT id,status,published_at FROM posts WHERE task_id=?").all(task.id),
  feedback: db.prepare("SELECT id,action_status FROM feedback WHERE task_id=?").all(task.id),
  communications: db.prepare("SELECT id,status FROM communications WHERE task_id=?").all(task.id),
  assignments: db
    .prepare("SELECT id,assignment_status,completion_status FROM blogger_assignments WHERE task_id=?")
    .all(task.id),
  meetings: db.prepare("SELECT id,status FROM meetings WHERE task_id=?").all(task.id),
  maxTaskUpdateId:
    db.prepare("SELECT COALESCE(MAX(id),0) m FROM task_updates").get().m,
  maxActivityId:
    db.prepare("SELECT COALESCE(MAX(id),0) m FROM activity_log").get().m,
};

function restoreDemoData() {
  db.prepare("UPDATE tasks SET status=?, updated_at=? WHERE id=?").run(
    original.task.status,
    original.task.updated_at,
    task.id
  );
  for (const row of original.posts) {
    db.prepare("UPDATE posts SET status=?, published_at=? WHERE id=?").run(
      row.status,
      row.published_at,
      row.id
    );
  }
  for (const row of original.feedback) {
    db.prepare("UPDATE feedback SET action_status=? WHERE id=?").run(
      row.action_status,
      row.id
    );
  }
  for (const row of original.communications) {
    db.prepare("UPDATE communications SET status=? WHERE id=?").run(row.status, row.id);
  }
  for (const row of original.assignments) {
    db.prepare(
      "UPDATE blogger_assignments SET assignment_status=?, completion_status=? WHERE id=?"
    ).run(row.assignment_status, row.completion_status, row.id);
  }
  for (const row of original.meetings) {
    db.prepare("UPDATE meetings SET status=? WHERE id=?").run(row.status, row.id);
  }
  db.prepare("DELETE FROM task_updates WHERE task_id=? AND id>?").run(
    task.id,
    original.maxTaskUpdateId
  );
  db.prepare("DELETE FROM activity_log WHERE task_id=? AND id>?").run(
    task.id,
    original.maxActivityId
  );
}

async function cleanOutput() {
  await fs.mkdir(SHOT_DIR, { recursive: true });
  await fs.mkdir(VIDEO_DIR, { recursive: true });
  for (const name of await fs.readdir(SHOT_DIR)) {
    if (name.endsWith(".png")) await fs.unlink(path.join(SHOT_DIR, name));
  }
  for (const name of ["tasks-walkthrough.webm", "tasks-walkthrough.mp4"]) {
    await fs.rm(path.join(VIDEO_DIR, name), { force: true });
  }
  await fs.rm(RAW_VIDEO_DIR, { recursive: true, force: true });
}

await cleanOutput();

const browser = await chromium.launch({
  channel: "chrome",
  headless: HEADLESS,
});

let recordedVideoPath = null;
let steps = [];

try {
  // Sign in once, then reuse the session so the video starts on the task board.
  const authContext = await browser.newContext({ viewport: VIEWPORT });
  const authPage = await authContext.newPage();
  await authPage.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await authPage.fill('input[name="email"]', EMAIL);
  await authPage.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    authPage.waitForURL(/\/(dashboard|my-work)/),
    authPage.getByRole("button", { name: "Sign in" }).click(),
  ]);
  const storageState = await authContext.storageState();
  await authContext.close();

  const context = await browser.newContext({
    storageState,
    viewport: VIEWPORT,
    recordVideo: { dir: RAW_VIDEO_DIR, size: VIEWPORT },
  });
  await context.addInitScript(() => {
    // The Next.js dev indicator lives in a shadow root; hide its host element.
    // Next replaces <head> during hydration, so keep re-adding the style.
    setInterval(() => {
      if (document.getElementById("training-hide-dev") || !document.head) return;
      const style = document.createElement("style");
      style.id = "training-hide-dev";
      style.textContent = "nextjs-portal{display:none!important}";
      document.head.appendChild(style);
    }, 250);
  });
  const page = await context.newPage();
  const video = page.video();
  const startedAt = Date.now();

  async function clearHighlight() {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("[data-training-highlight]")) {
        el.removeAttribute("data-training-highlight");
        el.style.outline = "";
        el.style.outlineOffset = "";
        el.style.boxShadow = "";
      }
    });
  }

  async function highlight(locator) {
    await clearHighlight();
    const element = await locator.first().elementHandle();
    if (!element) return;
    await element.evaluate((node) => {
      node.setAttribute("data-training-highlight", "1");
      node.style.outline = "4px solid #dc2626";
      node.style.outlineOffset = "4px";
      node.style.boxShadow = "0 0 0 9px rgba(220,38,38,0.15)";
      node.scrollIntoView({ block: "center", behavior: "instant" });
    });
    await page.waitForTimeout(350);
  }

  async function setCaption(step, caption) {
    await page.evaluate(
      ({ step, total, caption }) => {
        document.getElementById("training-caption")?.remove();
        const bar = document.createElement("div");
        bar.id = "training-caption";
        bar.style.cssText =
          "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;" +
          "background:#ffffff;border-top:2px solid #111111;padding:11px 18px;" +
          "font:600 15px Arial,Helvetica,sans-serif;color:#111111;" +
          "display:flex;justify-content:space-between;align-items:center;gap:18px;";
        const left = document.createElement("span");
        left.textContent = caption;
        const right = document.createElement("span");
        right.textContent = `Step ${step} of ${total}`;
        right.style.fontWeight = "400";
        bar.append(left, right);
        document.body.appendChild(bar);
      },
      { step, caption, total: TOTAL_STEPS }
    );
  }

  async function shot(name, caption, note, target) {
    const step = steps.length + 1;
    await page.evaluate(() => {
      if (document.getElementById("training-hide-dev") || !document.head) return;
      const style = document.createElement("style");
      style.id = "training-hide-dev";
      style.textContent = "nextjs-portal{display:none!important}";
      document.head.appendChild(style);
    });
    if (target) await highlight(target);
    else await clearHighlight();
    await setCaption(step, caption);
    await page.waitForTimeout(PAUSE);
    const file = `${String(step).padStart(2, "0")}-${name}.png`;
    await page.screenshot({ path: path.join(SHOT_DIR, file) });
    steps.push({
      file,
      caption,
      note,
      atSeconds: Math.round(((Date.now() - startedAt) / 1000) * 10) / 10,
      url: page.url().replace(BASE_URL, ""),
    });
  }

  // 1. Board overview
  await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Client-wise Task Board" }).waitFor();
  await shot(
    "board-overview",
    "Every piece of work starts as a task",
    "The task board shows client, owner, category, due date, status, and linked records."
  );

  // 2. Filters
  const filterForm = page.locator('form[method="get"]').first();
  await shot(
    "filters",
    "Filter by client, teammate, category, or status",
    "Use the filter row to find the work you need without leaving the board.",
    filterForm
  );

  await filterForm.locator('select[name="client"]').selectOption({ label: "Solhaus" });
  await filterForm.locator('select[name="category"]').selectOption("social_media");
  await filterForm.locator('select[name="status"]').selectOption("in_progress");
  await shot(
    "filters-filled",
    "Example: Solhaus + Social Media + In progress",
    "Filters combine with AND logic, so the result is a precise slice of the board.",
    filterForm
  );

  await Promise.all([
    page.waitForURL(/client=/, { timeout: 15000 }),
    filterForm.getByRole("button", { name: "Apply filters" }).click(),
  ]);
  await page.waitForLoadState("networkidle");
  await shot(
    "filtered-results",
    "Only matching tasks remain",
    "The active filters are visible above the board and can be cleared at any time."
  );

  await Promise.all([
    page.waitForURL(`${BASE_URL}/tasks`, { timeout: 15000 }),
    page.getByRole("link", { name: "Clear" }).click(),
  ]);
  await page.waitForLoadState("networkidle");

  // 3. Create form
  const createForm = page
    .locator("form")
    .filter({ has: page.getByPlaceholder("Task title *") })
    .first();
  await shot(
    "create-task",
    "Create the task once — the category connects the right module",
    "Choose a category such as Social Media, Feedback, Client Communication, Blogger, or Meeting.",
    createForm
  );

  await shot(
    "link-existing",
    "Already have a post or meeting? Link it instead of duplicating",
    "The link field reuses an existing record; leaving it blank lets the app create one.",
    createForm.locator('select[name="linked_record"]')
  );

  // 4. One task in focus
  await page.goto(`${BASE_URL}/tasks?task=${task.id}`, { waitUntil: "networkidle" });
  const card = page
    .locator("div.rounded-lg.border.bg-white.p-4")
    .filter({ has: page.getByText(task.title, { exact: true }) })
    .first();
  await card.waitFor();
  await shot(
    "task-card",
    "A task carries the owner, client, category, deadline, and status",
    "This single record is the source of truth for the work and its history.",
    card
  );

  const linkedSection = card.getByText("Linked records", { exact: true }).locator("xpath=..");
  await shot(
    "linked-records",
    "Linked records stay connected to the same task",
    "The Social Post shown here is the same activity, not a duplicate.",
    linkedSection
  );

  const activitySection = card.getByText("Activity history", { exact: true }).locator("xpath=..");
  await shot(
    "activity-history",
    "Activity history shows who changed what",
    "Every status move and note becomes part of the shared timeline.",
    activitySection
  );

  // 5. Status update and automatic sync
  const statusSelect = card.locator('select[name="status"]');
  await statusSelect.selectOption("done");
  await shot(
    "status-change",
    "Move the task to Done when the work is finished",
    "Status, assignee, category, and due date can be updated in one place.",
    statusSelect
  );

  await card.getByRole("button", { name: "Update" }).click();
  await page.waitForTimeout(1800);
  await page.waitForLoadState("networkidle");

  const updatedCard = page
    .locator("div.rounded-lg.border.bg-white.p-4")
    .filter({ has: page.getByText(task.title, { exact: true }) })
    .first();
  await updatedCard.waitFor();
  await shot(
    "sync-result",
    "The linked Social Post is now published automatically",
    "Task status drives the connected module status, so there is no second update to make.",
    updatedCard.getByText(/Social Post:/).first()
  );
  await page.waitForTimeout(2500);

  await shot(
    "status-activity",
    "The change is recorded in the task timeline",
    "Open the client timeline later to see the same update in context.",
    updatedCard.getByText("Activity history", { exact: true }).locator("xpath=..")
  );

  // 6. Back to the board
  await Promise.all([
    page.waitForURL(`${BASE_URL}/tasks`, { timeout: 15000 }),
    page.getByRole("link", { name: "Show all tasks" }).click(),
  ]);
  await page.waitForLoadState("networkidle");
  await shot(
    "recap",
    "One task. One update. Everywhere.",
    "Use Tasks as the single place to create, connect, and update client work."
  );
  await page.waitForTimeout(2500);

  const timings = {
    task: { id: task.id, title: task.title },
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    steps,
  };
  await fs.writeFile(
    path.join(SHOT_DIR, "timings.json"),
    JSON.stringify(timings, null, 2)
  );

  await context.close();
  recordedVideoPath = await video.path();

  console.log(`\nCaptured ${steps.length} screenshots.`);
  console.log(`Video: ${recordedVideoPath}`);
} finally {
  restoreDemoData();
  await browser.close();
  db.close();
}

if (recordedVideoPath) {
  const webmTarget = path.join(VIDEO_DIR, "tasks-walkthrough.webm");
  const mp4Target = path.join(VIDEO_DIR, "tasks-walkthrough.mp4");
  await fs.rename(recordedVideoPath, webmTarget);

  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        webmTarget,
        "-vf",
        "scale=1280:-2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        mp4Target,
      ],
      { stdio: "inherit" }
    );
    console.log(`MP4: ${mp4Target}`);
  } catch (error) {
    console.warn("ffmpeg conversion failed; the WebM recording is still available.", error);
  }

  await fs.rm(RAW_VIDEO_DIR, { recursive: true, force: true });
}

// Build the storyboard PDF from the captured screenshots.
const pdfBrowser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const storyboardPage = await pdfBrowser.newPage();
  const images = await Promise.all(
    steps.map(async (step) => {
      const data = await fs.readFile(path.join(SHOT_DIR, step.file));
      return { ...step, dataUri: `data:image/png;base64,${data.toString("base64")}` };
    })
  );

  const pages = images
    .map(
      (step, index) => `
      <section class="page">
        <div class="step">Step ${index + 1} of ${images.length}</div>
        <h2>${escapeHtml(step.caption)}</h2>
        <img src="${step.dataUri}" alt="${escapeHtml(step.caption)}" />
        <p class="note">${escapeHtml(step.note)}</p>
        <p class="meta">Screen: ${escapeHtml(step.url || "/tasks")} · ${step.atSeconds}s</p>
      </section>`
    )
    .join("");

  await storyboardPage.setContent(
    `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
          .cover {
            min-height: 297mm; padding: 24mm; page-break-after: always;
            display: flex; flex-direction: column; justify-content: space-between;
          }
          .cover .brand { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; }
          .cover h1 { font-size: 38px; line-height: 1.1; margin: 0 0 12px; }
          .cover p { font-size: 15px; line-height: 1.5; max-width: 150mm; }
          .cover .meta { font-size: 12px; color: #555; }
          .page {
            min-height: 297mm; padding: 14mm; page-break-after: always;
            display: flex; flex-direction: column;
          }
          .step { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #666; }
          h2 { font-size: 20px; margin: 6px 0 10px; }
          img { width: 100%; border: 1px solid #bbb; display: block; }
          .note { font-size: 13px; line-height: 1.45; margin: 10px 0 4px; }
          .meta { font-size: 10px; color: #777; margin-top: auto; }
        </style>
      </head>
      <body>
        <section class="cover">
          <div>
            <div class="brand">Winkk Media · Training</div>
            <h1>Tasks module<br />walkthrough</h1>
            <p>
              A step-by-step storyboard for the NotebookLM video and the companion
              screen recording. Use it with the module brief, example walkthrough,
              and FAQ in this folder.
            </p>
          </div>
          <div>
            <p><strong>Example task:</strong> ${escapeHtml(task.title)}</p>
            <p><strong>Audience:</strong> Owner and employees</p>
            <p><strong>Run:</strong> npm run training:tasks</p>
            <p class="meta">Generated ${new Date().toLocaleString("en-IN")} · ${images.length} steps</p>
          </div>
        </section>
        ${pages}
      </body>
    </html>`,
    { waitUntil: "load" }
  );

  const pdfPath = path.join(OUT_DIR, "tasks-storyboard.pdf");
  await storyboardPage.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  console.log(`Storyboard PDF: ${pdfPath}`);
} finally {
  await pdfBrowser.close();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

console.log("\nDone. Next: open training/tasks/README.md.");
