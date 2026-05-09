// Synthesis prompt: cross-track synthesis generation

export function buildSynthesisPrompt(trackSummaries) {
  return `You have complete knowledge of a user's projects and activities across multiple tracks, derived from their Claude.ai conversation history. Below are summaries of each track.

${trackSummaries}

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
- {track A} depends on {track B}: {why}
{or "None identified" if none}

## Priority Matrix (ranked by impact)
1. {action} — Track: {name} — Why: {reason}
2. ...

## Connections & Themes
- {observation about patterns, shared themes, or synergies across tracks}`;
}
