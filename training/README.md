# Winkk Media training videos

This folder contains the production kit for short, module-by-module training videos for the Winkk Media Tracker.

The goal is a consistent series that teaches the **workflow**, not just the buttons. Each module gets:

1. **A NotebookLM source pack** — module brief, step-by-step, example, FAQ, prompt.
2. **An annotated storyboard PDF** — real screenshots in click order.
3. **A screen recording** — the actual application, captured from seeded demo data.
4. **A voiceover script** — simple English, written for the owner and employees.

## Series plan

| # | Module | Status |
|---|---|---|
| 1 | Tasks | ✅ Pilot kit in `training/tasks/` |
| 2 | Dashboard | Planned |
| 3 | Social Posts | ✅ Kit in `training/posts/` |
| 4 | My Work | Planned |
| 5 | Clients | Planned |
| 6 | Feedback | Planned |
| 7 | Communications | Planned |
| 8 | Bloggers | Planned |
| 9 | Meetings | Planned |
| 10 | Team | Planned |
| 11 | End-to-end workflow | Planned |

## Requirements

- The application running locally with the demo dataset.
- Google Chrome installed. The kit uses `playwright-core` with the system Chrome.
- Playwright's recorder ffmpeg: `npx playwright-core install ffmpeg` (one time).
- System `ffmpeg` (`brew install ffmpeg`) for the MP4 conversion and review frames.

## Recommended production flow

1. Run the app with the demo dataset: `npm run seed:demo` and `npm run dev`.
2. Capture the module: `npm run training:tasks` or `npm run training:posts` (more modules will get their own command).
3. Review the screenshots, MP4, and storyboard PDF.
4. Create a NotebookLM notebook for the module and upload:
   - `tasks-storyboard.pdf`
   - `notebooklm/01-module-brief.md`
   - `notebooklm/02-step-by-step.md`
   - `notebooklm/03-example-walkthrough.md`
   - `notebooklm/04-faq-and-mistakes.md`
5. Paste the prompt from `notebooklm/05-notebooklm-prompt.md` into the Video Overview instructions.
6. Generate a 3–4 minute Explainer video.
7. Record the voiceover for the MP4 using `notebooklm/06-voiceover-script.md`, or use the NotebookLM narration.
8. Publish the NotebookLM video, the short screen recording, and the PDF together.

## Important rules

- Use **demo data only**. Do not show live client details or passwords.
- Prefer **names over numbers** in narration; counts change.
- Re-capture after a major UI change. The recording is a snapshot, not a live demo.
- NotebookLM cannot open the application. It only sees the uploaded storyboard and documents.
- The MP4 is the “watch me do it” companion. NotebookLM is the “why and how it connects” explainer.
