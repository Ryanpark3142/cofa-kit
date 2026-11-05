#!/usr/bin/env bash
# 시험장처럼 작업 폴더가 홈이고 그 홈이 git 저장소일 때 설치와 도구가 도는지 확인한다
set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME="$(mktemp -d)"
export HOME
cd "$HOME"
git init -q
git config user.email candidate@localhost
git config user.name candidate

fail() { echo "실패: $*" >&2; exit 1; }

command -v python >/dev/null 2>&1 && echo "참고: 이 환경에는 python 이 있다" || echo "확인: python 없음"
bash "$KIT/install.sh" --hooks > install.log
[ "$(find .agents/skills -mindepth 1 -maxdepth 1 -type d | wc -l)" = 17 ] || fail "스킬 수"
[ -f .agents/skills/design/ui.css ] || fail "ui.css"
[ -f .agents/skills/design/fonts/PretendardVariable.woff2 ] || fail "글꼴"
[ ! -e .codex/hooks.json ] || fail "홈에 훅이 설치됨"
git log --oneline | grep -q "cofa-kit" || fail "설치 커밋"

K="node .cofa/kit/scripts/kit.mjs"
$K req add "시험 요구" --source 지시서 > /dev/null
cat > smoke.test.mjs <<'EOF'
import test from 'node:test';
import assert from 'node:assert';
test('덧셈', () => assert.strictEqual(1 + 1, 2));
EOF
$K run --req R1 -- node --test | tee run-ok.log
grep -q "통과" run-ok.log || fail "run 통과 표시"
if $K run --req R1 -- bash -c 'exit 3' > run-bad.log 2>&1; then
  grep -q "exit 3" run-bad.log || fail "실패 종료 코드가 기록되지 않음"
fi
grep -q "exit 3" run-bad.log || fail "실패 종료 코드 표시"
printf '설명 기록\n' > EXPLAIN.md
$K board | tee board.log
grep "커밋 안 됨" board.log | sed 's/·.*//' | grep -q EXPLAIN && fail "EXPLAIN.md 를 코드로 셈"
$K commit -m "test: 시험 (R1)" smoke.test.mjs > /dev/null
git ls-files | grep -qx EXPLAIN.md || fail "EXPLAIN.md 가 기록으로 커밋되지 않음"
$K check | tail -5
$K card > /dev/null
echo "리눅스 점검 통과"
