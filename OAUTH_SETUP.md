# Google OAuth Setup Guide

Follow these steps to enable Google Drive sync for your PWA.

## Step 1: Google Cloud Console Setup

### 1.1 Go to Google Cloud Console
Visit: https://console.cloud.google.com/

### 1.2 Select Your Project
Use the same project where you set up the service account for GitHub Actions.

### 1.3 Enable Google Drive API
- Go to **"APIs & Services" → "Library"**
- Search for **"Google Drive API"**
- Click **"Enable"** (if not already enabled)

### 1.4 Create OAuth 2.0 Client ID

1. Go to **"APIs & Services" → "Credentials"**
2. Click **"Create Credentials" → "OAuth 2.0 Client ID"**

3. **Configure OAuth consent screen** (if first time):
   - Click "Configure Consent Screen"
   - Choose **"External"** (unless you have Google Workspace)
   - Fill in required fields:
     - App name: `Claude Progress Tracker`
     - User support email: (your email)
     - Developer contact: (your email)
   - Click "Save and Continue"
   - **Scopes**: Click "Add or Remove Scopes"
     - Add: `https://www.googleapis.com/auth/drive.file`
     - This allows app to access only files it creates
   - Click "Save and Continue"
   - **Test users** (for External apps):
     - Click "+ ADD USERS"
     - Add your email address
     - Click "Save and Continue"
   - Click "Back to Dashboard"

4. **Create OAuth Client ID**:
   - Go back to **"Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"**
   - Application type: **"Web application"**
   - Name: `Claude Progress Tracker PWA`
   - **Authorized JavaScript origins**:
     - Click "+ ADD URI"
     - Add: `https://YOUR-USERNAME.github.io`
     - Replace YOUR-USERNAME with your actual GitHub username
   - **Authorized redirect URIs**:
     - Click "+ ADD URI"  
     - Add: `https://YOUR-USERNAME.github.io/claude-progress-tracker`
     - (Replace with your actual GitHub Pages URL)
   - Click **"Create"**

5. **Copy Client ID**:
   - A popup will show your Client ID
   - It looks like: `123456789-abcdefghijklmnop.apps.googleusercontent.com`
   - **Copy this** - you'll need it in Step 2

## Step 2: Configure PWA Settings

### 2.1 Open Your PWA
Visit your GitHub Pages URL:
- `https://YOUR-USERNAME.github.io/claude-progress-tracker/`

### 2.2 Open Settings
Click the **⚙️** (Settings) button in the top right

### 2.3 Enter Configuration

**Google OAuth Client ID:**
```
123456789-abcdefghijklmnop.apps.googleusercontent.com
```
Paste the Client ID you copied from Step 1

**Google Drive Folder ID:**
```
YOUR_FOLDER_ID_HERE
```
This is the same folder ID from your `.env` file where the GitHub Actions uploads files.
- Find it in the folder URL: `https://drive.google.com/drive/folders/[FOLDER_ID]`

**Projects.json File ID (Optional):**
Leave blank for now - not needed with OAuth sync.

### 2.4 Save Settings
Click **"Save Settings"**

The page will reload and show **"Sign in with Google"** button.

## Step 3: Sign In

1. Click **"Sign in with Google"**
2. Choose your Google account
3. Review permissions:
   - "See, edit, create, and delete only the specific Google Drive files you use with this app"
4. Click **"Allow"**

You're now signed in! You should see:
- ✅ Your profile picture and email in the header
- ✅ "✓ Synced" status indicator
- ✅ All your data now syncs to Drive

## Step 4: Verify Sync

1. Open Google Drive
2. Go to your "Claude Exports" folder (or whatever you named it)
3. You should see a new file: **`user-data.json`**
4. This file contains your priorities, notes, and completion status

## What Gets Synced?

**Synced to Drive (`user-data.json`):**
- ✅ Conversation priorities (urgent, high, medium, low, parked)
- ✅ Archive/hidden status
- ✅ Custom notes
- ✅ Marked as complete status

**Read from repo (`projects.json`):**
- Conversations from Claude exports
- Progress percentages from Claude API
- Project assignments
- Next steps, review dates

## Multi-Device Usage

Once set up, you can use the PWA on any device:

1. Open PWA on new device
2. Go to Settings
3. Enter same **OAuth Client ID** and **Folder ID**
4. Sign in with same Google account
5. Your data automatically syncs!

## Troubleshooting

### "Configure OAuth in Settings" button is disabled
- Make sure you entered the OAuth Client ID in Settings
- Save settings and refresh the page

### Sign in popup is blocked
- Allow popups for your GitHub Pages domain
- Try signing in again

### "Failed to load user data from Drive"
- Check that Drive Folder ID is correct
- Make sure you signed in with the account that has access to the folder
- Verify folder is shared with your account

### OAuth consent screen shows "unverified app"
- This is normal for External apps in development
- Click "Advanced" → "Go to Claude Progress Tracker (unsafe)"
- This is YOUR app, so it's safe

### Need to add more users?
- Go to OAuth consent screen settings
- Add email addresses under "Test users"
- Or publish your app (requires verification for public apps)

## Security Notes

- ✅ **Drive scope** is limited to `.file` - only accesses files it creates
- ✅ **Data is private** - only you can read/write your user-data.json
- ✅ **Access token** expires after 1 hour (automatically renewed)
- ✅ **No backend** - all auth happens in browser
- ✅ **Open source** - you can audit the code

## Cost

Everything remains **100% free**:
- ✅ Google Drive API - free quota (generous limits)
- ✅ OAuth - free
- ✅ GitHub Pages - free
- ✅ GitHub Actions - free tier

---

**Done!** Your progress tracker now syncs privately across all your devices. 🎉
