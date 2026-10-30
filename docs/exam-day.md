# 당일 운영표

과제 180분 + 사후 설명(서술형) 기준. 실제 시험 안내와 다르면 안내를 따른다.

## 사전 체험(15분, 1회)에서 확인할 것
1. 감독 연결: 웹캠 · 전체 화면 공유 · 휴대폰 앱 · 충전선
2. 터미널: `node --version`, `python3 --version`, `git --version`
3. clone 되는지: `git clone --depth 1 https://github.com/<아이디>/<저장소> /tmp/kit`
4. 설치: 빈 폴더에서 `bash /tmp/kit/install.sh` → 환경 요약이 나오는지
5. `codex` → `/status`, `/model` 목록·추론 강도 확인 → `적용된 AGENTS.md 규칙을 3줄로 요약하고 스킬 이름을 나열해줘`
6. (선택) MCP 탭에 install.sh 가 출력한 JSON 추가 → Codex 에서 `time_status 도구를 호출해줘`
7. 서버 0.0.0.0 실행 → Browser 미리보기
8. 체험 종료 → 예시 서술형 화면에서 타이핑 감각

## 과제 시간표
| 분 | 단계 | 할 일 | 스킬 |
|---|---|---|---|
| 0~3 | 설치 | clone + install.sh, codex 재시작 | 프롬프트 0 |
| 3~15 | 파악 | 지시서 정독, 요구 등록, 담당자에게 구체적 질문 하나씩 | `$kickoff` `$interview` `$data-first-look` |
| 15~30 | 계획 | 설계안 비교 → 선택 → 슬라이스 → PLAN.md → 첫 커밋 | `$playbook` `$plan` |
| 30~130 | 구현 | 슬라이스마다 구현→검증→커밋. 긴 독립 작업은 위임. 100분에 필수 미완이면 가산 기능 버림 | `$build-slice` `$delegate` `$debug` |
| 130~155 | 검증 | 요구별 증거, 엣지 케이스, 교차 확인 | `$verify` |
| 155~170 | 정리 | 제출 문서, 사후 설명 대비, 핵심 코드 다시 읽기 | `$submit` `$explainback` |
| 170~ | 제출 | 저장 상태 확인 → 「제출하고 문제풀기」 | |

## 모델 운용
codex-cli 0.164 `codex debug models` 의 설명: GPT-6.1-Sol 「Latest workhorse model for coding and everyday work」, GPT-5.6-Terra 「Older balanced model for straightforward work」, GPT-6-Luna 「Fast and affordable model for easier tasks」. 추론 강도 low~xhigh(Sol·Terra 는 max·ultra 까지), 기본 medium.
- 주력은 GPT-6.1-Sol. 비용은 추론 강도로 조절: 구현 medium, 계획·검증·어려운 디버깅 high.
- 위치 찾기·요약 초안처럼 틀려도 바로 드러나는 일만 Luna.
- xhigh 이상은 응답이 느려 시간을 잡아먹으므로 막힌 설계 판단에만.
- 같은 요청 반복 금지. 응답이 길어지면 "짧게"를 붙인다.

## 사후 설명(서술형)
- AI·복사 붙여넣기 불가, 문항당 5분, 이전 문항으로 못 돌아감.
- 틀: 무엇을 → 왜(버린 대안) → 어떻게 검증(수치) → 한계. 파일·함수 이름을 그대로.
- 전제가 실제와 다른 질문은 "실제로는 ~"로 바로잡는다.
