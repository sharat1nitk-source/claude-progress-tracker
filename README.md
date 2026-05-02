# Claude Progress Tracker

A complete multi-user system for automatically tracking Claude.ai conversation progress across projects. Features OAuth authentication, private data isolation, smart priority management, and queue-based processing.

## ✨ Features

### Core Functionality
- **Multi-User Support**: Complete privacy isolation per user with email-based data separation
- **OAuth Authentication**: Sign in with Google for secure, private access
- **Queue-Based Processing**: Add exports to queue via PWA, processed automatically by GitHub Actions
- **Smart Categorization**: Claude API extracts project, topic, progress %, next steps
- **Delta Processing**: Only processes new/changed conversations (cost-efficient)
- **Priority Management**: 5-level priority system with confirmation workflow
- **Search**: Real-time search across conversation name, topic, summary, next steps

### User Interface
- **Mobile-First PWA**: Progressive Web App with offline support
- **Smart Sorting**: Unconfirmed conversations first, then by priority (urgent → low → parked)
- **Archive & Completion**: Mark conversations as archived or completed
- **Tab Navigation**: Separate views for conversations and export management
- **Real-Time Sync**: Auto-syncs priorities, notes, completion status to Google Drive

### Technical
- **Zero Backend**: Runs on GitHub Actions + Google Drive + GitHub Pages
- **Service Worker**: Offline access with intelligent caching
- **Per-User State**: Tracks processed conversations separately for each user
- **Automatic Deduplication**: Prevents duplicate conversations across projects

## 🏗️ Architecture

```
┌──────────────────┐
│  User 1          │ ──┐
│  (Upload ZIPs)   │   │
└──────────────────┘   │
                       ▼
┌──────────────────┐   ┌─────────────────────┐
│  User 2          │──►│  Google Drive       │
│  (Upload ZIPs)   │   │  (Shared Folder)    │
└──────────────────┘   │                     │
                       │  - ZIP files        │
                       │  - process-queue    │
                       │  - projects-{email} │
                       │  - user-data-{email}│
                       └──────────┬──────────┘
                                  │
                                  ▼
                       ┌─────────────────────┐
                       │  GitHub Actions     │
                       │  (Scheduled/Manual) │
                       │                     │
                       │  1. Read queue      │
                       │  2. Download ZIPs   │
                       │  3. Process ────────┼───► Claude API
                       │  4. Create/update   │     (Extract metadata)
                       │     projects-{email}│
                       │  5. Save state      │
                       │  6. Update queue    │
                       └──────────┬──────────┘
                                  │
                                  ▼
                       ┌─────────────────────┐
                       │  PWA (GitHub Pages) │
                       │                     │
                       │  ┌────────────────┐ │
                       │  │ OAuth Sign In  │ │
                       │  └───────┬────────┘ │
                       │          │          │
                       │          ▼          │
                       │  ┌────────────────┐ │
                       │  │ Load private   │ │
                       │  │ projects-{u}   │ │
                       │  │ user-data-{u}  │ │
                       │  └───────┬────────┘ │
                       │          │          │
                       │          ▼          │
                       │  ┌────────────────┐ │
                       │  │ View & Manage  │ │
                       │  │ Conversations  │ │
                       │  │ Add to Queue   │ │
                       │  └────────────────┘ │
                       └─────────────────────┘
```

## 🚀 Setup Guide

### Prerequisites

