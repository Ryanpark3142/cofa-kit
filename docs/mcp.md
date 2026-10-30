# MCP

## cofa-kit MCP 서버 (포함, 의존성 없음)
`mcp/server.mjs` — stdio JSON-RPC. Node 만 있으면 된다. 작업 폴더는 `COFA_ROOT` 환경 변수, 없으면 현재 폴더에서 위로 `.cofa`/`.git` 을 찾는다.

| 도구 | 하는 일 |
|---|---|
| `time_status` | 경과·남은 시간, 현재 단계와 할 일 |
| `log_work` | WORKLOG.md 에 시각과 한 줄 기록 |
| `log_decision` | DECISIONS.md 에 결정/버린 대안/이유/검증 |
| `req_upsert` | 요구사항 추가·상태 변경(REQUIREMENTS.md 갱신) |
| `req_list` | 요구사항 표 |
| `submission_check` | 제출 전 점검 |

### 등록 방법
- **IDE 의 MCP 탭**(JSON): `install.sh` 가 출력하는 블록을 붙여 넣는다.
  ```json
  {
    "mcpServers": {
      "cofa-kit": {
        "command": "node",
        "args": ["/<작업폴더>/.cofa/kit/mcp/server.mjs"],
        "env": { "COFA_ROOT": "/<작업폴더>" }
      }
    }
  }
  ```
- **Codex config.toml** 형식이 필요하면:
  ```toml
  [mcp_servers.cofa-kit]
  command = "node"
  args = ["/<작업폴더>/.cofa/kit/mcp/server.mjs"]
  env = { COFA_ROOT = "/<작업폴더>" }
  ```
  시험 환경에서는 `~/.codex/config.toml` 을 직접 고치지 말고 MCP 탭을 쓴다.
- **플러그인으로 설치**하면 `.mcp.json` 이 자동 등록된다(Codex 버전에 따라 다름).

### MCP 가 안 될 때
같은 기능이 터미널 명령으로 있다: `node .cofa/kit/scripts/kit.mjs status | log | decision | req | check`. AGENTS.md 도 이 명령을 대안으로 안내한다.

## 쓸 만한 공개 MCP (선택, 네트워크·npm 이 될 때만)
| 서버 | 용도 | 등록 예 |
|---|---|---|
| Context7 | 라이브러리 최신 문서 검색 | `"context7": {"command": "npx", "args": ["-y", "@upstash/context7-mcp"]}` |
| Playwright | 브라우저로 웹 결과물 자동 확인 | `"playwright": {"command": "npx", "args": ["-y", "@playwright/mcp@latest", "--headless"]}` |

- 둘 다 첫 실행에 npm 다운로드가 필요하다. 사전 체험에서 `npm ping` 이 되는지 먼저 본다(`kit.mjs env`).
- Playwright 는 브라우저 설치가 필요해 메모리를 많이 쓴다. 우측 상단 RAM 을 보고, 부족하면 `curl` 확인 + 사람이 Browser 탭에서 확인하는 쪽이 낫다.
