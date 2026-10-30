#!/usr/bin/env node
// cofa-kit 명령줄 도구: MCP 가 안 될 때 같은 기능(시간·기록·요구사항·제출 점검)을 터미널에서 쓴다
import * as core from '../lib/core.mjs';

const HELP = `사용법: node .cofa/kit/scripts/kit.mjs <명령>
  start [HH:MM]          과제 시작 시각 기록(생략 시 지금)
  status                 경과·남은 시간과 현재 단계
  log "<한 줄>"           WORKLOG.md 에 기록
  decision --what "<결정>" --alt "<버린 대안>" --why "<이유>" --check "<검증 방법>"
  req add "<요구>" [--source 지시서|담당자|추론] [--status todo]
  req set <ID> [--status todo|doing|done|verified|dropped] [--evidence "<명령·결과>"] [--text ..]
  req list               요구사항 표
  run -- <명령>           테스트·실행을 돌리고 증거(.cofa/evidence)를 남긴다. 0건 실행은 통과로 치지 않는다
  check                  제출 전 점검
  env [--net]            실행 환경(언어·패키지) 확인. --net 이면 npm 레지스트리 접속도 시험
  help                   이 도움말`;

function parse(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--net') opt.net = true;
    else if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] ?? '', i++;
    else pos.push(argv[i]);
  }
  return { pos, opt };
}

const root = core.resolveRoot();
const argv = process.argv.slice(2);
// run 은 -- 뒤를 통째로 명령으로 받는다(옵션 해석을 하지 않는다)
const dd = argv.indexOf('--');
const runCmd = argv[0] === 'run' ? (dd >= 0 ? argv.slice(dd + 1) : argv.slice(1)).join(' ') : '';
const { pos, opt } = parse(argv[0] === 'run' ? ['run'] : argv);
const [cmd, ...rest] = pos;

try {
  switch (cmd) {
    case 'start':
      core.setStart(root, rest[0]);
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
      const [sub, arg] = rest;
      const show = (r) => console.log(`${r.id} [${r.status}] ${r.text} (출처: ${r.source}${r.evidence ? `, 증거: ${r.evidence}` : ''})`);
      if (sub === 'add') show(core.upsertReq(root, { text: arg, source: opt.source, status: opt.status, evidence: opt.evidence }));
      else if (sub === 'set') show(core.upsertReq(root, { id: arg, text: opt.text, source: opt.source, status: opt.status, evidence: opt.evidence }));
      else if (sub === 'list') console.log(core.renderReqs(core.loadReqs(root)));
      else throw new Error('req add | set | list');
      break;
    }
    case 'run': {
      const r = core.runEvidence(root, runCmd);
      console.log(`${r.tail}\n\n[증거 #${r.n}] exit ${r.code} · ${r.ms}ms · ${r.verdict} → ${r.file}`);
      // 0건 실행은 명령이 성공해도 종료 코드 2(검사한 것이 없음)
      process.exitCode = r.code !== 0 ? (r.code > 0 ? r.code : 1) : r.verdict === '통과' ? 0 : 2;
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
    default:
      console.log(HELP);
  }
} catch (e) {
  console.error(`오류: ${e.message}`);
  process.exitCode = 1;
}
