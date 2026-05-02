# Setup Checklist

Use this checklist to set up your Claude Progress Tracker system.

## ☑️ Prerequisites

- [ ] Google Cloud account (free tier)
- [ ] GitHub account (free tier)
- [ ] Anthropic API key (from console.anthropic.com)
- [ ] Claude.ai account

## ☑️ Google Drive Setup

- [ ] Create new Google Cloud project (or use existing)
- [ ] Enable Google Drive API
- [ ] Create service account named `claude-tracker-bot`
- [ ] Download service account JSON key file
- [ ] Create "Claude Exports" folder in Google Drive
- [ ] Share folder with service account email (Editor permission)
- [ ] Copy Folder ID from URL

## ☑️ GitHub Configuration

- [ ] Push code to GitHub repository
- [ ] Add GitHub Secret: `GOOGLE_DRIVE_CREDENTIALS` (paste entire JSON file contents)
- [ ] Add GitHub Secret: `GOOGLE_DRIVE_FOLDER_ID` (folder ID from Drive)
- [ ] Add GitHub Secret: `ANTHROPIC_API_KEY` (your Claude API key)
- [ ] Enable GitHub Pages (Settings → Pages → Source: main/public)

## ☑️ PWA Configuration

- [ ] Create empty `projects.json` in Google Drive:
  ```json
  {
    "projects": [],
    "lastUpdated": "2026-04-20T00:00:00Z"
  }
  ```
- [ ] Share `projects.json` publicly ("Anyone with link can view")
- [ ] Get File ID from URL (open file in Drive, copy from URL)
- [ ] Open PWA at `https://<your-username>.github.io/<repo-name>/`
- [ ] Click Settings ⚙️
- [ ] Enter File ID for `projects.json`
- [ ] Save settings

## ☑️ First Run

- [ ] Export conversations from Claude.ai (Profile → Settings → Export data)
- [ ] Upload ZIP file to "Claude Exports" folder in Google Drive
- [ ] Go to GitHub Actions → "Process Claude Conversations" → "Run workflow"
- [ ] Wait for workflow to complete (~3-5 minutes)
- [ ] Check `projects.json` in Drive - should now have your conversations
- [ ] Refresh PWA - should show your projects!

## ☑️ Mobile Installation (Optional)

**iOS:**
- [ ] Open PWA in Safari
- [ ] Tap Share button
- [ ] Tap "Add to Home Screen"

**Android:**
- [ ] Open PWA in Chrome
- [ ] Tap menu (three dots)
- [ ] Tap "Add to Home screen"

## 🎉 Done!

Your Claude Progress Tracker is now set up and running!

The workflow will automatically process new exports daily at 2 AM UTC, or you can trigger it manually anytime.

## 📊 Verify Everything Works

### Test Checklist:
- [ ] Workflow runs successfully in GitHub Actions
- [ ] `projects.json` is created/updated in Google Drive
- [ ] `processed_conversations.json` is created in Google Drive
- [ ] PWA loads and displays projects
- [ ] Can click conversations to see next steps
- [ ] Can refresh PWA to reload data
- [ ] PWA works offline (after first load)

### Expected Costs:
- **GitHub Actions**: Free (2,000 minutes/month)
- **GitHub Pages**: Free
- **Google Drive API**: Free (within quotas)
- **Claude API**: ~$0.01 per 100 conversations
- **Total**: ~$0.30/month for typical usage

## 🆘 Troubleshooting

If something doesn't work, check:

1. **GitHub Actions fails**:
   - Verify all 3 secrets are set correctly
   - Check error message in Actions logs
   - Ensure GOOGLE_DRIVE_CREDENTIALS is valid JSON

2. **No conversations processed**:
   - Verify ZIP file is in the correct Drive folder
   - Check service account has access to the folder
   - Look at workflow logs for errors

3. **PWA shows "No Projects"**:
   - Check File ID in PWA settings
   - Verify `projects.json` is shared publicly
   - Try clearing cache in PWA settings

4. **Conversations not updating**:
   - Check GitHub Actions ran successfully
   - Verify `projects.json` was updated in Drive
   - Refresh PWA

## 📝 Notes

- The first run will process all conversations in your export (~3-5 minutes)
- Subsequent runs only process new/updated conversations (much faster)
- You can upload multiple exports - the system will deduplicate automatically
- Review dates and next steps are AI-generated - edit in PWA if needed

---

For detailed documentation, see [README.md](README.md)
