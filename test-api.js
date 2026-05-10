#!/usr/bin/env node
// Real API test — synthesis + digest with actual DeepSeek calls
// Uses 73 real extraction results from analysis-data/state-file.json

import fs from 'fs';
import KnowledgeBuilder from './src/knowledge-builder.js';
import DigestGenerator from './src/digest-generator.js';

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('DEEPSEEK_API_KEY not set in environment');
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync('./analysis-data/state-file.json', 'utf8'));
const convs = state.conversations || {};

// Reconstruct extraction results
const extractionResults = [];
for (const [uuid, entry] of Object.entries(convs)) {
  if (!entry.knowledge) continue;
  extractionResults.push({
    conversation: {
      uuid,
      name: entry.conversationName || 'Unknown',
      created_at: entry.conversationCreatedAt || '2026-01-01',
      updated_at: entry.conversationUpdatedAt || '2026-01-01',
    },
    knowledge: entry.knowledge,
    success: true,
  });
}

console.log(`Loaded ${extractionResults.length} extraction results\n`);

const builder = new KnowledgeBuilder(apiKey);

// Phase 1: Build tracks (no API)
const tracks = builder.groupByTrack(extractionResults);
console.log(`Tracks: ${tracks.size}`);

const trackDocuments = [];
let issues = [];
for (const track of tracks.values()) {
  let doc;
  try {
    doc = builder.buildTrackDocument(track);
  } catch (e) {
    issues.push({ track: track.name, type: 'CRASH', error: e.message });
    continue;
  }
  const slug = builder.slugify(track.name);
  trackDocuments.push({ name: track.name, slug, document: doc });

  if (doc.includes('[object Object]')) {
    issues.push({ track: track.name, type: '[object Object]' });
  }
}

console.log(`Track docs built: ${trackDocuments.length}, issues: ${issues.length}\n`);

// Phase 2: Synthesis (real API)
console.log('=== Running synthesis (real API) ===');
let synthesis;
try {
  synthesis = await builder.buildSynthesis(trackDocuments);
  console.log(`Synthesis: ${synthesis.length} chars\n`);
  console.log(synthesis.substring(0, 500));
  console.log('...\n');
} catch (e) {
  console.error(`Synthesis FAILED: ${e.message}`);
  process.exit(1);
}

// Phase 3: Digest (real API)
console.log('=== Running digest (real API) ===');

// Trim docs (no history table) and condense
const trimmedDocs = trackDocuments.map(t => ({
  name: t.name,
  slug: t.slug,
  document: t.document.split('## Conversation History')[0] || t.document,
}));

const digestGenerator = new DigestGenerator(apiKey);
let digest;
try {
  digest = await digestGenerator.generate(trimmedDocs, synthesis, null, null, {}, {});
  console.log(`Digest: ${digest.tracks.length} tracks, ${digest.cross_track_priorities.length} priorities`);
  console.log(`Connections: ${digest.connections.length}, Stalling: ${digest.stalling_tracks.length}`);
  console.log(`Focus: ${digest.focus_recommendation.substring(0, 200)}...\n`);

  // Show first 3 tracks
  for (const t of digest.tracks.slice(0, 3)) {
    console.log(`  ${t.name}: status=${t.status}, days=${t.days_since_active}, priorities=${t.top_priorities?.length || 0}, blockers=${t.blockers?.length || 0}`);
  }
} catch (e) {
  console.error(`Digest FAILED: ${e.message}`);
  process.exit(1);
}

// Phase 4: Validation
console.log('\n=== Validation ===');
const failures = [];

if (issues.length > 0) {
  failures.push(`${issues.length} builder issues: ${JSON.stringify(issues)}`);
}
if (!synthesis || synthesis.length < 100) {
  failures.push('Synthesis too short or empty');
}
if (!digest || !digest.tracks || digest.tracks.length === 0) {
  failures.push('Digest has no tracks');
}
if (!digest.focus_recommendation || digest.focus_recommendation.length < 20) {
  failures.push('Digest focus_recommendation too short');
}

if (failures.length === 0) {
  console.log('ALL CHECKS PASSED');
  // Save outputs for comparison
  const output = {
    trackCount: trackDocuments.length,
    synthesisLength: synthesis.length,
    digestTrackCount: digest.tracks.length,
    synthesis: synthesis,
    digest: digest,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync('./analysis-data/api-test-output.json', JSON.stringify(output, null, 2));
  console.log('Output saved to analysis-data/api-test-output.json');
} else {
  console.log('FAILURES:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
