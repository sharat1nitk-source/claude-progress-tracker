# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An automated system for tracking Claude.ai conversation progress across projects. The system:
1. Processes Claude conversation exports (ZIP files) from Google Drive
2. Uses Claude API to extract structured metadata (project, progress %, next steps)
3. Publishes tracking data to a mobile-friendly PWA hosted on GitHub Pages

**Tech Stack:** Node.js (ES modules), Google Drive API, Anthropic API, vanilla JavaScript PWA

## Development Commands

### Running the Processor Locally
```bash
# Setup
npm install

# Create .env from .env.example and fill in credentials
cp .env.example .env

# Run processor (requires ZIP exports in Google Drive)
npm start
```

### Testing the PWA
```bash
# Serve the root directory (index.html is at root)
python3 -m http.server 8000
# Open http://localhost:8000

# Note: PWA reads from projects.json at root (committed to repo)
```

### GitHub Actions Workflow
```bash
# Workflow runs automatically daily at 2 AM UTC
# Manual trigger: Actions tab → "Process Claude Conversations" → "Run workflow"

# Force reprocess all conversations (ignore state):
# Use workflow_dispatch with force_reprocess: true
```

## Architecture

### Data Flow
```
Claude.ai Export (ZIP) 
  → Google Drive folder
  → GitHub Actions downloads & extracts
  → Claude API processes each conversation
  → State saved to Drive (processed_conversations.json)
  → Tracking data uploaded to Drive (projects.json)
  → projects.json downloaded to repo & committed
  → GitHub Pages serves PWA reading projects.json
```

### Source Structure

**src/process.js** (Main orchestrator)
- ConversationProcessor class coordinates entire flow
- Downloads ZIPs from Drive, extracts conversations.json
- Calls ClaudeAPI to process new/updated conversations
- Updates projects.json with results
- Key methods: `run()`, `processConversations()`, `updateTrackingData()`

**src/claude-api.js** (Claude API client)
- Batches conversation processing
- Sends conversation name + summary + known projects list to Claude
- Claude extracts: projectName, topic, progressPercent, progressSummary, nextSteps, reviewDate
- Returns structured metadata for each conversation

**src/drive-api.js** (Google Drive operations)
- Authenticates with service account credentials
- Methods: `listFiles()`, `downloadFile()`, `uploadJSON()`, `downloadJSON()`
- Handles both file downloads and JSON read/write

**src/state-manager.js** (Delta processing)
- Tracks processed conversations in `processed_conversations.json` on Drive
- Computes content hash to detect changes
- `filterConversations()` returns only new/modified conversations
- Enables efficient incremental processing (doesn't reprocess unchanged conversations)

**src/download-projects.js** (CI helper)
- Downloads projects.json from Drive to repo root
- Used in GitHub Actions to commit updated tracking data

**index.html** (PWA frontend)
- Single-file PWA with inline CSS and JavaScript
- Fetches projects.json from same domain (committed file)
- Displays projects, conversations, progress bars, next steps
- Supports filtering, completion marking, and settings (projects.json file ID)
- All state stored in localStorage

**service-worker.js** (Offline support)
- Caches PWA assets and projects.json for offline access
- Cache-first strategy with fallback

### Key Data Structures

**projects.json** (tracking data in Drive & repo):
```javascript
{
  "projects": [
    {
      "id": "ai-learning",  // slugified name
      "name": "AI Learning",
      "emoji": "🧠",
      "color": "#9333ea",
      "conversations": [
        {
          "uuid": "...",
          "name": "Intel hyper-threading...",
          "topic": "CPU Architecture",
          "progressSummary": "Learned about...",
          "progressPercent": 75,
          "nextSteps": ["Research...", "Test..."],
          "lastUpdated": "2026-04-19T...",
          "reviewDate": "2026-05-03",
          "completed": false,
          "notes": ""
        }
      ]
    }
  ],
  "lastUpdated": "2026-04-20T12:00:00Z"
}
```

**processed_conversations.json** (state in Drive):
```javascript
{
  "conversations": {
    "uuid": {
      "lastProcessedAt": "...",
      "lastModifiedTime": "...",
      "contentHash": "...",
      "projectName": "AI Learning"
    }
  },
  "lastRunAt": "..."
}
```

### Project Auto-Categorization

Projects are auto-created from Claude API responses. `getProjectStyle()` in process.js assigns emoji/color based on project name keywords:
- "ai" → 🧠 purple
- "learn" → 📚 blue
- "finance" → 💰 orange
- "automation" → ⚙️ green
- etc.

When adding new categories, update the `styles` object in `ConversationProcessor.getProjectStyle()`.

## GitHub Secrets Required

Set these in repository Settings → Secrets and variables → Actions:

1. **GOOGLE_DRIVE_CREDENTIALS** - Service account JSON (entire file contents)
2. **GOOGLE_DRIVE_FOLDER_ID** - Drive folder ID from URL
3. **ANTHROPIC_API_KEY** - API key from console.anthropic.com

## Important Implementation Notes

### Delta Processing
The state-manager.js ensures only new or modified conversations are sent to Claude API. Never bypass this unless explicitly force reprocessing. This keeps API costs low.

### Conversation Sorting
In PWA, conversations are sorted by last update date (most recent first). The project `updateTrackingData()` sorts by review date for action prioritization.

### PWA Data Source
The PWA reads from projects.json committed to the repository (served via GitHub Pages). The workflow downloads from Drive and commits this file after each run. The PWA settings screen allows configuring a Google Drive file ID as an alternative data source.

### Error Handling
If Claude API processing fails for some conversations, those are skipped but others continue. Check workflow logs for error details. Failed conversations will retry on next run since they weren't marked as processed.

## Common Development Scenarios

### Adding a New Metadata Field
1. Update Claude API prompt in `claude-api.js` (extractMetadata method)
2. Parse the new field in the API response
3. Update conversation schema in `process.js` (updateTrackingData method)
4. Update PWA UI in `index.html` to display the field

### Debugging Processing Issues
1. Check GitHub Actions logs for the specific run
2. Verify ZIP file is in Google Drive folder
3. Test locally with `npm start` (requires .env setup)
4. Check Drive for processed_conversations.json to see state

### Testing PWA Changes
1. Edit index.html, service-worker.js, or manifest.json
2. Serve locally: `python3 -m http.server 8000`
3. Commit changes - GitHub Pages auto-deploys from main branch
4. Update service worker version to force cache refresh

### Modifying the Processing Schedule
Edit `.github/workflows/process-conversations.yml`:
```yaml
schedule:
  - cron: '0 2 * * *'  # Daily at 2 AM UTC
```
