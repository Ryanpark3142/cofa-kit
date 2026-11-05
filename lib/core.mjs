// cofa-kit 공용 로직: 시간 상태·작업 기록·결정 기록·요구사항 추적·작업(탭) 나누기·실행 증거·커밋·제출 점검·환경 확인
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';

export const VERSION = '0.2.0';
const IS_WIN = process.platform === 'win32';

// 180분 과제 기준 단계표. [시작분, 끝분, 이름, 할 일]
export const PHASES = [
  [0, 15, '파악', '지시서 정독 → 담당자에게 구체적인 질문을 하나씩 → 요구사항 등록(req add)'],
  [15, 30, '계획', '설계안 2개 비교 → 슬라이스 분할 → 슬라이스마다 검증 방법 먼저 → PLAN.md → 첫 커밋'],
  [30, 130, '구현', '슬라이스마다 구현→검증→커밋, 파일이 안 겹치는 슬라이스는 다른 탭에 맡김. 100분에 필수 요구가 남았으면 가산 기능은 버린다'],
  [130, 155, '검증', '요구사항별 실행 증거, 엣지 케이스, 독립 검증($check), 증거 없는 것은 「미검증」'],
  [155, 170, '정리', 'SUBMISSION.md·한계 작성, 서술형 대비($explainback), 핵심 코드 다시 읽기'],
  [170, 180, '제출', '저장 상태·필수 파일 확인 → 「제출하고 문제풀기」'],
];

// .cofa(키트 설치 위치)가 있는 가장 가까운 상위 폴더를 먼저 찾고, 없으면 가장 가까운 .git 폴더.
// 과제가 하위 폴더에 따로 git 저장소를 줘도 기록이 두 곳으로 갈라지지 않게 한다
export function findRoot(start = process.cwd()) {
  const from = path.resolve(start);
  let gitDir = null;
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.cofa'))) return dir;
    if (!gitDir && fs.existsSync(path.join(dir, '.git'))) gitDir = dir;
    if (path.dirname(dir) === dir) return gitDir || from;
  }
}

export function resolveRoot(cwd) {
  return process.env.COFA_ROOT ? path.resolve(process.env.COFA_ROOT) : findRoot(cwd);
}

const p = (root, ...rest) => path.join(root, ...rest);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// 여러 세션(터미널 탭)이 같은 기록 파일을 동시에 고쳐도 한쪽 변경이 사라지지 않게 잠근다.
// 잠근 프로세스가 죽어 남은 잠금은 10초 뒤 치운다
export function withLock(root, name, fn) {
  fs.mkdirSync(p(root, '.cofa'), { recursive: true });
  const lock = p(root, '.cofa', `${name}.lock`);
  for (let i = 0; ; i++) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 10000) fs.rmSync(lock, { force: true });
      } catch {}
      if (i >= 300) throw new Error(`.cofa/${name}.lock 을 얻지 못했습니다. 다른 세션이 끝난 뒤 다시 하세요.`);
      sleep(20 + Math.random() * 30);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

