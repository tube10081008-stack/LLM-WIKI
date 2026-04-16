---
id: "node_skill_band-cover-ai-pipeline"
schema_version: 1
node_type: "skill"
title: "Band Cover AI Pipeline: AI 기반 악기별 영상 프레임 선별 시스템"
status: "draft"
confidence_score: 0.92
created_at: "2026-04-16"
updated_at: "2026-04-16"
last_reinforced: "2026-04-16"
category_path: "10_Wiki/Skills/Development"
source_refs:
  - "src_20260416_c0400bd9"
related:
  - "node_topic_ai-vision"
  - "node_topic_pipeline-automation"
  - "node_topic_container-deployment"
  - "node_topic_media-processing"
contradicts: []
policy_version: 1
---

# [[Band Cover AI Pipeline: AI 기반 악기별 영상 프레임 선별 시스템]]

## 📌 한 줄 통찰 (The Karpathy Summary)
> 유튜브 URL 혹은 로컬 영상을 입력받아 **yt-dlp**와 **FFmpeg**로 프레임을 추출하고, **4단계 필터링 파이프라인**과 **Gemini 2.5 Flash Vision** AI를 통해 악기별(보컬, 기타, 베이스, 피아노, 드럼) 최적의 프레임을 자동 선별하는 시스템입니

## 📖 구조화된 지식 (Synthesized Content)
#### 핵심 요약
유튜브 URL 혹은 로컬 영상을 입력받아 **yt-dlp**와 **FFmpeg**로 프레임을 추출하고, **4단계 필터링 파이프라인**과 **Gemini 2.5 Flash Vision** AI를 통해 악기별(보컬, 기타, 베이스, 피아노, 드럼) 최적의 프레임을 자동 선별하는 시스템입니다.

#### 추출 포인트
##### 1. 4단계 스마트 필터링 파이프라인 (sharp 활용)
- **Pass 1 (Blur):** Laplacian Variance 알고리즘으로 흐릿한 프레임(임계값 50 미만) 제거
- **Pass 2 (Brightness):** 밝기 분포가 25~230 범위를 벗어나는 프레임 제거
- **Pass 3 (Similarity):** SSIM(Structural Similarity Index) 0.88 이상인 중복 프레임 제거
- **Pass 4 (AI Classification):** Gemini 2.5 Flash Vision으로 6개 카테고리 분류 및 점수화, 파트별 Best 5 선정

##### 2. 기술 스택 및 배포 인프라
- **Runtime:** Node.js 20 (ESM), Express 5, Socket.io 4 (실시간 진행 상황 대시보드)
- **Infra:** Docker (FFmpeg, Chromium 포함) 기반 Google Cloud Run 배포
- **Automation:** `BandCoverAI.bat` 파일을 통한 윈도우 바탕화면 원클릭 실행 지원

##### 3. 캐릭터 변환 워크플로우
- 선별된 프레임 데이터를 Google Opal(Gems)과 연동하여 실제 인물을 사전에 정의된 5인조 캐릭터(Gio, Cora, Finn, Addy, Opie)로 교체하는 3D 애니메이션 생성 프로세스 수행

#### 다음 액션
- [ ] Gemini API 호출 비용 절감을 위한 로컬 경량 모델(CLIP 등) 대체 테스트
- [ ] 3D 캐릭터 생성 워크플로우(Google Opal)의 API 자동화 연동 확인
- [ ] 대시보드 UI의 GlassMorphism 스타일 고도화 및 실시간 로그 뷰어 추가

## ⚠️ 모순 및 업데이트 (Contradictions & RL Update)
- 과거 데이터와의 충돌: 아직 명시된 충돌 문서가 없습니다.
- 정책 변화: 현재는 사용자 피드백 루프가 연결되기 전의 초안 상태입니다.

## 🔗 지식 연결 (Graph)
- Parent: [[Development]]
- Related: [[AI-Vision]], [[Pipeline-Automation]], [[Container-Deployment]], [[Media-Processing]]
- Raw Source: [[00_Raw/2026/04/16/source_src_20260416_c0400bd9/source]]