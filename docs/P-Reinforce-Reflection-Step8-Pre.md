# P-Reinforce Reflection: Step 8 Pre-Entry Corrections

> Date: 2026-04-15
> Scope: Critical issue correction + Step 8 Git Automation implementation

---

## Reflection Rule 준수 — 4대 질문 답변

### Q1. "이 proposal이 적용되면, 10년 뒤에도 원본 truth를 복원할 수 있는가?"

**Yes.** 에이전트의 신뢰 경계를 교정했습니다.

- 기존: `processWorkspaceAgentQueue()`가 propose+apply를 한 번에 실행 → proposal이 조용히 truth가 됨
- 교정: `P_REINFORCE_AGENT_MODE=manual` (기본값)에서는 propose만 수행하고 `pending_review` 상태로 큐에 남김
- 원본 raw 소스는 건드리지 않으며, wiki 노드는 인간 리뷰 후에만 생성됨

### Q2. "계약은 기계가 읽을 수 있는가?"

**Yes.** `job-queue.schema.json`에 `pending_review` status를 정식으로 추가했습니다.

- 계약 번들 검증 통과: `npm run verify:integrity` ✅
- 8개 스키마 모두 machine-valid

### Q3. "이 변경이 기존 동작을 깨트리는가?"

**No.**

- `P_REINFORCE_AGENT_MODE=auto`로 설정하면 기존 동작 100% 유지
- API Key 헤더 이동은 Gemini API의 공식 지원 방식
- 유틸리티 함수 추출은 re-export로 하위 호환 보장

### Q4. "이 코드는 왜 이렇게 결정했는가?"

문서화 완료:

- 에이전트 모드 분기: `includeApplyEvent` 파라미터로 명시적 제어
- Git checkpoint: knowledge roots 단위로 selective staging
- Push retry: exponential backoff 3회

---

## 발견된 Critical 이슈 & 교정 내역

| # | 이슈 | 심각도 | 교정 방법 | 검증 |
|---|---|---|---|---|
| 1 | 에이전트 propose+apply 한 번에 실행 | 🔴 Critical | manual/auto 모드 분기 + pending_review 상태 | ✅ 스키마 검증 통과 |
| 2 | API Key URL parameter 노출 | 🔴 Critical | `x-goog-api-key` 헤더로 이동 | ✅ 빌드 통과 |
| 3 | 유틸리티 함수 5개 중복 | 🟡 Major | `utils.js`로 추출 + re-export | ✅ 빌드 통과 |

---

## Step 8 구현 내역

| 구성 요소 | 파일 | 상태 |
|---|---|---|
| `executeGitCheckpoint()` | `server/p-reinforce/gitAutomation.js` | ✅ 구현 |
| `pushGitCheckpoint()` | `server/p-reinforce/gitAutomation.js` | ✅ 구현 |
| API 엔드포인트 | `api/git-checkpoint.js` | ✅ 신규 |
| 프론트엔드 서비스 | `src/lib/wikiNodeService.js` | ✅ 3개 함수 추가 |
| UI 버튼 + 결과 표시 | `src/App.jsx` GitReadinessCard | ✅ Checkpoint/Push 버튼 |

---

## 수정된 파일 목록

### 신규 생성
- `server/p-reinforce/utils.js` — 공통 유틸리티 5개
- `api/git-checkpoint.js` — Git 체크포인트 API

### 수정
- `server/p-reinforce/persistence.js` — utils import + re-export
- `server/p-reinforce/workspaceSnapshot.js` — utils import
- `server/p-reinforce/agent.js` — 신뢰 경계 교정 + utils import
- `server/p-reinforce/maintenance.js` — utils import
- `server/p-reinforce/proposalBuilder.js` — utils import
- `server/p-reinforce/gitAutomation.js` — executeGitCheckpoint + pushGitCheckpoint
- `contracts/job-queue.schema.json` — pending_review status
- `api/generate.js` — API Key 헤더 이동
- `src/lib/wikiNodeService.js` — Git 서비스 함수 3개
- `src/App.jsx` — GitReadinessCard 인터랙티브 UI
