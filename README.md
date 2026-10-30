# cofa-kit

3시간 안팎의 AI 활용 실무 과제를 **Codex CLI** 로 풀 때 쓰는 개인 작업 키트.
요구 파악 → 담당자 인터뷰 → 계획 → 슬라이스 구현 → 검증 → 제출 → 사후 설명까지의 **일하는 방식**을 담았다.
**과제 해법 코드는 없다.** 어떤 과제가 나와도 같은 절차와 기록 양식을 쓰는 것이 목적이다.

| 구성 | 내용 |
|---|---|
| `AGENTS.md` | Codex 작업 규칙(주도권·범위 통제·증거 기반 검증·시간·보고 형식) |
| `skills/` | 11개: `kickoff` `interview` `plan` `build-slice` `debug` `verify` `delegate` `data-first-look` `playbook` `explainback` `submit` |
| `skills/playbook/references/` | 과제 유형별 요령(웹·데이터·API·기존 코드·자동화·LLM 기능·문서) + 반도체 용어 |
| `prompts/PROMPTS.md` | 단계별 복사용 요청문, 담당자 질문 예시, 서술형 답변 틀 |
| `mcp/server.mjs` | 의존성 없는 MCP 서버: 시간 상태·작업/결정 기록·요구사항 추적·제출 점검 |
| `hooks/` | 세션 시작·프롬프트 제출 때 경과 시간과 단계를 컨텍스트에 넣는 훅 |
| `scripts/kit.mjs` | MCP 와 같은 기능의 명령줄 도구(MCP 가 안 될 때) |
| `scripts/profile.mjs` | CSV/TSV 첫 점검(인코딩·형식·결측·키 후보) |
| `templates/` | PLAN · DECISIONS · WORKLOG · SUBMISSION 양식 |
| `docs/` | 당일 운영표, MCP 등록 방법 |
| `.codex-plugin/` `.mcp.json` `.agents/plugins/` | Codex 플러그인 매니페스트·MCP·마켓플레이스 정의 |

필요한 것: `bash`, `git`, `node`(18 이상). 외부 패키지 설치 없음.

## 설치

### A. 작업 폴더에 직접 설치 (기본, 어떤 Codex 버전에서도)
과제 작업 폴더에서:
```bash
git clone --depth 1 https://github.com/<아이디>/<저장소> /tmp/kit && bash /tmp/kit/install.sh
```
또는 Codex 에게: `https://github.com/<아이디>/<저장소> 를 /tmp/kit 에 clone 하고 bash /tmp/kit/install.sh 를 작업 폴더에서 실행해줘.`

설치 스크립트가 하는 일(기존 파일은 덮어쓰지 않음):
- `AGENTS.md` 생성(이미 있으면 뒤에 덧붙임 — 과제 지침이 우선)
- `.agents/skills/` 에 스킬 복사(Codex 가 저장소 스킬로 인식)
- `PLAN.md` `DECISIONS.md` `WORKLOG.md` 양식 생성
- 도구 사본을 `.cofa/kit/` 에 둠(`/tmp` 는 환경이 일시정지되면 사라질 수 있어서), `.gitignore` 에 추가
- 시작 시각 기록, 실행 환경(언어·패키지·npm 접근) 출력, 첫 커밋
- MCP 탭에 붙일 JSON 출력

설치 뒤 `codex` 를 다시 열고 `$kickoff` 로 시작한다.

### B. Codex 플러그인으로 설치 (선택, 지원되는 버전에서)
```bash
codex plugin marketplace add <아이디>/<저장소>
```
그다음 Codex 의 플러그인 목록에서 `cofa-kit` 을 설치한다. 훅은 설치 뒤 직접 검토·신뢰해야 동작한다.
플러그인 방식은 스킬·MCP·훅을 주지만 작업 폴더에 양식과 `AGENTS.md` 를 만들지는 않으므로 **A 의 install.sh 도 같이 실행**한다.

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
- 같은 목적의 공개 저장소들(예: `frank081999-glitch/cofa-harness`, `hamjoon2003/sk-hynix-2nd-harness`, `zittenyetten/cofa-probe-kit`)의 접근을 참고했다. 코드와 문서는 이 저장소에서 새로 썼다.

## 확인 상태
로컬(Windows Git Bash, Node 25, codex-cli 0.164.0)에서 확인한 것:
- `install.sh`: 새 설치, 재실행(중복 없음), 기존 AGENTS.md 뒤 덧붙임, 첫 커밋
- `codex debug prompt-input` 으로 AGENTS.md 와 `.agents/skills` 11개가 모델 입력에 들어가는 것
- `codex plugin marketplace add <경로>` → `codex plugin add cofa-kit@cofa-kit-local` 설치, 플러그인 스킬 11개(`cofa-kit:<이름>`) 인식, `codex mcp list` 에 MCP 등록
- MCP 서버: initialize · tools/list · tools/call · 오류 · ping 응답, 훅 스크립트 출력, `kit.mjs` 전 명령, `profile.mjs`(cp949·따옴표·날짜 표기 섞임)

확인하지 못한 것:
- 플러그인 MCP 의 `${PLUGIN_ROOT}` 치환과 훅 실제 발동(모델 호출이 필요해 시험하지 않음). MCP 는 install.sh 가 출력하는 절대 경로를 MCP 탭에 넣는 방식을 기본으로 쓴다.
- 시험 환경의 Codex 버전·네트워크에서의 동작. 사전 체험에서 확인한다. 안 되면 A 방식 + `kit.mjs` 명령만으로도 모든 기능을 쓸 수 있다.

## 라이선스
MIT