// 쓰다 끊겨도 반쪽 파일이 남지 않게 .cofa 안의 임시 파일에 쓰고 이름을 바꾼다
function writeAtomic(root, file, data) {
  const tmp = p(root, '.cofa', `tmp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, data);
  for (let i = 0; ; i++) {
    try {
      return fs.renameSync(tmp, file);
    } catch (e) {
      // Windows 는 다른 프로세스가 그 파일을 읽는 중이면 이름 바꾸기를 잠깐 거부한다
      if (i >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) {
        fs.rmSync(tmp, { force: true });
        throw e;
      }
      sleep(25);
    }
  }
}

// 없을 때만 머리말을 쓴다(두 세션이 동시에 만들어도 먼저 쓴 내용을 덮지 않는다)
function ensureFile(file, header) {
  try {
    fs.writeFileSync(file, header, { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}

function readConfig(root) {
  try {
    return JSON.parse(fs.readFileSync(p(root, '.cofa', 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function setMinutes(root, minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) throw new Error(`--min 은 양수 분이어야 합니다: ${minutes}`);
  fs.mkdirSync(p(root, '.cofa'), { recursive: true });
  fs.writeFileSync(p(root, '.cofa', 'config.json'), JSON.stringify({ ...readConfig(root), minutes: m }, null, 2) + '\n');
}

export function getStart(root) {
  try {
    const raw = fs.readFileSync(p(root, '.cofa', 'started_at'), 'utf8').trim();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// hhmm 가 주어지면 오늘(KST) 그 시각, 없으면 지금을 시작 시각으로 기록
export function setStart(root, hhmm, now = new Date()) {
  let start = now;
  if (hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) throw new Error(`시각 형식은 HH:MM 이어야 합니다: ${hhmm}`);
    const kstNow = new Date(now.getTime() + 9 * 3600e3);
    const y = kstNow.getUTCFullYear();
    const mo = kstNow.getUTCMonth();
    const d = kstNow.getUTCDate();
    start = new Date(Date.UTC(y, mo, d, Number(m[1]) - 9, Number(m[2])));
  }
  fs.mkdirSync(p(root, '.cofa'), { recursive: true });
  fs.writeFileSync(p(root, '.cofa', 'started_at'), start.toISOString() + '\n');
  return start;
}

export function kst(d) {
  return d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function timeStatus(root, now = new Date()) {
  const start = getStart(root);
  if (!start) {
    return { started: false, text: '시작 시각이 없습니다. `node .cofa/kit/scripts/kit.mjs start` (또는 start HH:MM) 로 기록하세요.' };
  }
  const total = Number(readConfig(root).minutes) || 180;
  const elapsed = Math.max(0, Math.floor((now - start) / 60000));
  const remaining = total - elapsed;
  const scale = total / 180;
  const idx = PHASES.findIndex(([a, b]) => elapsed >= a * scale && elapsed < b * scale);
  const phase = idx >= 0 ? PHASES[idx] : [180, 180, '시간 종료', '즉시 제출. 시작 시각이 틀렸다면 kit.mjs start HH:MM 으로 고친다'];
  const next = idx >= 0 ? PHASES[idx + 1] : null;
  const lines = [
    remaining >= 0
      ? `경과 ${elapsed}분 / 남은 ${remaining}분 (시작 ${kst(start)} KST, 총 ${total}분)`
      : `경과 ${elapsed}분 / ${-remaining}분 초과 (시작 ${kst(start)} KST, 총 ${total}분)`,
    `현재 단계: ${phase[2]} — ${phase[3]}`,
  ];
  if (next) lines.push(`다음 단계 「${next[2]}」 까지 ${Math.round(next[0] * scale) - elapsed}분`);
  if (remaining <= 15 && remaining > 0) lines.push('⚠ 15분 이하: 새 기능 금지. 저장·커밋·제출만 한다.');
  return { started: true, elapsed, remaining, total, phase: phase[2], text: lines.join('\n') };
}

function stamp(root, now = new Date()) {
  const t = timeStatus(root, now);
  return t.started ? `${kst(now)} +${t.elapsed}m` : kst(now);
}

export function appendWorklog(root, text, now = new Date()) {
  if (!String(text || '').trim()) throw new Error('기록할 내용이 없습니다: kit.mjs log "<한 줄>"');
  const file = p(root, 'WORKLOG.md');
  ensureFile(file, '# WORKLOG\n\n작업 흐름을 시각과 함께 한 줄씩 남긴다.\n\n');
  const line = `- [${stamp(root, now)}] ${text.replace(/\s*\n\s*/g, ' ')}\n`;
  fs.appendFileSync(file, line);
  return line.trim();
}

const DECISION_HEADER =
  '# DECISIONS\n\n결정할 때마다 한 줄. 서술형 답변의 재료다.\n\n| 시각 | 결정 | 버린 대안 | 이유 | 검증 방법 |\n|---|---|---|---|---|\n';

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim() || '-';

export function appendDecision(root, { decision, alternatives, reason, verification }, now = new Date()) {
  if (!decision) throw new Error('decision 은 필수입니다');
  const file = p(root, 'DECISIONS.md');
  ensureFile(file, DECISION_HEADER);
  const row = `| ${stamp(root, now)} | ${cell(decision)} | ${cell(alternatives)} | ${cell(reason)} | ${cell(verification)} |\n`;
  fs.appendFileSync(file, row);
  return row.trim();
}

export const REQ_STATUS = ['todo', 'doing', 'done', 'verified', 'dropped'];
const STATUS_KO = { todo: '할 일', doing: '진행', done: '구현(미검증)', verified: '검증됨', dropped: '제외' };

// 파일이 없을 때만 빈 목록. 깨진 JSON 을 빈 목록으로 보고 덮어쓰면 기존 요구가 사라지므로 오류로 멈춘다
export function loadReqs(root) {
  const file = p(root, '.cofa', 'requirements.json');
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`.cofa/requirements.json 을 읽지 못했습니다(${e.message}). 파일을 고치거나 git 으로 되돌린 뒤 다시 하세요.`);
  }
}

export function renderReqs(reqs) {
  const head =
    '# REQUIREMENTS\n\n요구사항 추적표. `kit.mjs req` 나 `kit.mjs run --req` 로 갱신한다(직접 고치면 다음 갱신 때 덮어써진다).\n' +
    '출처: 지시서 / 담당자 / 추론(확인 필요). 「검증됨」 은 증거(명령·결과)가 있을 때만.\n\n' +
    '| ID | 요구 | 출처 | 상태 | 증거·비고 |\n|---|---|---|---|---|\n';
  return head + reqs.map((r) => `| ${r.id} | ${cell(r.text)} | ${cell(r.source)} | ${STATUS_KO[r.status] || r.status} | ${cell(r.evidence)} |`).join('\n') + '\n';
}

function saveReqs(root, reqs) {
  writeAtomic(root, p(root, '.cofa', 'requirements.json'), JSON.stringify(reqs, null, 2));
  writeAtomic(root, p(root, 'REQUIREMENTS.md'), renderReqs(reqs));
}

const findReq = (reqs, id) => reqs.find((x) => String(x.id).toLowerCase() === String(id).toLowerCase());

export function upsertReq(root, { id, text, source, status, evidence }) {
  if (status && !REQ_STATUS.includes(status)) throw new Error(`status 는 ${REQ_STATUS.join('|')} 중 하나`);
  return withLock(root, 'requirements', () => {
    const reqs = loadReqs(root);
    let r = id ? findReq(reqs, id) : null;
    if (!r) {
      if (!text) throw new Error(id ? `없는 ID 입니다: ${id}` : 'text 는 필수입니다');
      const n = reqs.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0) + 1;
      r = { id: id || `R${n}`, text, source: source || '지시서', status: status || 'todo', evidence: evidence || '' };
      reqs.push(r);
    } else {
      // 명시적으로 넘긴 값은 빈 문자열도 반영한다(증거 지우기)
      if (text) r.text = text;
      if (source) r.source = source;
      if (status) r.status = status;
      if (evidence !== undefined) r.evidence = evidence;
    }
    saveReqs(root, reqs);
    return r;
  });
}

// 통과한 실행 증거를 요구에 잇는다: 상태를 올리고(검증됨은 내리지 않는다) 증거는 최근 3개까지 남긴다
export function linkEvidence(root, ids, ref, mark = 'done') {
  return withLock(root, 'requirements', () => {
    const reqs = loadReqs(root);
    const out = [];
    for (const id of ids) {
      const r = findReq(reqs, id);
      if (!r) {
        out.push(`${id}: 없는 요구라 잇지 않음(kit.mjs req list)`);
        continue;
      }
      if (mark === 'verified' || r.status !== 'verified') r.status = mark;
      const refs = String(r.evidence || '').split(' / ').filter((s) => s && s !== ref);
      r.evidence = [...refs, ref].slice(-3).join(' / ');
      out.push(`${r.id} → ${STATUS_KO[r.status]}`);
    }
    saveReqs(root, reqs);
    return out;
  });
}

// 테스트 러너들이 「0건 실행」 을 알리는 문구. 이때 종료 코드 0 이어도 통과로 치지 않는다
// (pytest·unittest·mocha·jest·vitest·go test·node --test 의 spec/TAP 출력)
const ZERO_RUN = /(collected 0 items|no tests ran|Ran 0 tests|\b0 passing\b|Tests:\s+0 total|No tests found|\[no test files\]|^\s*(?:#|ℹ)\s*tests 0\s*$|\b0 tests?\b(?! failed))/im;

// 코드 상태 「HEAD·지문」. 지문은 git 이 보는 작업 파일(추적 + 무시 안 된 새 파일)의 경로·내용 해시라 커밋만 하면 그대로고 파일이 바뀌면 달라진다.
// .git 에 아무것도 쓰지 않으므로 샌드박스에서도 계산된다. 기록 문서(*.md)·숨김 경로(.cofa·.codex 등)·의존성 폴더는 빼서 코드 변경만 본다
const STATE_SKIP = (f) => /(^|\/)\./.test(f) || /(^|\/)(node_modules|venv|__pycache__|site-packages)\//.test(f) || /\.md$/i.test(f);

export function codeState(root) {
  if (sh('git rev-parse --is-inside-work-tree', root) !== 'true') return '-';
  const head = sh('git rev-parse --short HEAD', root) || '커밋없음';
  const r = git(root, ['-c', 'core.quotePath=false', 'ls-files', '-z', '-c', '-o', '--exclude-standard']);
  if (r.code !== 0) return `${head}·?`;
  const files = [...new Set(r.out.split('\0').filter(Boolean))].filter((f) => !STATE_SKIP(f)).sort();
  const h = createHash('sha1');
  for (const f of files) {
    let st;
    try {
      st = fs.statSync(p(root, f));
    } catch {
      continue; // 지운 파일은 목록에서 빠져 지문이 달라진다
    }
    if (!st.isFile()) continue;
    h.update(`${f}\0`);
    // 큰 파일(데이터 등)은 내용 대신 크기·수정 시각으로 본다(매번 읽으면 느리다)
    h.update(st.size > 20 * 1024 * 1024 ? `${st.size}:${st.mtimeMs}` : fs.readFileSync(p(root, f)));
  }
  return `${head}·${h.digest('hex').slice(0, 10)}`;
}

// 리눅스는 bash 로 돌린다(/bin/sh 가 dash 면 Codex 가 흔히 쓰는 bash 문법이 깨진다).
// timeout 명령이 있으면 그 아래에서 돌려, 시간 초과 때 자식 프로세스(실수로 띄운 서버 등)까지 같이 끝낸다
function shellFor(command, sec) {
  if (IS_WIN || !fs.existsSync('/bin/bash')) return { file: command, args: null, ms: sec * 1000, wrapped: false };
  // GNU coreutils 의 timeout 만 쓴다(busybox 판은 -k 를 몰라 모든 실행이 실패로 기록된다)
  if (/coreutils/i.test(sh('timeout --version') || '')) {
    return { file: 'timeout', args: ['-k', '5', String(sec), '/bin/bash', '-c', command], ms: (sec + 15) * 1000, wrapped: true };
  }
  return { file: '/bin/bash', args: ['-c', command], ms: sec * 1000, wrapped: false };
}

// 큰 출력도 끝부분만 읽는다(테스트 요약·0건 문구는 끝에 나온다)
function readTail(file, max) {
  const size = fs.statSync(file).size;
  const len = Math.min(size, max);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buf, 0, len, size - len);
  } finally {
    fs.closeSync(fd);
  }
  return buf.toString('utf8');
}

const shortCmd = (c) => {
  const s = String(c).replace(/\s+/g, ' ').trim();
  return s.length > 40 ? s.slice(0, 39) + '…' : s;
};

// 명령을 실행하고 명령·코드 상태·종료 코드·소요 시간·끝 40줄을 .cofa/evidence 에 남긴다(검증 증거).
// reqs 를 주면 통과했을 때 그 요구에 증거 번호를 잇고 상태를 올린다(mark: done | verified)
export function runEvidence(root, command, { now = new Date(), timeoutSec = 180, reqs = [], mark = 'done' } = {}) {
  if (!command) throw new Error('실행할 명령이 없습니다: kit.mjs run -- <명령>');
  if (!['done', 'verified'].includes(mark)) throw new Error('--mark 는 done 이나 verified 입니다');
  const sec = Math.max(1, Math.round(Number(timeoutSec) || 180));
  const sp = shellFor(command, sec);
  // 출력은 파이프가 아니라 파일로 받는다: 명령이 서버를 백그라운드로 띄우면(`app &`) 그 서버가 파이프를 쥐고 있어
  // 명령이 끝나도 spawnSync 가 서버가 죽을 때까지 기다린다. 파일이면 명령이 끝나는 즉시 돌아온다(stdout·stderr 순서도 그대로)
  fs.mkdirSync(p(root, '.cofa'), { recursive: true });
  const outFile = p(root, '.cofa', `tmp-run-${process.pid}-${Date.now()}.out`);
  const fd = fs.openSync(outFile, 'w');
  const t0 = Date.now();
  let r;
  try {
    const base = { cwd: root, stdio: ['ignore', fd, fd], timeout: sp.ms };
    r = sp.args ? spawnSync(sp.file, sp.args, base) : spawnSync(sp.file, { ...base, shell: true });
  } finally {
    fs.closeSync(fd);
  }
  const ms = Date.now() - t0;
  // 코드 상태는 실행 「뒤」 에 잰다: 명령이 만든 산출물(out/report.csv 등)까지 들어가야 다음 점검에서 오경보가 나지 않는다
  const state = codeState(root);
  const output = readTail(outFile, 256 * 1024);
  try {
    fs.rmSync(outFile, { force: true });
  } catch {
    // Windows 에서 백그라운드 프로세스가 아직 쥐고 있으면 못 지운다(.cofa/.gitignore 의 tmp-* 라 커밋되지 않는다)
  }
  const tail = output.trimEnd().split('\n').slice(-40).join('\n');
  // 시그널로 죽거나(시간 초과 포함) 실행 자체가 실패하면 status 가 null 이다. 이때 통과로 치지 않는다
  const code = r.status ?? -1;
  const timedOut = r.error?.code === 'ETIMEDOUT' || (sp.wrapped && (code === 124 || code === 137) && ms >= sec * 1000 - 1000);
  const verdict = timedOut
    ? `실패(시간 초과 ${sec}초)`
    : r.signal
      ? `실패(${r.signal})`
      : code !== 0
        ? '실패'
        : ZERO_RUN.test(output)
          ? '0건(돌리지 않음)'
          : '통과';
  const dir = p(root, '.cofa', 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  ensureFile(path.join(dir, 'index.md'), '| # | 시각 | 명령 | 코드 상태 | exit | 판정 |\n|---|---|---|---|---|---|\n');
  // 여러 세션이 동시에 실행해도 번호가 겹치지 않게 「없을 때만 만들기」 로 번호를 잡는다
  let num = Math.max(0, ...fs.readdirSync(dir).map((f) => parseInt(f, 10)).filter(Number.isFinite)) + 1;
  let n;
  let file;
  for (;; num++) {
    n = String(num).padStart(3, '0');
    file = path.join(dir, `${n}.log`);
    try {
      fs.writeFileSync(file, `$ ${command}\n# ${stamp(root, now)} · 코드 ${state} · exit ${code} · ${ms}ms · ${verdict}\n\n${tail}\n`, { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  fs.appendFileSync(path.join(dir, 'index.md'), `| ${n} | ${stamp(root, now)} | \`${cell(command)}\` | ${state} | ${code} | ${verdict} |\n`);
  const linked = verdict === '통과' && reqs.length ? linkEvidence(root, reqs, `#${n} ${shortCmd(command)} 통과`, mark) : [];
  return { n, code, verdict, ms, tail, state, linked, file: path.relative(root, file) };
}

export function loadEvidence(root) {
  try {
    return fs
      .readFileSync(p(root, '.cofa', 'evidence', 'index.md'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => l.split('|').map((s) => s.trim()))
      .filter((c) => /^\d+$/.test(c[1] || ''))
      .map((c) => ({ n: c[1], at: c[2], state: c[c.length - 4], code: c[c.length - 3], verdict: c[c.length - 2] }));
  } catch {
    return [];
  }
}

// 마지막 통과 뒤에 코드 파일이 바뀌었으면 그 통과는 지금 코드의 증거가 아니다
function staleNote(root, ev) {
  const pass = [...ev].reverse().find((e) => e.verdict === '통과');
  const tree = (s) => (s || '').split('·')[1];
  const before = tree(pass?.state);
  const now = tree(codeState(root));
  return pass && before && before !== '?' && now && now !== '?' && before !== now ? pass : null;
}

function sh(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim();
  } catch {
    return null;
  }
}

// 앞 공백은 남긴다(git status --porcelain 은 첫 칸 공백이 뜻을 가진다)
function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 30000 });
  return { code: r.status ?? -1, out: `${r.stdout || ''}${r.stderr || ''}`.trimEnd() };
}

