// Synthesis prompt: cross-track synthesis generation

export function buildSynthesisPrompt(trackSummaries, countHint) {
  return `You have complete knowledge of a user's projects and activities across multiple tracks, derived from their Claude.ai conversation history. Below are summaries of each track.

${trackSummaries}

EXACT TASK AND BLOCKER COUNTS (use these in the Track Health table — do not recount or estimate):
${countHint}

Generate a cross-track synthesis document. Focus on TRAJECTORY — where is each track heading, not just where it's been. Note any blockers that appear to be resolved in recent conversations vs blockers that remain active.

Respond ONLY with markdown (no code fences around the whole thing):

# Cross-Track Synthesis
Last updated: ${new Date().toISOString().split('T')[0]}

## Overall Picture
{2 paragraphs — where things stand across all tracks, highlighting recent momentum and key shifts}

## Track Health
| Track | Status | Last Active | Open Tasks | Blockers (Active) | Trend |
|-------|--------|-------------|------------|-------------------|-------|
{one row per track, Trend = improving/stable/declining/new}

## Cross-Track Dependencies
RULES:
- Only list a dependency if BOTH affected tracks reference it in their Connections sections.
- Cite specific evidence from the track documents. If evidence is ambiguous, do NOT list it.
- Do NOT contradict the track documents. If a track says something is resolved or unblocked, do not claim it blocks another track.
- If no dependencies meet this bar, write "None confidently identified — insufficient cross-referencing in source documents."

- {track A} depends on {track B}: {why} (Evidence: track A connections section mentions {track B}, track B confirms via {specific detail})
{or "None confidently identified — insufficient cross-referencing in source documents."}

## Priority Matrix (ranked by impact)
RULES:
- Rank by actual impact on user's goals, not just status labels.
- A track that should be archived must NOT appear in this matrix.
- Verify priority claims: if ranking says "X unblocks Y", confirm that Y's track document actually shows it is blocked by X.

1. {action} — Track: {name} — Why: {verified reason}
2. ...

## Track Health
| Track | Status | Last Active | Open Tasks | Blockers (Active) | Trend |
|-------|--------|-------------|------------|-------------------|-------|
{one row per track, Count Open Tasks and Blockers from the track document sections labeled "Pending Tasks" and "Blockers" — count the list items exactly. Do not estimate or default to 0.}

## Connections & Themes
- {observation about patterns, shared themes, or synergies across tracks}
- Each theme must be specific to THIS user's data, not a generic observation that could apply to anyone.`;
}
