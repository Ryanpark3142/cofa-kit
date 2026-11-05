#!/usr/bin/env bash
# 과제 작업 폴더에 cofa-kit(규칙·스킬·양식·도구)을 설치한다. 사용자 파일은 덮어쓰지 않는다(.cofa/kit 도구 사본만 매번 새로 받는다).
# 사용: git clone --depth 1 https://github.com/Ryanpark3142/cofa-kit /tmp/kit && bash /tmp/kit/install.sh [작업폴더(기본: 현재 폴더)] [--hooks]
set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_ARG=""
WANT_HOOKS=0
for a in "$@"; do
  case "$a" in
    --hooks) WANT_HOOKS=1 ;;
    *) DEST_ARG="$a" ;;
  esac
done
DEST="$(cd "${DEST_ARG:-$PWD}" && pwd)"
say() { printf '\033[1m[cofa-kit]\033[0m %s\n' "$*"; }

if [ "$KIT" = "$DEST" ]; then
  echo "작업 폴더에서 실행하세요(키트 폴더 자체에는 설치하지 않습니다)." >&2
  exit 1
fi

# 0) 선검사: 아무것도 바꾸기 전에 node 18+ 와 git 을 확인한다
if ! command -v node >/dev/null 2>&1; then
  echo "[cofa-kit] node 가 없습니다. 설치를 멈춥니다(작업 폴더는 그대로). 규칙만 쓰려면: cp $KIT/AGENTS.md . && mkdir -p .agents && cp -R $KIT/skills .agents/" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[cofa-kit] node $NODE_MAJOR 은 너무 오래됐습니다(18 이상 필요). 설치를 멈춥니다." >&2
  exit 1
fi
command -v git >/dev/null 2>&1 || { echo "[cofa-kit] git 이 없습니다." >&2; exit 1; }

cd "$DEST"
ADDED=()   # 이번 설치가 만들거나 바꾼 경로만 커밋한다(사용자의 다른 변경은 섞지 않는다)

# 이미 git 저장소 안이면(시험장은 홈 /home/user 자체가 저장소라는 관찰이 있다) 새로 만들지 않는다
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  say "git 저장소: $(git rev-parse --show-toplevel)"
else
  git init -q && say "git 저장소를 새로 만들었습니다."
fi
# 작성자 정보가 없으면 커밋이 전부 실패해 git 기록이 남지 않는다 → 이 저장소에만 기본값
if ! git config user.email >/dev/null; then
  git config user.email "candidate@localhost"
  say "git 작성자 이메일이 없어 이 저장소에만 candidate@localhost 로 설정했습니다."
fi
if ! git config user.name >/dev/null; then
  git config user.name "candidate"
  say "git 작성자 이름이 없어 이 저장소에만 candidate 로 설정했습니다."
fi

# .gitignore 끝에 줄바꿈이 없으면 덧붙인 줄이 앞줄에 붙는다 → 먼저 줄바꿈을 맞춘다
add_ignore() {
  grep -qxF "$1" .gitignore 2>/dev/null && return 1
  [ -s .gitignore ] && [ -n "$(tail -c1 .gitignore)" ] && echo >> .gitignore
  echo "$1" >> .gitignore
}

# 1) 도구 사본: /tmp 는 환경이 일시정지되면 사라질 수 있어 작업 폴더 안에 둔다
rm -rf .cofa/kit
mkdir -p .cofa/kit
cp -R "$KIT/lib" "$KIT/mcp" "$KIT/hooks" "$KIT/scripts" "$KIT/prompts" "$KIT/templates" "$KIT/docs" .cofa/kit/
# 도구 사본·잠금·임시 파일은 커밋하지 않는다(기록 파일 requirements.json·evidence·tasks 는 커밋한다)
if [ ! -e .cofa/.gitignore ]; then
  printf 'kit/\n*.lock\ntmp-*\n' > .cofa/.gitignore
  ADDED+=(.cofa/.gitignore)
fi
say "도구 → .cofa/kit/"

# 2) 작업 규칙: 과제가 이미 AGENTS.md 를 줬으면 뒤에 덧붙인다(한 번만)
MARK='<!-- cofa-kit:begin -->'
if [ -f AGENTS.md ]; then
  if grep -qF "$MARK" AGENTS.md; then
    say "AGENTS.md 에 이미 규칙이 있습니다(건너뜀)."
  else
    { printf '\n\n'; cat "$KIT/AGENTS.md"; } >> AGENTS.md
    ADDED+=(AGENTS.md)
    say "기존 AGENTS.md 뒤에 규칙을 덧붙였습니다. 키트 규칙 첫 문단에 과제 지침이 우선이라고 적혀 있습니다."
  fi
else
  cp "$KIT/AGENTS.md" AGENTS.md
  ADDED+=(AGENTS.md)
  say "AGENTS.md 생성"
fi
# 같은 폴더에 AGENTS.override.md 가 있으면 Codex 는 AGENTS.md 대신 그 파일만 읽는다 → 그 파일 뒤에도 덧붙인다
if [ -f AGENTS.override.md ] && ! grep -qF "$MARK" AGENTS.override.md; then
  { printf '\n\n'; cat "$KIT/AGENTS.md"; } >> AGENTS.override.md
  ADDED+=(AGENTS.override.md)
  say "AGENTS.override.md 가 있어 그 뒤에도 규칙을 덧붙였습니다(Codex 는 이 파일을 AGENTS.md 대신 읽습니다)."
fi

