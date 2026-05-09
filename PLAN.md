# Claude Personal Knowledge Assistant — Build Plan

## What We're Building

A personal AI assistant that:
- Processes all Claude.ai chat exports into a living knowledge base
- Generates a rich visual brief (priorities, status, focus recommendation across all tracks)
- Answers natural language questions using full knowledge of your chat history
- Accessible from mobile and desktop via PWA

**Not a metadata dashboard.** An AI that has internalized your conversation history and reasons across all of it.

---

## Privacy Model

- GitHub repo is **public** (code only, no data ever)
- All conversation content, extracted knowledge, summaries → **Google Drive only** (private)
- GitHub Actions runs code, never logs conversation content
- API keys in GitHub Secrets
- Trigger processing manually from GitHub Actions UI (no automation needed)

---

## Architecture

```
Claude.ai export ZIP → upload to Google Drive
        ↓
Trigger GitHub Actions manually (or on schedule)
        ↓
Processing pipeline (runs in Actions):
  1. Per-conversation deep extraction  →  Claude Haiku API
  2. Cross-conversation synthesis      →  Claude Sonnet API  
  3. Visual digest generation          →  Claude Sonnet API
        ↓
All outputs written to Google Drive (private)
        ↓
PWA reads from Drive
  Tab 1: Visual Brief   — digest, priorities, track status
  Tab 2: Chat           — ask anything, answered from knowledge base
```

---

## Data on Google Drive

### Input
- `exports/claude-export-{date}.zip` — user uploads manually

### Internal state
- `processed-state-{email}.json` — content hashes for delta processing (skip unchanged conversations)

### Knowledge base outputs
- `knowledge-base/tracks/{slug}.md` — living document per track
- `knowledge-base/meta/synthesis.md` — cross-track connections and priority matrix
- `knowledge-base/digest-{email}.json` — structured JSON consumed by PWA visual brief

---

## File Structure

```
src/
  drive-api.js           KEEP (update file path constants)
  state-manager.js       KEEP (delta processing, unchanged)
  knowledge-extractor.js NEW  (replaces claude-api.js)
  knowledge-builder.js   NEW  (builds track docs + synthesis)
  digest-generator.js    NEW  (generates visual digest JSON)
  process.js             REWRITE (new pipeline)
index.html               REWRITE (visual brief + chat)
service-worker.js        KEEP
manifest.json            KEEP
.github/workflows/
  process-conversations.yml  UPDATE (point to new process.js pipeline)
```

---

## Step 1 — Knowledge Extraction (`src/knowledge-extractor.js`)

One Claude API call per conversation. Model: `claude-haiku-4-5-20251001` (fast, cheap).

**Input:** conversation name, created_at, updated_at, summary (or first ~2000 chars of messages), list of known track names.

**Output JSON per conversation:**
```json
{
  "track": "Career Transition",
  "conversation_type": "planning|research|execution|decision|reflection",
  "narrative_summary": "2-3 sentence summary of what happened in this conversation",
  "decisions_made": ["decided to target ML engineering roles"],
  "plans_created": ["6-month learning roadmap outlined"],
  "tasks_completed": ["finished Python basics module"],
  "tasks_pending": ["build a portfolio project"],
  "blockers": ["unclear whether to do AWS or GCP cert first"],
  "open_questions": ["should I go full-time study or part-time?"],
  "key_insights": ["ML roles require more math prep than expected"],
  "connections_to": ["AI Learning — math prerequisites overlap"],
  "status": "active|parked|blocked|completed",
  "importance": "high|medium|low",
  "progress_narrative": "one sentence on where things stand"
}
```

**Delta processing:** reuse `state-manager.js` — skip conversations where SHA256 hash of (name + summary) is unchanged since last run.

---

## Step 2 — Knowledge Builder (`src/knowledge-builder.js`)

After all conversations extracted, build track documents and synthesis. Model: `claude-sonnet-4-6`.

### Track document per track — `knowledge-base/tracks/{slug}.md`

```markdown
# {Track Name}
Last updated: {timestamp} | Status: active|stalling|blocked

## Current State
{2-3 sentence narrative of where this track stands right now}

## Decisions Made
- {decision} — {conversation name}, {date}

## Plans & Goals
- {plan} — {status: in progress|not started|completed}

## Completed
- {task} ({date})

## Pending Tasks
- {task}

## Blockers
- {blocker}

## Open Questions
- {question}

## Key Insights
- {insight}

## Connections to Other Tracks
- {other track}: {how they connect}

## Conversation History (chronological)
| Date | Conversation | Summary |
|------|-------------|---------|
| {date} | {name} | {narrative_summary} |
```

### Synthesis — `knowledge-base/meta/synthesis.md`

Single Claude Sonnet call with all track summaries as input. Output:

```markdown
# Cross-Track Synthesis
Last updated: {timestamp}

## Overall Picture
{paragraph — where things stand across all tracks}

## Track Health
| Track | Status | Last Active | Open Tasks | Blockers |
|-------|--------|-------------|------------|----------|

## Cross-Track Dependencies
- {track A} depends on {track B}: {why}

## Priority Matrix (ranked)
1. {action} — Track: {name} — Why: {reason}
2. ...

## Connections & Themes
- {observation}
```

---

## Step 3 — Digest Generator (`src/digest-generator.js`)

One Claude Sonnet call with all track docs + synthesis as input. Outputs structured JSON for the PWA.

