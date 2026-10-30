#!/usr/bin/env node
// cofa-kit 명령줄 도구: 시간·기록·요구사항·작업(탭) 나누기·실행 증거·커밋·제출 점검을 터미널에서 쓴다(MCP 없이 전부 된다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '../lib/core.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `사용법: node .cofa/kit/scripts/kit.mjs <명령>   (여러 탭에서 동시에 써도 기록이 섞이지 않는다)
  board                  한눈에: 시간·요구·작업(탭)·증거·커밋 안 된 변경·최근 커밋
  status                 경과·남은 시간과 현재 단계
  start [HH:MM] [--min 180]   시작 시각 기록(이미 있으면 그대로 둔다. 고칠 때만 HH:MM)
  req add "<요구>" ["<요구2>" …] [--source 지시서|담당자|추론]
  req set <ID> [--status todo|doing|done|verified|dropped] [--evidence "…"] [--text "…"] [--source …]
  req list
  run [--req R1,R2] [--mark verified] [--timeout 180] -- <명령>
                         테스트·실행을 돌려 증거(.cofa/evidence)를 남긴다. 통과하면 --req 요구에 증거 번호를 잇고
                         상태를 올린다(기본 구현됨, --mark verified 면 검증됨). 0건 실행·시간 초과는 통과가 아니다.
                         서버처럼 끝나지 않는 명령은 넣지 않는다(서버는 따로 띄우고 curl 을 run 으로)
  commit -m "<메시지>" <파일…>   그 파일과 기록 파일만 커밋(다른 탭의 변경은 섞지 않음, git 잠금이면 잠시 뒤 다시)
  task new "<제목>" --files "a.py,tests/test_a.py" --done "<완료 기준 명령>" [--req R2] [--goal "<한 줄>"]
  task <T번호> <대기|진행|완료|검증됨|중단>
  task list
  decision --what "<결정>" --alt "<버린 대안>" --why "<이유>" --check "<검증 방법>"
  log "<한 줄>"           WORKLOG.md 에 기록
  check                  제출 전 점검
  env [--net]            실행 환경(언어·패키지). --net 이면 npm 레지스트리 접속도 시험
  card                   한 장 요약(탭 나누기·입력 문장)
  mcp                    IDE 의 MCP 탭에 붙일 JSON(선택)
  help                   이 도움말`;

const FLAGS = new Set(['--net', '--force']);
function parse(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (FLAGS.has(a)) opt[a.slice(2)] = true;
    else if (a === '-m') (opt.m = argv[i + 1] ?? ''), i++;
    else if (a.startsWith('--') && a.length > 2) (opt[a.slice(2)] = argv[i + 1] ?? ''), i++;
    else pos.push(a);
  }
  return { pos, opt };
}

// run 은 -- 뒤(없으면 앞쪽 run 옵션 뒤)를 통째로 명령으로 받는다.
// 한 문자열이면 그대로(&&·| 같은 셸 문법 허용), 여러 인자면 인자마다 따옴표로 감싸 원래 경계를 지킨다.
// 리눅스 bash 는 작은따옴표, Windows cmd 는 작은따옴표를 모르므로 큰따옴표로 감싼다
const shQuote =
  process.platform === 'win32'
    ? (s) => (/^[\w\/\\.:=@%+,-]+$/.test(s) ? s : `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`)
    : (s) => (/^[\w\/.:=@%+,-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const RUN_OPTS = new Set(['--req', '--mark', '--timeout']);
function splitRun(args) {
  const dd = args.indexOf('--');
  const head = dd >= 0 ? args.slice(0, dd) : args;
  const opt = {};
  let i = 0;
  while (i < head.length && RUN_OPTS.has(head[i])) (opt[head[i].slice(2)] = head[i + 1] ?? ''), (i += 2);
  const cmdArgs = dd >= 0 ? args.slice(dd + 1) : args.slice(i);
  return { opt, cmd: cmdArgs.length === 1 ? cmdArgs[0] : cmdArgs.map(shQuote).join(' ') };
}

const root = core.resolveRoot();
const argv = process.argv.slice(2);
const { pos, opt } = parse(argv[0] === 'run' ? ['run'] : argv);
const [cmd, ...rest] = pos;
const ids = (s) => String(s || '').split(/[,\s]+/).filter(Boolean);

try {
  switch (cmd) {
    case 'board':
      console.log(core.board(root));
      break;
    case 'start':
      if (opt.min) core.setMinutes(root, opt.min);
      // 다른 탭이 실수로 start 를 다시 불러도 시작 시각이 지금으로 바뀌지 않게 한다
      if (!rest[0] && core.getStart(root) && !opt.force) console.log('시작 시각이 이미 있어 그대로 둡니다(고칠 때만 start HH:MM).');
      else core.setStart(root, rest[0]);
      console.log(core.timeStatus(root).text);
      break;
    case 'status':
      console.log(core.timeStatus(root).text);
      break;
    case 'log':
      console.log(core.appendWorklog(root, rest.join(' ')));
      break;
    case 'decision':
      console.log(core.appendDecision(root, { decision: opt.what, alternatives: opt.alt, reason: opt.why, verification: opt.check }));
      break;
    case 'req': {
      const [sub, ...args] = rest;
      const show = (r) => console.log(`${r.id} [${r.status}] ${r.text} (출처: ${r.source}${r.evidence ? `, 증거: ${r.evidence}` : ''})`);
      if (sub === 'add') {
        if (!args.length) throw new Error('req add "<요구>" ["<요구2>" …]');
        for (const text of args) show(core.upsertReq(root, { text, source: opt.source, status: opt.status, evidence: opt.evidence }));
      } else if (sub === 'set') show(core.upsertReq(root, { id: args[0], text: opt.text, source: opt.source, status: opt.status, evidence: opt.evidence }));
      else if (sub === 'list' || !sub) console.log(core.renderReqs(core.loadReqs(root)));
      else throw new Error('req add | set | list');
      break;
    }
    case 'run': {
      const { opt: ro, cmd: runCmd } = splitRun(argv.slice(1));
      const r = core.runEvidence(root, runCmd, { timeoutSec: ro.timeout, reqs: ids(ro.req), mark: ro.mark || 'done' });
      console.log(`${r.tail}\n\n[증거 #${r.n}] exit ${r.code} · ${r.ms}ms · ${r.verdict} → ${r.file}${r.linked.length ? `\n[요구] ${r.linked.join(' · ')}` : ''}`);
      if (r.verdict.includes('시간 초과')) console.log('서버처럼 끝나지 않는 명령이면 kit.mjs run 밖에서 띄우고, 확인용 curl 만 run 으로 돌린다.');
      // 0건 실행은 명령이 성공해도 종료 코드 2(검사한 것이 없음)
      process.exitCode = r.code !== 0 ? (r.code > 0 ? r.code : 1) : r.verdict === '통과' ? 0 : 2;
      break;
    }
    case 'commit':
      console.log(core.commitPaths(root, opt.m || opt.message, rest));
      break;
    case 'task': {
      const [sub, ...args] = rest;
      if (sub === 'new') {
        const t = core.newTask(root, { title: args.join(' '), files: opt.files, done: opt.done, reqs: opt.req, goal: opt.goal });
        console.log(`${t.id} 만듦 → ${t.file} (「입출력 계약」 칸을 2~3줄 채운다)`);
        for (const o of t.overlaps) console.log(`⚠ 파일 겹침: ${o} — 한 파일은 한 작업만 고치게 나눈다`);
        console.log(`사용자에게: 터미널 새 탭(+) → codex --yolo → $worker ${t.id}`);
      } else if (sub === 'list' || !sub) console.log(core.renderTasks(core.loadTasks(root)));
      else console.log(core.setTaskStatus(root, sub, args[0]));
      break;
    }
    case 'check': {
      const items = core.submissionCheck(root);
      console.log(core.formatCheck(items));
      process.exitCode = items.some((i) => i.level === 'fail') ? 1 : 0;
      break;
    }
    case 'env':
      console.log(core.envReport(root, { net: !!opt.net }));
      break;
    case 'card':
      console.log(fs.readFileSync(path.join(KIT, 'docs', 'card.md'), 'utf8'));
      break;
    case 'mcp':
      console.log(
        'IDE 의 MCP 탭 JSON 의 mcpServers 안에 넣고 저장한 뒤 codex 를 다시 연다(선택. 안 되면 빼고 kit.mjs 만 쓴다):\n' +
          JSON.stringify({ mcpServers: { 'cofa-kit': { command: 'node', args: [path.join(KIT, 'mcp', 'server.mjs')], env: { COFA_ROOT: root }, default_tools_approval_mode: 'approve' } } }, null, 2),
      );
      break;
    default:
      console.log(HELP);
  }
} catch (e) {
  console.error(`오류: ${e.message}`);
  process.exitCode = 1;
}
