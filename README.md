# cofa-kit

3시간 안팎의 AI 활용 실무 과제를 **Codex CLI** 로 풀 때 쓰는 개인 작업 키트.
요구 파악 → 담당자 인터뷰 → 계획 → 슬라이스 구현 → 검증 → 제출 → 사후 설명까지의 **일하는 방식**을 담았다.
**과제 해법 코드는 없다.** 어떤 과제가 나와도 같은 절차와 기록 양식을 쓰는 것이 목적이다.

| 구성 | 내용 |
|---|---|
| `AGENTS.md` | Codex 작업 규칙(주도권·범위 통제·증거 기반 검증·시간·보고 형식) |
| `skills/` | 13개: `next`(「다음」 만 치면 단계를 골라 진행) `kickoff` `interview` `plan` `build-slice` `debug` `verify` `delegate` `data-first-look` `playbook` `handoff` `explainback` `submit` |
| `skills/playbook/references/` | 과제 유형별 요령(웹·데이터·API·기존 코드·자동화·LLM 기능·문서) + 반도체 용어 |
| `prompts/PROMPTS.md` | 단계별 복사용 요청문, 담당자 질문 예시, 서술형 답변 틀 |
| `mcp/server.mjs` | 의존성 없는 MCP 서버: 시간 상태·작업/결정 기록·요구사항 추적·제출 점검 |
| `hooks/` | 세션 시작·프롬프트 제출 때 경과 시간과 단계를 컨텍스트에 넣는 훅 |
| `scripts/kit.mjs` | MCP 와 같은 기능의 명령줄 도구 + `run`(테스트·실행 증거 기록, 0건 실행 감지) |
| `scripts/profile.mjs` | CSV/TSV 첫 점검(인코딩·형식·결측·키 후보, 개인정보 의심 열은 값 가림) |
| `templates/` | PLAN · DECISIONS · WORKLOG · SUBMISSION 양식 |
| `docs/` | 당일 운영표, MCP 등록 방법 |
| `.codex-plugin/` `.mcp.json` `.agents/plugins/` | Codex 플러그인 매니페스트·MCP·마켓플레이스 정의 |

필요한 것: `bash`, `git`, `node`(18 이상). 외부 패키지 설치 없음.

## 설치

### A. 작업 폴더에 직접 설치 (기본·시험장용)
과제 작업 폴더의 터미널에서 직접 친다(Codex 에 시키면 샌드박스 네트워크 차단으로 승인이 한 번 더 필요하다):
```bash
git clone --depth 1 https://github.com/Ryanpark3142/cofa-kit /tmp/kit && bash /tmp/kit/install.sh
```
`git clone` 이 막히고 HTTPS 다운로드만 될 때:
```bash
mkdir -p /tmp/kit && curl -fsSL https://codeload.github.com/Ryanpark3142/cofa-kit/tar.gz/refs/heads/main | tar xz -C /tmp/kit --strip-components=1 && bash /tmp/kit/install.sh
```

설치 스크립트가 하는 일(사용자 파일은 덮어쓰지 않음, `~/.codex` 는 건드리지 않음, 외부 접속 없음):
- 먼저 `node` 18 이상·`git` 을 확인하고, 없으면 아무것도 바꾸지 않고 멈춘다
- `AGENTS.md` 생성(이미 있으면 뒤에 덧붙임 — 과제 지침이 우선)
- `.agents/skills/` 에 스킬 11개 복사(Codex 가 저장소 스킬로 인식)
- `PLAN.md` `DECISIONS.md` `WORKLOG.md` 양식 생성
- `.codex/hooks.json`(프로젝트 훅) 생성 — `/hooks` 에서 신뢰해야 동작
- 도구 사본을 `.cofa/kit/` 에 둠(`/tmp` 는 환경이 일시정지되면 사라질 수 있어서), `.gitignore` 에 추가
- 시작 시각 기록, 실행 환경 출력, **이번에 만든 파일만** 커밋
- IDE 의 MCP 탭에 붙일 JSON 출력

설치 뒤:
1. `codex` 를 열고 폴더 신뢰를 물으면 신뢰한다.
2. (선택) `/hooks` → cofa-kit 훅 2개 신뢰 → 프롬프트마다 `[cofa-kit] 경과 N분 / 남은 M분 · 단계` 가 자동으로 붙는다.
3. (선택) MCP 탭에 출력된 JSON 을 넣고 Codex 를 다시 연다. `default_tools_approval_mode: approve` 가 있어야 도구마다 승인 창이 뜨지 않는다.
4. `$kickoff` 로 시작한다.