**Output: `knowledge-base/digest-{email}.json`**
```json
{
  "generated_at": "ISO timestamp",
  "focus_recommendation": "2-3 sentences on what to focus on right now and why",
  "tracks": [
    {
      "name": "Career Transition",
      "slug": "career-transition",
      "status": "active|stalling|blocked|completed",
      "status_reason": "one sentence why this status",
      "current_focus": "one sentence on what is actively being worked",
      "progress_summary": "short paragraph",
      "top_priorities": [
        { "action": "...", "why": "...", "urgency": "high|medium|low" },
        { "action": "...", "why": "...", "urgency": "high|medium|low" },
        { "action": "...", "why": "...", "urgency": "high|medium|low" }
      ],
      "blockers": ["..."],
      "recent_wins": ["..."],
      "days_since_active": 3
    }
  ],
  "cross_track_priorities": [
    { "rank": 1, "action": "...", "track": "...", "why": "...", "urgency": "high" },
    { "rank": 2, "action": "...", "track": "...", "why": "...", "urgency": "high" },
    { "rank": 3, "action": "...", "track": "...", "why": "...", "urgency": "medium" }
  ],
  "connections": [
    "Completing X in AI Learning unblocks the Career Transition portfolio requirement"
  ],
  "stalling_tracks": ["Home Lab Setup — 12 days inactive, 3 open tasks"]
}
```

---

## Step 4 — Pipeline (`src/process.js`)

```
1. Auth (Drive service account)
2. Load process-queue.json from Drive
3. For each pending export:
   a. Download + extract ZIP → conversations.json
   b. Load processed-state-{email}.json
   c. For each new/changed conversation → knowledge-extractor.js
   d. Save updated processed-state to Drive
   e. knowledge-builder.js → write track docs + synthesis to Drive
   f. digest-generator.js → write digest-{email}.json to Drive
   g. Mark export complete in queue
4. Log counts only (no conversation content in logs)
```

---

## Step 5 — PWA (`index.html`)

Three tabs. Single HTML file, vanilla JS.

### Tab 1: Focus Brief (default)

**Hero — always visible at top:**
```
What to Focus On
{focus_recommendation text}
─────────────────────────
Last updated: {timestamp}   [↺ Go to GitHub Actions to refresh]
```

**Track cards** (sorted: blocked first, then stalling, then active):
```
● Career Transition                              [ACTIVE]
  {current_focus}
  
  Top Priorities:
  1. {action}  ▲ HIGH
  2. {action}  ● MED
  3. {action}  ▼ LOW

  ⚠ Blocked: {blocker}        ← only if exists
  Last active: 2 days ago
```

**Cross-Track Priorities section:**
```
Across All Tracks
  #1  {action}                [Career Transition]  ▲ HIGH
      {why}
  #2  ...
```

**Connections section** (if any):
```
Linked
  • Completing X in AI Learning unblocks your Career Transition portfolio
```

**Stalling alert** (if any):
```
⚠ Needs Attention
  • Home Lab Setup — no activity for 12 days, 3 open tasks
```

### Tab 2: Chat

Simple conversational interface. On each question:
1. Load `digest-{email}.json` from Drive (cache 1hr)
2. Load `knowledge-base/meta/synthesis.md` from Drive (text)
3. Load track docs for tracks mentioned in question (or all if ≤ 5 tracks)
4. Send to `claude-sonnet-4-6` with system prompt:
   ```
   You are a personal assistant with complete knowledge of the user's projects,
   plans, decisions, and progress — derived from their Claude.ai conversation history.
   Answer questions concisely and specifically. Reference actual decisions, plans,
   or conversations when relevant. If you don't know something, say so.
   ```
5. Stream response into chat UI

Chat history kept in memory only (session-scoped, not persisted).

### Tab 3: Exports

Keep existing queue management UI. Update Drive file path references to match new structure.

---

## Model Usage & Estimated Cost

| Step | Model | Per run |
|------|-------|---------|
| Conversation extraction | claude-haiku-4-5-20251001 | ~$0.001 per new conversation |
| Track synthesis | claude-sonnet-4-6 | ~$0.01 flat |
| Digest generation | claude-sonnet-4-6 | ~$0.01 flat |
| Chat question (Tab 2) | claude-sonnet-4-6 | ~$0.01 per question |

~50 conversations, weekly refresh, 20 questions/month → **~$1-2/month total**

---

## What to Reuse vs Replace

| File | Action |
|------|--------|
| `src/drive-api.js` | Keep — update Drive folder/file path constants |
| `src/state-manager.js` | Keep — delta logic unchanged |
| `src/claude-api.js` | Delete — replaced by knowledge-extractor.js |
| `src/process.js` | Rewrite |
| `index.html` | Rewrite |
| `service-worker.js` | Keep |
| `manifest.json` | Keep |
| `.github/workflows/process-conversations.yml` | Update — point to new process.js |

---

## Implementation Order

1. `src/knowledge-extractor.js` — write + test with sample conversations
2. `src/knowledge-builder.js` — track docs + synthesis
3. `src/digest-generator.js` — digest JSON
4. `src/process.js` — wire pipeline
5. Update `src/drive-api.js` paths
6. `index.html` — Tab 1 (Focus Brief) first, then Tab 2 (Chat), then Tab 3 (Exports)
7. Update `.github/workflows/process-conversations.yml`
8. End-to-end test with real export

---

## Implementation Notes

- Track slugs: lowercase-hyphenated from track name ("Career Transition" → "career-transition")
- Create `knowledge-base/tracks/` folder on Drive if it doesn't exist (drive-api.js)
- Skip empty conversations (no name, no summary, no messages) — don't include in knowledge base
- If knowledge base doesn't exist yet, Tab 1 shows "No data yet — trigger your first export in GitHub Actions"
- Tab 2 chat should show same empty state with instructions
- PWA caches digest + synthesis with 1hr TTL for offline use
