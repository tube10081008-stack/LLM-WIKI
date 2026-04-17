---
id: "node_skill_image-generation-analysis-framework"
schema_version: 1
node_type: "skill"
title: "이미지 생성 분석 마스터 프롬프트 프레임워크"
status: "draft"
confidence_score: 0.8
created_at: "2026-04-17"
updated_at: "2026-04-17"
last_reinforced: "2026-04-17"
category_path: "10_Wiki/Skills/Image-Prompts"
source_refs:
  - "src_20260417_384199b9"
related:
  - "node_topic_untitled"
contradicts: []
policy_version: 1
---

# [[이미지 생성 분석 마스터 프롬프트 프레임워크]]

## 📌 한 줄 통찰 (The Karpathy Summary)
> 이 프레임워크는 원본 이미지를 다각도(제품 상세, 카메라 구도, 환경 맥락, 조명 및 분위기)에서 체계적으로 분석하여 구조화된 JSON 데이터로 변환하기 위한 마스터 프롬프트입니다. 이는 AI 모델이 이미지의 시각적 요소를 정밀하게 이해하고 일관성 있는 이미지 생성을 위한 '프롬프트 역

## 📖 구조화된 지식 (Synthesized Content)
#### 핵심 요약
이 프레임워크는 원본 이미지를 다각도(제품 상세, 카메라 구도, 환경 맥락, 조명 및 분위기)에서 체계적으로 분석하여 구조화된 JSON 데이터로 변환하기 위한 마스터 프롬프트입니다. 이는 AI 모델이 이미지의 시각적 요소를 정밀하게 이해하고 일관성 있는 이미지 생성을 위한 '프롬프트 역설계'를 가능하게 합니다.

#### 추출 포인트
- **구조적 데이터화**: 비정형 이미지 정보를 제품 카테고리, 재질, 색상, 형태, 텍스트 등 명확한 속성값으로 분류합니다.
- **기술적 촬영 요소**: 단순 묘사를 넘어 카메라의 각도(Angle)와 구도(Composition)를 전문 용어 기반으로 식별합니다.
- **환경 및 시각 효과**: 배경 컨셉, 바닥 재질, 소품뿐만 아니라 연기나 빛 번짐과 같은 비가시적/특수 효과까지 포착합니다.
- **감성적 메타데이터**: 조명의 종류와 그림자의 대비 정도를 파악하여 전체적인 톤앤매너(Mood)를 정의합니다.

#### 다음 액션
1. 해당 JSON 구조를 GPT-4o나 Gemini 1.5 Pro 등 멀티모달 모델의 시스템 프롬프트로 설정하여 테스트를 진행합니다.
2. 추출된 데이터를 스테이블 디퓨전(Stable Diffusion)이나 미드저니(Midjourney)의 입력 프롬프트로 변환하는 템플릿을 설계합니다.
3. 분석된 결과물을 기반으로 일관된 브랜드 이미지를 생성하기 위한 가이드라인을 수립합니다.

## ⚠️ 모순 및 업데이트 (Contradictions & RL Update)
- 과거 데이터와의 충돌: 아직 명시된 충돌 문서가 없습니다.
- 정책 변화: 현재는 사용자 피드백 루프가 연결되기 전의 초안 상태입니다.

## 🔗 지식 연결 (Graph)
- Parent: [[Image Prompts]]
- Related: [[이미지-텍스트 변환 전략]], [[시각 콘텐츠 분류 체계]]
- Raw Source: [[00_Raw/2026/04/17/source_src_20260417_384199b9/source]]