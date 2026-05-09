# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A personal AI knowledge assistant that processes Claude.ai chat exports into a living knowledge base. The system:
1. Extracts structured knowledge from every conversation (tracks, decisions, tasks, blockers)
2. Builds per-track documents and cross-track synthesis
3. Generates a visual digest with focus recommendations
4. Provides a chat interface to query your knowledge base
5. All data stays private on Google Drive — never committed to the public repo

**Tech Stack:** Node.js (ES modules), Google Drive API, DeepSeek API (deepseek-chat), Google OAuth 2.0, vanilla JavaScript PWA

## Development Commands

```bash
npm install
cp .env.example .env   # fill in credentials
npm start              # runs src/process.js pipeline

# Serve PWA locally
python3 -m http.server 8000
# Open http://localhost:8000
```

### GitHub Actions
- Runs daily at 2 AM UTC or manually from Actions tab
- Manual trigger: Actions > "Process Claude Conversations" > "Run workflow"
- Force reprocess: enable `force_reprocess` input

## Architecture

### Pipeline (runs in GitHub Actions)
```
Claude.ai export ZIP (on Google Drive)
  -> process.js reads process-queue.json
  -> Downloads + extracts ZIP (conversations.json, projects.json, memories.json)
  -> knowledge-extractor.js: per-conversation extraction via DeepSeek
  -> state-manager.js: delta processing (skip unchanged conversations)
  -> knowledge-builder.js: build track docs + cross-track synthesis via DeepSeek
  -> digest-generator.js: generate structured digest JSON via DeepSeek
  -> All outputs written to Google Drive knowledge-base/ folder
```

### PWA (index.html)
```
Tab 1: Focus Brief — reads digest-{email}.json, shows priorities + track cards
Tab 2: Chat — conversational Q&A over knowledge base via DeepSeek (browser-side API call)
Tab 3: Exports — queue management for ZIP processing
```

### Source Structure

**src/knowledge-extractor.js** — Per-conversation knowledge extraction
- One DeepSeek call per conversation
- Extracts: track, conversation_type, narrative_summary, decisions, plans, tasks, blockers, insights, connections, status, importance
- Accumulates track names across conversations for consistency

**src/knowledge-builder.js** — Track document + synthesis generation
- Groups extraction results by track
- Builds markdown document per track (decisions, plans, tasks, blockers, insights, history table)
- Single DeepSeek call for cross-track synthesis (dependencies, priority matrix, themes)

**src/digest-generator.js** — Visual digest JSON generation
- Single DeepSeek call with all track docs + synthesis
- Reads priorities.json (user-stated overrides from Chat tab)
- Reads memories from export for additional context
- Outputs structured JSON consumed by PWA Focus Brief tab

**src/process.js** — Main pipeline orchestrator
- Reads process-queue.json from Drive
- Downloads/extracts ZIPs, filters new conversations via state-manager
- Runs extraction -> build -> digest pipeline
- Bundles all output (tracks, synthesis, digest) into single kb-output-{email}.json

**src/drive-api.js** — Google Drive API wrapper (service account auth, file CRUD)

**src/state-manager.js** — Delta processing (SHA256 content hashing, skip unchanged conversations)

**index.html** — Single-file PWA with three tabs
- OAuth redirect flow for Google auth
- Pre-creates kb-output file via OAuth (service account can't create, only update)
- Chat loads full track documents + synthesis + digest for rich context
- Priority overrides from chat saved to kb-priorities.json on Drive

### Data on Google Drive

```
{folder}/
  process-queue.json              — export processing queue
  processed_conversations-{email}.json — delta state per user
  kb-output-{email}.json          — bundled KB: track docs, synthesis, digest
  kb-priorities.json              — user-stated priority overrides (from Chat tab)
```

## Key Design Decisions

- **All Claude calls use deepseek-chat** — DeepSeek provides quality at lower cost
- **Priorities persist via priorities.json** — Chat tab writes priority overrides to Drive, digest generator reads them
- **memories.json from export** feeds into digest generation for additional user context
- **1-hour cache TTL** on digest and synthesis in the PWA for offline/performance
- **Track slugs** are lowercase-hyphenated: "Career Transition" -> "career-transition"
- **Empty conversations** (no name, no summary, no messages) are skipped

## Setup Requirements

### GitHub Secrets
1. **GOOGLE_DRIVE_CREDENTIALS** — Service account JSON
2. **GOOGLE_DRIVE_FOLDER_ID** — Shared Drive folder ID
3. **DEEPSEEK_API_KEY** — From https://platform.deepseek.com/api_keys

### PWA Settings (configured in-app)
1. Google OAuth Client ID
2. Google Drive Folder ID
3. DeepSeek API Key (for Chat tab, stored in localStorage only)
