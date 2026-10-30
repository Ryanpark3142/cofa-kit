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
  check                  제출 전 점검
  env                    실행 환경(언어·패키지·네트워크) 확인`;

function parse(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] ?? '', i++;
    else pos.push(argv[i]);
  }
  return { pos, opt };
}

const root = core.resolveRoot();
const { pos, opt } = parse(process.argv.slice(2));
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
    case 'check': {
      const items = core.submissionCheck(root);
      console.log(core.formatCheck(items));
      process.exitCode = items.some((i) => i.level === 'fail') ? 1 : 0;
      break;
    }
    case 'env':
      console.log(core.envReport(root));
      break;
    default:
      console.log(HELP);
  }
} catch (e) {
  console.error(`오류: ${e.message}`);
  process.exitCode = 1;
}
