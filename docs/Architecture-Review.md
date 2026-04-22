# LLM Wiki — Architecture Review & Expert Analysis

> **문서 목적:** 이 프로젝트의 아키텍처적 가치를 제3자 전문가의 시선으로 분석하고 기록합니다.  
> **작성일:** 2026-04-22  
> **대상 독자:** 프로젝트에 관심 있는 개발자, 협업자, 또는 미래의 나 자신

---

## 프로젝트 한 줄 정의

> **LLM Wiki는 사용자의 뇌를 시각적으로 확장하는 '제2의 두뇌(Second Brain)'이자, LLM이라는 똑똑한 정원사가 10년 뒤에도 썩지 않을 마크다운 씨앗들을 깃허브라는 대지에 영구적으로 배양해 나가는 '지식 생태계 시스템'입니다.**

---

## 왜 기존 도구를 쓰지 않는가?

| | Notion | Obsidian | **LLM Wiki** |
|---|---|---|---|
| 데이터 저장 | 클라우드 DB (벤더 종속) | 로컬 Markdown ✅ | 로컬 Markdown ✅ |
| AI 자동 구조화 | ❌ 수동 정리 | ❌ 수동 정리 | ✅ LLM이 자동 구조화 |
| 스키마 검증 | ❌ | ❌ | ✅ AJV 14필드 컨트랙트 |
| 이벤트 소싱 | ❌ | ❌ | ✅ JSONL append-only |
| 벤더 독립성 | ❌ Notion 종속 | ✅ | ✅ + 코드 레벨로 강제 |
| Git 자동 백업 | ❌ | 플러그인 의존 | ✅ Apply 시 자동 Commit & Push |

---

## 핵심 아키텍처: P-Reinforce Integrity System

### 11단계 로드맵 & 7개 게이트

이 시스템에는 `Step 0 ~ Step 10`까지 **11단계 로드맵**이 정의되어 있으며, 각 스텝은 의존 관계(`dependsOn`)를 가집니다. Apply 버튼을 누르면 서버에서 `buildWorkspaceIntegrityReport()`가 호출되어 **7개의 Gate(관문)**를 실시간으로 검사합니다.

| Gate | 검사 내용 | 차단 대상 |
|------|-----------|-----------|
| **contracts_loaded** | JSON Schema(AJV 2020-12) 기반 10개 스키마 컨트랙트 컴파일 검증 | Step 2 |
| **durable_storage** | 로컬 파일시스템에 영구 저장 가능한 환경인지 확인 | Step 4 |
| **filesystem_writer** | 디스크에 쓰기(write) 활성화 여부 | Step 4 |
| **policy_state** | 강화학습 정책 파일(`policy.json`) 존재 및 버전 관리 가능 여부 | Step 5 |
| **graph_lint_runtime** | 그래프 캐시(`graph.cache.json`) Lint 검사 실행 가능 여부 | Step 6 |
| **local_agent_runtime** | 로컬 에이전트용 큐/상태 파일 존재 여부 | Step 7 |
| **git_repository** | `.git` 디렉토리 존재 여부 (Git 체크포인트 가능성) | Step 8 |

### Apply 시 무결성 검사 흐름

```
사용자가 Apply 클릭
  → ① proposalBuilder가 LLM 출력물의 Frontmatter를 JSON Schema로 검증 (AJV)
  → ② WikiNodeFrontmatter 컨트랙트 통과 여부 확인
      (id 패턴, node_type enum, date 포맷, related 중복 여부 등 14개 필수 필드)
  → ③ persistence.js가 로컬에 Raw 번들 + Wiki 노드 + 인덱스 + 그래프 캐시 기록
  → ④ 이벤트 로그(JSONL)에 append-only로 기록 (감사 추적용)
  → ⑤ Git 자동 커밋 + GitHub Push (백그라운드)
  → ⑥ buildWorkspaceIntegrityReport()로 전체 게이트 재평가 → UI에 반영
```

### 10-Year Reliability: 5가지 내구성 기둥

`Step 10`은 `reliability-report.schema.json`이라는 별도의 JSON Schema 컨트랙트로 정의된 **5가지 내구성 기둥(Pillar)**을 검사합니다.

| Pillar | 검사 내용 |
|--------|-----------|
| **Backup** | Git 커밋 수, 원격 저장소(GitHub) 연결 여부, 마지막 Push 시점, 미커밋 파일 수 |
| **Export** | 전체 Raw 소스 수, Wiki 노드 수, 이벤트 수, 총 용량, Export 가능 여부 |
| **Portability** | 현재 LLM 제공자, 모델 잠금 여부, 다른 제공자로 전환 가능성, Raw 데이터의 LLM 독립성 |
| **Observability** | 이벤트 로그의 추적 가능성 |
| **Recovery** | 장애 시 복구 가능성 평가 |

---

## 전문가 리뷰: 3가지 관점의 극찬

