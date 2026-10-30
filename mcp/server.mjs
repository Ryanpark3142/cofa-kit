#!/usr/bin/env node
// cofa-kit MCP 서버(stdio, 의존성 없음): 시간 상태·작업/결정 기록·요구사항 추적·제출 점검 도구를 Codex 에 제공
import readline from 'node:readline';
import * as core from '../lib/core.mjs';

const root = core.resolveRoot();
// 이 서버가 지원하는 MCP 버전. 클라이언트가 이 밖의 버전을 요청하면 최신 지원 버전으로 답한다(MCP 버전 협상 규칙)
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE_LOCAL = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const TOOLS = [
  {
    name: 'board',
    readOnly: true,
    description: '한눈에 보기: 경과·남은 시간, 요구 상태, 다른 탭의 작업(T), 마지막 실행 증거, 커밋 안 된 변경, 최근 커밋. 새 세션을 시작하거나 다음 할 일을 고를 때 부른다.',
    inputSchema: { type: 'object', properties: {} },
    run: () => core.board(root),
  },
  {
    name: 'time_status',
    readOnly: true,
    description: '과제 경과·남은 시간과 지금 해야 할 단계를 알려준다. 단계를 바꾸거나 큰 작업을 시작하기 전에 부른다.',
    inputSchema: { type: 'object', properties: {} },
    run: () => core.timeStatus(root).text,
  },
  {
    name: 'log_work',
    description: 'WORKLOG.md 에 시각과 함께 한 줄 기록한다. 슬라이스 완료·막힘·방향 전환·담당자 답변 반영 때 쓴다.',
    inputSchema: { type: 'object', properties: { entry: { type: 'string' } }, required: ['entry'] },
    run: (a) => core.appendWorklog(root, a.entry),
  },
  {
    name: 'log_decision',
    description: 'DECISIONS.md 에 설계·범위 결정을 한 줄 남긴다(결정/버린 대안/이유/검증 방법). 서술형 답변의 근거가 된다.',
    inputSchema: {
      type: 'object',
      properties: {
        decision: { type: 'string' },
        alternatives: { type: 'string' },
        reason: { type: 'string' },
        verification: { type: 'string' },
      },
      required: ['decision', 'reason'],
    },
    run: (a) => core.appendDecision(root, a),
  },
  {
    name: 'req_upsert',
    description:
      '요구사항 추적표(REQUIREMENTS.md)에 요구를 추가하거나 상태를 바꾼다. id 없이 text 를 주면 추가. status: todo|doing|done|verified|dropped. verified 는 evidence(실행한 명령과 결과)가 있을 때만.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
        source: { type: 'string', description: '지시서 | 담당자 | 추론' },
        status: { type: 'string', enum: core.REQ_STATUS },
        evidence: { type: 'string' },
      },
    },
    run: (a) => JSON.stringify(core.upsertReq(root, a)),
  },
  {
    name: 'req_list',
    readOnly: true,
    description: '요구사항 추적표 전체를 돌려준다.',
    inputSchema: { type: 'object', properties: {} },
    run: () => core.renderReqs(core.loadReqs(root)),
  },
  {
    name: 'submission_check',
    readOnly: true,
    description: '제출 전 점검: 필수 문서, 미검증 요구, 커밋 안 된 변경, 비밀키 의심 문자열, TODO, 큰 파일.',
    inputSchema: { type: 'object', properties: {} },
    run: () => core.formatCheck(core.submissionCheck(root)),
  },
];

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // 알림은 응답하지 않는다
  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: SUPPORTED_VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : SUPPORTED_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'cofa-kit', version: core.VERSION },
      },
    });
  }
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') {
    const tools = TOOLS.map(({ run, readOnly, ...t }) => ({ ...t, annotations: readOnly ? READ_ONLY : WRITE_LOCAL }));
    return send({ jsonrpc: '2.0', id, result: { tools } });
  }
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `알 수 없는 도구: ${params?.name}` } });
    try {
      const text = tool.run(params.arguments || {});
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
    } catch (e) {
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `오류: ${e.message}` }], isError: true } });
    }
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `지원하지 않는 메서드: ${method}` } });
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON 파싱 실패' } });
  }
  for (const m of Array.isArray(msg) ? msg : [msg]) handle(m);
});
