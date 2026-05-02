#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import DriveAPI from './drive-api.js';
import ClaudeAPI from './claude-api.js';
import StateManager from './state-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main orchestration for processing Claude conversations
 */
class ConversationProcessor {
  constructor() {
    this.config = this.loadConfig();
    this.driveAPI = null;
    this.claudeAPI = null;
    this.stateManager = null;
    this.tempDir = path.join(__dirname, '..', 'temp');
  }

  /**
   * Load configuration from environment
   */
  loadConfig() {
    const requiredVars = ['GOOGLE_DRIVE_CREDENTIALS', 'GOOGLE_DRIVE_FOLDER_ID', 'ANTHROPIC_API_KEY'];
    const missing = requiredVars.filter(v => !process.env[v]);

    if (missing.length > 0) {
      console.error('❌ Missing required environment variables:', missing.join(', '));
      console.error('\nPlease set these in GitHub Secrets or create a .env file based on .env.example');
      process.exit(1);
    }

let credentials;
        const rawCreds = process.env.GOOGLE_DRIVE_CREDENTIALS;
        try {
                credentials = JSON.parse(rawCreds);
        } catch (e1) {
                try {
                          credentials = JSON.parse(Buffer.from(rawCreds, 'base64').toString('utf8'));
                } catch (e2) {
                          console.error('❌ Failed to parse GOOGLE_DRIVE_CREDENTIALS as JSON');
                          console.error('Value starts with:', rawCreds ? rawCreds.substring(0, 20) + '...' : 'undefined');
                          process.exit(1);
                }
        }
        console.log('Service Account Email:', credentials.client_email);

    return {
      credentials,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
      apiKey: process.env.ANTHROPIC_API_KEY,
      forceReprocess: process.env.FORCE_REPROCESS === 'true',
      logLevel: process.env.LOG_LEVEL || 'info',
    };
      
  }