// ── 작업(탭) 나누기 ── .cofa/tasks/T<n>.md 한 파일이 작업 하나. 메인 세션이 만들고 다른 탭의 작업 세션($worker)이 맡는다
export const TASK_STATUS = ['대기', '진행', '완료', '검증됨', '중단'];
const ACTIVE = ['대기', '진행'];
const taskDir = (root) => p(root, '.cofa', 'tasks');
const splitFiles = (s) =>
  String(s || '')
    .split(/[,\s]+/)
    .map((f) => f.replace(/^[`'"]+|[`'"]+$/g, '').replace(/^\.\//, ''))
    .filter(Boolean);

export function parseTask(text) {
  const get = (k) => ((new RegExp(`^${k}\\s*:\\s*(.*)$`, 'm').exec(text) || [])[1] || '').trim();
  return { title: ((/^#\s*(.*)$/m.exec(text) || [])[1] || '').trim(), status: get('상태'), reqs: get('요구'), files: splitFiles(get('수정 가능한 파일')), done: get('완료 기준') };
}

export function loadTasks(root) {
  let names;
  try {
    names = fs.readdirSync(taskDir(root)).filter((f) => /^T\d+\.md$/i.test(f));
  } catch {
    return [];
  }
  return names
    .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
    .map((f) => ({ id: f.replace(/\.md$/i, '').toUpperCase(), ...parseTask(fs.readFileSync(path.join(taskDir(root), f), 'utf8')) }));
}

// 진행 중인 작업끼리 같은 파일을 고치게 돼 있으면 알려준다(두 탭이 한 파일을 고치면 한쪽 수정이 깨진다)
export function taskOverlaps(tasks) {
  const owner = new Map();
  const out = [];
  for (const t of tasks.filter((x) => ACTIVE.includes(x.status))) {
    for (const f of t.files) {
      if (owner.has(f) && owner.get(f) !== t.id) out.push(`${f} ← ${owner.get(f)}, ${t.id}`);
      else owner.set(f, t.id);
    }
  }
  return out;
}

export function newTask(root, { title, files, done, reqs, goal }) {
  if (!title) throw new Error('작업 제목이 필요합니다: task new "<제목>" --files "a.py,tests/test_a.py" --done "<완료 기준 명령>"');
  const list = splitFiles(files);
  if (!list.length) throw new Error('--files 로 수정 가능한 파일을 정해야 합니다(다른 작업과 겹치지 않게).');
  if (!done) throw new Error('--done 으로 완료 기준 명령을 정해야 합니다(예: --done "python3 -m pytest -q tests/test_a.py").');
  fs.mkdirSync(taskDir(root), { recursive: true });
  let num = Math.max(0, ...fs.readdirSync(taskDir(root)).map((f) => parseInt(f.slice(1), 10)).filter(Number.isFinite)) + 1;
  for (;; num++) {
    const id = `T${num}`;
    const file = path.join(taskDir(root), `${id}.md`);
    const body = [
      `# ${id}: ${title}`,
      '상태: 대기',
      `요구: ${reqs || '-'}`,
      `수정 가능한 파일: ${list.join(', ')}`,
      `완료 기준: ${done}`,
      `목표: ${goal || '(메인이 한 줄로)'}`,
      '',
      '## 입출력 계약',
      '(메인이 2~3줄: 함수 이름과 인자·반환, 파일 형식, 예시 입력 → 기대 출력)',
      '',
      '## 하지 말 것',
      '- 위 파일 밖 수정(필요하면 「메인이 할 일」 로 적는다. 이 작업 파일의 「결과」 절과 상태 줄은 작업 세션이 채운다), 패키지 설치, 서버 실행, 설계 변경',
      '- `git add -A`·`git add .`·`git commit -a`·`git stash`·`git reset`·`git checkout -- .`·`git clean`',
      '',
      '## 결과',
      '(작업 세션이 끝나고 채운다: 바꾼 파일 · 증거 번호와 결과 · 커밋 · 메인이 할 일 · 남은 문제)',
      '',
    ].join('\n');
    try {
      fs.writeFileSync(file, body, { flag: 'wx' });
      return { id, file: path.relative(root, file), overlaps: taskOverlaps(loadTasks(root)) };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

export function setTaskStatus(root, id, status) {
  if (!TASK_STATUS.includes(status)) throw new Error(`상태는 ${TASK_STATUS.join('|')} 중 하나입니다`);
  const tid = String(id || '').toUpperCase();
  const file = path.join(taskDir(root), `${tid}.md`);
  if (!/^T\d+$/.test(tid) || !fs.existsSync(file)) throw new Error(`없는 작업입니다: ${id} (kit.mjs task list)`);
  return withLock(root, `task-${tid}`, () => {
    const text = fs.readFileSync(file, 'utf8');
    const next = /^상태\s*:.*$/m.test(text) ? text.replace(/^상태\s*:.*$/m, `상태: ${status}`) : text.replace(/^(#.*\n)/, `$1상태: ${status}\n`);
    writeAtomic(root, file, next);
    return `${tid} → ${status}`;
  });
}

export function renderTasks(tasks) {
  if (!tasks.length) return '작업 없음. 나눌 때: kit.mjs task new "<제목>" --files "<파일들>" --done "<완료 기준 명령>"';
  const rows = tasks.map((t) => `| ${t.id} | ${cell(t.title.replace(/^T\d+:\s*/, ''))} | ${t.status || '?'} | ${cell(t.reqs)} | ${cell(t.files.join(', '))} |`);
  const warn = taskOverlaps(tasks).map((o) => `⚠ 파일 겹침: ${o} — 한 파일은 한 작업만 고친다`);
  return ['| 작업 | 제목 | 상태 | 요구 | 수정 가능한 파일 |', '|---|---|---|---|---|', ...rows, ...warn].join('\n');
}

// ── git ── 경로를 지정한 커밋만 한다: 다른 탭이 git add 해 둔 파일이 섞이지 않고, 기록 파일은 같이 넣는다
export const RECORD_PATHS = ['REQUIREMENTS.md', 'WORKLOG.md', 'DECISIONS.md', 'PLAN.md', 'EXPLAIN.md', '.cofa/.gitignore', '.cofa/requirements.json', '.cofa/evidence', '.cofa/tasks', '.cofa/started_at', '.cofa/config.json'];

export function commitPaths(root, message, files, { records = true } = {}) {
  if (!message) throw new Error('커밋 메시지가 없습니다: kit.mjs commit -m "<type>: <무엇> (<요구 ID>)" <파일…>');
  if (sh('git rev-parse --is-inside-work-tree', root) !== 'true') throw new Error('git 저장소가 아닙니다(git init 부터).');
  // 플랫폼 .gitignore 가 숨김 폴더를 무시하면 기록 경로를 git add 할 때 전체가 실패하므로, 무시된 기록 경로는 뺀다
  const recs = records ? RECORD_PATHS.filter((f) => fs.existsSync(p(root, f)) && git(root, ['check-ignore', '-q', '--', f]).code !== 0) : [];
  const all = [...new Set([...files.map((f) => f.replace(/^\.\//, '')), ...recs])];
  if (!all.length) throw new Error('커밋할 파일을 적어 주세요: kit.mjs commit -m "<메시지>" <파일…>');
  // 다른 세션이 git 을 쓰는 중이면(index.lock 이 이미 있음) 잠시 기다렸다 다시 한다
  const retry = (args) => {
    let r;
    for (let i = 0; i < 10; i++) {
      r = git(root, args);
      if (r.code === 0 || !/index\.lock'?: File exists/i.test(r.out)) return r;
      sleep(600);
    }
    return r;
  };
  const hint = (out) =>
    /Permission denied|Operation not permitted|Read-only/i.test(out)
      ? '\n샌드박스가 .git 쓰기를 막았습니다. 승인을 요청해 다시 하거나, 사용자가 터미널에서 같은 kit.mjs commit 명령을 실행합니다.'
      : /index\.lock/.test(out)
        ? '\n다른 세션의 git 이 끝나지 않았습니다. 잠시 뒤 다시 하세요(git 이 안 도는데 계속이면 .git/index.lock 을 지운다).'
        : '';
  const add = retry(['add', '--', ...all]);
  if (add.code !== 0) throw new Error(`git add 실패: ${add.out}${hint(add.out)}`);
  const staged = git(root, ['-c', 'core.quotePath=false', 'diff', '--cached', '--name-only', '--', ...all]).out;
  if (!staged) return '바뀐 것이 없어 커밋하지 않았습니다.';
  // 경로를 지정하면 그 경로만 커밋된다(다른 세션이 add 해 둔 파일은 색인에 그대로 남는다)
  const c = retry(['commit', '-q', '-m', message, '--', ...all]);
  if (c.code !== 0) throw new Error(`git commit 실패: ${c.out}${hint(c.out)}`);
  return `${git(root, ['log', '-1', '--oneline']).out}\n커밋한 파일: ${staged.split('\n').join(', ')}`;
}

// 숨김 폴더(.cofa·.codex·.cache 등) 안의 경로인지. 플랫폼·도구 파일이라 점검·귀속 대상에서 뺀다
const inHiddenDir = (f) => /(^|\/)\.[^/]+\//.test(f);

function gitChanges(root) {
  const r = git(root, ['-c', 'core.quotePath=false', 'status', '--porcelain']);
  if (r.code !== 0) return [];
  return r.out
    .split('\n')
    .filter((l) => l.length > 3)
    .map((l) => l.slice(3).split(' -> ').pop().replace(/^"|"$/g, ''));
}

// 한눈에 보기: 시간·요구·작업(탭)·증거·커밋 안 된 변경·최근 커밋. 여러 탭이 같이 보는 상태판이다
export function board(root) {
  const L = [];
  const t = timeStatus(root);
  L.push(t.started ? `⏱ 경과 ${t.elapsed}분 / 남은 ${t.remaining}분 · 단계 ${t.phase}${t.remaining <= 15 ? ' · 새 기능 금지' : ''}` : '⏱ 시작 시각 없음 — kit.mjs start');

  let reqs = [];
  try {
    reqs = loadReqs(root);
  } catch (e) {
    L.push(`요구: ${e.message}`);
  }
  if (reqs.length) {
    const count = (s) => reqs.filter((r) => r.status === s).length;
    L.push(`요구 ${reqs.length}개: ${REQ_STATUS.filter(count).map((s) => `${STATUS_KO[s]} ${count(s)}`).join(' · ')}`);
    const open = reqs.filter((r) => !['verified', 'dropped'].includes(r.status));
    if (open.length) L.push(`  남은 요구: ${open.map((r) => `${r.id}(${STATUS_KO[r.status]}) ${String(r.text).slice(0, 20)}`).join(' / ')}`);
  } else L.push('요구: 없음 — $kickoff 로 등록');

  const tasks = loadTasks(root);
  if (tasks.length) {
    L.push(`작업(탭): ${tasks.map((x) => `${x.id} ${x.status || '?'} [${x.files.join(', ')}]`).join(' · ')}`);
    for (const o of taskOverlaps(tasks)) L.push(`  ⚠ 파일 겹침: ${o}`);
  }

  const ev = loadEvidence(root);
  if (ev.length) {
    const last = ev[ev.length - 1];
    const stale = staleNote(root, ev);
    L.push(`증거 ${ev.length}건 · 마지막 #${last.n} ${last.verdict} (${last.at})${stale ? ` · ⚠ 마지막 통과 #${stale.n} 뒤에 코드가 바뀜` : ''}`);
  } else L.push('증거: 없음 — 테스트는 kit.mjs run --req <ID> -- <명령>');

  if (sh('git rev-parse --is-inside-work-tree', root) === 'true') {
    const ch = gitChanges(root);
    const code = ch.filter((f) => !inHiddenDir(f) && !f.startsWith('.cofa/') && !RECORD_PATHS.includes(f));
    const recs = ch.filter((f) => f.startsWith('.cofa/') || RECORD_PATHS.includes(f));
    const owner = (f) => tasks.find((x) => !['검증됨', '중단'].includes(x.status) && x.files.some((g) => g === f || (f.endsWith('/') && g.startsWith(f))))?.id;
    const shown = code.slice(0, 8).map((f) => (owner(f) ? `${f}←${owner(f)}` : f));
    L.push(code.length || recs.length ? `커밋 안 됨: 코드 ${code.length}${code.length ? ` (${shown.join(', ')}${code.length > 8 ? ', …' : ''})` : ''} · 기록 ${recs.length}` : '커밋 안 된 변경 없음');
    const log = sh('git log --oneline -3', root);
    if (log) L.push(`최근 커밋: ${log.split('\n').join(' / ')}`);
  } else L.push('git 저장소 아님 — git init');
  return L.join('\n');
}

const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{20,}/, 'OpenAI 형식 키'],
  [/AKIA[0-9A-Z]{16}/, 'AWS 액세스 키'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '개인 키'],
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub 토큰'],
];

export function submissionCheck(root) {
  const out = [];
  const add = (level, msg) => out.push({ level, msg });

  const t = timeStatus(root);
  add(t.started ? 'ok' : 'warn', t.started ? `시간: 경과 ${t.elapsed}분, 남은 ${t.remaining}분` : '시작 시각 미기록');

  for (const [f, why] of [
    ['README.md', '실행 방법'],
    ['PLAN.md', '계획'],
    ['DECISIONS.md', '결정 기록'],
    ['SUBMISSION.md', '제출 문서(과제가 다른 이름을 지정했으면 그 파일)'],
  ]) {
    const exists = fs.existsSync(p(root, f));
    add(exists ? 'ok' : 'warn', `${f} ${exists ? '있음' : '없음'} — ${why}`);
  }

  const sub = p(root, 'SUBMISSION.md');
  if (fs.existsSync(sub) && /\(작성\)/.test(fs.readFileSync(sub, 'utf8'))) add('warn', 'SUBMISSION.md 에 채우지 않은 (작성) 칸이 남음');

  let reqs = [];
  try {
    reqs = loadReqs(root);
  } catch (e) {
    add('fail', e.message);
  }
  if (!reqs.length) add('warn', '등록된 요구사항 없음 — 추적표 없이 제출하면 근거를 대기 어렵다');
  else {
    const open = reqs.filter((r) => !['verified', 'dropped'].includes(r.status));
    add(open.length ? 'warn' : 'ok', open.length ? `검증 안 된 요구 ${open.length}개: ${open.map((r) => `${r.id}(${STATUS_KO[r.status]})`).join(', ')}` : `요구사항 ${reqs.length}개 모두 검증 또는 제외`);
    const noEvidence = reqs.filter((r) => r.status === 'verified' && !r.evidence);
    if (noEvidence.length) add('warn', `증거 칸이 빈 「검증됨」: ${noEvidence.map((r) => r.id).join(', ')}`);
  }

  const tasks = loadTasks(root);
  const busy = tasks.filter((x) => ACTIVE.includes(x.status));
  if (busy.length) add('warn', `끝나지 않은 작업(다른 탭): ${busy.map((x) => `${x.id}(${x.status})`).join(', ')} — 탭을 확인하고 끝내거나 「중단」 으로`);
  const unchecked = tasks.filter((x) => x.status === '완료');
  if (unchecked.length) add('warn', `메인에서 다시 확인 안 한 작업: ${unchecked.map((x) => x.id).join(', ')} — 완료 기준 명령을 메인에서 다시 돌린다`);

  const ev = loadEvidence(root);
  if (!ev.length) add('warn', '실행 증거 없음 — 테스트·실행은 `kit.mjs run --req <ID> -- <명령>` 으로 돌려 .cofa/evidence 에 남긴다');
  else {
    const last = ev[ev.length - 1];
    const zero = ev.filter((e) => e.verdict.startsWith('0건')).length;
    add(last.verdict === '통과' ? 'ok' : 'warn', `실행 증거 ${ev.length}건, 마지막 #${last.n} ${last.verdict}${zero ? ` · 0건 실행 ${zero}회` : ''}`);
    const stale = staleNote(root, ev);
    if (stale) add('warn', `마지막 통과 #${stale.n} 뒤에 코드가 바뀜 — 다시 돌려 확인(재검증 필요)`);
  }

  const isGit = sh('git rev-parse --is-inside-work-tree', root) === 'true';
  if (!isGit) add('warn', 'git 저장소가 아님 — 커밋 기록이 평가 자료로 남지 않는다');
  else {
    // 숨김 폴더 변경(.cache·.npm 같은 플랫폼 파일)은 세지 않는다. 키트 기록(.cofa)은 센다
    const ch = gitChanges(root).filter((f) => !inHiddenDir(f) || f.startsWith('.cofa/'));
    add(ch.length ? 'warn' : 'ok', ch.length ? `커밋 안 된 변경 ${ch.length}개: ${ch.slice(0, 6).join(', ')}${ch.length > 6 ? ', …' : ''}` : '작업 트리 깨끗함');
    const count = sh('git rev-list --count HEAD', root);
    add('ok', `커밋 ${count ?? 0}개`);
  }

  const files = isGit
    ? [sh('git -c core.quotePath=false ls-files', root), sh('git -c core.quotePath=false ls-files -o --exclude-standard', root)].filter(Boolean).join('\n').split('\n')
    : [];
  let todo = 0;
  for (const f of files) {
    // 숨김 폴더(플랫폼·도구 설정 — 예: ~/.codex 의 인증 파일)와 의존성·가상환경 폴더는 어느 깊이에 있든 뺀다
    if (!f || inHiddenDir(f) || /(^|\/)(node_modules|venv|__pycache__|site-packages)\//.test(f)) continue;
    const full = p(root, f);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (st.size > 5 * 1024 * 1024) add('warn', `큰 파일 ${f} (${(st.size / 1048576).toFixed(1)}MB)${st.size > 20 * 1024 * 1024 ? ' — 비밀 문자열 검사 생략, 직접 확인' : ''}`);
    if (st.size > 20 * 1024 * 1024) continue;
    const body = fs.readFileSync(full, 'utf8');
    for (const [re, name] of SECRET_PATTERNS) if (re.test(body)) add('fail', `${f}: ${name} 처럼 보이는 문자열 — 지우고 제출`);
    todo += (body.match(/\b(TODO|FIXME|XXX)\b/g) || []).length;
  }
  if (todo) add('warn', `TODO/FIXME ${todo}곳 — 남길 거면 SUBMISSION.md 한계에 적는다`);

  return out;
}

export function formatCheck(items) {
  const icon = { ok: '✓', warn: '!', fail: '✗' };
  const fails = items.filter((i) => i.level === 'fail').length;
  const warns = items.filter((i) => i.level === 'warn').length;
  return items.map((i) => `${icon[i.level]} ${i.msg}`).join('\n') + `\n\n결과: 실패 ${fails} · 경고 ${warns}`;
}

function readCodexConfig() {
  const home = process.env.CODEX_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '', '.codex');
  try {
    const lines = fs
      .readFileSync(path.join(home, 'config.toml'), 'utf8')
      .split('\n')
      .filter((l) => /^\s*(model|model_reasoning_effort|approval_policy|sandbox_mode)\s*=/.test(l))
      .map((l) => l.trim());
    return lines.length ? lines.join(' · ') : '해당 항목 없음(기본값)';
  } catch {
    return '파일 없음';
  }
}

// net=true 일 때만 외부(npm 레지스트리)에 접속해 본다
export function envReport(root, { net = false } = {}) {
  const rows = [
    ['node', sh('node --version', root)],
    ['npm', sh('npm --version', root)],
    ['python3', sh('python3 --version', root)],
    ['pip 패키지(pandas·numpy·fastapi·flask·pytest)', sh('python3 -c "import importlib.util as u;print(\',\'.join(m for m in [\'pandas\',\'numpy\',\'fastapi\',\'flask\',\'pytest\'] if u.find_spec(m)))"', root)],
    ['git', sh('git --version', root)],
    ['codex', sh('codex --version', root)],
    ['npm 레지스트리 접근', net ? (sh('npm ping', root) !== null ? '됨' : '안 됨') : '확인 안 함(kit.mjs env --net)'],
    ['OS', sh('uname -sr', root)],
    ['CPU 코어', sh('nproc', root)],
    ['메모리(MB, 전체/사용가능)', sh("free -m | awk '/^Mem/{print $2\"/\"$7}'", root)],
    ['작업 폴더', root],
    ['git 루트', sh('git rev-parse --show-toplevel', root)],
    // 읽기만 한다. 플랫폼이 준비한 Codex 설정(승인·샌드박스·모델)을 알아 두려는 것
    ['Codex 설정(읽기만)', readCodexConfig()],
  ];
  return rows.map(([k, v]) => `${k}: ${v ?? '없음'}`).join('\n');
}
