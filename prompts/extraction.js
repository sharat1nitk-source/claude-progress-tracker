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

1. **Track**: Which project or topic does this belong to? Use an existing track name if it fits perfectly. Otherwise create a new one (2-4 words). Be specific — if the conversation is about "Kubernetes learning" or "Google Cloud certification", create a "Kubernetes" or "Cloud Engineering" track rather than lumping it into a generic track.
2. **Conversation type**: planning, research, execution, decision, or reflection.
3. **Narrative summary**: 2-3 sentences of what happened. Include the starting point AND the end state.
4. **Decisions made**: List of specific decisions (empty array if none).
5. **Plans created**: List of plans or roadmaps outlined (empty array if none).
6. **Tasks completed**: What was finished in this conversation (empty array if none).
7. **Tasks pending**: What still needs to be done (empty array if none).
8. **Blockers**: Current blockers only — things that are STILL blocking progress. If a blocker was resolved IN this conversation, do NOT list it here (it's resolved). (empty array if none).
9. **Blockers resolved**: List any blockers that were RESOLVED or CLOSED during this conversation. E.g., if something was blocking progress and now it's unblocked. (empty array if none).
10. **Open questions**: Unresolved questions (empty array if none).
11. **Key insights**: Important learnings or realizations (empty array if none).
12. **Connections to**: Other tracks this relates to, with brief reason (empty array if none).
13. **Status**: The trajectory of progress — is this track moving forward (active), stuck (blocked), winding down (completed), or on hold (parked)? Consider the END state of the conversation, not the start.
14. **Importance**: high, medium, or low.
15. **Progress narrative**: One sentence on where things stand NOW (end of conversation).

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
  "blockers_resolved": [],
  "open_questions": [],
  "key_insights": [],
  "connections_to": [],
  "status": "active|parked|blocked|completed",
  "importance": "high|medium|low",
  "progress_narrative": "..."
}`;
}