  /**
   * Initialize API clients
   */
  async initialize() {
    console.log('🚀 Starting Claude Conversation Processor\n');

    // Initialize Drive API
    this.driveAPI = new DriveAPI(this.config.credentials);
    await this.driveAPI.authenticate();

    // Initialize Claude API
    this.claudeAPI = new ClaudeAPI(this.config.apiKey);
    console.log('✅ Claude API client initialized');

    // Initialize State Manager
    this.stateManager = new StateManager(this.driveAPI, this.config.folderId);
    await this.stateManager.loadState();

    // Create temp directory
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  /**
   * List and download ZIP files from Google Drive
   */
  async getExportFiles() {
    console.log('\n📥 Fetching export files from Google Drive...');

    const files = await this.driveAPI.listFiles(
      this.config.folderId,
      "mimeType='application/zip' or mimeType='application/x-zip-compressed'"
    );

    console.log(`Found ${files.length} ZIP file(s)`);

    return files;
  }

  /**
   * Extract and parse a ZIP export
   * @param {string} zipPath
   * @returns {Promise<Object>} Parsed export data
   */
  async extractExport(zipPath) {
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    const exportData = {
      conversations: [],
      projects: [],
      memories: [],
      users: [],
    };

    for (const entry of zipEntries) {
      if (entry.entryName === 'conversations.json') {
        const content = entry.getData().toString('utf8');
        exportData.conversations = JSON.parse(content);
      } else if (entry.entryName === 'projects.json') {
        const content = entry.getData().toString('utf8');
        exportData.projects = JSON.parse(content);
      } else if (entry.entryName === 'memories.json') {
        const content = entry.getData().toString('utf8');
        exportData.memories = JSON.parse(content);
      } else if (entry.entryName === 'users.json') {
        const content = entry.getData().toString('utf8');
        exportData.users = JSON.parse(content);
      }
    }

    return exportData;
  }

  /**
   * Process all conversations
   */
  async processConversations(exportData) {
    const { conversations, projects } = exportData;

    console.log(`\n📊 Total conversations in export: ${conversations.length}`);
    console.log(`📁 Known projects in export: ${projects.length}`);

    // Extract known project names
    const knownProjects = projects
      .filter(p => !p.is_starter_project)
      .map(p => p.name);

    console.log('Known projects:', knownProjects.join(', ') || 'None');

    // Filter conversations that need processing
    const { toProcess, skipped } = this.stateManager.filterConversations(
      conversations,
      this.config.forceReprocess
    );

    console.log(`\n🔄 To process: ${toProcess.length}`);
    console.log(`⏭️  Skipped (already processed): ${skipped.length}`);

    if (toProcess.length === 0) {
      console.log('\n✅ All conversations are up to date!');
      return [];
    }

    // Process conversations with Claude API
    const results = await this.claudeAPI.processConversations(toProcess, knownProjects);

    // Mark successful ones as processed
    for (const result of results) {
      if (result.success) {
        this.stateManager.markProcessed(result.conversation, result.metadata);
      }
    }

    return results;
  }

  /**
   * Generate project ID from name
   */
  slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Assign emoji and color based on project name
   */
  getProjectStyle(projectName) {
    const name = projectName.toLowerCase();

    // Keyword-based matching
    const styles = {
      ai: { emoji: '🧠', color: '#9333ea' },
      learn: { emoji: '📚', color: '#0ea5e9' },
      finance: { emoji: '💰', color: '#f59e0b' },
      home: { emoji: '🏠', color: '#3b82f6' },
      automation: { emoji: '⚙️', color: '#10b981' },
      productivity: { emoji: '📊', color: '#8b5cf6' },
      health: { emoji: '❤️', color: '#ef4444' },
      wellbeing: { emoji: '🧘', color: '#ec4899' },
      misc: { emoji: '📝', color: '#6b7280' },
    };

    for (const [keyword, style] of Object.entries(styles)) {
      if (name.includes(keyword)) {
        return style;
      }
    }

    // Default style
    return { emoji: '📁', color: '#6b7280' };
  }

  /**
   * Merge results into tracking projects.json
   */
  async updateTrackingData(results, userEmail) {
    console.log(`\n📝 Updating tracking data for ${userEmail}...`);

    const fileName = `projects-${userEmail}.json`;

    // Load existing tracking data for this user
    let trackingData = await this.driveAPI.downloadJSON(
      this.config.folderId,
      fileName
    );

    if (!trackingData || !trackingData.projects) {
      trackingData = {
        projects: [],
        lastUpdated: new Date().toISOString(),
      };
    }

    // Group results by project
    const projectMap = new Map();

    // Initialize with existing projects
    for (const project of trackingData.projects) {
      projectMap.set(project.id, project);
    }

    // Add new conversations
    for (const result of results) {
      if (!result.success) continue;

      const { conversation, metadata } = result;
      const projectName = metadata.projectName;
      const projectId = this.slugify(projectName);

      // Remove conversation from ALL other projects first (handles re-categorization)
      for (const [pid, proj] of projectMap.entries()) {
        proj.conversations = proj.conversations.filter(c => c.uuid !== conversation.uuid);
      }

      // Get or create project
      if (!projectMap.has(projectId)) {
        const style = this.getProjectStyle(projectName);
        projectMap.set(projectId, {
          id: projectId,
          name: projectName,
          emoji: style.emoji,
          color: style.color,
          conversations: [],
        });
      }

      const project = projectMap.get(projectId);

      // Add conversation (we know it's not in any project now)
      const convEntry = {
        uuid: conversation.uuid,
        name: conversation.name,
        topic: metadata.topic,
        progressSummary: metadata.progressSummary,
        progressPercent: metadata.progressPercent,
        nextSteps: metadata.nextSteps,
        lastUpdated: conversation.updated_at,
        reviewDate: metadata.reviewDate,
        completed: metadata.progressPercent >= 100,
        notes: '',
      };
      project.conversations.push(convEntry);
    }

    // Convert map to array, remove empty projects, and sort conversations
    trackingData.projects = Array.from(projectMap.values())
      .filter(project => project.conversations.length > 0); // Remove empty projects

    for (const project of trackingData.projects) {
      project.conversations.sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
    }

    trackingData.lastUpdated = new Date().toISOString();

    // Upload to Drive with user-specific filename
    await this.driveAPI.uploadJSON(this.config.folderId, fileName, trackingData);

    console.log(`✅ Updated ${fileName} with ${results.filter(r => r.success).length} conversations`);

    return trackingData;
  }

  /**
   * Cleanup temporary files
   */
  async cleanup() {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Main execution flow
   */
  async run() {
    const startTime = Date.now();

    try {
      await this.initialize();

      // Read queue from Drive
      console.log('📋 Looking for process-queue.json in folder:', this.config.folderId);
      let queue = await this.driveAPI.downloadJSON(
        this.config.folderId,
        'process-queue.json'
      );

      console.log('Queue data:', queue);

      if (!queue || !queue.queue || queue.queue.length === 0) {
        console.log('\n⚠️  No items in processing queue');
        console.log('Queue object:', JSON.stringify(queue, null, 2));

        // List all JSON files to help debug
        const allFiles = await this.driveAPI.listFiles(
          this.config.folderId,
          "mimeType='application/json'"
        );
        console.log('All JSON files in folder:', allFiles.map(f => f.name));

        return;
      }

      // Filter pending items
      const pendingItems = queue.queue.filter(item => item.status === 'pending');

      if (pendingItems.length === 0) {
        console.log('\n✅ All queue items already processed');
        return;
      }

      console.log(`\n📋 Found ${pendingItems.length} pending item(s) in queue`);

      let totalProcessed = 0;
      let totalErrors = 0;

      // Process each pending item
      for (const item of pendingItems) {
        try {
          console.log(`\n${'='.repeat(60)}`);
          console.log(`📦 Processing: ${item.zipFileName}`);
          console.log(`👤 User: ${item.email}`);
          console.log(`${'='.repeat(60)}`);

          // Load user-specific state
          this.stateManager.setUserEmail(item.email);
          await this.stateManager.loadState();

          // Download export
          const zipPath = path.join(this.tempDir, item.zipFileName);
          await this.driveAPI.downloadFile(item.zipFileId, zipPath);
          console.log('✅ Downloaded export');

          // Extract and parse
          const exportData = await this.extractExport(zipPath);
          console.log('✅ Extracted export data');

          // Process conversations (will filter based on state)
          const results = await this.processConversations(exportData);

          // Update tracking data for this user
          if (results.length > 0) {
            await this.updateTrackingData(results, item.email);
          }

          // Save user-specific state
          await this.stateManager.saveState();

          // Update queue item status
          item.status = 'completed';
          item.processedAt = new Date().toISOString();
          item.conversationsProcessed = results.filter(r => r.success).length;

          const successCount = results.filter(r => r.success).length;
          const errorCount = results.filter(r => !r.success).length;
          totalProcessed += successCount;
          totalErrors += errorCount;

          console.log(`✅ Processed ${successCount} conversations for ${item.email}`);
        } catch (error) {
          console.error(`❌ Error processing ${item.zipFileName}:`, error.message);
          item.status = 'failed';
          item.error = error.message;
          totalErrors++;
        }
      }

      // Save updated queue back to Drive
      await this.driveAPI.uploadJSON(this.config.folderId, 'process-queue.json', queue);
      console.log('\n✅ Updated queue status');

      // Generate summary
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log('\n' + '='.repeat(60));
      console.log('✅ PROCESSING COMPLETE');
      console.log('='.repeat(60));
      console.log(`📊 Processed: ${totalProcessed} conversations`);
      console.log(`❌ Errors: ${totalErrors}`);
      console.log(`👥 Users: ${pendingItems.length}`);
      console.log(`⏱️  Duration: ${duration}s`);
      console.log('='.repeat(60));

      // Write summary for GitHub Actions
      const summary = {
        processed: totalProcessed,
        errors: totalErrors,
        users: pendingItems.length,
        duration: `${duration}s`,
        timestamp: new Date().toISOString(),
      };

      await fs.writeFile(
        path.join(__dirname, '..', 'processing-summary.json'),
        JSON.stringify(summary, null, 2)
      );
    } catch (error) {
      console.error('\n❌ Fatal error:', error.message);
      console.error(error.stack);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const processor = new ConversationProcessor();
  processor.run();
}

export default ConversationProcessor;
