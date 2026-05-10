// Extraction prompt: per-conversation knowledge extraction

export function buildExtractionPrompt(conversationContext, knownTracks) {
  const tracksList = knownTracks.length > 0
    ? knownTracks.map(t => `  - ${t}`).join('\n')
    : '  (No existing tracks)';

  return `Analyze this Claude.ai conversation and extract structured knowledge for a personal knowledge base.

**Known Tracks (from previous conversations):**
${tracksList}

**Conversation Details:**
${conversationContext}

Extract:

1. **Track**: Which project or topic does this belong to? Use an existing track name if it fits perfectly. Otherwise create a new one (2-4 words). Be specific.
**Track rules:**
- Technical domains (Kubernetes, home lab, robotics, cloud) MUST get their own track. Never bury them under Job Change or generic tracks.
- Multi-domain conversations: use primary track for main focus, secondary_tracks for other domains.
2. **Conversation type**: planning, research, execution, decision, or reflection.
3. **Narrative summary**: 2-3 sentences of what happened. Include the starting point AND the end state.
4. **Decisions made**: List of specific decisions (empty array if none).
5. **Plans created**: List of plans or roadmaps outlined (empty array if none).
6. **Tasks completed**: What was finished in this conversation (empty array if none).
7. **Tasks pending**: What still needs to be done (empty array if none).
8. **Blockers**: Current blockers only — things actively blocking progress RIGHT NOW. If a blocker was implicitly or explicitly resolved (even by a completed task), do NOT list it here. (empty array if none).
9. **Blockers resolved**: List blockers RESOLVED in this conversation (including implicit — e.g., a completed task that unblocked a known blocker). (empty array if none).
10. **Open questions**: Unresolved questions (empty array if none).
11. **Key insights**: Non-obvious synthesis, strategic realizations, or pattern recognition. NOT product specifications (e.g., "Pixel has no IR blaster"). NOT textbook explanations (e.g., "Hyper-Threading adds a second architectural state"). NOT basic facts about a product. An insight should surprise someone who already read the conversation summary. (empty array if none).
12. **Connections to**: Other tracks this relates to, with brief reason (empty array if none).
13. **Secondary tracks**: Other tracks this conversation also belongs to. Format: [{"track": "Name", "reason": "why"}]. (empty array if none).
14. **Status**: The trajectory of progress — is this track moving forward (active), stuck (blocked), winding down (completed), or on hold (parked)? Consider the END state of the conversation, not the start.
15. **Importance**: high, medium, or low.
16. **Progress narrative**: One sentence on where things stand NOW (end of conversation).

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "track": "...",
  "conversation_type": "...",
  "narrative_summary": "...",
  "decisions_made": [],
  "plans_created": [],
  "tasks_completed": [],
  "tasks_pending": [],
  "blockers": [],
  "blockers_resolved": [],
  "open_questions": [],
  "key_insights": [],
  "connections_to": [],
  "secondary_tracks": [],
  "status": "...",
  "importance": "...",
  "progress_narrative": "..."
}`;
}
