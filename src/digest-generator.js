import OpenAI from 'openai';

class DigestGenerator {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
    this.model = 'deepseek-chat';
  }

  condenseTrackForDigest({ name, slug, document }, trackNotes = {}) {
    const statusMatch = document.match(/Status: (\w+) \| Last active: (\d{4}-\d{2}-\d{2})/);
    const status = statusMatch?.[1] || 'unknown';
    const lastActive = statusMatch?.[2] || 'unknown';

    const extractSection = (sectionName) => {
      const m = document.match(new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |$)`));
      if (!m) return [];
      return m[1].split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim());
    };

    const currentStateMatch = document.match(/## Current State\n([\s\S]*?)(?=\n## |$)/);
    const currentState = currentStateMatch
      ? currentStateMatch[1].trim().split(/\. +/).slice(0, 2).join('. ')
      : '';

    const pending = extractSection('Pending Tasks').slice(0, 5);
    const blockers = extractSection('Blockers').slice(0, 3);
    const blockersResolved = extractSection('Blockers Resolved').slice(0, 3);
    const decisions = extractSection('Decisions Made').slice(-3);

    let condensed = `### ${name} (status: ${status}, last active: ${lastActive})\n`;
    if (currentState) condensed += `Current: ${currentState}\n`;
    if (pending.length) condensed += `Pending: ${pending.join(' | ')}\n`;
    if (blockers.length) condensed += `Blockers: ${blockers.join(' | ')}\n`;
    if (blockersResolved.length) condensed += `Blockers recently resolved: ${blockersResolved.join(' | ')}\n`;
    if (decisions.length) condensed += `Recent decisions: ${decisions.join(' | ')}\n`;
    const note = trackNotes[slug] || '';
    if (note) condensed += `User note: ${note}\n`;
    return condensed;
  }

  async generate(trackDocuments, synthesis, priorities = null, memories = null, trackPriorities = {}, trackNotes = {}) {
    if (!trackDocuments || trackDocuments.length === 0) {
      console.log('No track documents to generate digest from.');
      return null;
    }

    console.log('Generating visual digest...');

    const condensedTracks = trackDocuments.map(t => this.condenseTrackForDigest(t, trackNotes)).join('\n');
    const inputChars = condensedTracks.length + (synthesis || '').length;
    console.log(`  Input: ${trackDocuments.length} tracks, ~${inputChars} chars (~${Math.ceil(inputChars / 4)} tokens est.)`);

    let contextBlock = `## Track Snapshots\n\n${condensedTracks}\n\n## Cross-Track Synthesis\n\n${synthesis || 'No synthesis available.'}`;

    if (priorities && priorities.length > 0) {
      const priorityLines = priorities
        .map(p => `- [${p.set_at?.split('T')[0] || 'unknown'}] ${p.statement}`)
        .join('\n');
      contextBlock += `\n\n## User-Stated Priority Overrides\nThe user has explicitly stated these priorities. These MUST take precedence over inferred priorities:\n${priorityLines}`;
    }

    if (memories && memories.length > 0) {
      const memoryLines = memories.slice(0, 50).map(m => `- ${m}`).join('\n');
      contextBlock += `\n\n## User's Claude.ai Memories\nThese are the user's own stated facts, preferences, and context:\n${memoryLines}`;
    }

    const high = Object.entries(trackPriorities).filter(([, v]) => v === 'high').map(([k]) => k);
    const low = Object.entries(trackPriorities).filter(([, v]) => v === 'low').map(([k]) => k);
    if (high.length || low.length) {
      contextBlock += '\n\n## User-Set Track Priorities';
      if (high.length) contextBlock += `\nHigh priority (user explicitly elevated): ${high.join(', ')}`;
      if (low.length) contextBlock += `\nLow priority (user explicitly deprioritized): ${low.join(', ')}`;
      contextBlock += '\nThese MUST influence focus_recommendation and cross_track_priorities ordering.';
    }

    const prompt = `You are generating a structured digest from a user's personal knowledge base. This powers their daily focus dashboard.

${contextBlock}

IMPORTANT RULES — read carefully:

1. **User notes are AUTHORITATIVE**: Each track may have a "User note:" line. This is the USER telling you something about this track. If a user note contradicts the document data (e.g., says "blocker is resolved" or "dev environment is ready"), BELIEVE THE USER NOTE over the stale document data. These notes are the user's explicit corrections.

2. **Check for resolved blockers**: Track documents may have a "## Blockers Resolved" section listing blockers that were resolved in a conversation. Do NOT list resolved blockers as current blockers. Only report blockers that are still active and recent.

3. **Trajectory over aggregate**: Look at the RECENT conversations (last 2-3 entries in the conversation history). Recent activity matters more than old status. A track that was "blocked" 3 conversations ago but "active" for the last 2 is actually active now.

4. **Be critical about stale data**: If last active date is old (>7 days), the data may be stale. Lead with the user's note if available.

5. **User priorities**: "User-Set Track Priorities" and "User-Stated Priority Overrides" MUST directly influence the focus_recommendation and cross_track_priorities.

First, analyze each track's real priority by weighing these signals in order of importance:
- **User notes and priorities** (highest — these override everything)
- **Recency**: Recently active tracks matter more than dormant ones
- **Trajectory**: Is the track trending active/improving or stuck/declining?
- **Task density**: Tracks with many concrete pending tasks should rank higher
- **Blocker impact**: Blocked tracks need attention to unstick, BUT check if the blockers are recent or historical
- **Completion trajectory**: Tracks where most tasks are done and nothing new is pending may be winding down
- **Cross-track impact**: Tracks that unblock or feed into others are higher leverage

Then generate a JSON digest. The focus_recommendation should be opinionated: tell the user exactly what to work on first and why. The cross_track_priorities should rank by actual importance to the user's goals — not just status labels. Use the analysis above to determine rank.

Keep all text SHORT — one sentence max per field. Limit arrays strictly to the counts shown.

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "generated_at": "${new Date().toISOString()}",
  "focus_recommendation": "2-3 sentences max",
  "tracks": [
    {
      "name": "Track Name",
      "slug": "track-name",
      "status": "active|stalling|blocked|completed",
      "status_reason": "one short sentence",
      "current_focus": "one short sentence",
      "top_priorities": [
        { "action": "short phrase", "why": "short phrase", "urgency": "high|medium|low" }
      ],
      "blockers": ["one phrase each"],
      "recent_wins": ["one phrase each"],
      "days_since_active": 0
    }
  ],
  "cross_track_priorities": [
    { "rank": 1, "action": "short phrase", "track": "name", "why": "short phrase", "urgency": "high|medium|low" }
  ],
  "connections": [],
  "stalling_tracks": []
}

STRICT LIMITS: top_priorities max 3 items, blockers max 2 items, recent_wins max 2 items, cross_track_priorities max 8 items.`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 8192,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const resultText = response.choices[0].message.content;
    const outputChars = resultText.length;
    console.log(`  Output: ~${outputChars} chars (~${Math.ceil(outputChars / 4)} tokens est.), finish_reason: ${response.choices[0].finish_reason}`);
    if (response.choices[0].finish_reason === 'length') {
      console.warn('  Warning: digest response truncated (max_tokens hit)');
    }
    const digest = this.parseDigest(resultText);

    this.enrichWithDaysSinceActive(digest, trackDocuments);

    console.log(`  Digest generated: ${digest.tracks.length} tracks, ${digest.cross_track_priorities.length} priorities`);
    return digest;
  }

  parseDigest(responseText) {
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```\s*/, '').replace(/```\s*$/, '');
    }

    const parsed = JSON.parse(cleaned);

    if (!parsed.tracks || !Array.isArray(parsed.tracks)) {
      throw new Error('Digest missing tracks array');
    }
    if (!parsed.focus_recommendation) {
      throw new Error('Digest missing focus_recommendation');
    }
    if (!parsed.cross_track_priorities) {
      parsed.cross_track_priorities = [];
    }
    if (!parsed.connections) {
      parsed.connections = [];
    }
    if (!parsed.stalling_tracks) {
      parsed.stalling_tracks = [];
    }

    for (const track of parsed.tracks) {
      if (!track.slug) {
        track.slug = track.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      }
      if (!track.top_priorities) track.top_priorities = [];
      if (!track.blockers) track.blockers = [];
      if (!track.recent_wins) track.recent_wins = [];
      if (typeof track.days_since_active !== 'number') track.days_since_active = 0;
    }

    return parsed;
  }

  enrichWithDaysSinceActive(digest, trackDocuments) {
    const now = new Date();

    for (const track of digest.tracks) {
      const doc = trackDocuments.find(
        d => d.slug === track.slug || d.name === track.name
      );
      if (!doc) continue;

      const lastActiveMatch = doc.document.match(/Last active: (\d{4}-\d{2}-\d{2})/);
      if (lastActiveMatch) {
        const lastDate = new Date(lastActiveMatch[1]);
        track.days_since_active = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      }
    }

    const stallingThreshold = 7;
    digest.stalling_tracks = digest.tracks
      .filter(t => t.days_since_active >= stallingThreshold && t.status !== 'completed')
      .map(t => `${t.name} — ${t.days_since_active} days inactive`);
  }
}

export default DigestGenerator;
