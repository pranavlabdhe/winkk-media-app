# Social Posts module — training kit

This kit records the Social Posts module from the real application and prepares it for NotebookLM.
It follows the same 14-beat rhythm as the Tasks kit:

> board → filter → create → connect → open → update → verify → recap.

## Run it

The app must already be running at `http://localhost:3000`.

```bash
npm run seed:demo     # only if the demo posts are missing
npm run dev           # in another terminal

npm run training:posts
```

If Playwright reports a missing ffmpeg binary, install its recorder once:

```bash
npx playwright-core install ffmpeg
```

The kit uses the system Google Chrome (`channel: "chrome"`), so no browser download is needed.
The finished MP4 is about 1 minute 42 seconds at 1280 px wide.

Optional environment variables:

| Variable | Default | Use |
|---|---|---|
| `TRAINING_BASE_URL` | `http://localhost:3000` | Record against another environment |
| `TRAINING_EMAIL` | `owner@winkk.media` | Login used for the recording |
| `TRAINING_PASSWORD` | `password123` | Login password |
| `TRAINING_CLIENT` | `Solhaus` | Client used for the example |
| `TRAINING_POST` | `Solhaus Diwali Campaign Reel` | Existing post used for the anatomy steps |
| `TRAINING_NEW_POST` | `Solhaus Diwali Offer Story` | Post created on camera |
| `HEADED=1` | unset | Watch the browser while recording |

## What it produces

```
training/posts/
  posts-storyboard.pdf          NotebookLM-ready screenshot storyboard
  storyboard/
    01-board-overview.png
    ...
    14-recap.png
    timings.json                Step timestamps for voiceover editing
  video/
    posts-walkthrough.webm
    posts-walkthrough.mp4       Companion “watch me do it” recording
  notebooklm/
    01-module-brief.md
    02-step-by-step.md
    03-example-walkthrough.md
    04-faq-and-mistakes.md
    05-notebooklm-prompt.md
    06-voiceover-script.md
    07-video-description.md
```

## The example

The recording uses the seeded Solhaus data:

- **Solhaus Diwali Campaign Reel** — Instagram, scheduled 22 November, linked to a task owned by
  the Social Media Executive.
- **Solhaus Festive Carousel** — Instagram, scheduled 25 November, linked to a task owned by
  Designer 1.

On camera the script adds **Solhaus Diwali Offer Story** for Solhaus, Instagram, scheduled for
17 November at 9:30 am with the caption “Diwali offer ends 24 Nov.” The task field is left on
**Create/link task automatically**, so the app creates the linked task. The post is then
published, the task becomes **Done**, and the task card is shown as proof.

The script deletes the post and the auto-created task (plus their task updates and activity
rows) when it finishes. The seeded demo data is left untouched.

If a recording is interrupted, run:

```bash
npm run seed:demo:reset
npm run seed:demo
```

## NotebookLM steps

1. Create a new notebook named **Social Posts module — Winkk Media Tracker**.
2. Upload:
   - `posts-storyboard.pdf`
   - `notebooklm/01-module-brief.md`
   - `notebooklm/02-step-by-step.md`
   - `notebooklm/03-example-walkthrough.md`
   - `notebooklm/04-faq-and-mistakes.md`
3. Open **Studio → Video Overview**.
4. Choose **Explainer**, English, and 3–4 minutes if available.
5. Paste the instructions from `notebooklm/05-notebooklm-prompt.md`.
6. Generate, review, and regenerate if it invents UI or ignores the screenshots.
7. Download the video and publish it with the MP4 and PDF.

## Quality checklist

- [ ] The video uses **Posts** labels exactly as they appear in the app.
- [ ] The example is Solhaus / Instagram / scheduled 17 November.
- [ ] Adding the post shows the linked task being created automatically.
- [ ] Publishing the post shows the task becoming Done without a second edit.
- [ ] The task card shows **Created from Social Post**, the linked record, and the sync note.
- [ ] The status mapping (scheduled ↔ in progress, published ↔ done) is stated correctly.
- [ ] The video does not claim the app publishes to Instagram.
- [ ] No password, real client contact, or private note appears.
- [ ] The storyboard uses real screenshots, not AI-redrawn UI.
- [ ] The MP4 and NotebookLM video agree on the same 14-step story.
