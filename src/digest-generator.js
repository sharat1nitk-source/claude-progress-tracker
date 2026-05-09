import Anthropic from '@anthropic-ai/sdk';

class DigestGenerator {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
    this.model = 'claude-sonnet-4-6';
  }

  async generate(trackDocuments, synthesis, priorities = null, memories = null) {
    if (!trackDocuments || trackDocuments.length === 0) {
      console.log('No track documents to generate digest from.');
      return null;
    }

    console.log('Generating visual digest...');

    const trackContent = trackDocuments
      .map(({ name, document }) => `### ${name}\n${document}`)
      .join('\n\n---\n\n');

    let contextBlock = `## Track Documents\n\n${trackContent}\n\n## Cross-Track Synthesis\n\n${synthesis || 'No synthesis available.'}`;

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

    const prompt = `You are generating a structured digest from a user's personal knowledge base. This powers their daily focus dashboard.

${contextBlock}

Generate a JSON digest. Be specific and actionable — reference actual decisions, tasks, and blockers from the track documents. The focus_recommendation should be opinionated: tell the user exactly what to work on first and why.

If user-stated priority overrides exist, they MUST influence the focus_recommendation and cross_track_priorities ranking.

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "generated_at": "${new Date().toISOString()}",
  "focus_recommendation": "2-3 sentences on what to focus on right now and why",
  "tracks": [
    {
      "name": "Track Name",
      "slug": "track-name",
      "status": "active|stalling|blocked|completed",
      "status_reason": "one sentence why this status",
      "current_focus": "one sentence on what is actively being worked",
      "progress_summary": "short paragraph",
      "top_priorities": [
        { "action": "...", "why": "...", "urgency": "high|medium|low" }
      ],
      "blockers": [],
      "recent_wins": [],
      "days_since_active": 0
    }
  ],
  "cross_track_priorities": [
    { "rank": 1, "action": "...", "track": "...", "why": "...", "urgency": "high|medium|low" }
  ],
  "connections": [],
  "stalling_tracks": []
}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const resultText = response.content[0].text;
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
