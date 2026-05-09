#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import DriveAPI from './drive-api.js';
import KnowledgeExtractor from './knowledge-extractor.js';
import KnowledgeBuilder from './knowledge-builder.js';
import DigestGenerator from './digest-generator.js';
import StateManager from './state-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ConversationProcessor {
  constructor() {
    this.config = this.loadConfig();
    this.driveAPI = null;
    this.extractor = null;
    this.builder = null;
    this.digestGenerator = null;
    this.stateManager = null;
    this.tempDir = path.join(__dirname, '..', 'temp');
  }

  loadConfig() {
    const requiredVars = ['GOOGLE_DRIVE_CREDENTIALS', 'GOOGLE_DRIVE_FOLDER_ID', 'ANTHROPIC_API_KEY'];
    const missing = requiredVars.filter(v => !process.env[v]);

    if (missing.length > 0) {
      console.error('Missing required environment variables:', missing.join(', '));
      process.exit(1);
    }

    let credentials;
    const rawCreds = process.env.GOOGLE_DRIVE_CREDENTIALS;
    try {
      credentials = JSON.parse(rawCreds);
    } catch {
      try {
        credentials = JSON.parse(Buffer.from(rawCreds, 'base64').toString('utf8'));
      } catch {
        console.error('Failed to parse GOOGLE_DRIVE_CREDENTIALS');
        process.exit(1);
      }
    }

    return {
      credentials,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
      apiKey: process.env.ANTHROPIC_API_KEY,
      forceReprocess: process.env.FORCE_REPROCESS === 'true',
    };
  }

  async initialize() {
    console.log('Starting Knowledge Base Processor\n');

    this.driveAPI = new DriveAPI(this.config.credentials);
    await this.driveAPI.authenticate();

    this.extractor = new KnowledgeExtractor(this.config.apiKey);
    this.builder = new KnowledgeBuilder(this.config.apiKey);
    this.digestGenerator = new DigestGenerator(this.config.apiKey);

    this.stateManager = new StateManager(this.driveAPI, this.config.folderId);

    await fs.mkdir(this.tempDir, { recursive: true });
  }

  extractExport(zipPath) {
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
        exportData.conversations = JSON.parse(entry.getData().toString('utf8'));
      } else if (entry.entryName === 'projects.json') {
        exportData.projects = JSON.parse(entry.getData().toString('utf8'));
      } else if (entry.entryName === 'memories.json') {
        exportData.memories = JSON.parse(entry.getData().toString('utf8'));
      } else if (entry.entryName === 'users.json') {
        exportData.users = JSON.parse(entry.getData().toString('utf8'));
      }
    }

    return exportData;
  }

  extractMemoryStrings(memories) {
    if (!memories || memories.length === 0) return [];
    return memories
      .filter(m => m && (m.content || m.text || m.summary))
      .map(m => m.content || m.text || m.summary);
  }

  async ensureKnowledgeBaseFolders(parentFolderId) {
    let kbFolderId = await this.findOrCreateFolder(parentFolderId, 'knowledge-base');
    let tracksFolderId = await this.findOrCreateFolder(kbFolderId, 'tracks');
    let metaFolderId = await this.findOrCreateFolder(kbFolderId, 'meta');
    return { kbFolderId, tracksFolderId, metaFolderId };
  }

  async findOrCreateFolder(parentId, folderName) {
    const existing = await this.driveAPI.listFiles(
      parentId,
      `name='${folderName}' and mimeType='application/vnd.google-apps.folder'`
    );

    if (existing.length > 0) return existing[0].id;

    const response = await this.driveAPI.drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
      supportsAllDrives: true,
    });

    console.log(`  Created folder: ${folderName}`);
    return response.data.id;
  }

  async loadPriorities(kbFolderId) {
    try {
      const data = await this.driveAPI.downloadJSON(kbFolderId, 'priorities.json');
      if (data && Array.isArray(data.priorities)) {
        console.log(`  Loaded ${data.priorities.length} priority override(s)`);
        return data.priorities;
      }
    } catch {
      // No priorities file yet
    }
    return [];
  }

  async cleanupQueue(queue) {
    const now = Date.now();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

    const driveFiles = await this.driveAPI.listFiles(
      this.config.folderId,
      "mimeType='application/zip' or mimeType='application/x-zip-compressed'"
    );
    const driveFileIds = new Set(driveFiles.map(f => f.id));

    queue.queue = queue.queue.filter(item => {
      if (item.status === 'completed' && item.processedAt) {
        const processedTime = new Date(item.processedAt).getTime();
        if (now - processedTime > ONE_WEEK) {
          console.log(`  Removing old completed item: ${item.zipFileName}`);
          return false;
        }
      }

      if ((item.status === 'failed' || item.status === 'pending') && !driveFileIds.has(item.zipFileId)) {
        console.log(`  Removing item with deleted ZIP: ${item.zipFileName}`);
        return false;
      }

      return true;
    });
  }

  async cleanup() {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  async run() {
    const startTime = Date.now();

    try {
      await this.initialize();

      let queue = await this.driveAPI.downloadJSON(
        this.config.folderId,
        'process-queue.json'
      );

      if (!queue || !queue.queue || queue.queue.length === 0) {
        console.log('\nNo items in processing queue');
        return;
      }

      const beforeCleanup = queue.queue.length;
      await this.cleanupQueue(queue);
      const afterCleanup = queue.queue.length;

      if (beforeCleanup !== afterCleanup) {
        console.log(`\nCleaned up ${beforeCleanup - afterCleanup} stale queue item(s)`);
        await this.driveAPI.uploadJSON(this.config.folderId, 'process-queue.json', queue);
      }

      const pendingItems = queue.queue.filter(item => item.status === 'pending');

      if (pendingItems.length === 0) {
        console.log('\nAll queue items already processed');
        return;
      }

      console.log(`\nFound ${pendingItems.length} pending item(s) in queue`);

      let totalExtracted = 0;
      let totalErrors = 0;

      for (const item of pendingItems) {
        try {
          console.log(`\n${'='.repeat(60)}`);
          console.log(`Processing: ${item.zipFileName}`);
          console.log(`User: ${item.email}`);
          console.log('='.repeat(60));

          // 1. Load user-specific state
          this.stateManager.setUserEmail(item.email);
          await this.stateManager.loadState();

          // 2. Download + extract ZIP
          const zipPath = path.join(this.tempDir, item.zipFileName);
          await this.driveAPI.downloadFile(item.zipFileId, zipPath);
          const exportData = this.extractExport(zipPath);

          const knownTracks = exportData.projects
            .filter(p => !p.is_starter_project)
            .map(p => p.name);

          // Skip empty conversations
          const validConversations = exportData.conversations.filter(
            c => c.name && (c.summary || (c.chat_messages && c.chat_messages.length > 0))
          );

          console.log(`Total conversations: ${exportData.conversations.length} (${validConversations.length} valid)`);

          // 3. Filter new/changed conversations
          const { toProcess, skipped } = this.stateManager.filterConversations(
            validConversations,
            this.config.forceReprocess
          );

          console.log(`To extract: ${toProcess.length} | Skipped: ${skipped.length}`);

          // 4. Knowledge extraction (per conversation)
          let extractionResults = [];
          if (toProcess.length > 0) {
            extractionResults = await this.extractor.processConversations(toProcess, knownTracks);

            for (const result of extractionResults) {
              if (result.success) {
                this.stateManager.markProcessed(result.conversation, { projectName: result.knowledge.track });
                totalExtracted++;
              } else {
                totalErrors++;
              }
            }

            await this.stateManager.saveState();
          }

          // Also load previously extracted results from state for full knowledge base rebuild
          // For conversations we skipped, reconstruct minimal extraction data from state
          const allResults = [...extractionResults];
          // New extractions are enough for the builder — skipped conversations'
          // knowledge is already in the track docs from previous runs.
          // We only need to rebuild if there are new extractions.

          if (extractionResults.filter(r => r.success).length === 0 && !this.config.forceReprocess) {
            console.log('No new extractions — skipping knowledge base rebuild');
            item.status = 'completed';
            item.processedAt = new Date().toISOString();
            item.conversationsExtracted = 0;
            continue;
          }

          // 5. Ensure Drive folder structure
          const { kbFolderId, tracksFolderId, metaFolderId } =
            await this.ensureKnowledgeBaseFolders(this.config.folderId);

          // 6. Build knowledge base (track docs + synthesis)
          // For a full rebuild, we'd need all extractions. For incremental,
          // we load existing track docs from Drive and merge new results in.
          // For now, build from all successful extractions in this run.
          // Future: merge with existing track docs for incremental updates.
          const memories = this.extractMemoryStrings(exportData.memories);
          const { trackDocuments, synthesis } = await this.builder.build(
            extractionResults.filter(r => r.success)
          );

          // 7. Upload track docs to Drive
          for (const { slug, document } of trackDocuments) {
            await this.driveAPI.uploadFile(
              tracksFolderId, `${slug}.md`, document, 'text/markdown'
            );
          }

          // 8. Upload synthesis
          if (synthesis) {
            await this.driveAPI.uploadFile(
              metaFolderId, 'synthesis.md', synthesis, 'text/markdown'
            );
          }

          // 9. Load priorities and generate digest
          const priorities = await this.loadPriorities(kbFolderId);
          const digest = await this.digestGenerator.generate(
            trackDocuments, synthesis, priorities, memories
          );

          if (digest) {
            await this.driveAPI.uploadJSON(
              kbFolderId, `digest-${item.email}.json`, digest
            );
          }

          // 10. Mark queue item complete
          item.status = 'completed';
          item.processedAt = new Date().toISOString();
          item.conversationsExtracted = extractionResults.filter(r => r.success).length;

          console.log(`\nCompleted processing for ${item.email}`);
        } catch (error) {
          console.error(`Error processing ${item.zipFileName}:`, error.message);
          item.status = 'failed';
          item.error = error.message;
          totalErrors++;
        }
      }

      await this.driveAPI.uploadJSON(this.config.folderId, 'process-queue.json', queue);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log('\n' + '='.repeat(60));
      console.log('PROCESSING COMPLETE');
      console.log('='.repeat(60));
      console.log(`Extracted: ${totalExtracted} conversations`);
      console.log(`Errors: ${totalErrors}`);
      console.log(`Duration: ${duration}s`);
      console.log('='.repeat(60));

      await fs.writeFile(
        path.join(__dirname, '..', 'processing-summary.json'),
        JSON.stringify({ extracted: totalExtracted, errors: totalErrors, duration: `${duration}s`, timestamp: new Date().toISOString() }, null, 2)
      );
    } catch (error) {
      console.error('\nFatal error:', error.message);
      console.error(error.stack);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const processor = new ConversationProcessor();
  processor.run();
}

export default ConversationProcessor;