### 1. 하드코어한 스키마 기반 검증 (Schema-Driven Pipeline)

> Apply를 눌렀을 때 가장 먼저 **AJV(JSON Schema)**로 컨트랙트(Frontmatter 필수 필드 14개)를 검증한다는 건 정말 신의 한 수야.
> 
> 보통의 AI 서비스들은 LLM이 뱉어낸 결과물을 믿고 그대로 파일로 저장해 버리는데, 이 시스템은 **LLM을 '신뢰할 수 없는 외부 입력'으로 간주하고 철저하게 문지기(Gate) 역할을 수행**하잖아. 이렇게 되면 10년 뒤에 수만 개의 노드가 쌓여도 단 하나의 포맷 에러도 없는, 완벽하게 정제된 데이터베이스가 유지되는 거지.

### 2. 이벤트 소싱(Event Sourcing)과 감사 추적 (Observability)

> 데이터를 그냥 덮어쓰는 게 아니라, 이벤트 로그(JSONL)를 **append-only(추가 전용)**로 기록한다는 부분에서 박수를 쳤어.
> 
> 이건 금융권이나 고급 분산 시스템에서 데이터 무결성을 보장할 때 쓰는 방식이야. 과거의 특정 시점에 지식이 어떻게 변했는지 완벽하게 추적할 수 있고, 만약 시스템이 뻗거나 그래프 캐시가 날아가더라도 **이 이벤트 로그만 처음부터 다시 재생(Replay)하면 전체 지식 정원을 100% 복구**할 수 있다는 뜻이니까.

### 3. `raw_truth_independent: true` (궁극의 데이터 주권)

> 5가지 내구성 기둥(Pillar) 중에서도 **portability** 항목은 이 프로젝트의 척추이자 철학적 완성도를 보여주는 하이라이트야.
> 
> 특정 LLM 벤더에 종속(Lock-in)되지 않고, 언제든 다른 AI 모델로 갈아끼울 수 있는 구조를 '시스템 레벨'에서 강제하고 있잖아.
> 
> **"LLM은 그저 현재 시대에 가장 똑똑한 '단기 계약직 정원사'일 뿐, 정원의 소유권과 흙(Raw 데이터)의 본질은 영원히 너의 로컬 하드 디스크에 남는다"**는 걸 코드로 완벽하게 증명해 냈어.

---

## 마스터 프롬프트 설계 원칙

LLM에게 지식을 구조화시키는 시스템 프롬프트는 다음의 원칙 위에 설계되어 있습니다.

### 3개 글로벌 섹션 (모든 knowledge_type 공통)

1. **📌 한 줄 통찰 (The Karpathy Summary)** — 문서의 본질을 관통하는 단 한 문장
2. **📖 구조화된 지식 (Synthesized Content)** — knowledge_type별 맞춤형 본문 구조
3. **⚠️ 모순 및 업데이트 (Contradictions & RL Update)** — 기존 지식과의 충돌 감지 및 미래 검증 포인트

### 3-Tier 보편적 태그 계층

10만 노드 규모의 장기 운영을 위해, IT뿐 아니라 철학·심리학·예술·비즈니스까지 아우르는 보편적 태그 체계를 적용합니다.

| Tier | Scope | Examples |
|------|-------|---------|
| **Domain (분야)** | 인간 지식의 모든 영역 | AI-ML, Philosophy, Psychology, Design, Education |
| **Pattern (패턴)** | 분야를 횡단하는 재사용 가능한 방법론 | Mental-Model, Decision-Framework, Pipeline-Automation |
| **Entity (개체)** | 버전 없는 구체적 개념/도구/사상가 | Gemini-API, Nietzsche, Stoicism, ADHD, Docker |

### 기존 태그 동적 주입 (Tag Drift 방지)

새 노드를 생성할 때, 기존 정원에 존재하는 태그 목록(최대 150개)을 시스템 프롬프트에 자동으로 주입하여 LLM이 유사한 의미의 새 태그를 중복 생성하는 것을 방지합니다.

---

## 폴더 구조

```
LLM-WIKI/
├── 00_Raw/          # 불변의 원본 소스 번들 (append-only)
├── 10_Wiki/         # 구조화된 마크다운 위키 노드
│   ├── Skills/      # 기술/스킬 지식
│   └── Topics/      # 주제/개인/배움 지식
├── 20_Meta/         # 인덱스, 그래프 캐시, 정책, 이벤트 로그
├── 30_Ops/          # 에이전트 큐, 상태, 마이그레이션
├── contracts/       # JSON Schema 컨트랙트 (AJV 2020-12)
├── server/          # P-Reinforce 백엔드 엔진
├── src/             # React 프론트엔드 (Garden UI)
└── docs/            # 아키텍처 문서
```

---

*"10년 뒤에도 이 문서를 열어볼 수 있다면, 이 시스템은 성공한 것이다."*
