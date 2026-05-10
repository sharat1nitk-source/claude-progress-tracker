// Digest prompt: generate structured digest JSON from track documents + synthesis

export function buildDigestPrompt(contextBlock) {
  return `You are generating a structured digest from a user's personal knowledge base. This powers their daily focus dashboard.

${contextBlock}

IMPORTANT RULES — read carefully:

1. **User notes are AUTHORITATIVE**: Each track may have a "User note:" line. This is the USER telling you something about this track. If a user note contradicts the document data (e.g., says "blocker is resolved" or "dev environment is ready"), BELIEVE THE USER NOTE over the stale document data. These notes are the user's explicit corrections.

2. **Check for resolved blockers**: Track documents may have a "Blockers recently resolved:" field. Do NOT list resolved blockers as current blockers. Only report blockers that are still active and recent.

3. **Trajectory over aggregate**: Look at the RECENT conversations (last 2-3 entries in the conversation history). Recent activity matters more than old status. A track that was "blocked" 3 conversations ago but "active" for the last 2 is actually active now.

4. **Be critical about stale data**: If last active date is old (>7 days), the data may be stale. Lead with the user's note if available.

5. **User priorities**: "User-Set Track Priorities" and "User-Stated Priority Overrides" MUST directly influence the focus_recommendation and cross_track_priorities.

6. **Analysis-archived tracks**: Some tracks may be marked as "ANALYSIS ARCHIVED" — the user has explicitly chosen to stop analyzing them. These tracks' data is frozen and may be stale. Do NOT include them in cross_track_priorities or stalling_tracks. They should appear in tracks[] with status "frozen".

7. **Group tracks into logical categories**: Look at all track names and their current state. Group them into 4-8 logical categories (e.g., "AI & Tech", "Career & Finance", "Home & Devices", "Entertainment", etc.). Each track belongs to exactly ONE group. Choose groups that make sense given the actual track names — don't force-fit into predefined categories.

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
  "groups": [
    { "name": "Group Name", "track_slugs": ["track-slug-1", "track-slug-2"], "rationale": "one short sentence" }
  ],
  "tracks": [
    {
      "name": "Track Name",
      "slug": "track-name",
      "status": "active|stalling|blocked|completed|frozen",
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

STRICT LIMITS: groups 4-8, top_priorities max 3 items, blockers max 2 items, recent_wins max 2 items, cross_track_priorities max 8 items.`;
}
