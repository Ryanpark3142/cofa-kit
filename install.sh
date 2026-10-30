#!/usr/bin/env bash
# 과제 작업 폴더에 cofa-kit(규칙·스킬·양식·도구·훅)을 설치한다. 사용자 파일은 덮어쓰지 않는다(.cofa/kit 도구 사본만 매번 새로 받는다).
# 사용: git clone --depth 1 https://github.com/Ryanpark3142/cofa-kit /tmp/kit && bash /tmp/kit/install.sh [작업폴더(기본: 현재 폴더)]
set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$(cd "${1:-$PWD}" && pwd)"
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
  git config user.name "candidate"
  say "git 작성자 정보가 없어 이 저장소에만 candidate 로 설정했습니다."
fi

# 1) 도구 사본: /tmp 는 환경이 일시정지되면 사라질 수 있어 작업 폴더 안에 둔다
rm -rf .cofa/kit
mkdir -p .cofa/kit
cp -R "$KIT/lib" "$KIT/mcp" "$KIT/hooks" "$KIT/scripts" "$KIT/prompts" "$KIT/templates" "$KIT/docs" .cofa/kit/
say "도구 → .cofa/kit/"

# 2) 작업 규칙: 과제가 이미 AGENTS.md 를 줬으면 뒤에 덧붙인다(한 번만)
MARK='<!-- cofa-kit:begin -->'
if [ -f AGENTS.md ]; then
  if grep -qF "$MARK" AGENTS.md; then
    say "AGENTS.md 에 이미 규칙이 있습니다(건너뜀)."
  else
    { printf '\n\n'; cat "$KIT/AGENTS.md"; } >> AGENTS.md
    ADDED+=(AGENTS.md)
    say "기존 AGENTS.md 뒤에 규칙을 덧붙였습니다. 과제 지침이 앞에 있으니 그쪽이 우선입니다."
  fi
else
  cp "$KIT/AGENTS.md" AGENTS.md
  ADDED+=(AGENTS.md)
  say "AGENTS.md 생성"
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

# 5) 프로젝트 훅(선택 기능): Codex 에서 /hooks 로 신뢰해야 동작한다. 이미 있으면 건드리지 않는다
# 작업 폴더가 홈이면 ./.codex 가 곧 ~/.codex(플랫폼 관리 설정)이므로 절대 쓰지 않는다
CODEX_HOME_DIR="$(cd "${CODEX_HOME:-$HOME/.codex}" 2>/dev/null && pwd || echo "${CODEX_HOME:-$HOME/.codex}")"
HOOKS_STEP="  2) (선택) /hooks 에서 cofa-kit 훅 2개를 신뢰한다."
if [ "$DEST/.codex" = "$CODEX_HOME_DIR" ] || [ "$DEST" = "$(cd "$HOME" && pwd)" ]; then
  HOOKS_STEP="  2) (훅 없음: 작업 폴더가 홈) 시간은 node .cofa/kit/scripts/kit.mjs status 로 본다."
  say "작업 폴더가 홈이라 훅을 설치하지 않습니다(~/.codex 보호). 시간 안내는 kit.mjs status 로 봅니다."
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
  say "훅 → .codex/hooks.json (codex 에서 /hooks 로 신뢰하면 시간 안내가 자동으로 붙습니다)"
else
  say ".codex/hooks.json 이 이미 있어 훅은 설치하지 않았습니다."
fi

# 6) 시작 시각(이미 있으면 유지)
if [ ! -e .cofa/started_at ]; then
  node .cofa/kit/scripts/kit.mjs start >/dev/null
  ADDED+=(.cofa/started_at)
fi
if ! grep -qxF '.cofa/kit/' .gitignore 2>/dev/null; then
  echo '.cofa/kit/' >> .gitignore
  ADDED+=(.gitignore)
fi

# 7) 환경 확인(외부 접속 없음)
say "실행 환경"
node .cofa/kit/scripts/kit.mjs env | sed 's/^/    /'
echo
node .cofa/kit/scripts/kit.mjs status | sed 's/^/    /'

# 8) 설치 커밋: 이번에 만든 경로만
if [ ${#ADDED[@]} -gt 0 ]; then
  git add -- "${ADDED[@]}"
  if git commit -q -m "chore: cofa-kit 작업 규칙·스킬·양식 설치" -- "${ADDED[@]}"; then
    say "커밋 완료(설치한 파일만)"
  else
    say "커밋 실패 — git status 를 확인하세요."
  fi
else
  say "새로 설치한 파일이 없어 커밋하지 않았습니다."
fi

cat <<EOF

[cofa-kit] MCP(선택): IDE 의 MCP 탭 JSON 에 아래 블록을 추가하고 저장한 뒤 codex 를 다시 여세요.
{
  "mcpServers": {
    "cofa-kit": {
      "command": "node",
      "args": ["$DEST/.cofa/kit/mcp/server.mjs"],
      "env": { "COFA_ROOT": "$DEST" },
      "default_tools_approval_mode": "approve"
    }
  }
}
MCP 가 안 되거나 승인 창이 계속 뜨면 MCP 는 빼고 같은 기능을 명령으로: node .cofa/kit/scripts/kit.mjs help

다음:
  1) codex 를 (다시) 열고, 폴더 신뢰를 물으면 신뢰한다.
$HOOKS_STEP
  3) \$kickoff 로 시작한다. 과제 시작 시각이 설치 시각과 다르면: node .cofa/kit/scripts/kit.mjs start HH:MM
EOF