### B. Codex 플러그인 (시험장에서는 쓰지 않는다)
`codex plugin marketplace add Ryanpark3142/cofa-kit` → `codex plugin add cofa-kit@cofa-kit-local` 로 스킬(`cofa-kit:<이름>`)·MCP·훅을 받을 수 있다.
다만 이 명령은 `~/.codex/config.toml` 에 마켓플레이스·플러그인 항목을 쓴다. 시험 환경은 이 파일이 플랫폼 관리 설정이므로 **A 만 쓴다.** A 와 함께 설치하면 같은 스킬이 두 번 보인다. 개인 PC 연습용이다.

## 하루 흐름
`docs/exam-day.md` 참고. 요약:

| 분 | 할 일 | 스킬 |
|---|---|---|
| 0~15 | 지시서 정독, 요구 등록, 담당자에게 작고 구체적인 질문 | `$kickoff` `$interview` |
| 15~30 | 설계안 비교 → 선택 → 슬라이스 → PLAN.md | `$playbook` `$plan` |
| 30~130 | 슬라이스마다 구현 → 검증 → 커밋, 긴 독립 작업은 위임 | `$build-slice` `$delegate` `$debug` |
| 130~155 | 요구별 실행 증거, 엣지 케이스 | `$verify` |
| 155~180 | 제출 문서, 사후 설명 대비, 제출 | `$submit` `$explainback` |

## 설계 근거
- 과제 플랫폼이 결과물과 함께 프롬프트·도구 설정·AI 대화·검증 실행 기록을 모으고, 사후 질의 답이 실제 구현과 맞는지 확인한다고 공개돼 있다([Cofa Probe 소개](https://www.getcofa.com/ko/probe)). → 결정·검증 기록을 남기는 도구와 `explainback` 을 넣었다.
- 개발팀 인터뷰([조쉬 뉴스레터, 2026-10-16](https://maily.so/josh/posts/x1zg69d3rqg))에서 담당자에게 작게 여러 번 묻는 응시자, 과설계하지 않는 응시자, 적은 비용으로 푸는 응시자를 높게 본다고 했다. → `interview`, AGENTS.md 의 범위 통제·토큰 절약 규칙.
- 같은 목적의 공개 저장소 46개(예: `frank081999-glitch/cofa-harness`, `hamjoon2003/sk-hynix-2nd-harness`, `zittenyetten/cofa-probe-kit`, `song0328/cofa-workflow`, `keepdev0919/hynix`)의 접근과 사전 체험 관찰을 참고했다(세션 교체, 증거 기록, 인터뷰 순서, 홈 폴더 = git 저장소, 포트·메모리 함정 등). 코드와 문서는 이 저장소에서 새로 썼다.

## 확인 상태
로컬(Windows Git Bash, Node 25, codex-cli 0.164.0)에서 확인한 것:
- `install.sh`: 새 설치, 재실행(중복 없음), 기존 AGENTS.md 뒤 덧붙임, 기존 미커밋 변경을 설치 커밋에 섞지 않음, git 작성자 정보 없을 때, 작업 폴더가 홈일 때 훅 미설치
- `codex debug prompt-input` 으로 AGENTS.md 와 `.agents/skills` 가 모델 입력에 들어가는 것
- `codex exec` 실전: Codex 가 AGENTS.md·`$kickoff`·`$data-first-look`·`$interview` 를 따라 요구 등록·데이터 점검·질문 작성. MCP 가 막히면 `kit.mjs` 로 대체
- MCP: `default_tools_approval_mode = "approve"` 일 때 승인 없이 호출 성공, 없거나 `auto` 면 비대화형에서 실패
- 프로젝트 훅 `.codex/hooks.json`: 신뢰된 상태에서 SessionStart·UserPromptSubmit 컨텍스트가 실제로 모델에 들어감
- 플러그인: 격리한 CODEX_HOME 에서 마켓플레이스 추가·설치, 스킬·MCP 등록
- MCP 서버 프로토콜(버전 협상·도구 목록·호출·오류·ping), `kit.mjs` 전 명령, `profile.mjs`(cp949·따옴표·날짜 표기 섞임·개인정보 가림)
- Codex(독립 검토)와 Claude 교차검토 지적 반영

확인하지 못한 것:
- 시험 환경(리눅스, 고정 Codex 버전)에서의 설치·스킬 인식·MCP 탭 등록·`/hooks` 신뢰. 사전 체험에서 확인한다(`docs/exam-day.md`). 무엇이 안 돼도 `AGENTS.md` + `kit.mjs` 만으로 모든 기능을 쓸 수 있다.
- 플러그인 MCP 의 `${PLUGIN_ROOT}` 치환(플러그인은 시험장에서 쓰지 않음).

## 라이선스
MIT
