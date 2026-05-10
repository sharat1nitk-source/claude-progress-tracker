import OpenAI from 'openai';
import config from '../prompts/config.js';
import { buildExtractionPrompt } from '../prompts/extraction.js';

class KnowledgeExtractor {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
    this.model = config.model;
  }

  prepareContext(conversation) {
    let context = `Name: ${conversation.name}\n`;
    context += `Created: ${conversation.created_at}\n`;
    context += `Updated: ${conversation.updated_at}\n`;

    if (conversation.summary && conversation.summary.length > 0) {
      context += `\nSummary:\n${conversation.summary}`;
    } else if (conversation.chat_messages && conversation.chat_messages.length > 0) {
      context += '\nMessages:\n';
      let charCount = 0;
      for (const msg of conversation.chat_messages) {
        const text = msg.text?.substring(0, 500) || '(no text)';
        const line = `${msg.sender}: ${text}\n\n`;
        if (charCount + line.length > 2000) break;
        context += line;
        charCount += line.length;
      }
    } else {
      context += '\nNo summary or messages available.';
    }

    return context;
  }

  buildPrompt(conversationContext, knownTracks) {
    return buildExtractionPrompt(conversationContext, knownTracks);
  }

  parseResponse(responseText) {
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```\s*/, '').replace(/```\s*$/, '');
    }

    const parsed = JSON.parse(cleaned);

    const requiredFields = [
      'track', 'conversation_type', 'narrative_summary',
      'decisions_made', 'plans_created', 'tasks_completed',
      'tasks_pending', 'blockers', 'open_questions',
      'key_insights', 'connections_to', 'status',
      'importance', 'progress_narrative',
    ];

    for (const field of requiredFields) {
      if (!(field in parsed)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    const validTypes = ['planning', 'research', 'execution', 'decision', 'reflection'];
    if (!validTypes.includes(parsed.conversation_type)) {
      parsed.conversation_type = 'research';
    }

    const validStatuses = ['active', 'parked', 'blocked', 'completed'];
    if (!validStatuses.includes(parsed.status)) {
      parsed.status = 'active';
    }

    const validImportance = ['high', 'medium', 'low'];
    if (!validImportance.includes(parsed.importance)) {
      parsed.importance = 'medium';
    }

    const arrayFields = [
      'decisions_made', 'plans_created', 'tasks_completed',
      'tasks_pending', 'blockers', 'blockers_resolved', 'open_questions',
      'key_insights', 'connections_to', 'secondary_tracks',
    ];
    for (const field of arrayFields) {
      if (!Array.isArray(parsed[field])) {
        parsed[field] = [];
      }
    }

    return parsed;
  }

  async extractKnowledge(conversation, knownTracks = []) {
    const conversationContext = this.prepareContext(conversation);
    const prompt = this.buildPrompt(conversationContext, knownTracks);

    const apiParams = { model: this.model, max_tokens: config.extractionMaxTokens, messages: [{ role: 'user', content: prompt }] };
    apiParams.temperature = config.temperature;
    const response = await this.client.chat.completions.create(apiParams);

    const resultText = response.choices[0].message.content;
    if (response.choices[0].finish_reason === 'length') {
      console.warn('  Warning: response truncated (max_tokens hit)');
    }
    return this.parseResponse(resultText);
  }

  async processConversations(conversations, knownTracks = [], onProgress = null) {
    const results = [];
    const delayMs = 200;
    const collectedTracks = new Set(knownTracks);

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];

      try {
        console.log(`[${i + 1}/${conversations.length}] Extracting: ${conv.name}`);

        const knowledge = await this.extractKnowledge(conv, [...collectedTracks]);
        collectedTracks.add(knowledge.track);

        results.push({ conversation: conv, knowledge, success: true });

        console.log(`  -> Track: ${knowledge.track} | Type: ${knowledge.conversation_type} | Status: ${knowledge.status}`);

        if (onProgress) {
          onProgress(i + 1, conversations.length, knowledge);
        }

        if (i < conversations.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`  Error processing "${conv.name}": ${error.message}`);
        results.push({ conversation: conv, error: error.message, success: false });
      }
    }

    return results;
  }
}

export default KnowledgeExtractor;