# 3) 스킬
mkdir -p .agents/skills
for s in "$KIT"/skills/*/; do
  name="$(basename "$s")"
  if [ -e ".agents/skills/$name" ]; then
    say "스킬 $name 이미 있음(건너뜀)"
  else
    cp -R "$s" ".agents/skills/$name"
    ADDED+=(".agents/skills/$name")
  fi
done
say "스킬 → .agents/skills/"

# 4) 작업 문서 양식(없을 때만)
for f in PLAN.md DECISIONS.md WORKLOG.md; do
  if [ ! -e "$f" ]; then
    cp "$KIT/templates/$f" "$f"
    ADDED+=("$f")
  fi
done
say "양식 → PLAN.md DECISIONS.md WORKLOG.md (SUBMISSION.md 는 \$submit 때 만듭니다)"

# 5) 프로젝트 훅(선택, --hooks 일 때만): /hooks 에서 신뢰하면 Codex 가 그 신뢰 기록을 ~/.codex/config.toml 에 쓴다
#    (codex-cli 0.164 의 [hooks.state] 항목). 시험 환경은 그 파일이 플랫폼 관리 설정이라 기본으로는 설치하지 않는다.
#    작업 폴더가 홈이면 ./.codex 가 곧 ~/.codex 이므로 --hooks 여도 쓰지 않는다
CODEX_HOME_DIR="$(cd "${CODEX_HOME:-$HOME/.codex}" 2>/dev/null && pwd || echo "${CODEX_HOME:-$HOME/.codex}")"
HOOKS_STEP=""
if [ "$WANT_HOOKS" != 1 ]; then
  :
elif [ "$DEST/.codex" = "$CODEX_HOME_DIR" ] || [ "$DEST" = "$(cd "$HOME" && pwd)" ]; then
  say "작업 폴더가 홈이라 훅을 설치하지 않습니다(~/.codex 보호). 시간은 kit.mjs status 로 봅니다."
elif [ ! -e .codex/hooks.json ]; then
  mkdir -p .codex
  HOOK="node \\\"$DEST/.cofa/kit/hooks/context.mjs\\\""
  cat > .codex/hooks.json <<EOF
{
  "description": "cofa-kit: 세션 시작·프롬프트 제출 때 경과 시간과 단계를 컨텍스트로 넣는다. Codex 의 /hooks 에서 신뢰한 뒤 동작한다.",
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "$HOOK start", "timeout": 5 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "$HOOK prompt", "timeout": 5 }] }]
  }
}
EOF
  ADDED+=(.codex/hooks.json)
  HOOKS_STEP="  4) (훅) codex 에서 /hooks → cofa-kit 훅 2개 신뢰(신뢰 기록은 ~/.codex/config.toml 에 남는다)"
  say "훅 → .codex/hooks.json"
else
  say ".codex/hooks.json 이 이미 있어 훅은 설치하지 않았습니다."
fi

# 6) 시작 시각(이미 있으면 유지)
if [ ! -e .cofa/started_at ]; then
  node .cofa/kit/scripts/kit.mjs start >/dev/null
  ADDED+=(.cofa/started_at)
fi
# 키트를 작업 폴더 안에 받아 설치한 경우(예: Codex 가 ./cofa-kit 에 clone): 제출물에 섞이지 않게 git 에서 뺀다
KIT_REL=""
case "$KIT/" in "$DEST"/*) KIT_REL="${KIT#"$DEST"/}" ;; esac
if [ -n "$KIT_REL" ]; then
  add_ignore "$KIT_REL/" && ADDED+=(.gitignore)
  say "키트 원본이 작업 폴더 안($KIT_REL/)에 있어 .gitignore 에 넣었습니다. 도구는 .cofa/kit 에 복사됐으니 지워도 됩니다: rm -rf \"$KIT_REL\""
fi

# 7) 환경 확인(외부 접속 없음)
say "실행 환경"
node .cofa/kit/scripts/kit.mjs env | sed 's/^/    /'
echo
node .cofa/kit/scripts/kit.mjs status | sed 's/^/    /'

# 8) 설치 커밋: 이번에 만든 경로만. 플랫폼 .gitignore 가 무시하는 경로(예: 숨김 폴더)는 빼야 git add 가 통째로 실패하지 않는다
COMMIT=()
for f in ${ADDED[@]+"${ADDED[@]}"}; do
  git check-ignore -q -- "$f" 2>/dev/null || COMMIT+=("$f")
done
if [ ${#COMMIT[@]} -gt 0 ]; then
  if git add -- "${COMMIT[@]}" && git commit -q -m "chore: cofa-kit 작업 규칙·스킬·양식 설치" -- "${COMMIT[@]}"; then
    say "커밋 완료(설치한 파일만)"
  else
    say "커밋 실패 — git status 를 확인하세요(설치 자체는 끝났습니다)."
  fi
else
  say "새로 설치한 파일이 없어 커밋하지 않았습니다."
fi

cat <<EOF

다음:
  1) codex 를 열고 /permissions → Full Access 를 고른다(이미 열려 있으면 그 세션에서, 탭마다 한 번)
  2) 첫 입력: \$kickoff   그다음부터는 「다음」 만 쳐도 단계를 골라 진행한다.
     과제 시작 시각이 설치 시각과 다르면: node .cofa/kit/scripts/kit.mjs start HH:MM
  3) 탭 나누기(메인·작업·검증/설명)와 입력 문장 한 장: node .cofa/kit/scripts/kit.mjs card
$HOOKS_STEP
EOF
