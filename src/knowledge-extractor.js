import OpenAI from 'openai';

class KnowledgeExtractor {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
    this.model = 'deepseek-chat';
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
    const tracksList = knownTracks.length > 0
      ? knownTracks.map(t => `  - ${t}`).join('\n')
      : '  (No existing tracks)';

    return `Analyze this Claude.ai conversation and extract structured knowledge for a personal knowledge base.

**Known Tracks (from previous conversations):**
${tracksList}

**Conversation Details:**
${conversationContext}

Extract:

1. **Track**: Which track does this belong to? Use an existing track name if it fits, otherwise create a new one (2-4 words).
2. **Conversation type**: planning, research, execution, decision, or reflection.
3. **Narrative summary**: 2-3 sentences of what happened.
4. **Decisions made**: List of specific decisions (empty array if none).
5. **Plans created**: List of plans or roadmaps outlined (empty array if none).
6. **Tasks completed**: What was finished in this conversation (empty array if none).
7. **Tasks pending**: What still needs to be done (empty array if none).
8. **Blockers**: What's preventing progress (empty array if none).
9. **Open questions**: Unresolved questions (empty array if none).
10. **Key insights**: Important learnings or realizations (empty array if none).
11. **Connections to**: Other tracks this relates to, with brief reason (empty array if none).
12. **Status**: active, parked, blocked, or completed.
13. **Importance**: high, medium, or low.
14. **Progress narrative**: One sentence on where things stand.

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "track": "...",
  "conversation_type": "planning|research|execution|decision|reflection",
  "narrative_summary": "...",
  "decisions_made": [],
  "plans_created": [],
  "tasks_completed": [],
  "tasks_pending": [],
  "blockers": [],
  "open_questions": [],
  "key_insights": [],
  "connections_to": [],
  "status": "active|parked|blocked|completed",
  "importance": "high|medium|low",
  "progress_narrative": "..."
}`;
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
      'tasks_pending', 'blockers', 'open_questions',
      'key_insights', 'connections_to',
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

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 2048,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

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
