#!/usr/bin/env bash
# cofa-kit 결정론 시험: 새 폴더에 설치하고 기록·여러 탭 동시 실행·증거·커밋·점검·MCP 를 확인한다(외부 접속 없음, 설치 대상에 복사되지 않음)
# 사용: bash tests/kit-test.sh [시험 폴더를 만들 상위 폴더(기본: 임시 폴더)]
set -uo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${1:-$(mktemp -d)}"
PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ✓ $*"; }
ng() { FAIL=$((FAIL + 1)); echo "  ✗ $*"; }
t() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$name"; else ng "$name"; fi; }
tn() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then ng "$name"; else ok "$name"; fi; }   # 명령이 실패해야 통과
K() { node .cofa/kit/scripts/kit.mjs "$@"; }
has() { grep -qF -- "$2" "$1"; }
O="$BASE/out-$$.txt"   # 출력은 작업 폴더 밖에 둔다(git status 를 더럽히지 않게)

# 플랫폼 흉내: 이미 커밋이 있는 git 저장소에 과제 README 가 있다
newws() {
  W="$BASE/$1-$$"
  rm -rf "$W" && mkdir -p "$W" && cd "$W" || exit 1
  git init -q && git config user.email t@t && git config user.name t
  echo "# 과제" > README.md && git add README.md && git commit -qm init
}

echo "[1] 설치·재설치"
newws main
bash "$KIT/install.sh" > "$O" 2>&1; rc=$?
t "설치 종료 코드 0" [ "$rc" -eq 0 ]
t "설치 출력에 Full Access 안내" has "$O" "/permissions"
for f in AGENTS.md PLAN.md DECISIONS.md WORKLOG.md .cofa/.gitignore .cofa/started_at .cofa/kit/scripts/kit.mjs .cofa/kit/docs/card.md .agents/skills/worker/SKILL.md .agents/skills/check/SKILL.md .agents/skills/next/SKILL.md; do
  t "설치됨: $f" [ -e "$f" ]
done
t "훅은 기본으로 설치하지 않음" [ ! -e .codex/hooks.json ]
t "설치 커밋 뒤 작업 트리 깨끗함" [ -z "$(git status --porcelain)" ]
bash "$KIT/install.sh" > "$O" 2>&1; rc=$?
t "재설치 종료 코드 0" [ "$rc" -eq 0 ]
t "재설치해도 규칙 블록 1개" [ "$(grep -c 'cofa-kit:begin' AGENTS.md)" -eq 1 ]
t "재설치는 새 커밋 없음" has "$O" "새로 설치한 파일이 없어"

echo "[2] 시작 시각은 덮어쓰지 않는다"
before="$(cat .cofa/started_at)"
K start > "$O"
t "start 를 다시 불러도 그대로" [ "$(cat .cofa/started_at)" = "$before" ]
t "그대로 둔다는 안내" has "$O" "그대로 둡니다"
K start 09:00 > /dev/null
t "start HH:MM 은 고친다" [ "$(cat .cofa/started_at)" != "$before" ]

echo "[3] 요구 등록(여러 개·동시)"
K req add "입력 CSV 를 읽는다" "설비별 수율을 낸다" "기준 미만 경고" > /dev/null
t "한 번에 3개" [ "$(node -e "console.log(require('./.cofa/requirements.json').length)")" -eq 3 ]
for i in $(seq 1 20); do K req add "동시 $i" > /dev/null & done; wait
n="$(node -e "const r=require('./.cofa/requirements.json');console.log(r.length+':'+new Set(r.map(x=>x.id)).size)")"
t "20개 동시 등록에도 유실·중복 없음 ($n)" [ "$n" = "23:23" ]
t "REQUIREMENTS.md 도 23행" [ "$(grep -c '^| R' REQUIREMENTS.md)" -eq 23 ]

