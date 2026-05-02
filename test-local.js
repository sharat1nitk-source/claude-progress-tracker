#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import ClaudeAPI from './src/claude-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Local test script - processes a Claude export without Google Drive
 */
async function runLocalTest() {
  console.log('🧠 Claude Progress Tracker - Local Test\n');

  // Get API key from command line argument
  const apiKey = process.argv[2];
  if (!apiKey) {
    console.error('❌ Usage: node test-local.js <api-key> <path-to-export-zip>');
    console.error('   Example: node test-local.js sk-ant-your-key-here /path/to/export.zip\n');
    process.exit(1);
  }

  // Get export file path from command line
  const exportPath = process.argv[3];
  if (!exportPath) {
    console.error('❌ Please provide path to your Claude export ZIP file');
    console.error('   Example: node test-local.js sk-ant-... ~/Downloads/export.zip\n');
    process.exit(1);
  }

  console.log('📦 Processing export:', path.basename(exportPath), '\n');

  try {
    // Extract ZIP
    console.log('📂 Extracting ZIP file...');
    const zip = new AdmZip(exportPath);
    const zipEntries = zip.getEntries();

    let conversations = [];
    let projects = [];

    for (const entry of zipEntries) {
      if (entry.entryName === 'conversations.json') {
        const content = entry.getData().toString('utf8');
        conversations = JSON.parse(content);
      } else if (entry.entryName === 'projects.json') {
        const content = entry.getData().toString('utf8');
        projects = JSON.parse(content);
      }
    }

    console.log(`✅ Found ${conversations.length} conversations`);
    console.log(`✅ Found ${projects.length} projects\n`);

    // Extract known project names
    const knownProjects = projects
      .filter(p => !p.is_starter_project)
      .map(p => p.name);

    console.log('📁 Your existing projects:', knownProjects.join(', '), '\n');

    // For testing, let's process just the first 5 conversations
    const testConversations = conversations.slice(0, 5);
    console.log(`🔬 Testing with first ${testConversations.length} conversations (to save API costs)\n`);

    // Initialize Claude API
    const claudeAPI = new ClaudeAPI(apiKey);

    // Process conversations
    console.log('🤖 Processing with Claude API...\n');
    const results = await claudeAPI.processConversations(testConversations, knownProjects);

    // Show results
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESULTS');
    console.log('='.repeat(70) + '\n');

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Successfully processed: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}\n`);

    // Show sample results
    console.log('📋 Sample Results:\n');
    for (const result of successful.slice(0, 3)) {
      const { conversation, metadata } = result;
      console.log(`─────────────────────────────────────────────────────────────────────`);
      console.log(`📝 "${conversation.name}"`);
      console.log(`   Project: ${metadata.projectName}`);
      console.log(`   Topic: ${metadata.topic}`);
      console.log(`   Progress: ${metadata.progressPercent}%`);
      console.log(`   Summary: ${metadata.progressSummary}`);
      console.log(`   Review: ${metadata.reviewDate}`);
      console.log(`   Next Steps:`);
      metadata.nextSteps.forEach(step => console.log(`      • ${step}`));
      console.log('');
    }

    // Generate projects.json structure
    const projectsMap = new Map();

    for (const result of successful) {
      const { conversation, metadata } = result;
      const projectName = metadata.projectName;
      const projectId = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      if (!projectsMap.has(projectId)) {
        projectsMap.set(projectId, {
          id: projectId,
          name: projectName,
          emoji: getProjectEmoji(projectName),
          color: getProjectColor(projectName),
          conversations: []
        });
      }

      const project = projectsMap.get(projectId);
      project.conversations.push({
        uuid: conversation.uuid,
        name: conversation.name,
        topic: metadata.topic,
        progressSummary: metadata.progressSummary,
        progressPercent: metadata.progressPercent,
        nextSteps: metadata.nextSteps,
        lastUpdated: conversation.updated_at,
        reviewDate: metadata.reviewDate,
        completed: metadata.progressPercent >= 100,
        notes: ''
      });
    }

    const outputData = {
      projects: Array.from(projectsMap.values()),
      lastUpdated: new Date().toISOString()
    };

    // Save to local file
    const outputPath = path.join(__dirname, 'projects-local.json');
    await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));

    console.log('='.repeat(70));
    console.log('✅ SUCCESS!');
    console.log('='.repeat(70));
    console.log(`\n📄 Generated: ${outputPath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   • ${successful.length} conversations processed`);
    console.log(`   • ${projectsMap.size} projects created`);
    console.log(`   • Ready to view!\n`);

    console.log('🎉 Local test complete!\n');
    console.log('Next steps:');
    console.log('1. Open projects-local.json to see the results');
    console.log('2. If you like it, we can process all 72 conversations');
    console.log('3. Then optionally set up cloud automation\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

function getProjectEmoji(projectName) {
  const name = projectName.toLowerCase();
  if (name.includes('ai') || name.includes('learn')) return '🧠';
  if (name.includes('finance')) return '💰';
  if (name.includes('home')) return '🏠';
  if (name.includes('productivity')) return '📊';
  if (name.includes('health') || name.includes('wellbeing')) return '❤️';
  if (name.includes('misc')) return '📝';
  return '📁';
}

function getProjectColor(projectName) {
  const name = projectName.toLowerCase();
  if (name.includes('ai') || name.includes('learn')) return '#9333ea';
  if (name.includes('finance')) return '#f59e0b';
  if (name.includes('home')) return '#3b82f6';
  if (name.includes('productivity')) return '#8b5cf6';
  if (name.includes('health') || name.includes('wellbeing')) return '#ec4899';
  if (name.includes('misc')) return '#6b7280';
  return '#6b7280';
}

runLocalTest();
