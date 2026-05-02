import crypto from 'crypto';

/**
 * State manager for tracking processed conversations
 */
class StateManager {
  constructor(driveAPI, folderId, userEmail = null) {
    this.driveAPI = driveAPI;
    this.folderId = folderId;
    this.userEmail = userEmail;
    this.state = {
      conversations: {},
      lastRunAt: null,
    };
    this.stateFileName = userEmail
      ? `processed_conversations-${userEmail}.json`
      : 'processed_conversations.json';
  }

  /**
   * Set user email and update state filename
   */
  setUserEmail(userEmail) {
    this.userEmail = userEmail;
    this.stateFileName = `processed_conversations-${userEmail}.json`;
  }

  /**
   * Load state from Google Drive
   */
  async loadState() {
    try {
      console.log(`📂 Loading processing state: ${this.stateFileName}`);

      const stateData = await this.driveAPI.downloadJSON(this.folderId, this.stateFileName);

      if (stateData) {
        this.state = stateData;
        console.log(`✅ Loaded state from ${this.stateFileName}: ${Object.keys(this.state.conversations).length} conversations tracked`);
      } else {
        console.log(`📝 No existing state found at ${this.stateFileName}, starting fresh`);
        this.state = {
          conversations: {},
          lastRunAt: null,
        };
      }
    } catch (error) {
      console.error(`⚠️  Failed to load state from ${this.stateFileName}, starting fresh:`, error.message);
      this.state = {
        conversations: {},
        lastRunAt: null,
      };
    }
  }

  /**
   * Save state to Google Drive
   */
  async saveState() {
    try {
      this.state.lastRunAt = new Date().toISOString();
      const conversationCount = Object.keys(this.state.conversations).length;

      console.log(`💾 Saving state: ${this.stateFileName} (${conversationCount} conversations tracked)`);

      await this.driveAPI.uploadJSON(this.folderId, this.stateFileName, this.state);

      console.log(`✅ Saved processing state to ${this.stateFileName}`);
    } catch (error) {
      console.error(`❌ Failed to save state to ${this.stateFileName}:`, error.message);
      throw error;
    }
  }

  /**
   * Calculate content hash for a conversation
   * @param {Object} conversation
   * @returns {string}
   */
  calculateHash(conversation) {
    // Create stable hash from key conversation properties
    const hashData = {
      name: conversation.name,
      updated_at: conversation.updated_at,
      summary: conversation.summary || '',
      message_count: conversation.chat_messages?.length || 0,
    };

    const hashString = JSON.stringify(hashData, Object.keys(hashData).sort());
    return crypto.createHash('sha256').update(hashString).digest('hex');
  }

  /**
   * Check if a conversation needs processing
   * @param {Object} conversation
   * @param {boolean} forceReprocess - Force reprocessing even if already processed
   * @returns {boolean}
   */
  shouldProcess(conversation, forceReprocess = false) {
    if (forceReprocess) {
      return true;
    }

    const uuid = conversation.uuid;
    const currentHash = this.calculateHash(conversation);

    // Not in state -> needs processing
    if (!this.state.conversations[uuid]) {
      return true;
    }

    const storedState = this.state.conversations[uuid];

    // Updated since last processing -> needs processing
    if (conversation.updated_at > storedState.lastModifiedTime) {
      return true;
    }

    // Content changed -> needs processing
    if (currentHash !== storedState.contentHash) {
      return true;
    }

    return false;
  }

  /**
   * Mark a conversation as processed
   * @param {Object} conversation
   * @param {Object} metadata - Extracted metadata
   */
  markProcessed(conversation, metadata) {
    const uuid = conversation.uuid;
    const contentHash = this.calculateHash(conversation);

    this.state.conversations[uuid] = {
      lastProcessedAt: new Date().toISOString(),
      lastModifiedTime: conversation.updated_at,
      contentHash,
      projectName: metadata?.projectName || 'Unknown',
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalTracked: Object.keys(this.state.conversations).length,
      lastRunAt: this.state.lastRunAt,
    };
  }

  /**
   * Filter conversations that need processing
   * @param {Array<Object>} conversations
   * @param {boolean} forceReprocess
   * @returns {Object} { toProcess: [], skipped: [] }
   */
  filterConversations(conversations, forceReprocess = false) {
    const toProcess = [];
    const skipped = [];

    for (const conv of conversations) {
      if (this.shouldProcess(conv, forceReprocess)) {
        toProcess.push(conv);
      } else {
        skipped.push(conv);
      }
    }

    return { toProcess, skipped };
  }
}

export default StateManager;
