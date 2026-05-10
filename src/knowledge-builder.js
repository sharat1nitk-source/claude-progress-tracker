import OpenAI from 'openai';
import config from '../prompts/config.js';
import { buildSynthesisPrompt } from '../prompts/synthesis.js';

class KnowledgeBuilder {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
    this.model = config.model;
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

      // Primary track
      if (!tracks.has(trackName)) {
        tracks.set(trackName, { name: trackName, conversations: [] });
      }
      tracks.get(trackName).conversations.push({ conversation, knowledge });

      // Secondary tracks
      for (const sec of (knowledge.secondary_tracks || [])) {
        const secTrack = sec.track || sec;  // handle string or object
        const secReason = sec.reason || '';
        if (!secTrack || secTrack === trackName) continue;
        if (!tracks.has(secTrack)) {
          tracks.set(secTrack, { name: secTrack, conversations: [] });
        }
        tracks.get(secTrack).conversations.push({
          conversation,
          knowledge,
          isSecondary: true,
          secondaryReason: secReason
        });
      }
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
    let allPending = [];
    const allBlockers = [];      // { text, convName, date }
    const allResolvedBlockers = []; // { text, convName, date }
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
      for (const b of (knowledge.blockers || [])) {
        allBlockers.push({ text: b, convName, date });
      }
      for (const b of (knowledge.blockers_resolved || [])) {
        allResolvedBlockers.push({ text: b, convName, date });
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

    // Deduplicate blockers: remove any blocker that was later explicitly marked as resolved
    const resolvedTexts = new Set(allResolvedBlockers.map(b => b.text.trim().toLowerCase()));
    let activeBlockers = allBlockers.filter(b => !resolvedTexts.has(b.text.trim().toLowerCase()));

    // Near-match dedup: remove blockers with 70%+ text overlap
    const dedupedBlockers = [];
    for (const b of activeBlockers) {
      const bLower = b.text.trim().toLowerCase();
      const isDup = dedupedBlockers.some(existing => {
        const exLower = existing.text.trim().toLowerCase();
        if (exLower === bLower) return true;
        const minLen = Math.min(exLower.length, bLower.length);
        const overlapThreshold = Math.floor(minLen * 0.7);
        return exLower.includes(bLower.substring(0, overlapThreshold)) ||
               bLower.includes(exLower.substring(0, overlapThreshold));
      });
      if (!isDup) dedupedBlockers.push(b);
    }

    // Track unique resolved blockers for display
    const uniqueResolved = [];
    const seenResolved = new Set();
    for (const b of allResolvedBlockers) {
      const key = b.text.trim().toLowerCase();
      if (!seenResolved.has(key)) { seenResolved.add(key); uniqueResolved.push(b); }
    }

    // Trajectory-aware status: recent conversations (last 3) weighted more
    const recentThreshold = 3;
    const recentConvs = conversations.slice(-recentThreshold);
    const latestIsBlocked = latest.status === 'blocked' && (latest.blockers || []).length > 0;

    // Check if recent trajectory is positive (recent convs are active, no new blockers)
    const recentBlocked = recentConvs.filter(({ knowledge }) =>
      knowledge.status === 'blocked' && (knowledge.blockers || []).length > 0
    );
    const recentActive = recentConvs.filter(({ knowledge }) => knowledge.status === 'active');
    const trajectoryPositive = recentActive.length > recentBlocked.length && recentBlocked.length === 0;

    // Check if ANY active blocker comes from a recent conversation (vs stale/historical)
    const recentBlockerTexts = new Set();
    for (const { knowledge } of recentConvs) {
      for (const b of (knowledge.blockers || [])) recentBlockerTexts.add(b.trim().toLowerCase());
    }
    const hasRecentActiveBlockers = activeBlockers.some(b => recentBlockerTexts.has(b.text.trim().toLowerCase()));

    const totalActionable = allPending.length + allCompleted.length;
    const allDone = totalActionable > 0 ? (allCompleted.length / totalActionable) >= 0.9 : false;
    const noPendingLeft = allPending.length === 0 && totalActionable > 0;

    const daysSinceLastActive = conversations.length > 0
      ? (new Date() - new Date(conversations[conversations.length - 1].conversation.updated_at)) / 86400000
      : 999;
    const hasRecentPending = allPending.length > 0 && daysSinceLastActive < 30;

    let overallStatus;
    if (latestIsBlocked && hasRecentActiveBlockers && !trajectoryPositive) {
      overallStatus = 'blocked';
    } else if (conversations.length >= 2 && trajectoryPositive && !latestIsBlocked) {
      overallStatus = 'active';
    } else if ((allDone || noPendingLeft) && daysSinceLastActive > 30 && !hasRecentPending) {
      overallStatus = 'completed';
    } else if (allPending.length > 0 || conversations.length > 0) {
      overallStatus = 'active';
    } else {
      overallStatus = 'parked';
    }

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

    // Reconciliation: remove pending tasks that match completed ones (same wording)
    const completedTexts = new Set(
      allCompleted.map(t => t.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '').trim().toLowerCase())
    );
    allPending = allPending.filter(t => {
      const isDuplicate = completedTexts.has(t.trim().toLowerCase());
      if (isDuplicate) {
        console.log(`    Reconciled pending->completed: "${t.substring(0, 60)}..."`);
      }
      return !isDuplicate;
    });

    if (allPending.length > 0) {
      md += `## Pending Tasks\n`;
      for (const t of allPending) md += `- ${t}\n`;
      md += '\n';
    }

