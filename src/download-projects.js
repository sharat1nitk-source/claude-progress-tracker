#!/usr/bin/env node

import fs from 'fs';
import { google } from 'googleapis';

/**
 * Download projects.json from Google Drive
 */
async function download() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS);
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth: await auth.getClient() });

    // Find projects.json
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name='projects.json' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (res.data.files.length === 0) {
      console.log('⚠️  projects.json not found in Drive, skipping download');
      return;
    }

    const fileId = res.data.files[0].id;
    console.log(`📥 Downloading projects.json (${fileId})...`);

    // Download file content
    const file = await drive.files.get({
      fileId,
      alt: 'media',
      supportsAllDrives: true,
    });

    // Write to file
    fs.writeFileSync('projects.json', JSON.stringify(file.data, null, 2));
    console.log('✅ Downloaded projects.json successfully');

  } catch (error) {
    console.error('❌ Failed to download projects.json:', error.message);
    // Don't fail the workflow - just skip the download
    console.log('⚠️  Continuing without updating projects.json');
  }
}

download();
