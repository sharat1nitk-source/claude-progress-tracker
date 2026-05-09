import Anthropic from '@anthropic-ai/sdk';

class KnowledgeBuilder {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
    this.model = 'claude-sonnet-4-6';
  }

  slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  groupByTrack(extractionResults) {
    const tracks = new Map();

    for (const result of extractionResults) {
      if (!result.success) continue;

      const { conversation, knowledge } = result;
      const trackName = knowledge.track;

      if (!tracks.has(trackName)) {
        tracks.set(trackName, { name: trackName, conversations: [] });
      }

      tracks.get(trackName).conversations.push({ conversation, knowledge });
    }

    for (const track of tracks.values()) {
      track.conversations.sort(
        (a, b) => new Date(a.conversation.created_at) - new Date(b.conversation.created_at)
      );
    }

    return tracks;
  }

  buildTrackDocument(track) {
    const { name, conversations } = track;
    const latest = conversations[conversations.length - 1].knowledge;

    const allDecisions = [];
    const allPlans = [];
    const allCompleted = [];
    const allPending = [];
    const allBlockers = [];
    const allQuestions = [];
    const allInsights = [];
    const connectionMap = new Map();

    for (const { conversation, knowledge } of conversations) {
      const date = conversation.updated_at?.split('T')[0] || 'unknown';
      const convName = conversation.name;

      for (const d of knowledge.decisions_made) {
        allDecisions.push(`${d} — ${convName}, ${date}`);
      }
      for (const p of knowledge.plans_created) {
        allPlans.push(p);
      }
      for (const t of knowledge.tasks_completed) {
        allCompleted.push(`${t} (${date})`);
      }
      for (const t of knowledge.tasks_pending) {
        allPending.push(t);
      }
      for (const b of knowledge.blockers) {
        allBlockers.push(b);
      }
      for (const q of knowledge.open_questions) {
        allQuestions.push(q);
      }
      for (const i of knowledge.key_insights) {
        allInsights.push(i);
      }
      for (const c of knowledge.connections_to) {
        connectionMap.set(c, true);
      }
    }

    const statusCounts = {};
    for (const { knowledge } of conversations) {
      statusCounts[knowledge.status] = (statusCounts[knowledge.status] || 0) + 1;
    }
    const overallStatus = latest.status;

    const lastActive = conversations[conversations.length - 1].conversation.updated_at?.split('T')[0] || 'unknown';

    let md = `# ${name}\nLast updated: ${new Date().toISOString().split('T')[0]} | Status: ${overallStatus} | Last active: ${lastActive}\n\n`;

    md += `## Current State\n${latest.progress_narrative}\n\n`;

    if (allDecisions.length > 0) {
      md += `## Decisions Made\n`;
      for (const d of allDecisions) md += `- ${d}\n`;
      md += '\n';
    }

    if (allPlans.length > 0) {
      md += `## Plans & Goals\n`;
      for (const p of allPlans) md += `- ${p}\n`;
      md += '\n';
    }

    if (allCompleted.length > 0) {
      md += `## Completed\n`;
      for (const t of allCompleted) md += `- ${t}\n`;
      md += '\n';
    }

    if (allPending.length > 0) {
      md += `## Pending Tasks\n`;
      for (const t of allPending) md += `- ${t}\n`;
      md += '\n';
    }

    if (allBlockers.length > 0) {
      md += `## Blockers\n`;
      for (const b of allBlockers) md += `- ${b}\n`;
      md += '\n';
    }

    if (allQuestions.length > 0) {
      md += `## Open Questions\n`;
      for (const q of allQuestions) md += `- ${q}\n`;
      md += '\n';
    }

    if (allInsights.length > 0) {
      md += `## Key Insights\n`;
      for (const i of allInsights) md += `- ${i}\n`;
      md += '\n';
    }

    const connections = [...connectionMap.keys()];
    if (connections.length > 0) {
      md += `## Connections to Other Tracks\n`;
      for (const c of connections) md += `- ${c}\n`;
      md += '\n';
    }

    md += `## Conversation History (chronological)\n`;
    md += `| Date | Conversation | Type | Summary |\n`;
    md += `|------|-------------|------|--------|\n`;
    for (const { conversation, knowledge } of conversations) {
      const date = conversation.updated_at?.split('T')[0] || '';
      const cName = conversation.name?.replace(/\|/g, '/') || '';
      const summary = knowledge.narrative_summary?.replace(/\|/g, '/') || '';
      md += `| ${date} | ${cName} | ${knowledge.conversation_type} | ${summary} |\n`;
    }

    return md;
  }

  async buildSynthesis(trackDocuments) {
    const trackSummaries = trackDocuments
      .map(({ name, document }) => `### ${name}\n${document.split('\n').slice(0, 30).join('\n')}`)
      .join('\n\n---\n\n');

    const prompt = `You have complete knowledge of a user's projects and activities across multiple tracks, derived from their Claude.ai conversation history. Below are summaries of each track.

${trackSummaries}

Generate a cross-track synthesis document. Respond ONLY with markdown (no code fences around the whole thing):

# Cross-Track Synthesis
Last updated: ${new Date().toISOString().split('T')[0]}

## Overall Picture
{paragraph — where things stand across all tracks}

## Track Health
| Track | Status | Last Active | Open Tasks | Blockers |
|-------|--------|-------------|------------|----------|
{one row per track}

## Cross-Track Dependencies
- {track A} depends on {track B}: {why}
{or "None identified" if none}

## Priority Matrix (ranked)
1. {action} — Track: {name} — Why: {reason}
2. ...

## Connections & Themes
- {observation about patterns, shared themes, or synergies across tracks}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0].text;
  }

  async build(extractionResults) {
    const tracks = this.groupByTrack(extractionResults);

    if (tracks.size === 0) {
      console.log('No successful extractions to build from.');
      return { trackDocuments: [], synthesis: null };
    }

    console.log(`\nBuilding knowledge base for ${tracks.size} track(s)...`);

    const trackDocuments = [];
    for (const track of tracks.values()) {
      const document = this.buildTrackDocument(track);
      const slug = this.slugify(track.name);
      trackDocuments.push({ name: track.name, slug, document });
      console.log(`  Built track: ${track.name} (${track.conversations.length} conversations)`);
    }

    console.log('Generating cross-track synthesis...');
    const synthesis = await this.buildSynthesis(trackDocuments);
    console.log('  Synthesis complete.');

    return { trackDocuments, synthesis };
  }
}

export default KnowledgeBuilder;