    if (activeBlockers.length > 0) {
      md += `## Blockers\n`;
      for (const b of dedupedBlockers) md += `- ${b.text} — ${b.convName}, ${b.date}\n`;
      md += '\n';
    }
    if (uniqueResolved.length > 0) {
      md += `## Blockers Resolved\n`;
      for (const b of uniqueResolved) md += `- ${b.text} — ${b.convName}, ${b.date}\n`;
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
      for (const c of connections) {
        if (typeof c === 'object' && c !== null && c.track) {
          md += `- **${c.track}**: ${c.reason || ''}\n`;
        } else if (typeof c === 'string') {
          md += `- ${c}\n`;
        }
      }
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
    // Compute explicit counts so AI doesn't fabricate zeros
    const countData = trackDocuments.map(({ name, document }) => {
      const pendingMatch = document.match(/## Pending Tasks\n([\s\S]*?)(?=\n## |\n*$)/);
      const blockerMatch = document.match(/## Blockers\n([\s\S]*?)(?=\n## |\n*$)/);
      const pendingCount = pendingMatch ? (pendingMatch[1].match(/^- /gm) || []).length : 0;
      const blockerCount = blockerMatch ? (blockerMatch[1].match(/^- /gm) || []).length : 0;
      return { name, pendingCount, blockerCount };
    });
    const countHint = countData.map(t => `${t.name}: ${t.pendingCount} pending, ${t.blockerCount} blockers`).join('; ');

    const trackSummaries = trackDocuments
      .map(({ name, document }) => `### ${name}\n${document.split('\n').slice(0, 30).join('\n')}`)
      .join('\n\n---\n\n');

    const prompt = buildSynthesisPrompt(trackSummaries, countHint);

    const apiParams = { model: this.model, max_tokens: config.synthesisMaxTokens, messages: [{ role: 'user', content: prompt }] };
    apiParams.temperature = config.temperature;
    const response = await this.client.chat.completions.create(apiParams);

    return response.choices[0].message.content;
  }

  buildProjectLookup(projects) {
    const lookup = new Map();
    for (const p of projects) {
      if (p.is_starter_project) continue;
      const slug = this.slugify(p.name);
      lookup.set(slug, p);
      // Also index by the raw name parts for fuzzy matching
      for (const part of p.name.toLowerCase().split(/[\s,/]+/)) {
        if (part.length > 3) {
          if (!lookup.has(`_part:${part}`)) {
            lookup.set(`_part:${part}`, p);
          }
        }
      }
    }
    return lookup;
  }

  findProject(projectLookup, trackName) {
    const slug = this.slugify(trackName);
    // Exact slug match first
    if (projectLookup.has(slug)) return projectLookup.get(slug);
    // Fuzzy match: check if any track word matches a project word
    const trackParts = trackName.toLowerCase().split(/[\s,/]+/);
    for (const part of trackParts) {
      if (part.length > 3 && projectLookup.has(`_part:${part}`)) {
        return projectLookup.get(`_part:${part}`);
      }
    }
    // Reverse fuzzy: check if project name words (≥4 chars) appear in track name
    for (const [key, project] of projectLookup) {
      if (key.startsWith('_part:')) continue;
      const projParts = project.name.toLowerCase().split(/[\s,/]+/).filter(p => p.length >= 4);
      const trackLower = trackName.toLowerCase();
      const matchedParts = projParts.filter(pp => trackLower.includes(pp));
      if (matchedParts.length >= 2 || (matchedParts.length === 1 && matchedParts[0].length >= 6)) {
        return project;
      }
    }
    return null;
  }

  includeProjectDocs(document, project) {
    if (!project || !project.docs || project.docs.length === 0) return document;

    let docSection = '\n## Project Documents\n';
    for (const doc of project.docs) {
      // Truncate very large docs to avoid token overflow in digest
      const content = doc.content.length > 8000
        ? doc.content.substring(0, 8000) + '\n... (truncated)'
        : doc.content;
      docSection += `\n### ${doc.filename}\n${content}\n`;
    }

    const historyIdx = document.indexOf('## Conversation History');
    if (historyIdx !== -1) {
      return document.substring(0, historyIdx) + docSection + '\n\n' + document.substring(historyIdx);
    }
    return document + docSection;
  }

  async build(extractionResults, projects = []) {
    const tracks = this.groupByTrack(extractionResults);

    if (tracks.size === 0) {
      console.log('No successful extractions to build from.');
      return { trackDocuments: [], synthesis: null };
    }

    const projectLookup = this.buildProjectLookup(projects);

    console.log(`\nBuilding knowledge base for ${tracks.size} track(s)...`);
    if (projectLookup.size > 0) {
      console.log(`  ${projectLookup.size} project(s) available for doc injection`);
    }

    const trackDocuments = [];
    for (const track of tracks.values()) {
      let document = this.buildTrackDocument(track);
      const slug = this.slugify(track.name);
      const project = this.findProject(projectLookup, track.name);
      if (project) {
        document = this.includeProjectDocs(document, project);
        console.log(`  Built track: ${track.name} (${track.conversations.length} conversations, ${project.docs.length} doc(s) injected)`);
      } else {
        console.log(`  Built track: ${track.name} (${track.conversations.length} conversations)`);
      }
      trackDocuments.push({ name: track.name, slug, document });
    }

    console.log('Generating cross-track synthesis...');
    const synthesis = await this.buildSynthesis(trackDocuments);
    console.log('  Synthesis complete.');

    return { trackDocuments, synthesis };
  }
}

export default KnowledgeBuilder;
