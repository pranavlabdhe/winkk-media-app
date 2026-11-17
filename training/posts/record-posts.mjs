/**
 * Social Posts module training capture.
 *
 * Produces:
 *   training/posts/storyboard/*.png        annotated screenshots
 *   training/posts/posts-storyboard.pdf    NotebookLM-ready storyboard
 *   training/posts/video/posts-walkthrough.mp4
 *   training/posts/storyboard/timings.json
 *
 * Run the app first (`npm run dev`), then:
 *   npm run training:posts
 *
 * The recording creates one post and lets the app create its linked task, then
 * publishes the post. Both rows are deleted again when the capture ends, so the
 * demo data is left unchanged.
 *
 * Optional environment variables:
 *   TRAINING_BASE_URL    default http://localhost:3000
 *   TRAINING_EMAIL       default owner@winkk.media
 *   TRAINING_PASSWORD    default password123
 *   TRAINING_CLIENT      default "Solhaus"
 *   TRAINING_POST        default "Solhaus Diwali Campaign Reel"   (existing demo post)
 *   TRAINING_NEW_POST    default "Solhaus Diwali Offer Story"     (post created on camera)
 *   HEADED=1             watch the browser while it records
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
const CLIENT_NAME = process.env.TRAINING_CLIENT || "Solhaus";
const DEMO_POST_TITLE = process.env.TRAINING_POST || "Solhaus Diwali Campaign Reel";
const NEW_POST_TITLE = process.env.TRAINING_NEW_POST || "Solhaus Diwali Offer Story";
const NEW_POST_SCHEDULE = "2026-11-17T09:30";
const NEW_POST_PUBLISHED = "2026-11-17T10:00";
const NEW_POST_CAPTION = "Diwali offer ends 24 Nov.";

const VIEWPORT = { width: 1440, height: 900 };
const TOTAL_STEPS = 14;
const PAUSE = 6200;

const db = new Database(path.join(ROOT, "data.sqlite"));
db.pragma("journal_mode = WAL");

const client = db
  .prepare("SELECT id,name FROM clients WHERE name=? ORDER BY id LIMIT 1")
  .get(CLIENT_NAME);
if (!client) {
  console.error(`Client "${CLIENT_NAME}" was not found. Run \`npm run seed:demo\` first.`);
  process.exit(1);
}

function pickDemoPost() {
  let post = db
    .prepare("SELECT * FROM posts WHERE title=? AND client_id=? ORDER BY id LIMIT 1")
    .get(DEMO_POST_TITLE, client.id);
  if (!post) {
    post = db
      .prepare("SELECT * FROM posts WHERE client_id=? AND task_id IS NOT NULL ORDER BY id LIMIT 1")
      .get(client.id);
  }
  return post;
}

const demoPost = pickDemoPost();
if (!demoPost) {
  console.error(
    `No Social Post for ${CLIENT_NAME} was found.\n` +
      "Run `npm run seed:demo` first, or set TRAINING_POST to an existing post title."
  );
  process.exit(1);
}

const baseline = {
  maxPostId: db
    .prepare("SELECT COALESCE(MAX(id),0) m FROM posts WHERE title<>?")
    .get(NEW_POST_TITLE).m,
  maxTaskId: db
    .prepare(
      "SELECT COALESCE(MAX(id),0) m FROM tasks WHERE NOT (origin_module='post' AND title=?)"
    )
    .get(NEW_POST_TITLE).m,
};

let createdPostId = null;
let createdTaskId = null;

/**
 * Remove a previous, interrupted run so the recording starts from clean data.
 * Only rows above the baseline can belong to the capture.
 */
function cleanPreviousRun() {
  const stale = db
    .prepare("SELECT id,task_id FROM posts WHERE title=? AND id>?")
    .all(NEW_POST_TITLE, baseline.maxPostId);
  for (const row of stale) {
    const task = row.task_id
      ? db.prepare("SELECT id,origin_module FROM tasks WHERE id=?").get(row.task_id)
      : null;
    db.prepare("DELETE FROM task_updates WHERE task_id=?").run(row.task_id || 0);
    db.prepare(
      "DELETE FROM activity_log WHERE (entity_type='post' AND entity_id=?) OR task_id=?"
    ).run(row.id, row.task_id || 0);
    db.prepare("DELETE FROM posts WHERE id=?").run(row.id);
    if (task?.origin_module === "post" && task.id > baseline.maxTaskId) {
      db.prepare("DELETE FROM tasks WHERE id=?").run(task.id);
    }
  }
}
cleanPreviousRun();

