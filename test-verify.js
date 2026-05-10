#!/usr/bin/env node
// Local pipeline verification - runs builder with real extraction data
// Catches ALL bugs before pushing to GH Actions

import fs from 'fs';
import KnowledgeBuilder from './src/knowledge-builder.js';

const state = JSON.parse(fs.readFileSync('./analysis-data/state-file.json', 'utf8'));
const convs = state.conversations || {};

// Reconstruct extraction results in the format builder.build() expects
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

const builder = new KnowledgeBuilder('sk-test');

// === PHASE 1: groupByTrack ===
const tracks = builder.groupByTrack(extractionResults);
console.log(`=== PHASE 1: groupByTrack ===`);
console.log(`Tracks: ${tracks.size}`);

// Check for Kubernetes
const k8sTrack = [...tracks.values()].find(t => t.name.toLowerCase().includes('kuber'));
console.log(`Kubernetes track: ${k8sTrack ? 'EXISTS (' + k8sTrack.conversations.length + ' convs, ' + k8sTrack.conversations.filter(c => c.isSecondary).length + ' secondary)' : 'MISSING'}`);

// Check secondary tracks
let secondaryCount = 0;
for (const t of tracks.values()) {
  secondaryCount += t.conversations.filter(c => c.isSecondary).length;
}
console.log(`Total secondary track assignments: ${secondaryCount}`);

// === PHASE 2: Build track documents ===
console.log(`\n=== PHASE 2: Build track documents ===`);
const trackDocuments = [];
const issues = [];
let totalObjObj = 0;
let resolvedBlockersCount = 0;

for (const track of tracks.values()) {
  let doc;
  try {
    doc = builder.buildTrackDocument(track);
  } catch (e) {
    issues.push({ track: track.name, type: 'CRASH', error: e.message, stack: e.stack.split('\n')[0] });
    continue;
  }

  const slug = builder.slugify(track.name);
  trackDocuments.push({ name: track.name, slug, document: doc });

  // Check for [object Object]
  const objObjMatches = (doc.match(/\[object Object\]/g) || []).length;
  if (objObjMatches > 0) {
    issues.push({ track: track.name, type: '[object Object]', count: objObjMatches });
    totalObjObj += objObjMatches;
  }

  // Check for resolved blockers
  if (doc.includes('## Blockers Resolved')) {
    resolvedBlockersCount++;
  }

  // Check status
  const statusMatch = doc.match(/Status: (\w+)/);
  const status = statusMatch ? statusMatch[1] : '?';
  const activeMatch = doc.match(/Last active: (\d{4}-\d{2}-\d{2})/);
  const lastActive = activeMatch ? activeMatch[1] : '?';

  // Track counts
  const pendingCount = (doc.match(/^- .*\n/g) || []).length;
}

console.log(`Track docs built: ${trackDocuments.length}`);
console.log(`Crashes: ${issues.filter(i => i.type === 'CRASH').length}`);
console.log(`[object Object] instances: ${totalObjObj}`);
console.log(`Tracks with resolved blockers: ${resolvedBlockersCount}`);

// === PHASE 3: Quality checks ===
console.log(`\n=== PHASE 3: Quality checks ===`);

// Entertainment status
const entTrack = trackDocuments.find(t => t.name === 'Entertainment');
if (entTrack) {
  const entStatus = (entTrack.document.match(/Status: (\w+)/) || [])[1];
  const entPending = entTrack.document.includes('## Pending Tasks');
  console.log(`Entertainment: status=${entStatus}, hasPending=${entPending} ${entStatus === 'completed' && entPending ? '⚠️ BUG: completed but has pending tasks' : '✓'}`);
} else {
  console.log('Entertainment track: NOT FOUND (may have been merged into Media Recommendations)');
}

// Print all tracks with status
console.log(`\n--- All tracks ---`);
for (const t of trackDocuments.sort((a, b) => a.name.localeCompare(b.name))) {
  const status = (t.document.match(/Status: (\w+)/) || [])[1] || '?';
  const lastActive = (t.document.match(/Last active: (\d{4}-\d{2}-\d{2})/) || [])[1] || '?';
  const hasResolved = t.document.includes('## Blockers Resolved') ? ' ✓R' : '';
  const hasObjObj = t.document.includes('[object Object]') ? ' ⚠️OO' : '';
  console.log(`  ${(t.name + ' ').padEnd(35, '.')} ${status.padEnd(10)} last=${lastActive}${hasResolved}${hasObjObj}`);
}

// === PHASE 4: Size analysis ===
console.log(`\n=== PHASE 4: Size analysis ===`);

let totalDocChars = 0;
for (const t of trackDocuments) {
  totalDocChars += t.document.length;
}
console.log(`Total track doc chars: ${totalDocChars} (~${Math.ceil(totalDocChars / 4)} tokens at chars/4)`);
console.log(`Avg per track: ${Math.ceil(totalDocChars / trackDocuments.length)} chars (~${Math.ceil(totalDocChars / trackDocuments.length / 4)} tokens)`);

// Trimmed docs (for digest - no history table)
let trimmedChars = 0;
for (const t of trackDocuments) {
  const trimmed = t.document.split('## Conversation History')[0] || t.document;
  trimmedChars += trimmed.length;
}
console.log(`Trimmed docs (no history): ${trimmedChars} chars (~${Math.ceil(trimmedChars / 4)} tokens)`);

// Condensed docs (like digest generator's condenseTrackForDigest)
// Quick estimate: ~300 chars per track
const condensedEstimate = trackDocuments.length * 300;
console.log(`Condensed docs (digest style): ~${condensedEstimate} chars (~${Math.ceil(condensedEstimate / 4)} tokens)`);

// Synthesis input: first 30 lines per doc
let synthesisChars = 0;
for (const t of trackDocuments) {
  const lines = t.document.split('\n').slice(0, 30);
  synthesisChars += lines.join('\n').length;
}
console.log(`Synthesis input (30 lines/doc): ${synthesisChars} chars (~${Math.ceil(synthesisChars / 4)} tokens)`);

// Digest output estimate
const outputEstimate = trackDocuments.length * 300 + 3000;
console.log(`Digest output est (34 tracks): ~${outputEstimate} chars (~${Math.ceil(outputEstimate / 4)} tokens at chars/4, ~${Math.ceil(outputEstimate / 2)} at chars/2 conservative)`);

// === Summary ===
console.log(`\n=== SUMMARY ===`);
const crashCount = issues.filter(i => i.type === 'CRASH').length;
if (crashCount > 0) {
  console.log(`❌ ${crashCount} CRASHES - fix before pushing`);
  for (const i of issues.filter(i => i.type === 'CRASH')) {
    console.log(`   ${i.track}: ${i.error}`);
    console.log(`   ${i.stack}`);
  }
}
if (totalObjObj > 0) {
  console.log(`❌ ${totalObjObj} [object Object] instances - fix before pushing`);
  for (const i of issues.filter(i => i.type === '[object Object]')) {
    console.log(`   ${i.track}: ${i.count}`);
  }
}
if (crashCount === 0 && totalObjObj === 0) {
  console.log('✓ No crashes, no [object Object]');
}
console.log(`✓ Resolved blockers sections: ${resolvedBlockersCount}`);
console.log(`✓ Kubernetes exists: ${!!k8sTrack}`);
console.log(`✓ Total secondary assignments: ${secondaryCount}`);

// Print detailed issues
if (issues.length > 0) {
  console.log(`\nAll issues:`);
  issues.forEach(i => console.log(`  ${i.type}: ${i.track} ${i.count ? '(' + i.count + ')' : ''} ${i.error || ''}`));
}
