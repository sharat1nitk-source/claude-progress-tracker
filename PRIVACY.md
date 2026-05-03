# Privacy Architecture

## Overview

This system is designed with **privacy-first principles** for multi-user conversation tracking. Each user's data is completely isolated and accessible only to them.

## Privacy Guarantees

### ✅ What IS Private

1. **User Conversation Data**
   - All conversation content, topics, summaries, and progress stored in user-specific files
   - File naming: `projects-{email}.json` and `processed_conversations-{email}.json`
   - Files stored on Google Drive shared folder, never in public repository

2. **Access Control**
   - PWA requires Google OAuth authentication
   - Users can only read their own `projects-{email}.json` file
   - OAuth scopes limited to Drive read access for user's own files

3. **No Cross-User Access**
   - User A cannot see User B's conversations
   - No aggregated view showing all users' data
   - Backend processing maintains separate state per user

### ❌ What IS NOT Private (By Design)

1. **Shared Infrastructure**
   - Google Drive folder ID is shared (but folder contents are access-controlled)
   - GitHub Actions workflow is public (code only, no data)
   - PWA code is public (hosted on GitHub Pages)

2. **Metadata Visibility**
   - Queue system (`process-queue.json`) contains file IDs and email addresses of users who uploaded exports
   - This is necessary for processing coordination but doesn't expose conversation content

## Data Flow & Privacy Controls

### Upload & Processing

```
1. User uploads ZIP export to shared Drive folder
   ├─ File is visible to service account only
   └─ Added to process-queue.json with user's email

2. GitHub Actions processes queue
   ├─ Downloads ZIP (service account access)
   ├─ Processes conversations via Claude API
   ├─ Saves to projects-{email}.json (isolated by email)
   └─ NO DATA COMMITTED TO REPOSITORY

3. User accesses PWA
   ├─ Signs in with Google OAuth
   ├─ PWA requests Drive access with user's credentials
   ├─ Reads only projects-{email}.json matching their email
   └─ Cannot access other users' files
```

### Storage Locations

| Data Type | Location | Access |
|-----------|----------|--------|
| `projects-{email}.json` | Google Drive | User's OAuth token |
| `user-data-{email}.json` | Google Drive | User's OAuth token |
| `processed_conversations-{email}.json` | Google Drive | Service account (processing only) |
| `process-queue.json` | Google Drive | Service account |
| PWA code | GitHub Pages | Public |
| Processing code | GitHub repo | Public |
| User conversation content | **NEVER STORED PUBLICLY** | Private |

## Security Model

### Authentication

- **Backend (GitHub Actions)**: Service account with Drive access to shared folder
- **Frontend (PWA)**: User OAuth tokens (redirect-based flow, stored in localStorage)

### Authorization

- **Backend**: Service account can read/write all files in shared folder (needed for processing all users)
- **Frontend**: User token can only read files they create or have access to
- **Drive Permissions**: User-specific files (`projects-{email}.json`) are created by service account but readable by matching user email

### Token Storage

- **Access Tokens**: Stored in browser localStorage
- **Token Expiry**: Checked before each Drive API call
- **Refresh**: User must re-authenticate when token expires (no refresh tokens stored)

## Privacy-Preserving Design Decisions

### Why No Public Commit?

**Previous Design (Insecure):**
```
All users' data → aggregated projects.json → committed to repo → public
```
**Privacy Issue:** Anyone with repo access could see all users' conversations.

**Current Design (Secure):**
```
Each user's data → projects-{email}.json on Drive → OAuth-protected → private
```
**Privacy Win:** Users can only access their own data after authentication.

### Why Shared Drive Folder?

**Reason:** Service accounts cannot access personal Drive folders.

**Mitigation:** Files are named by email and PWA only reads matching file.

**Alternative Considered:** Separate folders per user (rejected due to complexity and service account limitations).

### Why Email in Filename?

**Reason:** Provides clear data isolation and easy identification of user's file.

**Privacy Note:** Email is already known to user (they signed in with it) and not exposed to other users.

## Compliance & Best Practices

### GDPR Considerations

- **Right to Access**: Users can view their data via PWA
- **Right to Deletion**: Users can delete their files from Drive
- **Data Minimization**: Only necessary conversation metadata stored
- **Purpose Limitation**: Data used only for progress tracking

### Recommendations

1. **Use Shared Drive**: Better access control than personal folders
2. **Limit Service Account Permissions**: Only grant Drive access to specific folder
3. **OAuth Scopes**: Request minimal necessary scopes (`drive.readonly` for PWA)
4. **Token Expiry**: Keep short token lifetimes, require re-auth periodically
5. **HTTPS Only**: PWA served over HTTPS (GitHub Pages default)

## What Users Should Know

### For Users

1. Your conversation data is stored in a shared Google Drive folder
2. Only you can see your conversations via the PWA (after signing in)
3. The backend processing system (GitHub Actions) can technically access your data to process it
4. No data is publicly committed or visible to others
5. You can delete your data by removing your `projects-{email}.json` file from Drive

### For Administrators

1. Service account has access to all users' files (necessary for processing)
2. Keep service account credentials secure (GitHub Secrets only)
3. Monitor Drive folder for unauthorized access
4. Regularly review OAuth client configurations
5. Audit processing logs for errors or security issues

## Security Checklist

- [x] User data never committed to public repository
- [x] OAuth authentication required for PWA access
- [x] User-specific file naming prevents cross-user access
- [x] Service account credentials stored securely (GitHub Secrets)
- [x] OAuth client ID configurable per user (not hardcoded)
- [x] Token expiry enforced
- [x] HTTPS for all external API calls
- [x] No sensitive data in URLs or logs
- [x] Queue cleanup prevents data leaks from deleted files
- [x] Documentation clearly states privacy model

## Future Enhancements

- [ ] Add file-level encryption for extra protection
- [ ] Implement Drive API permissions to restrict service account to specific file patterns
- [ ] Add audit logging for data access
- [ ] Support user-initiated data export (GDPR compliance)
- [ ] Add option for users to host their own processing backend