echo "[4] 실행 증거"
K run --req R1 -- node -e "console.log('3 passed')" > "$O"; rc=$?
t "통과 → 종료 코드 0 (여러 인자 형태)" [ "$rc" -eq 0 ]
K run -- "node -e \"console.log('a b')\" && node -e \"console.log('c')\"" > "$O"; rc=$?
t "한 문자열 형태(&& 포함)" [ "$rc" -eq 0 ]
t "한 문자열 형태 출력" has "$O" "a b"
t "통과하면 R1 이 구현됨으로" [ "$(node -e "console.log(require('./.cofa/requirements.json')[0].status)")" = done ]
t "R1 증거에 번호" has REQUIREMENTS.md "#001"
K run --req r2 --mark verified -- node -e "0" > /dev/null
t "--mark verified + 소문자 ID" [ "$(node -e "console.log(require('./.cofa/requirements.json')[1].status)")" = verified ]
K run --req R2 -- node -e "0" > /dev/null
t "검증됨은 구현됨으로 내려가지 않음" [ "$(node -e "console.log(require('./.cofa/requirements.json')[1].status)")" = verified ]
K run --req R3 -- node -e "process.exit(3)" > /dev/null; rc=$?
t "실패 → 명령의 종료 코드(3)" [ "$rc" -eq 3 ]
t "실패하면 요구 상태 그대로" [ "$(node -e "console.log(require('./.cofa/requirements.json')[2].status)")" = todo ]
K run -- node -e "console.log('collected 0 items')" > /dev/null; rc=$?
t "pytest 0건 → 종료 코드 2" [ "$rc" -eq 2 ]
K run -- node -e "console.log('ℹ tests 0')" > /dev/null; rc=$?
t "node --test 0건 → 종료 코드 2" [ "$rc" -eq 2 ]
K run -- node -e "console.log('?   	pkg	[no test files]')" > /dev/null; rc=$?
t "go test 0건 → 종료 코드 2" [ "$rc" -eq 2 ]
K run -- node -e "console.log('Ran 10 tests'); console.log('OK')" > /dev/null; rc=$?
t "10개 실행은 0건으로 오인하지 않음" [ "$rc" -eq 0 ]
s=$(date +%s); K run --timeout 2 -- node -e "setTimeout(()=>{},20000)" > "$O"; rc=$?; e=$(( $(date +%s) - s ))
t "시간 초과 → 실패 (${e}초)" [ "$rc" -ne 0 ]
t "시간 초과 문구" has "$O" "시간 초과"
t "시간 초과는 20초를 기다리지 않음" [ "$e" -lt 15 ]
K run --req R4 node -e "0" > /dev/null; rc=$?
t "-- 없이 옵션+명령" [ "$rc" -eq 0 ]
s=$(date +%s); K run -- "node -e \"require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},8000)'],{stdio:'inherit',detached:true}).unref();console.log('bg started')\"" > "$O"; rc=$?; e=$(( $(date +%s) - s ))
t "백그라운드 프로세스를 남겨도 바로 돌아옴 (${e}초)" [ "$e" -lt 6 ]
t "백그라운드 실행 출력도 기록" has "$O" "bg started"
K run -- "node -e \"console.log('out1');console.error('err2');console.log('out3')\"" > "$O"
t "stdout·stderr 순서 유지" [ "$(grep -E '^(out1|err2|out3)$' "$O" | tr '\n' ' ')" = "out1 err2 out3 " ]
for i in $(seq 1 10); do K run -- node -e "0" > /dev/null & done; wait
logs="$(ls .cofa/evidence/*.log | wc -l | tr -d ' ')"
rows="$(grep -cE '^\| [0-9]+ ' .cofa/evidence/index.md)"
t "동시 10회 실행에도 증거 번호 안 겹침 (log $logs · 표 $rows)" [ "$logs" = "$rows" ]

echo "[5] 작업(탭) 나누기"
K task new "파서" --files "src/a.js,tests/a.test.js" --done "node -e 0" --req R1 > "$O"
t "T1 생성" [ -f .cofa/tasks/T1.md ]
t "탭 안내 문구" has "$O" '$worker T1'
K task new "보고서" --files "src/b.js" --done "node -e 0" --req R2 > /dev/null
K task new "겹침" --files "src/a.js" --done "node -e 0" > "$O"
t "파일 겹침 경고" has "$O" "파일 겹침"
K task T3 중단 > /dev/null
K task t1 진행 > /dev/null
t "소문자 ID 로 상태 변경" has .cofa/tasks/T1.md "상태: 진행"
K task T1 엉뚱 > /dev/null 2>&1; rc=$?
t "잘못된 상태는 오류" [ "$rc" -ne 0 ]
for i in $(seq 1 5); do K task new "동시 $i" --files "x$i.js" --done "node -e 0" > /dev/null & done; wait
t "동시 5개 생성에도 번호 안 겹침" [ "$(ls .cofa/tasks/T*.md | wc -l | tr -d ' ')" -eq 8 ]
K board > "$O"
t "board 에 작업 표시" has "$O" "T1 진행"
tn "board 에 겹침 없음(T3 중단)" has "$O" "파일 겹침"

echo "[6] 경로 지정 커밋(다른 탭 변경을 섞지 않음)"
mkdir -p src && echo "a" > src/a.js && echo "b" > src/b.js
git add src/b.js   # 다른 탭이 add 만 해 둔 상태
K commit -m "feat: a" src/a.js > "$O"; rc=$?
t "커밋 성공" [ "$rc" -eq 0 ]
t "src/a.js 는 커밋됨" git cat-file -e HEAD:src/a.js
tn "src/b.js 는 커밋 안 됨" git cat-file -e HEAD:src/b.js
t "src/b.js 는 여전히 staged" [ "$(git diff --cached --name-only)" = "src/b.js" ]
t "기록 파일도 같이 커밋" git cat-file -e HEAD:.cofa/requirements.json
touch .git/index.lock
( sleep 2; rm -f .git/index.lock ) &
K commit -m "feat: b" src/b.js > "$O" 2>&1; rc=$?
wait
t "index.lock 이 풀리면 다시 해서 성공" [ "$rc" -eq 0 ]
K commit -m "빈 커밋" src/a.js > "$O"; rc=$?
t "바뀐 게 없으면 커밋 안 함" has "$O" "바뀐 것이 없어"
t "lock·임시 파일이 남지 않음" [ -z "$(ls .cofa/*.lock .cofa/tmp-* 2>/dev/null)" ]

