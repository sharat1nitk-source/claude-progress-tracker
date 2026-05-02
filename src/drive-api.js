import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';

/**
 * Google Drive API wrapper for file operations
 */
class DriveAPI {
  constructor(credentials) {
    this.credentials = credentials;
    this.drive = null;
  }

  /**
   * Authenticate with Google Drive API
   */
  async authenticate() {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: this.credentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });

      const authClient = await auth.getClient();
      this.drive = google.drive({ version: 'v3', auth: authClient });

      console.log('✅ Authenticated with Google Drive API');
    } catch (error) {
      console.error('❌ Failed to authenticate with Google Drive:', error.message);
      throw error;
    }
  }

  /**
   * List files in a folder
   * @param {string} folderId - The folder ID to list files from
   * @param {string} query - Optional query filter (e.g., "name contains 'data'")
   * @returns {Promise<Array>} Array of file objects
   */
  async listFiles(folderId, query = null) {
    try {
      let q = `'${folderId}' in parents and trashed=false`;
      if (query) {
        q += ` and ${query}`;
      }

      const response = await this.drive.files.list({
        q,
        fields: 'files(id, name, mimeType, modifiedTime, size)',
        orderBy: 'modifiedTime desc',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      return response.data.files || [];
    } catch (error) {
      console.error('❌ Failed to list files:', error.message);
      throw error;
    }
  }

  /**
   * Download a file to local path
   * @param {string} fileId - The file ID to download
   * @param {string} destPath - Destination path
   */
  async downloadFile(fileId, destPath) {
    try {
      const response = await this.drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      );

      // Ensure directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Write stream to file
      const dest = await fs.open(destPath, 'w');
      const writeStream = dest.createWriteStream();

      return new Promise((resolve, reject) => {
        response.data
          .pipe(writeStream)
          .on('finish', () => resolve(destPath))
          .on('error', reject);
      });
    } catch (error) {
      console.error(`❌ Failed to download file ${fileId}:`, error.message);
      throw error;
    }
  }

  /**
   * Upload or update a file
   * @param {string} folderId - Parent folder ID
   * @param {string} fileName - Name of the file
   * @param {string|Buffer} content - File content
   * @param {string} mimeType - MIME type (default: application/json)
   * @returns {Promise<Object>} Uploaded file metadata
   */
  async uploadFile(folderId, fileName, content, mimeType = 'application/json') {
    try {
      // Check if file already exists
      const existingFiles = await this.listFiles(folderId, `name='${fileName}'`);

      const media = {
        mimeType,
        body: typeof content === 'string' ? content : Buffer.from(content),
      };

      if (existingFiles.length > 0) {
        // Update existing file - use patch instead of update to ensure it stays in the shared folder
        const fileId = existingFiles[0].id;
        const response = await this.drive.files.update({
          fileId,
          media,
          fields: 'id, name, modifiedTime',
          supportsAllDrives: true,
        });

        console.log(`✅ Updated file: ${fileName}`);
        return response.data;
      } else {
        // Create new file with explicit parent
        const response = await this.drive.files.create({
          requestBody: {
            name: fileName,
            parents: [folderId],
          },
          media,
          fields: 'id, name, modifiedTime',
          supportsAllDrives: true,
        });

        console.log(`✅ Created file: ${fileName}`);
        return response.data;
      }
    } catch (error) {
      console.error(`❌ Failed to upload file ${fileName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get file metadata
   * @param {string} fileId - The file ID
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(fileId) {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, modifiedTime, size',
      });

      return response.data;
    } catch (error) {
      console.error(`❌ Failed to get file metadata ${fileId}:`, error.message);
      throw error;
    }
  }

  /**
   * Download JSON file and parse
   * @param {string} folderId - Folder ID
   * @param {string} fileName - File name
   * @returns {Promise<Object|null>} Parsed JSON or null if not found
   */
  async downloadJSON(folderId, fileName) {
    try {
      const files = await this.listFiles(folderId, `name='${fileName}'`);

      if (files.length === 0) {
        return null;
      }

      const fileId = files[0].id;
      const response = await this.drive.files.get({
        fileId,
        alt: 'media',
      });

      return response.data;
    } catch (error) {
      console.error(`❌ Failed to download JSON ${fileName}:`, error.message);
      return null;
    }
  }

  /**
   * Upload JSON file
   * @param {string} folderId - Folder ID
   * @param {string} fileName - File name
   * @param {Object} data - JSON data
   */
  async uploadJSON(folderId, fileName, data) {
    const content = JSON.stringify(data, null, 2);
    return this.uploadFile(folderId, fileName, content, 'application/json');
  }
}

export default DriveAPI;
