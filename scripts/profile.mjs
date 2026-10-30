#!/usr/bin/env node
// CSV/TSV 첫 점검(의존성 없음): 인코딩·행/열·열별 형식·결측·고유값·범위·상위값·키 후보·형식 섞임을 보여준다
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
const maxRows = Number(process.argv[3]) || Infinity;
if (!file) {
  console.log('사용법: node .cofa/kit/scripts/profile.mjs <파일.csv|tsv> [최대행수]');
  process.exit(1);
}

const buf = fs.readFileSync(file);
let text;
let encoding = 'utf-8';
try {
  text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
} catch {
  text = new TextDecoder('euc-kr').decode(buf);
  encoding = 'cp949/euc-kr 추정';
}
if (text.charCodeAt(0) === 0xfeff) {
  text = text.slice(1);
  encoding += ' (BOM)';
}

const firstLine = text.slice(0, text.indexOf('\n') >>> 0);
const delim = path.extname(file).toLowerCase() === '.tsv' || (firstLine.split('\t').length > firstLine.split(',').length) ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

// RFC 4180 따옴표 규칙을 따르는 최소 파서
function* parse(src) {
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') field += '"', i++;
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === delim) row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (!(row.length === 1 && row[0] === '')) yield row;
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) row.push(field), yield row;
}

const NULLS = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', '-', '?']);
const kind = (v) => {
  const s = v.trim();
  if (NULLS.has(s.toLowerCase())) return 'null';
  if (/^[+-]?\d+$/.test(s)) return 'int';
  if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(s) || /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return 'float';
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) return 'datetime';
  if (/^(true|false|y|n|yes|no)$/i.test(s)) return 'bool';
  return 'text';
};

// 날짜 문자열을 정렬 가능한 숫자로(한 자리 월·일도 올바르게 비교)
const dateKey = (s) => {
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s.trim());
  return m ? Number(m[1]) * 1e10 + Number(m[2]) * 1e8 + Number(m[3]) * 1e6 + Number(m[4] || 0) * 1e4 + Number(m[5] || 0) * 100 + Number(m[6] || 0) : NaN;
};
const PII_NAME = /(name|이름|성명|phone|tel|mobile|contact|전화|휴대|연락|email|e-mail|메일|주민|ssn|addr|주소|birth|생년)/i;
const PII_VALUE = /(^[^@\s]+@[^@\s]+\.[a-z]{2,}$)|(^0\d{1,2}-?\d{3,4}-?\d{4}$)|(^\d{6}-?[1-4]\d{6}$)/i;

const it = parse(text);
const header = it.next().value || [];
const cols = header.map((h) => ({ name: h.trim(), kinds: {}, nulls: 0, blanks: 0, uniq: new Map(), min: Infinity, max: -Infinity, minS: null, maxS: null, minK: Infinity, maxK: -Infinity, ws: 0, piiVals: 0 }));
let n = 0;
const badRows = [];
for (const row of it) {
  if (n >= maxRows) break;
  n++;
  if (row.length !== cols.length && badRows.length < 5) badRows.push(`${n + 1}행: 열 ${row.length}개(헤더 ${cols.length}개)`);
  cols.forEach((c, i) => {
    const v = row[i] ?? '';
    const k = kind(v);
    c.kinds[k] = (c.kinds[k] || 0) + 1;
    if (k === 'null') {
      if (v.trim() === '') c.blanks++;
      return c.nulls++;
    }
    if (v !== v.trim()) c.ws++;
    // 01012345678 처럼 숫자로 읽힌 전화번호와, 엑셀을 거치며 앞의 0 이 빠진 휴대폰 번호(1012345678)도 잡는다
    if ((k === 'text' || k === 'int') && PII_VALUE.test(v.trim())) c.piiVals++;
    else if (k === 'int' && /^1[016-9]\d{7,8}$/.test(v.trim())) c.piiVals++;
    if (k === 'text' && /^[가-힣]{2,4}$/.test(v.trim())) c.krNames = (c.krNames || 0) + 1;
    if (c.uniq.size < 50000) c.uniq.set(v, (c.uniq.get(v) || 0) + 1);
    if (k === 'int' || k === 'float') {
      const x = Number(v.replace(/,/g, ''));
      if (x < c.min) c.min = x;
      if (x > c.max) c.max = x;
    } else if (k === 'datetime') {
      (c.dateFmts ||= new Set()).add(v.trim().replace(/\d/g, '9'));
      const key = dateKey(v);
      if (key < c.minK) (c.minK = key), (c.minS = v.trim());
      if (key > c.maxK) (c.maxK = key), (c.maxS = v.trim());
    }
  });
}

const out = [];
out.push(`파일: ${file}`);
out.push(`인코딩: ${encoding} · 구분자: ${JSON.stringify(delim)} · 데이터 행 ${n}개 · 열 ${cols.length}개`);
if (badRows.length) out.push(`⚠ 열 개수가 다른 행: ${badRows.join(', ')}`);
const dupNames = header.filter((h, i) => header.indexOf(h) !== i);
if (dupNames.length) out.push(`⚠ 중복 열 이름: ${[...new Set(dupNames)].join(', ')}`);
out.push('');
out.push('| 열 | 형식(개수) | 결측 | 고유 | 범위 | 상위값 | 주의 |');
out.push('|---|---|---|---|---|---|---|');
for (const c of cols) {
  const kinds = Object.entries(c.kinds).filter(([k]) => k !== 'null').sort((a, b) => b[1] - a[1]);
  const kindStr = kinds.map(([k, v]) => `${k}(${v})`).join(' ') || '-';
  const nonNull = n - c.nulls;
  let range = c.min !== Infinity ? `${c.min} ~ ${c.max}` : c.minS ? `${c.minS} ~ ${c.maxS}` : '-';
  // 2~4글자 한글 값이 대부분이고 값이 다양하면 사람 이름일 수 있다(설비명 등이 함께 가려져도 손해는 작다)
  const krNameLike = nonNull >= 3 && (c.krNames || 0) / nonNull >= 0.8 && c.uniq.size >= nonNull * 0.5;
  const pii = PII_NAME.test(c.name) || c.piiVals > 0 || krNameLike;
  // 개인정보 의심 열은 값 자체를 출력하지 않는다(대화·로그에 남지 않게). 범위(최솟값~최댓값)도 실제 값이므로 가린다
  if (pii && range !== '-') range = '(가림)';
  const top = pii
    ? '(개인정보 의심 — 값 가림)'
    : [...c.uniq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, k]) => `${v.slice(0, 20)}(${k})`).join(', ');
  const warn = [];
  if (kinds.length > 1) warn.push('형식 섞임');
  if (c.dateFmts?.size > 1) warn.push(`날짜 표기 ${c.dateFmts.size}종`);
  if (c.uniq.size === nonNull && nonNull === n && n > 1) warn.push('키 후보');
  if (nonNull && c.uniq.size === 1) warn.push('값 하나뿐');
  if (c.ws) warn.push(`앞뒤 공백 ${c.ws}`);
  if (pii) warn.push('개인정보 의심');
  const nullStr = c.nulls ? `${c.nulls} (${((c.nulls / n) * 100).toFixed(1)}%: 빈칸 ${c.blanks}·NA류 ${c.nulls - c.blanks})` : '0';
  out.push(`| ${c.name} | ${kindStr} | ${nullStr} | ${c.uniq.size >= 50000 ? '50000+' : c.uniq.size} | ${range} | ${top.replace(/\|/g, '/')} | ${warn.join(', ')} |`);
}
console.log(out.join('\n'));