echo "[7] 재검증 필요 판정(오경보 없이)"
K run -- node -e "0" > /dev/null
K req set R5 --status doing > /dev/null
K commit -m "docs: 기록" > /dev/null
K check > "$O"
tn "문서만 커밋하면 재검증 경고 없음" has "$O" "재검증 필요"
t "코드 상태 지문이 계산됨(? 아님)" [ -z "$(grep -E '·\? \|' .cofa/evidence/index.md)" ]
K run -- "node -e \"require('fs').writeFileSync('gen.txt','x')\"" > /dev/null
K check > "$O"
tn "실행이 만든 산출물로는 재검증 경고 없음" has "$O" "재검증 필요"
rm -f gen.txt
K run -- node -e "0" > /dev/null
echo "a2" > src/a.js
K check > "$O"
t "코드가 바뀌면 재검증 경고" has "$O" "재검증 필요"
K board > "$O"
t "board 도 코드 변경 경고" has "$O" "코드가 바뀜"
t "board 가 미커밋 파일의 작업을 표시" has "$O" "src/a.js←T1"
git checkout -q -- src/a.js

echo "[8] 제출 점검"
mkdir -p .secretdir && echo "sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaa" > .secretdir/k.txt
K check > "$O"
tn "숨김 폴더의 키 모양은 무시" has "$O" ".secretdir"
echo "sk-bbbbbbbbbbbbbbbbbbbbbbbbbbbb" > notes.txt
K check > "$O"; rc=$?
t "작업 파일의 키 모양은 실패" has "$O" "notes.txt"
t "실패면 종료 코드 1" [ "$rc" -eq 1 ]
t "끝나지 않은 작업 경고" has "$O" "끝나지 않은 작업"
rm -rf notes.txt .secretdir

echo "[9] 하위 폴더에 따로 git 이 있어도 기록 위치는 하나"
mkdir -p sub && (cd sub && git init -q && node ../.cofa/kit/scripts/kit.mjs status > ../"$O")
t "하위 git 에서도 시작 시각을 찾음" has "$O" "경과"
rm -rf sub

echo "[10] card·mcp·decision·log·profile"
K card > "$O"; t "card 출력" has "$O" "worker"
K mcp > "$O"; t "mcp JSON 에 서버 경로" has "$O" "server.mjs"
K decision --what "CSV 직접 파싱" --alt "pandas" --why "설치 없음" --check "손계산 3행" > /dev/null
t "결정 기록" has DECISIONS.md "CSV 직접 파싱"
K log "담당자 답 반영" > /dev/null
t "작업 기록" has WORKLOG.md "담당자 답 반영"
printf 'name,phone,yield\n김철수,01012345678,91.5\n이영희,01098765432,88\n' > d.csv
node .cofa/kit/scripts/profile.mjs d.csv > "$O"
tn "profile: 전화번호 값 가림" has "$O" "01012345678"
rm -f d.csv

echo "[11] MCP 서버"
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"board","arguments":{}}}' | COFA_ROOT="$PWD" node .cofa/kit/mcp/server.mjs > "$O"
t "MCP 초기화" has "$O" '"protocolVersion":"2025-06-18"'
t "MCP board 도구" has "$O" '경과'

echo "[12] 플랫폼 .gitignore 가 숨김 폴더를 무시해도"
newws ignored
printf '.*\n!.gitignore\n' > .gitignore && git add .gitignore && git commit -qm ignore
bash "$KIT/install.sh" > /dev/null 2>&1; rc=$?
t "설치 종료 코드 0" [ "$rc" -eq 0 ]
echo "x" > app.js
K commit -m "feat: app" app.js > "$O" 2>&1; rc=$?
t "kit.mjs commit 성공(무시된 기록은 건너뜀)" [ "$rc" -eq 0 ]

echo "[13] --hooks 는 홈이 아닐 때만"
newws hooks
bash "$KIT/install.sh" --hooks > /dev/null 2>&1
t "--hooks 면 .codex/hooks.json" [ -f .codex/hooks.json ]
node .cofa/kit/hooks/context.mjs start < /dev/null > "$O"
t "훅 출력 JSON" has "$O" "additionalContext"

echo
echo "통과 $PASS · 실패 $FAIL  (시험 폴더: $BASE)"
[ "$FAIL" -eq 0 ]
