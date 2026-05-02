import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude API wrapper for conversation analysis
 */
class ClaudeAPI {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
    this.model = 'claude-sonnet-4-20250514';
  }

  /**
   * Extract metadata from a conversation
   * @param {Object} conversation - Conversation object with name, summary, created_at, updated_at
   * @param {Array<string>} knownProjects - List of known project names
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractMetadata(conversation, knownProjects = []) {
    try {
      // Prepare context
      const conversationContext = this.prepareContext(conversation);

      const prompt = this.buildPrompt(conversationContext, knownProjects);

      // Call Claude API
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Parse JSON response
      const resultText = response.content[0].text;
      const metadata = this.parseResponse(resultText);

      return metadata;
    } catch (error) {
      console.error('❌ Claude API error:', error.message);
      throw error;
    }
  }

  /**
   * Prepare conversation context for analysis
   * @param {Object} conversation
   * @returns {string}
   */
  prepareContext(conversation) {
    let context = `Name: ${conversation.name}\n`;
    context += `Created: ${conversation.created_at}\n`;
    context += `Updated: ${conversation.updated_at}\n`;

    if (conversation.summary && conversation.summary.length > 0) {
      context += `\nSummary:\n${conversation.summary}`;
    } else if (conversation.chat_messages && conversation.chat_messages.length > 0) {
      // Fallback: Use first few messages if no summary
      context += '\nFirst messages:\n';
      const messages = conversation.chat_messages.slice(0, 6); // First 3 exchanges
      for (const msg of messages) {
        context += `${msg.sender}: ${msg.text?.substring(0, 500) || '(no text)'}\n\n`;
      }
    } else {
      context += '\nNo summary or messages available.';
    }

    return context;
  }

  /**
   * Build the analysis prompt
   * @param {string} conversationContext
   * @param {Array<string>} knownProjects
   * @returns {string}
   */
  buildPrompt(conversationContext, knownProjects) {
    const projectsList = knownProjects.length > 0
      ? knownProjects.map(p => `  - ${p}`).join('\n')
      : '  (No existing projects)';

    return `Analyze this Claude.ai conversation and extract metadata for progress tracking.

**Known Projects (from user's Claude.ai account):**
${projectsList}

**Conversation Details:**
${conversationContext}

Based on this information, extract:

1. **Project Match**: Which known project does this belong to?
   - If it matches a known project, use that exact name
   - If no match, suggest a new project name (2-4 words)
   - Consider the conversation name and summary content

2. **Topic**: Specific topic discussed (2-4 words max)

3. **Progress Summary**: Where did the user leave off? (1 short sentence)
   - Extract from the summary what was accomplished or decided

4. **Progress Estimate**: Overall completion percentage (0-100)
   - 0-25%: Initial exploration/questions
   - 25-50%: Active discussion/planning
   - 50-75%: Partial implementation or deep analysis
   - 75-100%: Near completion or decision made

5. **Next Steps**: What should the user do next? (2-3 actionable bullet points)

6. **Review Date**: When should this be revisited?
   - If unfinished work: within 1 week
   - If completed/decided: within 2-4 weeks for review
   - Format: YYYY-MM-DD

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "projectName": "exact match or new name",
  "topic": "...",
  "progressSummary": "...",
  "progressPercent": 0-100,
  "nextSteps": ["...", "...", "..."],
  "reviewDate": "YYYY-MM-DD"
}`;
  }

  /**
   * Parse Claude's response
   * @param {string} responseText
   * @returns {Object}
   */
  parseResponse(responseText) {
    try {
      // Remove markdown code blocks if present
      let cleaned = responseText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/```json\s*/, '').replace(/```\s*$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```\s*/, '').replace(/```\s*$/, '');
      }

      const parsed = JSON.parse(cleaned);

      // Validate required fields
      const required = ['projectName', 'topic', 'progressSummary', 'progressPercent', 'nextSteps', 'reviewDate'];
      for (const field of required) {
        if (!(field in parsed)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Validate types
      if (typeof parsed.progressPercent !== 'number' || parsed.progressPercent < 0 || parsed.progressPercent > 100) {
        throw new Error('progressPercent must be a number between 0 and 100');
      }

      if (!Array.isArray(parsed.nextSteps)) {
        throw new Error('nextSteps must be an array');
      }

      return parsed;
    } catch (error) {
      console.error('❌ Failed to parse Claude response:', error.message);
      console.error('Response text:', responseText);
      throw new Error(`Invalid response format: ${error.message}`);
    }
  }

  /**
   * Process multiple conversations with rate limiting
   * @param {Array<Object>} conversations
   * @param {Array<string>} knownProjects
   * @param {Function} onProgress - Callback for progress updates
   * @returns {Promise<Array<Object>>}
   */
  async processConversations(conversations, knownProjects = [], onProgress = null) {
    const results = [];
    const delayMs = 200; // 200ms delay between requests (5 requests/second)

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];

      try {
        console.log(`\n[${i + 1}/${conversations.length}] Processing: ${conv.name}`);

        const metadata = await this.extractMetadata(conv, knownProjects);
        results.push({
          conversation: conv,
          metadata,
          success: true,
        });

        console.log(`  ✅ Project: ${metadata.projectName} | Topic: ${metadata.topic} | Progress: ${metadata.progressPercent}%`);

        if (onProgress) {
          onProgress(i + 1, conversations.length, metadata);
        }

        // Rate limiting delay
        if (i < conversations.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`  ❌ Error processing conversation: ${error.message}`);
        results.push({
          conversation: conv,
          error: error.message,
          success: false,
        });
      }
    }

    return results;
  }
}

export default ClaudeAPI;