1. **Google Cloud Project** (free tier)
2. **GitHub Account** (free tier)
3. **Anthropic API Key** ([console.anthropic.com](https://console.anthropic.com/))
4. **Claude.ai Account** (to export conversations)

### Step 1: Clone & Setup Repository

```bash
git clone https://github.com/YOUR-USERNAME/claude-progress-tracker.git
cd claude-progress-tracker
npm install

# Copy example config (you'll configure this later)
cp config.example.json config.json
```

### Step 2: Google Cloud Setup

#### Create Service Account (for GitHub Actions)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable **Google Drive API**:
   - APIs & Services → Library → Google Drive API → Enable
4. Create Service Account:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Name: `claude-tracker-bot`
   - Click "Done"
5. Download JSON Key:
   - Click the service account → Keys → Add Key → Create New Key → JSON
   - Save this file securely

#### Create OAuth 2.0 Client (for PWA)

1. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
2. Configure consent screen if needed:
   - External app type
   - Add your email as test user
   - Scopes: `https://www.googleapis.com/auth/drive`
3. Application type: **Web application**
4. Authorized JavaScript origins: `https://YOUR-USERNAME.github.io`
5. Authorized redirect URIs: `https://YOUR-USERNAME.github.io/claude-progress-tracker`
6. Save the **Client ID** (you'll need this)

See [OAUTH_SETUP.md](OAUTH_SETUP.md) for detailed OAuth setup instructions.

#### Setup Google Drive Folder

1. Create a folder in Google Drive (e.g., "Claude Exports")
2. Get the folder ID from URL: `https://drive.google.com/drive/folders/[FOLDER_ID]`
3. Share folder with service account email (from JSON key):
   - Right-click folder → Share → Add service account email → Editor access

### Step 3: Configure GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions → New repository secret:

1. **GOOGLE_DRIVE_CREDENTIALS**: Paste entire JSON key file contents
2. **GOOGLE_DRIVE_FOLDER_ID**: Your Drive folder ID
3. **ANTHROPIC_API_KEY**: Your Anthropic API key

### Step 4: Configure PWA (First-Time Setup)

**No config file needed!** Everything is configured via Settings panel:

1. Open your PWA: `https://YOUR-USERNAME.github.io/claude-progress-tracker/`
2. Click ⚙️ Settings button (or it will open automatically)
3. Enter:
   - **OAuth Client ID**: Your client ID from Step 2
   - **Drive Folder ID**: Your folder ID from Step 2
4. Click "Save Settings"
5. Settings are stored in browser localStorage (private to you)

### Step 5: Enable GitHub Pages

1. Repository → Settings → Pages
2. Source: Deploy from branch
3. Branch: `main` / `root`
4. Save

Your PWA will be available at: `https://YOUR-USERNAME.github.io/claude-progress-tracker/`

## 📱 Usage

### For Users

1. **Sign In**: Open PWA → Sign in with Google
2. **Upload Exports**:
   - Export conversations from Claude.ai (Settings → Data → Export)
   - Upload ZIP files to your Google Drive folder
3. **Queue Processing**:
   - Go to "Process Exports" tab in PWA
   - Click "Add to Queue" on new exports
   - GitHub Actions processes queue automatically (or trigger manually)
4. **Manage Conversations**:
   - Review new conversations (marked "UNCONFIRMED")
   - Set priorities (urgent, high, medium, low, parked)
   - Confirm priority or change as needed
   - Archive completed conversations
   - Search across all conversations

### For Administrators

**Trigger Manual Processing:**
```bash
gh workflow run "Process Claude Conversations"
```

**Add New Users:**
1. Google Cloud Console → OAuth consent screen → Test users → Add email
2. User signs in to PWA → Their files auto-created in Drive
3. User uploads ZIPs and adds to queue
4. Workflow processes their exports separately

## 🔒 Privacy & Security

- **Complete Data Isolation**: Each user's data stored in separate `projects-{email}.json` and `user-data-{email}.json` files
- **OAuth Scope**: Limited to `drive` scope for reading/writing user files
- **No Cross-User Access**: Users can only see their own conversations
- **Private Processing**: State tracked separately per user in `processed_conversations-{email}.json`
- **No Backend**: All processing happens in GitHub Actions (auditable)
- **Open Source**: Entire codebase available for review

## 🛠️ Development

### Local Testing

```bash
# Test processor locally
npm start

# Serve PWA locally
python3 -m http.server 8000
# Open http://localhost:8000
```

### Project Structure

```
├── src/
│   ├── process.js           # Main orchestrator
│   ├── claude-api.js        # Claude API client
│   ├── drive-api.js         # Google Drive operations
│   └── state-manager.js     # Delta processing state
├── index.html               # PWA frontend (single file)
├── service-worker.js        # Offline support
├── manifest.json            # PWA manifest
├── config.json              # OAuth & Drive config (gitignored)
├── config.example.json      # Template
├── .github/workflows/
│   └── process-conversations.yml  # Automated processing
├── CLAUDE.md                # Development guide
└── OAUTH_SETUP.md          # OAuth setup guide
```

### Key Files

- **index.html**: Complete PWA with inline CSS/JS
- **src/process.js**: Queue-based processing with per-user isolation
- **src/state-manager.js**: Tracks processed conversations per user
- **service-worker.js**: Caching strategy for offline access

## 📊 Data Schema

### projects-{email}.json
```json
{
  "projects": [
    {
      "id": "project-slug",
      "name": "Project Name",
      "emoji": "🧠",
      "color": "#9333ea",
      "conversations": [
        {
          "uuid": "...",
          "name": "Conversation name",
          "topic": "Extracted topic",
          "progressSummary": "What was accomplished",
          "progressPercent": 75,
          "nextSteps": ["Step 1", "Step 2"],
          "lastUpdated": "2026-05-02T...",
          "reviewDate": "2026-05-10",
          "completed": false
        }
      ]
    }
  ]
}
```

### user-data-{email}.json
```json
{
  "conversation-uuid": {
    "priority": "high",
    "priorityConfirmed": true,
    "archived": false,
    "completed": true,
    "notes": "Custom notes"
  }
}
```

### process-queue.json
```json
{
  "queue": [
    {
      "id": "timestamp",
      "zipFileId": "drive-file-id",
      "zipFileName": "export.zip",
      "email": "user@gmail.com",
      "status": "pending",
      "addedAt": "2026-05-02T...",
      "processedAt": null
    }
  ]
}
```

## 🤝 Contributing

Contributions welcome! Areas for improvement:
- Additional AI models support
- Export formats beyond ZIP
- Advanced filtering options
- Custom project categorization
- Bulk operations

## 📄 License

MIT License - See LICENSE file

## 🙏 Acknowledgments

Built with Claude Code (claude.ai/code)

---

**Note**: This is a personal productivity tool. Ensure you comply with Claude.ai's Terms of Service when exporting and processing conversations.
