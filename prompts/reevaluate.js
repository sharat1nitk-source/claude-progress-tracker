// Re-evaluate prompt: browser-side digest regeneration (PWA)

export function buildReevaluatePrompt(contextBlock) {
  return `You are generating a structured digest from a user's personal knowledge base. This powers their daily focus dashboard.

${contextBlock}

IMPORTANT RULES — read carefully:

1. **User notes are AUTHORITATIVE**: Each track may have a "User note:" line. This is the USER telling you something about this track. If a user note contradicts the document data (e.g., says "blocker is resolved" or "dev environment is ready"), BELIEVE THE USER NOTE over stale document data. These notes are the user's explicit corrections.

2. **Check for resolved blockers**: Track documents may have a "Blockers recently resolved:" field. Do NOT list resolved blockers as current blockers. Only report blockers that are still active and recent.

3. **Trajectory over aggregate**: Look at the data holistically. A track that was blocked before but has recent active conversations is actually active now. Prioritize recent signals.

4. **User priorities**: "User-Set Track Priorities" MUST directly influence the focus_recommendation and cross_track_priorities.

First, analyze each track's real priority by weighing these signals:
- **User notes** (highest — these override stale document data)
- **Trajectory**: Is the track trending active/improving or stuck/declining?
- **Recency**: Recently active tracks matter more than dormant ones
- **Task density**: Tracks with many concrete pending tasks should rank higher
- **Blocker impact**: Blocked tracks need attention, BUT check if blockers are recent or resolved
- **Completion trajectory**: Tracks winding down should rank lower
- **User priorities**: Respect user-set high/low priorities explicitly
- **Cross-track impact**: Tracks that unblock or feed into others are higher leverage

Then generate a JSON digest. The focus_recommendation should be opinionated: tell the user exactly what to work on first and why. The cross_track_priorities should rank by actual importance to the user's goals — not just status labels.

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
      "top_priorities": [{ "action": "short phrase", "why": "short phrase", "urgency": "high|medium|low" }],
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
}
