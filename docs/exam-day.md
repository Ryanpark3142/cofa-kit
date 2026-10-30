# 당일 운영표

과제 180분 + 사후 설명(서술형) 기준. 실제 시험 안내와 다르면 안내를 따른다.

## 사전 체험(15분, 1회)에서 확인할 것
1. 감독 연결: 웹캠 · 전체 화면 공유 · 휴대폰 앱 · 충전선
2. 터미널: `node --version`, `python3 --version`, `git --version`
3. 설치: 체험 작업 폴더에서 `git clone --depth 1 https://github.com/Ryanpark3142/cofa-kit /tmp/kit && bash /tmp/kit/install.sh` → 환경 요약이 나오는지. clone 이 막히면 codeload tar.gz 대안(README)
4. `codex` → 폴더 신뢰 → `/status`, `/model` 목록·추론 강도 확인 → `파일을 열지 말고, 지금 받은 지침에 있는 cofa-kit 원칙 6개의 제목과 쓸 수 있는 스킬 이름만 말해줘` (파일을 읽고 답하면 로딩 확인이 안 되므로 「열지 말고」 가 중요)
5. `/hooks` → cofa-kit 훅 2개 신뢰 → 아무 질문이나 보내고 답에 `[cofa-kit] 경과 …` 를 받았는지 물어본다
6. (선택) MCP 탭에 install.sh 가 출력한 JSON 추가 → Codex 에서 `time_status 도구를 호출해줘` → 승인 창 없이 되는지
7. 서버 0.0.0.0 실행 → Browser 미리보기
8. 체험 종료 → 예시 서술형 화면에서 타이핑 감각

## 과제 시간표
| 분 | 단계 | 할 일 | 스킬 |
|---|---|---|---|
| 0~3 | 설치 | Codex 에 주소 한 문장 → 승인 2번(clone·install.sh) → codex 재시작 | 프롬프트 0 |
| 3~15 | 파악 | 지시서 정독, 요구 등록, 담당자에게 구체적 질문 하나씩 | `$kickoff` `$interview` `$data-first-look` |
| 15~30 | 계획 | 설계안 비교 → 선택 → 슬라이스 → PLAN.md → 첫 커밋 | `$playbook` `$plan` |
| 30~130 | 구현 | 슬라이스마다 구현→검증→커밋. 긴 독립 작업은 위임. 100분에 필수 미완이면 가산 기능 버림 | `$build-slice` `$delegate` `$debug` |
| 130~155 | 검증 | 요구별 증거, 엣지 케이스, 교차 확인 | `$verify` |
| 155~170 | 정리 | 제출 문서, 사후 설명 대비, 핵심 코드 다시 읽기 | `$submit` `$explainback` |
| 170~ | 제출 | 저장 상태 확인 → 「제출하고 문제풀기」(미리보기, 일부 파일만 보임) → 「제출물 확정하고 문제풀기」(확정 뒤 수정 불가) | |

## 사전 체험에서 직접 본 것 (2026-10-31 0시대)
- **전체 화면을 벗어나면 기록된다.** 다른 창으로 2초 이동(스크린샷 도구 포함)에 「규정 위반 1회 — 평가자에게 전달」 경고가 떴다. 본시험에서는 캡처·창 전환을 하지 않는다.
- 설치: Codex 에 「github.com/Ryanpark3142/cofa-kit 을 README 대로 설치해줘」 → `git clone` 네트워크 승인 1번, `install.sh` 실행 승인 1번 → 성공. **저장소 이름을 틀리면 「GitHub 인증 필요」 로 실패한다**(체험 때 `cofa-kid` 오타). 주소는 그대로 쳐 넣는다.
- 작업 폴더는 홈(`~`). 그래서 훅은 설치되지 않았다(설계대로). MCP 탭에는 `{"mcpServers": {}}` 가 비어 있다.
- 기본 모델 표시 `GPT-6.1-Sol default`. `npm i -g @openai/codex` 는 EACCES 로 막힌다(Codex 업데이트 불가, 시도하지 않는다).
- Codex 샌드박스에서 외부 주소는 DNS 부터 안 된다(`curl developers.openai.com` → exit 6). 문서 조회에 기대지 않는다.
- Codex 가 확인한 제한: `~/.codex/config.toml` 수정 금지, **관리 포트 8090·8081·2222 사용 금지**, 앱은 다른 포트에 `0.0.0.0`, git push 금지.
- Cofa Helper 는 플랫폼 사용법만 답하고 과제 풀이·코드 리뷰는 하지 않는다.
- 확인 문제: 2문항, 문항당 약 3분 타이머, 복사·붙여넣기 불가, 시간이 끝나면 자동 확정, 이전 문항으로 못 돌아감. 1번 「체험 과제에서 구현한 서비스의 핵심 동작과 이를 확인한 방법을 설명해 주세요.」
- 상단 자원 표시는 `558M/16G`(공개 후기의 1.6GB 와 다름).

## 공개 후기에서 본 환경 (다른 응시자 저장소, 사전 체험 관찰. 본시험과 다를 수 있음)
- 작업 폴더는 홈(`/home/user`)이고 홈 자체가 git 저장소. 이때 install.sh 는 `~/.codex` 보호를 위해 훅을 설치하지 않는다.
- `python` 없음, `python3` 있음. Node 22·git 2.39 계열. 메모리 약 1.6GB.
- 서버 실행에 승인 창이 뜰 수 있고, 1024 미만 포트는 거부.
- 공개 저장소 clone 은 됨(승인이 필요할 수 있음). git push 는 막힘.
- 체험 서술형: 「만든 것이 무엇을 하며 어떻게 확인했나」, 「AI 제안을 어떻게 확인·수정했나」.
- 응시 메신저에는 Cofa Helper 없이 과제 담당자만 있을 수 있다(출처 불명확).

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
