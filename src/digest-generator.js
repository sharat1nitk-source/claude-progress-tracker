import Anthropic from '@anthropic-ai/sdk';

class DigestGenerator {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
    this.model = 'claude-sonnet-4-6';
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
    const decisions = extractSection('Decisions Made').slice(-3);

    let condensed = `### ${name} (status: ${status}, last active: ${lastActive})\n`;
    if (currentState) condensed += `Current: ${currentState}\n`;
    if (pending.length) condensed += `Pending: ${pending.join(' | ')}\n`;
    if (blockers.length) condensed += `Blockers: ${blockers.join(' | ')}\n`;
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

Generate a JSON digest. Be specific and actionable. The focus_recommendation should be opinionated: tell the user exactly what to work on first and why.

If user-stated priority overrides exist, they MUST influence the focus_recommendation and cross_track_priorities ranking.

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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const resultText = response.content[0].text;
    const outputChars = resultText.length;
    console.log(`  Output: ~${outputChars} chars (~${Math.ceil(outputChars / 4)} tokens est.), stop_reason: ${response.stop_reason}`);
    if (response.stop_reason === 'max_tokens') {
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