/** Delete the rows this recording created; the demo data is left untouched. */
function restoreDemoData() {
  const post = createdPostId
    ? db.prepare("SELECT id,task_id FROM posts WHERE id=?").get(createdPostId)
    : db
        .prepare("SELECT id,task_id FROM posts WHERE title=? AND id>? ORDER BY id DESC LIMIT 1")
        .get(NEW_POST_TITLE, baseline.maxPostId);
  const taskId = createdTaskId || post?.task_id || null;

  if (post) {
    db.prepare("DELETE FROM task_updates WHERE task_id=?").run(taskId || 0);
    db.prepare(
      "DELETE FROM activity_log WHERE (entity_type='post' AND entity_id=?) OR task_id=?"
    ).run(post.id, taskId || 0);
    db.prepare("DELETE FROM posts WHERE id=?").run(post.id);
  }
  if (taskId) {
    const task = db.prepare("SELECT id,origin_module FROM tasks WHERE id=?").get(taskId);
    if (task?.origin_module === "post" && task.id > baseline.maxTaskId) {
      db.prepare(
        "DELETE FROM activity_log WHERE entity_type='task' AND entity_id=?"
      ).run(task.id);
      db.prepare("DELETE FROM tasks WHERE id=?").run(task.id);
    }
  }
}

