# MCP

## cofa-kit MCP 서버 (포함, 의존성 없음)
`mcp/server.mjs` — stdio JSON-RPC. Node 만 있으면 된다. 작업 폴더는 `COFA_ROOT` 환경 변수, 없으면 현재 폴더에서 위로 `.cofa`/`.git` 을 찾는다.

MCP 는 선택이다. 같은 기능이 모두 `kit.mjs` 명령에 있고(사전 체험 때 MCP 탭은 비어 있었다), 규칙·스킬은 kit.mjs 를 기본으로 쓴다.

| 도구 | 하는 일 |
|---|---|
| `board` | 시간·요구·작업(탭)·마지막 증거·커밋 안 된 변경 한눈에 |
| `time_status` | 경과·남은 시간, 현재 단계와 할 일 |
| `log_work` | WORKLOG.md 에 시각과 한 줄 기록 |
| `log_decision` | DECISIONS.md 에 결정/버린 대안/이유/검증 |
| `req_upsert` | 요구사항 추가·상태 변경(REQUIREMENTS.md 갱신) |
| `req_list` | 요구사항 표 |
| `submission_check` | 제출 전 점검 |

### 등록 방법
- **IDE 의 MCP 탭**(JSON): `node .cofa/kit/scripts/kit.mjs mcp` 가 출력하는 블록(작업 폴더 절대 경로가 들어 있다)을 붙여 넣는다.
  ```json
  {
    "mcpServers": {
      "cofa-kit": {
        "command": "node",
        "args": ["/<작업폴더>/.cofa/kit/mcp/server.mjs"],
        "env": { "COFA_ROOT": "/<작업폴더>" },
        "default_tools_approval_mode": "approve"
      }
    }
  }
  ```
  `default_tools_approval_mode` 가 없으면 도구를 부를 때마다 승인이 필요하다. `codex exec`(비대화형)에서는 승인을 못 받아 호출이 전부 실패한다(codex-cli 0.164 실측: `approve` 는 성공, `auto` 는 실패). 값: `auto` `prompt` `writes` `approve`.
- **Codex config.toml** 형식이 필요하면:
  ```toml
  [mcp_servers.cofa-kit]
  command = "node"
  args = ["/<작업폴더>/.cofa/kit/mcp/server.mjs"]
  env = { COFA_ROOT = "/<작업폴더>" }
  default_tools_approval_mode = "approve"
  ```
  시험 환경에서는 `~/.codex/config.toml` 을 직접 고치지 말고 MCP 탭을 쓴다.
- **플러그인으로 설치**하면 `.mcp.json` 이 자동 등록된다(Codex 버전에 따라 다름).

### MCP 가 안 될 때
같은 기능이 터미널 명령으로 있다: `node .cofa/kit/scripts/kit.mjs board | status | req | run | commit | task | decision | log | check`. AGENTS.md·스킬은 이 명령을 기본으로 쓴다.

## 쓸 만한 공개 MCP (선택, 네트워크·npm 이 될 때만)
| 서버 | 용도 | 등록 예 |
|---|---|---|
| Context7 | 라이브러리 최신 문서 검색 | `"context7": {"command": "npx", "args": ["-y", "@upstash/context7-mcp"]}` |
| ~~Playwright~~ | **시험에서는 쓰지 않는다.** 「Computer Use(자동 조작) 전 단계 금지」 와 겹친다고 해석될 수 있고(원문에 Playwright 를 직접 가리키는 문장은 없음), 메모리도 작다. 웹 결과물은 `curl` + 사람이 Browser 탭에서 확인 | - |

- **외부 전송 주의**: Context7 는 질의를 외부 서버로 보낸다. 라이브러리 이름·API 질문만 보내고 과제 지시서·데이터·코드는 넣지 않는다. 시험에서는 「문제·파일·결과물 외부 전송 금지」 가 우선이다. 확신이 없으면 쓰지 않는다.
- Context7 는 첫 실행에 npm 다운로드가 필요하다. 사전 체험에서 `node .cofa/kit/scripts/kit.mjs env --net` 으로 npm 접근을 먼저 본다.
