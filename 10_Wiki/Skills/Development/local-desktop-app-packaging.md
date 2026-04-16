---
id: "node_skill_untitled"
schema_version: 1
node_type: "skill"
title: "로컬 서버 데스크톱 앱 패키징 기법"
status: "draft"
confidence_score: 0.8
created_at: "2026-04-16"
updated_at: "2026-04-16"
last_reinforced: "2026-04-16"
category_path: "10_Wiki/Skills/Development"
source_refs:
  - "src_20260416_38a27acc"
related:
  - "node_topic_developer-experience"
  - "node_topic_desktop-automation"
  - "node_topic_pwa"
  - "node_topic_local-dev-environment"
contradicts: []
policy_version: 1
---

# [[로컬 서버 데스크톱 앱 패키징 기법]]

## 📌 한 줄 통찰 (The Karpathy Summary)
> 이 기법은 Node.js 기반의 로컬 웹 서비스를 터미널 조작 없이 바탕화면 아이콘 하나로 실행 가능하도록 데스크톱 네이티브 앱처럼 패키징하는 자동화 방법론입니다. PWA 설정, 배치 스크립트, 그리고 커스텀 아이콘 바로가기 생성을 결합하여 사용자 경험을 극대화합니다.

## 📖 구조화된 지식 (Synthesized Content)
#### 핵심 요약
이 기법은 Node.js 기반의 로컬 웹 서비스를 터미널 조작 없이 바탕화면 아이콘 하나로 실행 가능하도록 데스크톱 네이티브 앱처럼 패키징하는 자동화 방법론입니다. PWA 설정, 배치 스크립트, 그리고 커스텀 아이콘 바로가기 생성을 결합하여 사용자 경험을 극대화합니다.

#### 추출 포인트

##### 1. PWA(Progressive Web App) 위장술
- **목적**: 브라우저의 주소창과 탭을 제거하여 독립적인 앱 윈도우(Standalone 모드) 느낌을 부여합니다.
- **필수 요소**: `public` 폴더 내 `manifest.json`, `sw.js` 및 표준 규격 아이콘(192px, 512px).

##### 2. Batch 매크로 스크립트(.bat) 설계
- **백그라운드 실행**: `start /min cmd /c "npm run dev"`를 통해 서버 구동 터미널을 최소화 상태로 실행합니다.
- **지연 처리**: `timeout /t 3`을 사용하여 서버가 완전히 가동될 시간을 확보합니다.
- **앱 모드 런칭**: `start chrome --app=http://localhost:5173/` 명령어로 크롬의 UI를 숨긴 채 웹앱을 호출합니다.

##### 3. PowerShell 기반 바로가기(.lnk) 커스터마이징
- **아이콘 입히기**: 배치 파일의 톱니바퀴 아이콘 대신 고유한 `.ico` 파일을 적용하기 위해 `WScript.Shell`을 사용합니다.
- **사용자 인터페이스 완성**: 최종적으로 바탕화면에 고퀄리티 아이콘의 실행 파일이 생성되어 네이티브 앱과 동일한 진입점을 제공합니다.

#### 다음 액션
- [ ] `manifest.json` 기본 템플릿 작성 및 프로젝트 적용
- [ ] 윈도우 환경 테스트용 `.bat` 자동 생성 스크립트 모듈화
- [ ] PowerShell을 이용한 아이콘 자동 매핑 스크립트 테스트

## ⚠️ 모순 및 업데이트 (Contradictions & RL Update)
- 과거 데이터와의 충돌: 아직 명시된 충돌 문서가 없습니다.
- 정책 변화: 현재는 사용자 피드백 루프가 연결되기 전의 초안 상태입니다.

## 🔗 지식 연결 (Graph)
- Parent: [[Development]]
- Related: [[Developer-Experience]], [[Desktop-Automation]], [[PWA]], [[Local-Dev-Environment]]
- Raw Source: [[00_Raw/2026/04/16/source_src_20260416_38a27acc/source]]