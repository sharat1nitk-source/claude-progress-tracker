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
      autoQueueEmail: process.env.AUTO_QUEUE_EMAIL || null,
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
      } else if (entry.entryName.endsWith('.json') && entry.entryName.startsWith('projects/')) {
        exportData.projects.push(JSON.parse(entry.getData().toString('utf8')));
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

  async loadPriorities(folderId) {
    try {
      const data = await this.driveAPI.downloadJSON(folderId, 'kb-priorities.json');
      if (data && Array.isArray(data.priorities)) {
        console.log(`  Loaded ${data.priorities.length} priority override(s)`);
        return data.priorities;
      }
    } catch {
      // No priorities file yet
    }
    return [];
  }

  async loadTrackSettings(folderId) {
    try {
      const data = await this.driveAPI.downloadJSON(folderId, 'kb-settings.json');
      return {
        archivedTracks: new Set(data?.archivedTracks || []),
        trackPriorities: data?.trackPriorities || {},
        trackNotes: data?.trackNotes || {},
      };
    } catch {
      return { archivedTracks: new Set(), trackPriorities: {}, trackNotes: {} };
    }
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

  async autoQueueLatestZip(queue) {
    const email = this.config.autoQueueEmail;
    console.log(`\nAuto-queue mode for ${email} — discovering latest export ZIP...`);

    const zipFiles = await this.driveAPI.listFiles(
      this.config.folderId,
      "mimeType='application/zip' or mimeType='application/x-zip-compressed'"
    );

    const exportZips = zipFiles
      .filter(f => f.name.startsWith('data-') && f.name.endsWith('.zip'))
      .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    if (exportZips.length === 0) {
      console.log('  No export ZIPs found on Drive');
      return;
    }

    const latest = exportZips[0];
    const existing = queue.queue.find(q => q.zipFileId === latest.id);

    if (existing) {
      if (this.config.forceReprocess) {
        existing.status = 'pending';
        existing.email = email;
        console.log(`  Re-queued (force): ${latest.name}`);
      } else {
        console.log(`  Already in queue: ${latest.name}`);
      }
    } else {
      queue.queue.push({
        zipFileId: latest.id,
        zipFileName: latest.name,
        email,
        status: 'pending',
        addedAt: new Date().toISOString(),
      });
      console.log(`  Queued: ${latest.name}`);
    }
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

      // Auto-queue: discover latest export ZIP and add to queue
      if (this.config.autoQueueEmail) {
        await this.autoQueueLatestZip(queue);
      }

      const beforeCleanup = queue.queue.length;
      await this.cleanupQueue(queue);
      const afterCleanup = queue.queue.length;

      if (beforeCleanup !== afterCleanup) {
        console.log(`\nCleaned up ${beforeCleanup - afterCleanup} stale queue item(s)`);
        await this.driveAPI.uploadJSON(this.config.folderId, 'process-queue.json', queue);
      }

      // Dedup pending items: keep only latest entry per zipFileId
      const allPending = queue.queue.filter(item => item.status === 'pending');
      const seen = new Map();
      for (const item of allPending) {
        seen.set(item.zipFileId, item);
      }
      const pendingItems = [...seen.values()];

      // Mark duplicates as superseded
      for (const item of allPending) {
        if (seen.get(item.zipFileId) !== item) {
          item.status = 'completed';
          item.processedAt = new Date().toISOString();
          item.note = 'superseded by newer queue entry';
        }
      }

      if (pendingItems.length === 0) {
        console.log('\nAll queue items already processed');
        return;
      }

      console.log(`\nFound ${pendingItems.length} pending item(s) in queue (deduped from ${allPending.length})`);

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

          // Check for state entries missing knowledge (migration from old format)
          const needsMigration = validConversations.filter(c => {
            const entry = this.stateManager.state.conversations[c.uuid];
            return entry && !entry.knowledge;
          });

          if (needsMigration.length > 0) {
            console.log(`${needsMigration.length} conversations need knowledge extraction (state migration)`);
            for (const c of needsMigration) {
              if (!toProcess.find(p => p.uuid === c.uuid)) {
                toProcess.push(c);
              }
            }
          }

          console.log(`To extract: ${toProcess.length} | Skipped: ${skipped.length - needsMigration.length}`);

          // 4. Knowledge extraction (per conversation)
          let newExtractions = 0;
          let extractionResults = [];
          if (toProcess.length > 0) {
            extractionResults = await this.extractor.processConversations(toProcess, knownTracks);

            for (const result of extractionResults) {
              if (result.success) {
                this.stateManager.markProcessed(
                  result.conversation,
                  { projectName: result.knowledge.track },
                  result.knowledge
                );
                newExtractions++;
                totalExtracted++;
              } else {
                totalErrors++;
              }
            }

            await this.stateManager.saveState();
          }

          // Load ALL stored extraction results for full rebuild
          const allResults = this.stateManager.getAllStoredResults();

          if (allResults.length === 0) {
            console.log('No extraction results available — nothing to build');
            item.status = 'completed';
            item.processedAt = new Date().toISOString();
            item.conversationsExtracted = 0;
            continue;
          }

          console.log(`Building knowledge base from ${allResults.length} total conversations (${newExtractions} new)`);

          // 5. Build knowledge base from all stored extractions
          const folderId = this.config.folderId;
          const memories = this.extractMemoryStrings(exportData.memories);
          console.log(`Memories from export: ${memories.length}`);

          const { trackDocuments, synthesis } = await this.builder.build(allResults, exportData.projects);

          // Filter out archived tracks, load user-set track priorities
          const { archivedTracks: archivedSet, trackPriorities, trackNotes } = await this.loadTrackSettings(folderId);
          const activeTrackDocs = trackDocuments.filter(t => !archivedSet.has(t.slug));
          if (archivedSet.size > 0) {
            console.log(`Excluded ${trackDocuments.length - activeTrackDocs.length} archived track(s)`);
          }
          if (Object.keys(trackPriorities).length > 0) {
            console.log(`Track priorities: ${JSON.stringify(trackPriorities)}`);
          }

          // 6. Load priorities and generate digest (only active tracks)
          // Trim track documents for digest (exclude long conversation history tables)
          const trimmedTrackDocs = activeTrackDocs.map(t => ({
            name: t.name,
            slug: t.slug,
            document: t.document.split('## Conversation History')[0] || t.document,
          }));

          const priorities = await this.loadPriorities(folderId);
          const digest = await this.digestGenerator.generate(
            trimmedTrackDocs, synthesis, priorities, memories, trackPriorities, trackNotes
          );

          // 7. Bundle all output into single file (PWA pre-creates via OAuth)
          const kbOutput = {
            tracks: activeTrackDocs.map(({ name, slug, document }) => ({ name, slug, document })),
            synthesis: synthesis || null,
            digest: digest || null,
            updatedAt: new Date().toISOString(),
          };

          const outputFileName = `kb-output-${item.email}.json`;
          await this.driveAPI.uploadJSON(folderId, outputFileName, kbOutput);
          console.log(`Uploaded bundled KB output: ${outputFileName} (${trackDocuments.length} tracks)`);

          // 8. Mark queue item complete
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
