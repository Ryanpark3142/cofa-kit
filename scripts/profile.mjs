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

const it = parse(text);
const header = it.next().value || [];
const cols = header.map((h) => ({ name: h.trim(), kinds: {}, nulls: 0, uniq: new Map(), min: Infinity, max: -Infinity, minS: null, maxS: null, ws: 0 }));
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
    if (k === 'null') return c.nulls++;
    if (v !== v.trim()) c.ws++;
    if (c.uniq.size < 50000) c.uniq.set(v, (c.uniq.get(v) || 0) + 1);
    if (k === 'int' || k === 'float') {
      const x = Number(v.replace(/,/g, ''));
      if (x < c.min) c.min = x;
      if (x > c.max) c.max = x;
    } else if (k === 'datetime') {
      (c.dateFmts ||= new Set()).add(v.trim().replace(/\d/g, '9'));
      if (c.minS === null || v < c.minS) c.minS = v;
      if (c.maxS === null || v > c.maxS) c.maxS = v;
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
  const range = c.min !== Infinity ? `${c.min} ~ ${c.max}` : c.minS ? `${c.minS} ~ ${c.maxS}` : '-';
  const top = [...c.uniq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, k]) => `${v.slice(0, 20)}(${k})`).join(', ');
  const warn = [];
  if (kinds.length > 1) warn.push('형식 섞임');
  if (c.dateFmts?.size > 1) warn.push(`날짜 표기 ${c.dateFmts.size}종`);
  if (c.uniq.size === nonNull && nonNull === n && n > 1) warn.push('키 후보');
  if (nonNull && c.uniq.size === 1) warn.push('값 하나뿐');
  if (c.ws) warn.push(`앞뒤 공백 ${c.ws}`);
  if (/(name|이름|phone|전화|email|메일|주민|addr|주소)/i.test(c.name)) warn.push('개인정보 의심');
  out.push(`| ${c.name} | ${kindStr} | ${c.nulls}${n ? ` (${((c.nulls / n) * 100).toFixed(1)}%)` : ''} | ${c.uniq.size >= 50000 ? '50000+' : c.uniq.size} | ${range} | ${top.replace(/\|/g, '/')} | ${warn.join(', ')} |`);
}
console.log(out.join('\n'));
