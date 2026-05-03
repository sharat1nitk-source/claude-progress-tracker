# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A privacy-preserving, multi-user system for tracking Claude.ai conversation progress across projects. The system:
1. Processes Claude conversation exports (ZIP files) from Google Drive
2. Uses Claude API to extract structured metadata (project, progress %, next steps)
3. Stores tracking data in user-specific files on Google Drive (never publicly committed)
4. PWA authenticates users via Google OAuth and shows only their own data

**Privacy Model:** Each user's data is isolated in `projects-{email}.json` files on Drive. The PWA requires authentication and only displays the authenticated user's projects. No user data is ever committed to the public repository.

**Tech Stack:** Node.js (ES modules), Google Drive API, Anthropic API, Google OAuth 2.0, vanilla JavaScript PWA

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

# Note: PWA requires OAuth authentication and reads user-specific data from Google Drive
# Configure OAuth Client ID and Drive Folder ID in Settings after first launch
```

### GitHub Actions Workflow
```bash
# Workflow runs automatically daily at 2 AM UTC
# Manual trigger: Actions tab → "Process Claude Conversations" → "Run workflow"

# Force reprocess all conversations (ignore state):
# Use workflow_dispatch with force_reprocess: true
```

## Architecture

### Data Flow (Privacy-Preserving)
```
Claude.ai Export (ZIP) 
  → Google Drive shared folder (process-queue.json tracks pending ZIPs)
  → GitHub Actions downloads & extracts
  → Claude API processes each conversation
  → State saved to Drive (processed_conversations-{email}.json per user)
  → Tracking data uploaded to Drive (projects-{email}.json per user)
  → NO PUBLIC COMMIT - data stays private on Drive
  → PWA authenticates user via OAuth
  → PWA reads only that user's projects-{email}.json from Drive
  → User sees only their own conversations
```

### Multi-User Privacy Architecture
The system supports multiple users while maintaining complete data isolation:
- **Backend Processing:** Each user has separate state (`processed_conversations-{email}.json`) and projects (`projects-{email}.json`) files on Drive
- **Frontend Access:** PWA requires Google OAuth authentication. After sign-in, users can only access their own `projects-{email}.json` file
- **No Cross-User Data Access:** Users cannot see other users' conversations or projects
- **No Public Data:** User data is NEVER committed to the public GitHub repository
- **Shared Infrastructure:** All users share the same Drive folder and processing workflow, but data is isolated by email

### Source Structure

**src/process.js** (Main orchestrator)
- ConversationProcessor class coordinates entire flow
- Reads process-queue.json to find pending ZIP files
- Cleans up queue (removes items with deleted ZIPs, old completed items)
- Downloads ZIPs from Drive, extracts conversations.json
- Calls ClaudeAPI to process new/updated conversations
- Updates user-specific projects-{email}.json with results
- Aggregates all user projects into projects.json
- Key methods: `run()`, `processConversations()`, `updateTrackingData()`, `cleanupQueue()`

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
- Tracks processed conversations in `processed_conversations-{email}.json` on Drive
- Computes content hash to detect changes
- `filterConversations()` returns only new/modified conversations
- Enables efficient incremental processing (doesn't reprocess unchanged conversations)
- User-specific state prevents cross-user reprocessing

**~~src/download-projects.js~~** (REMOVED)
- Previously downloaded projects.json to repo - removed for privacy
- User data is never committed to public repository

**index.html** (PWA frontend)
- Single-file PWA with inline CSS and JavaScript
- Requires Google OAuth authentication (redirect-based flow)
- Reads user-specific `projects-{email}.json` from Google Drive
- Displays only authenticated user's projects and conversations
- Supports filtering, completion marking, and settings
- User state stored in localStorage (OAuth tokens, preferences)
- Privacy-first: No cross-user data access

**service-worker.js** (Offline support)
- Caches PWA assets for offline access
- Does NOT cache user data (always fresh from Drive)

### Key Data Structures

**projects-{email}.json** (per-user tracking data in Drive - PRIVATE):
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
**Privacy Note:** This file is stored ONLY on Google Drive and never committed to the repository. Each user has their own file accessible only to them via OAuth.

**processed_conversations-{email}.json** (per-user state in Drive):
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

## Setup Requirements

### GitHub Secrets (for backend processing)
Set these in repository Settings → Secrets and variables → Actions:

1. **GOOGLE_DRIVE_CREDENTIALS** - Service account JSON (entire file contents)
2. **GOOGLE_DRIVE_FOLDER_ID** - Shared Drive folder ID from URL
3. **ANTHROPIC_API_KEY** - API key from console.anthropic.com

### OAuth Setup (for PWA authentication)
1. Create OAuth 2.0 Client ID in Google Cloud Console
2. Add authorized redirect URIs (your GitHub Pages URL)
3. Users configure their OAuth Client ID in PWA Settings
4. Users authenticate and grant Drive access to read their projects file

**Important:** The Drive folder must be a Shared Drive, not a personal folder. Service accounts cannot access personal Drive folders.

## Important Implementation Notes

### Delta Processing
The state-manager.js ensures only new or modified conversations are sent to Claude API. Never bypass this unless explicitly force reprocessing. This keeps API costs low.

### Conversation Sorting
In PWA, conversations are sorted by last update date (most recent first). The project `updateTrackingData()` sorts by review date for action prioritization.

### PWA Data Source & Privacy
The PWA reads user-specific `projects-{email}.json` files directly from Google Drive via OAuth. No user data is ever committed to the repository or served via GitHub Pages. This ensures complete privacy - users can only access their own conversation data after authentication.

### Error Handling
If Claude API processing fails for some conversations, those are skipped but others continue. Check workflow logs for error details. Failed conversations will retry on next run since they weren't marked as processed.

### Queue Management
The process-queue.json file tracks all ZIP files to be processed:
- New ZIPs are added with status 'pending'
- Successfully processed ZIPs are marked 'completed'
- Failed ZIPs are marked 'failed' with error message
- Queue cleanup runs before each processing session:
  - Removes items where ZIP file has been deleted from Drive
  - Removes completed items older than 1 week
  - Prevents repeated processing of deleted files

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
