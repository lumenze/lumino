#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error('Usage: node tools/chrome-extension/scripts/summarize-debug-report.mjs <report.json>');
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function fmtMs(ms) {
  return `${(ms / 1000).toFixed(3)}s`;
}

function cleanText(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function summarize(report) {
  const entries = Array.isArray(report.entries) ? report.entries : [];
  const startTs = entries[0]?.ts ?? Date.now();

  const walkthroughResume = entries.find(
    (e) => e?.category === 'walkthroughs' && typeof e?.message === 'string' && e.message.startsWith('Resuming in-progress walkthrough:')
  );
  const walkthroughId = walkthroughResume?.message?.split(':').slice(1).join(':').trim() || null;

  const stepEvents = [];
  const stepSeen = new Set();
  let lastStep = null;
  for (const e of entries) {
    if (e?.category !== 'player' || typeof e?.message !== 'string') continue;
    const m = e.message.match(/^Step (\d+)\/(\d+):\s+"([^"]+)"/);
    if (!m) continue;
    const data = e.data || {};
    const key = `${data.stepId || ''}::${m[1]}/${m[2]}`;
    if (stepSeen.has(key)) continue;
    stepSeen.add(key);
    const step = {
      ts: e.ts,
      idx: Number(m[1]),
      total: Number(m[2]),
      title: m[3],
      stepId: data.stepId || null,
      actionType: data.actionType || null,
      selector: data.selector || null,
      expectedUrl: data.expectedUrl || null,
      currentUrl: data.currentUrl || null,
    };
    stepEvents.push(step);
    lastStep = step;
  }

  const renderByStepId = new Map();
  for (const e of entries) {
    if (e?.category !== 'player' || typeof e?.message !== 'string') continue;
    if (!e.message.startsWith('Rendering step')) continue;
    const data = e.data || {};
    const stepMatch = e.message.match(/^Rendering step (\d+):/);
    const stepIdx = stepMatch ? Number(stepMatch[1]) : null;
    if (stepIdx === null) continue;
    if (!renderByStepId.has(stepIdx)) {
      renderByStepId.set(stepIdx, data);
    }
  }

  const waits = entries.filter(
    (e) => e?.category === 'player' && typeof e?.message === 'string' && e.message.startsWith('Still waiting for')
  );
  const finalWait = waits.at(-1) || null;

  const apiFailures = entries.filter((e) => {
    if (e?.category !== 'api' || typeof e?.message !== 'string') return false;
    const match = e.message.match(/->\s*(\d{3})/);
    if (!match) return false;
    return Number(match[1]) >= 400;
  });

  const startedEvents = entries.filter(
    (e) =>
      e?.category === 'api' &&
      typeof e?.message === 'string' &&
      e.message.startsWith('POST /api/v1/analytics/events') &&
      e?.data?.body?.type === 'walkthrough_started'
  );

  const lines = [];
  lines.push('# Lumino Debug Report Summary');
  lines.push('');
  lines.push('## Session');
  lines.push(`- Session: ${report.sessionId || 'n/a'}`);
  lines.push(`- URL: ${report.url || 'n/a'}`);
  lines.push(`- Exported At: ${report.exportedAt || 'n/a'}`);
  lines.push(`- User Agent: ${report.userAgent || 'n/a'}`);
  lines.push(`- Viewport: ${report.viewport?.w || '?'}x${report.viewport?.h || '?'}`);
  lines.push(`- Entries: ${report.entryCount ?? entries.length}`);
  lines.push('');
  lines.push('## Inferred Repro Steps');
  lines.push('1. Open the URL above.');
  lines.push('2. Inject Lumino using the Chrome extension.');
  if (walkthroughId) {
    lines.push(`3. Resume walkthrough \`${walkthroughId}\`.`);
  } else {
    lines.push('3. Start the walkthrough shown in the debug events.');
  }

  let listNum = 4;
  for (const step of stepEvents) {
    const render = renderByStepId.get(step.idx);
    const target = cleanText(step.selector || render?.id || step.title);
    const action = cleanText(step.actionType || 'interact');
    lines.push(
      `${listNum}. At step ${step.idx}/${step.total} (\`${step.title}\`), perform \`${action}\` on \`${target}\`.`
    );
    listNum += 1;
  }

  if (finalWait) {
    lines.push(`${listNum}. Observe the flow gets stuck waiting and does not advance.`);
  } else {
    lines.push(`${listNum}. Verify whether walkthrough advances through all steps.`);
  }
  lines.push('');

  lines.push('## Key Findings');
  if (lastStep) {
    lines.push(`- Last observed step: ${lastStep.idx}/${lastStep.total} (\`${lastStep.title}\`)`);
  }
  if (finalWait) {
    lines.push(`- Stuck warning: ${finalWait.message}`);
    if (finalWait?.data) {
      lines.push(
        `- Wait context: visible=${String(finalWait.data.elementVisible)}, inDom=${String(finalWait.data.elementStillInDom)}`
      );
    }
  }
  if (startedEvents.length > 1) {
    lines.push(`- Duplicate walkthrough start events detected: ${startedEvents.length}`);
  }
  if (apiFailures.length > 0) {
    lines.push(`- API failures detected: ${apiFailures.length}`);
    for (const fail of apiFailures.slice(0, 5)) {
      lines.push(`- API failure: ${fail.message}`);
    }
  } else {
    lines.push('- API failures: none detected');
  }
  lines.push('');

  lines.push('## Timeline Snippet');
  for (const e of entries.slice(0, 40)) {
    const rel = e.ts ? fmtMs(e.ts - startTs) : 'n/a';
    const cat = e.category || 'unknown';
    const lvl = e.level || 'info';
    const msg = cleanText(e.message || '');
    if (!msg) continue;
    lines.push(`- [${rel}] ${lvl}/${cat}: ${msg}`);
  }

  return lines.join('\n');
}

function main() {
  const input = process.argv[2];
  if (!input) {
    usage();
    process.exit(1);
  }
  const filePath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const report = readJson(filePath);
  const out = summarize(report);
  process.stdout.write(`${out}\n`);
}

main();
