# cofa-kit

3시간 안팎의 AI 활용 실무 과제를 **Codex CLI** 로 풀 때 쓰는 개인 작업 키트.
요구 파악 → 담당자 인터뷰 → 계획 → 슬라이스 구현 → 검증 → 제출 → 사후 설명까지의 **일하는 방식**을 담았고, 터미널 탭 여러 개에서 Codex 세션을 동시에 돌려도 기록·커밋이 섞이지 않게 했다.
**과제 해법 코드는 없다.** 어떤 과제가 나와도 같은 절차와 기록 양식을 쓰는 것이 목적이다.

> **AI 에이전트(Codex)에게 — 이 저장소를 설치하라는 요청을 받았다면 이것만 하면 된다.**
> 사용자의 **현재 작업 폴더**(과제 폴더)에서 아래 한 줄을 실행한다. 네트워크 승인을 요구하면 사용자에게 승인을 요청한다. 다른 파일은 고치지 않는다.
> ```bash
> git clone --depth 1 https://github.com/Ryanpark3142/cofa-kit /tmp/kit && bash /tmp/kit/install.sh
> ```
> clone 이 실패하면: `mkdir -p /tmp/kit && curl -fsSL https://codeload.github.com/Ryanpark3142/cofa-kit/tar.gz/refs/heads/main | tar xz -C /tmp/kit --strip-components=1 && bash /tmp/kit/install.sh`
> 끝나면 출력의 「실행 환경」 요약 3줄과 맨 아래 「다음:」 안내(`/permissions` → `Full Access` 포함)를 사용자에게 그대로 전한다. 이미 `/tmp/kit` 이 있으면 clone 대신 `git -C /tmp/kit pull` 후 install.sh 를 실행한다.

| 구성 | 내용 |
|---|---|
| `AGENTS.md` | Codex 작업 규칙(주도권·범위 통제·증거 기반 검증·여러 탭 안전 규칙·시간·보고 형식) |
| `skills/` | 17개. 메인 탭: `next`(「다음」 만 치면 단계를 골라 진행) `kickoff` `interview` `data-first-look` `playbook` `plan` `build-slice` `design`(화면 규칙과 `ui.css`, 글꼴 Pretendard 는 OFL) `debug` `verify` `delegate`(다른 탭에 나누기) `handoff` `submit` · 다른 탭: `worker`(맡은 작업) `check`(독립 검증) `explain`(설명) `explainback`(사후 설명 대비) |
| `skills/playbook/references/` | 과제 유형별 요령(웹·데이터·API·기존 코드·자동화·LLM 기능·문서) + 반도체 용어 |
| `scripts/kit.mjs` | 상태판(`board`)·요구 추적·실행 증거(`run`)·경로 지정 커밋(`commit`)·작업 나누기(`task`)·제출 점검(`check`). 여러 탭이 동시에 써도 기록이 사라지거나 번호가 겹치지 않는다 |
| `scripts/profile.mjs` | CSV/TSV 첫 점검(인코딩·형식·결측·키 후보, 개인정보 의심 열은 값 가림) |
| `docs/card.md` | 시험 중에 볼 한 장(`kit.mjs card`): 탭 나누기·입력 문장·막힐 때 |
| `prompts/PROMPTS.md` | 단계별 복사용 요청문, 담당자 질문 예시, 서술형 답변 틀 |
| `templates/` | PLAN · DECISIONS · WORKLOG · SUBMISSION 양식 |
| `docs/` | 당일 시나리오·운영표·MCP 등록 방법 |
| `mcp/server.mjs` `hooks/` | 선택 기능: kit.mjs 와 같은 기능의 MCP 서버, 시간 알림 훅(`--hooks`) |
| `tests/kit-test.sh` | 키트 자체 시험(설치·동시 실행·증거·커밋 격리·점검, 83개 항목). 작업 폴더에는 복사되지 않는다 |

필요한 것: `bash`, `git`, `node`(18 이상). 외부 패키지 설치 없음.

## 설치

### A. 작업 폴더에 직접 설치 (기본·시험장용)
과제 작업 폴더의 터미널에 한 줄(승인 창 없이 바로 끝난다):
```bash
git clone --depth 1 https://github.com/Ryanpark3142/cofa-kit /tmp/kit && bash /tmp/kit/install.sh
```
또는 Codex 에 한 문장: `github.com/Ryanpark3142/cofa-kit 를 /tmp/kit 에 받아서 README 대로 설치해줘` (사전 체험에서 성공, clone·install.sh 승인 각 1번).
`git clone` 이 막히고 HTTPS 다운로드만 될 때:
```bash
mkdir -p /tmp/kit && curl -fsSL https://codeload.github.com/Ryanpark3142/cofa-kit/tar.gz/refs/heads/main | tar xz -C /tmp/kit --strip-components=1 && bash /tmp/kit/install.sh
```