async function cleanOutput() {
  await fs.mkdir(SHOT_DIR, { recursive: true });
  await fs.mkdir(VIDEO_DIR, { recursive: true });
  for (const name of await fs.readdir(SHOT_DIR)) {
    if (name.endsWith(".png")) await fs.unlink(path.join(SHOT_DIR, name));
  }
  for (const name of ["posts-walkthrough.webm", "posts-walkthrough.mp4"]) {
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
let newPost = null;

try {
  // Sign in once, then reuse the session so the video starts on the post board.
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
      node.style.outlineOffset = "2px";
      // The inset ring keeps the highlight visible inside scroll containers.
      node.style.boxShadow =
        "inset 0 0 0 3px rgba(220,38,38,0.55), 0 0 0 9px rgba(220,38,38,0.15)";
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

  async function waitForDb(read, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = read();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return null;
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
  await page.goto(`${BASE_URL}/posts`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Social Media Post Tracking" }).waitFor();
  await shot(
    "board-overview",
    "Every social post lives on one board",
    "The page lists each post with its client, schedule, publish date, status, and the task that owns the work."
  );

  // 2. Status chips
  const chipRow = page.getByRole("link", { name: /^All:/ }).locator("xpath=..");
  await shot(
    "status-chips",
    "Status chips show the publishing picture",
    "Scheduled, Published, Pending, and Missed are counted live, so you can see the week at a glance.",
    chipRow
  );

  // 3. Filter by status
  const scheduledChip = page.getByRole("link", { name: /^Scheduled:/ });
  await Promise.all([
    page.waitForURL(/status=scheduled/, { timeout: 15000 }),
    scheduledChip.click(),
  ]);
  await page.waitForLoadState("networkidle");
  await shot(
    "status-filtered",
    "Click a status to see only those posts",
    "The filter is kept in the URL, so the view can be shared with a teammate or bookmarked."
  );

  // 4. Filter by client
  await page.goto(`${BASE_URL}/posts?client=${client.id}`, { waitUntil: "networkidle" });
  const clientHeading = page.getByRole("heading", { name: "Social Media Post Tracking" });
  await clientHeading.waitFor();
  await shot(
    "client-view",
    `Filtered to ${client.name} — one client's content calendar`,
    `The client page opens this view from its "Social posts" section, so the filter comes from where you started.`
  );

  // 5. One post in focus
  const demoRow = page
    .locator("tbody tr")
    .filter({ hasText: demoPost.title })
    .first();
  await demoRow.waitFor();
  await shot(
    "post-row",
    "Each row is one post, with one owner task",
    `"${demoPost.title}" is scheduled on ${demoPost.platform}, and the same row shows the task behind it.`,
    demoRow.locator("td").nth(1)
  );

  // 6. Linked task cell
  const linkedTaskCell = demoRow.locator("td").nth(5);
  await shot(
    "linked-task",
    "The linked task carries the owner, status, and deadline",
    "The post owns the publishing details; the task owns who does the work and when it is due. Click the task to open it.",
    linkedTaskCell
  );

  // 7. Create form
  const createForm = page
    .locator("form")
    .filter({ has: page.getByPlaceholder("Post title *") })
    .first();
  await shot(
    "create-form",
    "Add a new post without leaving the page",
    "Client, title, status, platform, schedule, publish date, URL, caption, and the task link live in one form.",
    createForm
  );

  // 8. Task choice
  const taskSelect = createForm.locator('select[name="task_id"]');
  await shot(
    "task-choice",
    "Link an existing task — or let the app create one",
    "Leave the field on “Create/link task automatically” and a Social Media task is created for the post.",
    taskSelect
  );

  // 9. Fill the example post
  await createForm.locator('select[name="client_id"]').selectOption(String(client.id));
  await createForm.locator('input[name="title"]').fill(NEW_POST_TITLE);
  await createForm.locator('select[name="status"]').selectOption("scheduled");
  await createForm.locator('input[name="scheduled_at"]').fill(NEW_POST_SCHEDULE);
  await createForm.locator('input[name="caption"]').fill(NEW_POST_CAPTION);
  await shot(
    "create-filled",
    `Example: ${NEW_POST_TITLE}, scheduled for 17 November`,
    "The client is already selected because the page is filtered to that client. One submission saves the post and its task."
  );
  await page.waitForTimeout(1200);

  await Promise.all([
    page.waitForLoadState("networkidle"),
    createForm.getByRole("button", { name: "Add post" }).click(),
  ]);

  newPost = await waitForDb(() =>
    db
      .prepare("SELECT * FROM posts WHERE title=? AND id>? ORDER BY id DESC LIMIT 1")
      .get(NEW_POST_TITLE, baseline.maxPostId)
  );
  if (!newPost) throw new Error("The post was not saved; check the server log.");
  createdPostId = newPost.id;
  createdTaskId = newPost.task_id;

  const newRow = page
    .locator("tbody tr")
    .filter({ hasText: NEW_POST_TITLE })
    .first();
  await newRow.waitFor({ timeout: 15000 });

  // 10. The created row
  await shot(
    "created-row",
    "The post and its task are created together",
    "The new row already shows a linked task with the same title, client, and due date, plus the status it will publish in.",
    newRow.locator("td").nth(1)
  );

  // 11. Publish the post
  const statusSelect = newRow.locator('select[name="status"]');
  await statusSelect.selectOption("published");
  await newRow.locator('input[name="published_at"]').fill(NEW_POST_PUBLISHED);
  await shot(
    "publish",
    "When the post goes live, set it to Published",
    "Add the publish date, then save. The status is what drives the linked task.",
    statusSelect
  );

  await Promise.all([
    page.waitForLoadState("networkidle"),
    newRow.getByRole("button", { name: "Save" }).click(),
  ]);

  const saved = await waitForDb(() => {
    const row = db.prepare("SELECT status,published_at FROM posts WHERE id=?").get(createdPostId);
    return row?.status === "published" ? row : null;
  });
  if (!saved) throw new Error(`Post ${createdPostId} did not reach published.`);

  const publishedRow = page
    .locator("tbody tr")
    .filter({ hasText: NEW_POST_TITLE })
    .first();
  await publishedRow.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);

  // 12. Sync result
  await shot(
    "published-sync",
    "The linked task is marked Done — no second update",
    "Published maps to the task status done. The rows on both modules now tell the same story.",
    publishedRow.locator("td").nth(5)
  );
  await page.waitForTimeout(1200);

  // 13. Confirm on the task board
  const linkedTask = db
    .prepare("SELECT id,title,status,due_date FROM tasks WHERE id=?")
    .get(createdTaskId);
  await page.goto(`${BASE_URL}/tasks?task=${createdTaskId}`, { waitUntil: "networkidle" });
  const taskCard = page
    .locator("div.rounded-lg.border.bg-white.p-4")
    .filter({ hasText: linkedTask.title })
    .first();
  await taskCard.waitFor();
  await shot(
    "task-done",
    "Open the linked task to confirm the same work",
    `Task #${linkedTask.id} is Done, due ${linkedTask.due_date}, and its Linked records section shows the Social Post.`,
    taskCard.getByText("done", { exact: true })
  );

  // 14. Recap
  await page.goto(`${BASE_URL}/posts?client=${client.id}`, { waitUntil: "networkidle" });
  const recapRow = page
    .locator("tbody tr")
    .filter({ hasText: NEW_POST_TITLE })
    .first();
  await shot(
    "recap",
    "One post. One task. One status.",
    "Schedule in Social Posts, publish there, and the task board follows. That is the whole workflow.",
    recapRow.locator("td").nth(1)
  );
  await page.waitForTimeout(2200);

  const timings = {
    post: { id: demoPost.id, title: demoPost.title },
    createdPost: { id: newPost.id, title: newPost.title, taskId: newPost.task_id },
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
  const webmTarget = path.join(VIDEO_DIR, "posts-walkthrough.webm");
  const mp4Target = path.join(VIDEO_DIR, "posts-walkthrough.mp4");
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
        <p class="meta">Screen: ${escapeHtml(step.url || "/posts")} · ${step.atSeconds}s</p>
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
            <h1>Social Posts module<br />walkthrough</h1>
            <p>
              A step-by-step storyboard for the NotebookLM video and the companion
              screen recording. Use it with the module brief, example walkthrough,
              and FAQ in this folder.
            </p>
          </div>
          <div>
            <p><strong>Example post:</strong> ${escapeHtml(demoPost.title)} · ${escapeHtml(client.name)}</p>
            <p><strong>New post recorded:</strong> ${escapeHtml(NEW_POST_TITLE)}</p>
            <p><strong>Audience:</strong> Owner, social media, and account teams</p>
            <p><strong>Run:</strong> npm run training:posts</p>
            <p class="meta">Generated ${new Date().toLocaleString("en-IN")} · ${images.length} steps</p>
          </div>
        </section>
        ${pages}
      </body>
    </html>`,
    { waitUntil: "load" }
  );

  const pdfPath = path.join(OUT_DIR, "posts-storyboard.pdf");
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

console.log("\nDone. Next: open training/posts/README.md.");
