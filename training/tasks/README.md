# Tasks module — training kit

This kit records the Tasks module from the real application and prepares it for NotebookLM.

## Run it

The app must already be running at `http://localhost:3000`.

```bash
npm run seed:demo     # only if the demo task is missing
npm run dev           # in another terminal

npm run training:tasks
```

If Playwright reports a missing ffmpeg binary, install its recorder once:

```bash
npx playwright-core install ffmpeg
```

The kit uses the system Google Chrome (`channel: "chrome"`), so no browser download is needed.
The finished MP4 is about 1 minute 40 seconds at 1280 px wide.

Optional environment variables:

| Variable | Default | Use |
|---|---|---|
| `TRAINING_BASE_URL` | `http://localhost:3000` | Record against another environment |
| `TRAINING_EMAIL` | `owner@winkk.media` | Login used for the recording |
| `TRAINING_PASSWORD` | `password123` | Login password |
| `TRAINING_TASK` | `Solhaus Diwali Campaign Reel` | Task used in the example |
| `HEADED=1` | unset | Watch the browser while recording |

## What it produces

```
training/tasks/
  tasks-storyboard.pdf          NotebookLM-ready screenshot storyboard
  storyboard/
    01-board-overview.png
    ...
    13-recap.png
    timings.json                Step timestamps for voiceover editing
  video/
    tasks-walkthrough.webm
    tasks-walkthrough.mp4       Companion “watch me do it” recording
  notebooklm/
    01-module-brief.md
    02-step-by-step.md
    03-example-walkthrough.md
    04-faq-and-mistakes.md
    05-notebooklm-prompt.md
    06-voiceover-script.md
    07-video-description.md
```

The recording temporarily marks the example task as **Done**, so the video shows the linked Social Post becoming **Published**. The script restores the original task and module statuses, and removes the training activity entries, when it finishes. If a recording is interrupted, run `npm run seed:demo` to return the demo dataset to its normal state.

## NotebookLM steps

1. Create a new notebook named **Tasks module — Winkk Media Tracker**.
2. Upload:
   - `tasks-storyboard.pdf`
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

- [ ] The video uses **Tasks** labels exactly as they appear in the app.
- [ ] The example is Solhaus / Social Media / In progress.
- [ ] The linked Social Post is shown as connected, not as a duplicate.
- [ ] The status change explains that the post updates automatically.
- [ ] No password, real client contact, or private note appears.
- [ ] The storyboard uses real screenshots, not AI-redrawn UI.
- [ ] The MP4 and NotebookLM video agree on the same 13-step story.
