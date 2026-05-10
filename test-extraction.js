#!/usr/bin/env node
// Extraction quality test — compares fresh extraction vs cached state file

import fs from 'fs';
import KnowledgeExtractor from './src/knowledge-extractor.js';

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('DEEPSEEK_API_KEY not set');
  process.exit(1);
}

const sample = JSON.parse(fs.readFileSync('/tmp/extraction_sample_convs.json', 'utf8'));
const state = JSON.parse(fs.readFileSync('analysis-data/state-file.json', 'utf8'));

const knownTracks = [
  'Finance', 'Job Change', 'Wellbeing', 'Claude Code', 'Learn AI',
  'AI Project Phases', 'Dev Environment Setup', 'Home Lab', 'Kubernetes',
  'Productivity', 'Misc', 'Investment Mgmt', 'Media Recommendations',
  'Gaming', 'Robotics & Automation', 'Computer Architecture',
  'Shah Rukh Khan Movies', 'FX Swaps Trading', 'Petpooja Automation',
  'Desk Cable Management', 'Laptop Selection', 'Claude Usage Limits',
  'Store Reviews', 'OpenRouter', 'Smart Home', 'Indian Politics',
  'TV Warranty', 'Adarsh Welkin Park', 'TV Troubleshooting',
  'Geopolitics & Energy Security', 'Cricket', 'AI Industry Analysis',
  'Markets Today', 'Portfolio Management System',
];

const extractor = new KnowledgeExtractor(apiKey);

console.log(`Testing extraction on ${sample.length} conversations\n`);

const results = [];
for (let i = 0; i < sample.length; i++) {
  const conv = sample[i];
  const uuid = conv.uuid;
  const cached = state.conversations[uuid]?.knowledge;

  console.log(`[${i+1}/${sample.length}] ${conv.name?.substring(0, 80)}`);

  let fresh;
  try {
    fresh = await extractor.extractKnowledge(conv, knownTracks);
  } catch (e) {
    console.log(`  EXTRACTION FAILED: ${e.message}`);
    results.push({ name: conv.name, uuid, error: e.message });
    continue;
  }

  // Compare
  const comparison = {
    name: conv.name?.substring(0, 60),
    uuid,
    matches: {},
    diffs: {},
    scores: {},
  };

  // 1. Track match
  comparison.matches.track = fresh.track === cached.track;
  if (!comparison.matches.track) {
    comparison.diffs.track = { cached: cached.track, fresh: fresh.track };
  }

  // 2. Type match
  comparison.matches.type = fresh.conversation_type === cached.conversation_type;
  if (!comparison.matches.type) {
    comparison.diffs.type = { cached: cached.conversation_type, fresh: fresh.conversation_type };
  }

  // 3. Status match
  comparison.matches.status = fresh.status === cached.status;
  if (!comparison.matches.status) {
    comparison.diffs.status = { cached: cached.status, fresh: fresh.status };
  }

  // 4. Array field size similarity
  const arrayFields = ['decisions_made', 'plans_created', 'tasks_completed', 'tasks_pending', 'blockers', 'open_questions', 'key_insights'];
  for (const field of arrayFields) {
    const cachedLen = (cached[field] || []).length;
    const freshLen = (fresh[field] || []).length;
    const diff = Math.abs(cachedLen - freshLen);
    comparison.scores[field] = { cached: cachedLen, fresh: freshLen, diff };
  }

  // 5. Narrative summary length check
  comparison.scores.narrative = {
    cached: (cached.narrative_summary || '').length,
    fresh: (fresh.narrative_summary || '').length,
  };

  // 6. Has resolved blockers?
  comparison.matches.hasResolved = !!(fresh.blockers_resolved?.length);

  results.push(comparison);

  // Print quick summary
  const trackOk = comparison.matches.track ? '✓' : `✗ (cached:${cached.track} fresh:${fresh.track})`;
  const typeOk = comparison.matches.type ? '✓' : `✗ (cached:${cached.conversation_type} fresh:${fresh.conversation_type})`;
  console.log(`  Track: ${trackOk}`);
  console.log(`  Type: ${typeOk}`);
  console.log(`  Tasks: cached=${comparison.scores.tasks_pending.cached} fresh=${comparison.scores.tasks_pending.fresh}`);
  console.log(`  Blockers: cached=${comparison.scores.blockers.cached} fresh=${comparison.scores.blockers.fresh}`);
  console.log();

  // Rate limit
  await new Promise(r => setTimeout(r, 500));
}

// Summary
console.log('='.repeat(60));
console.log('EXTRACTION QUALITY SUMMARY');
console.log('='.repeat(60));

const trackMatches = results.filter(r => r.matches?.track).length;
const typeMatches = results.filter(r => r.matches?.type).length;
const statusMatches = results.filter(r => r.matches?.status).length;
const errors = results.filter(r => r.error).length;

console.log(`\nTrack match: ${trackMatches}/${results.length}`);
console.log(`Type match: ${typeMatches}/${results.length}`);
console.log(`Status match: ${statusMatches}/${results.length}`);
console.log(`Errors: ${errors}`);

// Detailed diffs
for (const r of results) {
  if (r.error) {
    console.log(`\n❌ ${r.name}: ${r.error}`);
    continue;
  }
  const issues = [];
  if (!r.matches.track) issues.push(`Track: ${r.diffs.track?.cached} → ${r.diffs.track?.fresh}`);
  if (!r.matches.type) issues.push(`Type: ${r.diffs.type?.cached} → ${r.diffs.type?.fresh}`);
  if (!r.matches.status) issues.push(`Status: ${r.diffs.status?.cached} → ${r.diffs.status?.fresh}`);

  // Check array size differences > 2
  for (const [field, score] of Object.entries(r.scores)) {
    if (field === 'narrative') continue;
    if (score.diff > 2) {
      issues.push(`${field}: cached=${score.cached} fresh=${score.fresh} (Δ${score.diff})`);
    }
  }

  if (issues.length > 0) {
    console.log(`\n⚠️  ${r.name}:`);
    issues.forEach(i => console.log(`   ${i}`));
  }
}

// Save comparison
fs.writeFileSync('/tmp/extraction_comparison.json', JSON.stringify(results, null, 2));
console.log('\nComparison saved to /tmp/extraction_comparison.json');
