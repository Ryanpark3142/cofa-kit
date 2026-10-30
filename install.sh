#!/usr/bin/env bash
# 과제 작업 폴더에 cofa-kit(규칙·스킬·양식·도구)을 설치한다. 기존 파일은 덮어쓰지 않는다.
# 사용: git clone <이 저장소> /tmp/kit && bash /tmp/kit/install.sh [작업폴더(기본: 현재 폴더)]
set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$(cd "${1:-$PWD}" && pwd)"
cd "$DEST"
say() { printf '\033[1m[cofa-kit]\033[0m %s\n' "$*"; }

if [ "$KIT" = "$DEST" ]; then
  echo "작업 폴더에서 실행하세요(키트 폴더 자체에는 설치하지 않습니다)." >&2
  exit 1
fi

[ -d .git ] || { git init -q && say "git 저장소를 새로 만들었습니다."; }
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
    say "기존 AGENTS.md 뒤에 규칙을 덧붙였습니다. 과제 지침이 앞에 있으니 그쪽이 우선입니다."
  fi
else
  cp "$KIT/AGENTS.md" AGENTS.md
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
  fi
done
say "스킬 → .agents/skills/ ($(ls "$KIT/skills" | tr '\n' ' '))"

# 4) 작업 문서 양식(없을 때만)
for f in PLAN.md DECISIONS.md WORKLOG.md; do
  [ -e "$f" ] || cp "$KIT/templates/$f" "$f"
done
say "양식 → PLAN.md DECISIONS.md WORKLOG.md (SUBMISSION.md 는 \$submit 때 만듭니다)"

# 5) 시작 시각(이미 있으면 유지)
[ -e .cofa/started_at ] || node .cofa/kit/scripts/kit.mjs start >/dev/null
grep -qxF '.cofa/kit/' .gitignore 2>/dev/null || echo '.cofa/kit/' >> .gitignore

# 6) 환경 확인
say "실행 환경"
node .cofa/kit/scripts/kit.mjs env | sed 's/^/    /'
echo
node .cofa/kit/scripts/kit.mjs status | sed 's/^/    /'

# 7) 첫 커밋(작성자 정보가 없으면 건너뛴다)
git add AGENTS.md .agents PLAN.md DECISIONS.md WORKLOG.md .gitignore .cofa/started_at 2>/dev/null || true
if git commit -q -m "chore: cofa-kit 작업 규칙·스킬·양식 설치" 2>/dev/null; then
  say "커밋 완료"
else
  say "커밋은 건너뜀(git user.name/email 미설정이거나 변경 없음)."
fi

cat <<EOF

[cofa-kit] MCP 를 쓰려면 IDE 의 MCP 탭 JSON 에 아래를 추가하고 저장하세요(선택):
{
  "mcpServers": {
    "cofa-kit": {
      "command": "node",
      "args": ["$DEST/.cofa/kit/mcp/server.mjs"],
      "env": { "COFA_ROOT": "$DEST" }
    }
  }
}
MCP 가 안 되면 같은 기능을 터미널에서: node .cofa/kit/scripts/kit.mjs

다음: codex 를 (다시) 열고 \$kickoff 로 시작하세요. 과제 시작 시각이 지금과 다르면: node .cofa/kit/scripts/kit.mjs start HH:MM
EOF