설치 스크립트가 하는 일(사용자 파일은 덮어쓰지 않음, `~/.codex` 는 건드리지 않음, 외부 접속 없음):
- 먼저 `node` 18 이상·`git` 을 확인하고, 없으면 아무것도 바꾸지 않고 멈춘다
- `AGENTS.md` 생성(이미 있으면 뒤에 덧붙임 — 과제 지침이 우선. `AGENTS.override.md` 가 있으면 거기에도)
- `.agents/skills/` 에 스킬 17개 복사(Codex 가 저장소 스킬로 인식)
- `PLAN.md` `DECISIONS.md` `WORKLOG.md` 양식 생성
- 도구 사본을 `.cofa/kit/` 에 둠(`/tmp` 는 환경이 일시정지되면 사라질 수 있어서). 도구·잠금 파일은 `.cofa/.gitignore` 로 커밋에서 뺀다
- 시작 시각 기록, 실행 환경 출력, **이번에 만든 파일만** 커밋(플랫폼 `.gitignore` 가 무시하는 경로는 건너뜀)

설치 뒤:
1. `codex` 를 열고 `/permissions` → `Full Access` 를 고른다(이미 열려 있으면 그 세션에서, 탭마다 한 번).
2. `$kickoff` 로 시작한다. 그다음부터는 `다음` 만 쳐도 된다.
3. 탭 나누기·입력 문장 한 장: `node .cofa/kit/scripts/kit.mjs card`
- (선택) MCP: `kit.mjs mcp` 가 출력하는 JSON 을 IDE 의 MCP 탭에. 없어도 모든 기능이 kit.mjs 로 된다.
- (선택) 훅: `bash /tmp/kit/install.sh --hooks` → `/hooks` 에서 신뢰. 신뢰 기록이 `~/.codex/config.toml` 에 남으므로(0.164 의 `[hooks.state]`) 시험장에서는 쓰지 않는다.

### B. Codex 플러그인 (시험장에서는 쓰지 않는다)
`codex plugin marketplace add Ryanpark3142/cofa-kit` → `codex plugin add cofa-kit@cofa-kit-local` 로 스킬(`cofa-kit:<이름>`)·MCP·훅을 받을 수 있다. 이 명령은 `~/.codex/config.toml` 에 항목을 쓰므로 시험 환경에서는 **A 만 쓴다.** 개인 PC 연습용이다.

## 여러 탭으로 일하기
웹 IDE 터미널은 탭을 여러 개 열 수 있고, 탭마다 `codex` 를 띄우고 `/permissions` → `Full Access` 를 고르면 같은 폴더에서 Codex 세션이 동시에 돈다.

| 탭 | 맡는 일 | 첫 입력 |
|---|---|---|
| 1 메인 | 파악·담당자 질문·계획·통합·제출 | `$kickoff` → `다음` |
| 2 작업 | 메인이 `$delegate` 로 만든 작업 하나(파일이 안 겹치는 슬라이스) | `$worker T1` |
| 3 검증·공부 | 시작부터 끝까지 설명 듣기, 독립 검증, 설명 연습 | `$explain`(과제 → 계획 → 단계별 → 전체 정리, 이어 듣기는 `ㄱ`, 궁금하면 그냥 질문) · `$check` · `$explainback` |

섞이지 않게 하는 장치:
- **작업 파일** `.cofa/tasks/T<n>.md`: 수정 가능한 파일·완료 기준 명령·입출력 계약. 파일이 겹치면 `task new` 가 경고한다
- **경로 지정 커밋** `kit.mjs commit -m … <파일>`: 그 파일과 기록 파일만 커밋한다(다른 탭이 `git add` 해 둔 것은 섞이지 않음). `index.lock` 이 있으면 잠시 뒤 다시 한다
- **잠금·원자 쓰기**: 요구 추적표·작업 상태는 잠그고 고치며, 증거 번호는 「없을 때만 만들기」 로 잡아 동시에 돌려도 겹치지 않는다
- **상태판** `kit.mjs board`: 시간·요구·작업(탭)·마지막 증거·커밋 안 된 파일(어느 작업 것인지)·최근 커밋을 한 번에
- 규칙: `git add -A`·`stash`·`reset --hard`·`checkout -- .`·`clean` 금지, 패키지 설치·서버는 메인만

## 하루 흐름
`docs/scenario.md`(무엇을 어디에 입력하나), `docs/exam-day.md`(운영표·체험 관찰) 참고. 요약:

| 분 | 메인 탭 | 다른 탭 |
|---|---|---|
| 0~15 | 지시서 정독, 요구 등록, 담당자에게 작고 구체적인 질문 (`$kickoff` `$interview`) | |
| 15~30 | 설계안 비교 → 선택 → 슬라이스(바꿀 파일·검증 방법) → PLAN.md (`$plan`) | |
| 30~130 | 슬라이스마다 구현 → 검증 → 커밋 (`$build-slice`), 나눌 수 있는 것은 `$delegate` | `$worker T<n>` · 슬라이스마다 탭3 `ㄱ` |
| 130~155 | 요구별 실행 증거, 엣지 케이스 (`$verify`) | `$check`(독립 재계산) |
| 155~180 | 제출 문서·점검·제출 (`$submit`) | `$explainback`(설명 연습) |

## 설계 근거
- 과제 플랫폼이 결과물과 함께 프롬프트·도구 설정·AI 대화·검증 실행 기록을 모으고, 사후 질의 답이 실제 구현과 맞는지 확인한다고 공개돼 있다([Cofa Probe 소개](https://www.getcofa.com/ko/probe)). → 결정·검증 기록을 남기는 도구와 `explain`·`explainback` 을 넣었다.
- 개발팀 인터뷰([조쉬 뉴스레터, 2026-10-16](https://maily.so/josh/posts/x1zg69d3rqg))에서 담당자에게 작게 여러 번 묻는 응시자, 과설계하지 않는 응시자, 오래 걸리는 구현은 서브에이전트에 맡기고 검증 데이터를 먼저 정하는 응시자, 적은 비용으로 푸는 응시자를 높게 본다고 했다. → `interview`, 범위 통제 규칙, `delegate`(작업 파일에 기대값을 먼저 적음), 새 탭은 짧은 대화로 시작해 토큰이 적게 든다.
- 같은 목적의 공개 저장소 67개(예: `frank081999-glitch/cofa-harness`, `hamjoon2003/sk-hynix-2nd-harness`, `MIIXmix/cofa-kit` 의 독립 검증, `arcturus0637-rgb/cofa-prelim-kit` 의 증거 낡음 감지)의 접근과 사전 체험 관찰을 참고했다. 코드와 문서는 이 저장소에서 새로 썼다.

## 확인 상태
로컬(Windows Git Bash, Node 25, codex-cli 0.164.0, 모델 gpt-6.1-sol)에서 확인한 것:
- `tests/kit-test.sh` 83개 항목 통과: 설치·재설치, 시작 시각 보호, 요구 20개 동시 등록(유실·중복 0), 실행 10개 동시(증거 번호 겹침 0), 0건 실행(pytest·node --test·go test)·시간 초과 판정, 작업 파일·겹침 경고, 경로 지정 커밋(다른 탭이 staged 한 파일 제외)·`index.lock` 재시도, 문서 커밋·산출물 생성에는 「재검증 필요」 오경보 없음, 숨김 폴더 비밀값 무시, 하위 git 저장소, 플랫폼 `.gitignore` 가 숨김 폴더를 무시할 때, MCP
- Codex 실측(샌드박스 workspace-write): `$kickoff`(요구 등록·데이터 점검) → 담당자 답 반영·`$plan`·`$delegate`(작업 파일에 손계산 기대값) → `$build-slice` 2회 → **작업 탭 `$worker T1` 과 검증 탭 `$check` 동시 실행**(증거·요구 기록 충돌 없음, 검증 탭이 84.95%/85% 경계를 독립 계산으로 확인) → `다음` 이 「작업 완료 → 메인 재검증」 을 골라 처리 → `$submit`
- 이 PC 의 Codex 샌드박스는 `.git` 쓰기를 막아 Codex 의 커밋은 실패했고, 키트가 「사용자가 터미널에서 같은 명령」 으로 안내하는 것까지 확인했다(시험장은 Full Access 라 해당 없음)
- `codex debug prompt-input` 으로 AGENTS.md 블록과 스킬 16개가 모델 입력에 들어가는 것

시험 환경 사전 체험(2026-10-31)에서 확인한 것: Codex 한 문장 설치 성공, 작업 폴더 = 홈이라 훅은 설치되지 않음, Codex 가 규칙·스킬·양식·`kit.mjs` 를 인식. 자세한 관찰은 `docs/exam-day.md`.

확인하지 못한 것:
- 진짜 리눅스에서의 `kit.mjs run`. 같은 호출(`timeout -k 5 N bash -c …`, 출력은 파일)을 Git Bash 의 GNU timeout·bash 로 따로 돌려 종료 코드 보존·시간 초과 124·백그라운드 프로세스를 남겨도 즉시 반환·bash 문법을 확인했다
- 시험 환경의 MCP 탭 등록

## 라이선스
MIT
