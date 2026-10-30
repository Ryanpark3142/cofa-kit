#!/usr/bin/env node
// Codex 훅 공용 스크립트: 세션 시작(start)·프롬프트 제출(prompt) 때 시간 상태와 작업 규칙을 컨텍스트로 넣는다
import fs from 'node:fs';
import path from 'node:path';
import * as core from '../lib/core.mjs';

const mode = process.argv[2] === 'start' ? 'start' : 'prompt';

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function lastLines(file, n) {
  try {
    return fs.readFileSync(file, 'utf8').trim().split('\n').filter((l) => l.startsWith('- [')).slice(-n).join('\n');
  } catch {
    return '';
  }
}

try {
  const input = readStdin();
  const root = core.resolveRoot(input.cwd || process.cwd());
  const t = core.timeStatus(root);
  let text;
  if (mode === 'start') {
    const recent = lastLines(path.join(root, 'WORKLOG.md'), 5);
    text = [
      '[cofa-kit] 세션 시작 상태',
      t.text,
      recent ? `최근 작업 기록:\n${recent}` : '작업 기록 없음 — 지시서 파악부터.',
      '규칙: 요구에 없는 기능 금지 · 슬라이스마다 검증 후 커밋 · 결정은 DECISIONS.md · 증거 없으면 「미검증」.',
    ].join('\n');
  } else {
    if (!t.started) process.exit(0);
    text = `[cofa-kit] 경과 ${t.elapsed}분 / 남은 ${t.remaining}분 · 단계: ${t.phase}`;
    if (t.remaining <= 15) text += ' · 새 기능 금지, 저장·커밋·제출만';
  }
  const event = mode === 'start' ? 'SessionStart' : 'UserPromptSubmit';
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
} catch {
  // 훅 실패가 작업을 막지 않게 조용히 끝낸다
}
process.exit(0);
