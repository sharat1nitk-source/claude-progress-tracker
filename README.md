# Claude Knowledge Assistant

A personal AI knowledge assistant that turns your Claude.ai conversation history into a living, queryable knowledge base. All data stays private on your Google Drive — nothing is committed to this repo.

---

## What It Does

You export your Claude.ai conversations as a ZIP. The system processes them into structured knowledge — decisions made, tasks pending, blockers, insights — grouped by project track. You get:

1. **Focus Brief** — A daily dashboard showing what to work on, ordered by your priorities
2. **Chat** — Ask questions about your own projects; Claude fetches the relevant track details on demand
3. **Exports** — Queue management for processing new exports

---

## Architecture

```
Claude.ai Export ZIP (on Google Drive)
  → GitHub Actions pipeline (daily or manual)
      → knowledge-extractor.js  — one Claude call per conversation
      → knowledge-builder.js    — builds per-track docs + cross-track synthesis
      → digest-generator.js     — generates structured digest JSON
      → kb-output-{email}.json  — bundled output saved to Google Drive

PWA (index.html, hosted on GitHub Pages)
  → Focus Brief tab  — reads digest, shows track cards with priorities
  → Chat tab         — tool-use pattern; Claude fetches full track docs on demand
  → Exports tab      — add ZIPs to queue, pre-creates Drive files via OAuth
```

### Key constraint: personal Google Drive
The service account (used by GitHub Actions) has zero storage quota on personal Drive — it can update files but not create them. The PWA pre-creates all required files via OAuth (user's credentials) before the pipeline runs.

---

## Features

### Focus Brief
- Track cards with status (active / stalling / blocked / completed)
- **User priority control** — ▲/▼ buttons to set high/low priority per track; persists to Drive
- **Sorting** — priority-first (high → normal → low), then by status within
- **Per-track notes** — inline editable note per card; flows into chat and digest generation
- **Re-evaluate button** — regenerates the AI focus text in-browser (~$0.12/click) using your Anthropic API key; reflects current priorities and notes immediately, no pipeline run needed
- **Archive** — hide inactive tracks to a collapsed section
- **Stalling alerts** — tracks inactive for 7+ days flagged automatically

### Chat
- Condensed track list in system prompt (not all full docs)
- `get_track_details(slug)` tool — Claude fetches the full track document on demand
- User priorities and notes visible to Claude in every message
- Priority overrides via chat ("focus on X") saved to `kb-priorities.json` for next pipeline run

### Pipeline
- Delta processing — SHA256 hashing skips unchanged conversations
- State migration — auto-detects old state entries missing knowledge data and re-extracts
- Queue dedup — only the latest entry per ZIP is processed
- Input condensing — track docs trimmed to essentials before digest generation (prevents token overflow with many tracks)
- Logged input/output token estimates per run for diagnosability

### Persistence (Google Drive)
| File | Purpose |
|------|---------|
| `process-queue.json` | Export processing queue |
| `processed_conversations-{email}.json` | Delta state per user |
| `kb-output-{email}.json` | Bundled KB: full track docs + synthesis + digest |
| `kb-settings.json` | Archived tracks, user-set track priorities, track notes |
| `kb-priorities.json` | Priority override statements from Chat tab |

---

## Setup

See `OAUTH_SETUP.md` and `SETUP_CHECKLIST.md` for step-by-step instructions.

### GitHub Secrets required
- `GOOGLE_DRIVE_CREDENTIALS` — Service account JSON (base64 or raw)
- `GOOGLE_DRIVE_FOLDER_ID` — Drive folder ID
- `ANTHROPIC_API_KEY` — From console.anthropic.com

### PWA Settings (configured in-app, stored in localStorage)
- Google OAuth Client ID
- Google Drive Folder ID
- Anthropic API Key (for Chat tab and Re-evaluate)

---

## Day-to-Day Usage

1. Export your Claude.ai conversations (Settings → Export data)
2. Open PWA → Exports tab → add the ZIP to queue (this pre-creates required Drive files)
3. Trigger the GitHub Actions workflow (or wait for the daily 2 AM UTC run)
4. Refresh PWA → Focus Brief shows your knowledge base
5. Use ▲/▼ to tune priorities; click Re-evaluate to regenerate the focus text immediately
6. Add notes to tracks to give the AI more context about what matters
7. Chat to ask questions about your projects

---

## Known Gaps / Limitations

- **No chat history persistence** — chat history is in-memory only; refreshing starts a new session
- **Retry button UI** — clicking Retry on a failed export shows a popup but the status badge doesn't update immediately (the retry does work; it's a display timing issue)
- **Re-evaluate cost** — ~$0.12 per click; no budget cap or confirmation dialog
- **Single user** — designed for personal use; multiple users share the same Drive folder
- **No streaming** — chat responses appear all at once after the full response is ready
- **Cross-device API key** — Anthropic API key is localStorage only (intentional — it's a secret); must be re-entered per device

---

## Potential Future Enhancements

- Chat history persisted to Drive (cross-device conversation continuity)
- Streaming chat responses
- Manual track creation / merging tracks the AI split incorrectly
- Export scheduling (auto-trigger when new ZIP detected in Drive)
- Budget cap / confirmation on Re-evaluate button
- Track-level conversation history view in the PWA
- Mobile-optimized layout improvements
