// cofa-kit 공용 로직: 시간 상태·작업 기록·결정 기록·요구사항 추적·제출 점검·환경 확인
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

export const VERSION = '0.1.0';

// 180분 과제 기준 단계표. [시작분, 끝분, 이름, 할 일]
export const PHASES = [
  [0, 15, '파악', '지시서 정독 → 담당자에게 구체적인 질문을 하나씩 → 요구사항 등록(req add)'],
  [15, 30, '계획', '설계안 2개 비교 → 슬라이스 분할 → 슬라이스마다 검증 방법 먼저 → PLAN.md → 첫 커밋'],
  [30, 130, '구현', '슬라이스 단위 구현→검증→커밋. 100분에 필수 요구가 남았으면 가산 기능은 버린다'],
  [130, 155, '검증', '요구사항별 실행 증거, 엣지 케이스, 증거 없는 것은 「미검증」'],
  [155, 170, '정리', 'SUBMISSION.md·한계 작성, 서술형 대비($explainback), 핵심 코드 다시 읽기'],
  [170, 180, '제출', '저장 상태·필수 파일 확인 → 「제출하고 문제풀기」'],
];

export function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.cofa')) || fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

export function resolveRoot(cwd) {
  return process.env.COFA_ROOT ? path.resolve(process.env.COFA_ROOT) : findRoot(cwd);
}

const p = (root, ...rest) => path.join(root, ...rest);

function readConfig(root) {
  try {
    return JSON.parse(fs.readFileSync(p(root, '.cofa', 'config.json'), 'utf8'));
  } catch {
    return {};
  }
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
  const file = p(root, 'WORKLOG.md');
  if (!fs.existsSync(file)) fs.writeFileSync(file, '# WORKLOG\n\n작업 흐름을 시각과 함께 한 줄씩 남긴다.\n\n');
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
  if (!fs.existsSync(file)) fs.writeFileSync(file, DECISION_HEADER);
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
    '# REQUIREMENTS\n\n요구사항 추적표. `kit.mjs req` 나 MCP `req_upsert` 로 갱신한다(직접 고치면 다음 갱신 때 덮어써진다).\n' +
    '출처: 지시서 / 담당자 / 추론(확인 필요). 「검증됨」 은 증거(명령·결과)가 있을 때만.\n\n' +
    '| ID | 요구 | 출처 | 상태 | 증거·비고 |\n|---|---|---|---|---|\n';
  return head + reqs.map((r) => `| ${r.id} | ${cell(r.text)} | ${cell(r.source)} | ${STATUS_KO[r.status] || r.status} | ${cell(r.evidence)} |`).join('\n') + '\n';
}

export function upsertReq(root, { id, text, source, status, evidence }) {
  const reqs = loadReqs(root);
  if (status && !REQ_STATUS.includes(status)) throw new Error(`status 는 ${REQ_STATUS.join('|')} 중 하나`);
  let r = id ? reqs.find((x) => x.id === id) : null;
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
  fs.mkdirSync(p(root, '.cofa'), { recursive: true });
  fs.writeFileSync(p(root, '.cofa', 'requirements.json'), JSON.stringify(reqs, null, 2));
  fs.writeFileSync(p(root, 'REQUIREMENTS.md'), renderReqs(reqs));
  return r;
}

// 테스트 러너들이 「0건 실행」 을 알리는 문구. 이때 종료 코드 0 이어도 통과로 치지 않는다
const ZERO_RUN = /(collected 0 items|no tests ran|Ran 0 tests|\b0 passing\b|Tests:\s+0 total|No tests found|\b0 tests?\b(?! failed))/i;

// 명령을 실행하고 명령·종료 코드·소요 시간·끝 40줄을 .cofa/evidence 에 남긴다(검증 증거)
export function runEvidence(root, command, now = new Date()) {
  if (!command) throw new Error('실행할 명령이 없습니다: kit.mjs run -- <명령>');
  const t0 = Date.now();
  const r = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ms = Date.now() - t0;
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  const tail = output.trimEnd().split('\n').slice(-40).join('\n');
  const code = r.status ?? (r.error ? -1 : 0);
  const verdict = code !== 0 ? '실패' : ZERO_RUN.test(output) ? '0건(돌리지 않음)' : '통과';
  const dir = p(root, '.cofa', 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  const n = String(fs.readdirSync(dir).filter((f) => f.endsWith('.log')).length + 1).padStart(3, '0');
  const file = path.join(dir, `${n}.log`);
  fs.writeFileSync(file, `$ ${command}\n# ${stamp(root, now)} · exit ${code} · ${ms}ms · ${verdict}\n\n${tail}\n`);
  fs.appendFileSync(path.join(dir, 'index.md'), `| ${n} | ${stamp(root, now)} | \`${cell(command)}\` | ${code} | ${verdict} |\n`);
  return { n, code, verdict, ms, tail, file: path.relative(root, file) };
}

export function loadEvidence(root) {
  try {
    return fs
      .readFileSync(p(root, '.cofa', 'evidence', 'index.md'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => l.split('|').map((s) => s.trim()))
      .map((c) => ({ n: c[1], at: c[2], code: c[c.length - 3], verdict: c[c.length - 2] }));
  } catch {
    return [];
  }
}

function sh(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim();
  } catch {
    return null;
  }
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

  const ev = loadEvidence(root);
  if (!ev.length) add('warn', '실행 증거 없음 — 테스트·실행은 `kit.mjs run -- <명령>` 으로 돌려 .cofa/evidence 에 남긴다');
  else {
    const last = ev[ev.length - 1];
    const zero = ev.filter((e) => e.verdict.startsWith('0건')).length;
    add(last.verdict === '통과' ? 'ok' : 'warn', `실행 증거 ${ev.length}건, 마지막 #${last.n} ${last.verdict}${zero ? ` · 0건 실행 ${zero}회` : ''}`);
  }

  const isGit = sh('git rev-parse --is-inside-work-tree', root) === 'true';
  if (!isGit) add('warn', 'git 저장소가 아님 — 커밋 기록이 평가 자료로 남지 않는다');
  else {
    const dirty = (sh('git status --porcelain', root) || '').split('\n').filter(Boolean);
    add(dirty.length ? 'warn' : 'ok', dirty.length ? `커밋 안 된 변경 ${dirty.length}개` : '작업 트리 깨끗함');
    const count = sh('git rev-list --count HEAD', root);
    add('ok', `커밋 ${count ?? 0}개`);
  }

  const files = isGit
    ? [sh('git ls-files', root), sh('git ls-files -o --exclude-standard', root)].filter(Boolean).join('\n').split('\n')
    : [];
  let todo = 0;
  for (const f of files) {
    if (!f || f.startsWith('.cofa/kit/') || f.startsWith('node_modules/')) continue;
    const full = p(root, f);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
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
