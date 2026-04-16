# Band Cover AI Pipeline: AI 기반 악기별 영상 프레임 선별 시스템

- created_at: 2026-04-16T01:06:41.419Z
- knowledge_type: development-code

## Raw Text
유튜브 URL을 입력하면 yt-dlp로 영상을 자동 다운로드하고, 악기별 프레임을 AI가 분류·선별한다.

Step 1 (프레임 추출): yt-dlp로 YouTube URL에서 720p MP4 자동 다운로드 → ffmpeg로 5초 간격 프레임 추출(JPEG). 로컬 MP4 직접 입력도 지원.
Step 2 (스마트 선별): 4단계 필터링 파이프라인을 거침.
Pass 1: Laplacian Variance로 흐린 프레임 제거 (threshold: 50)
Pass 2: 밝기 필터 (25~230 범위 밖 제거)
Pass 3: SSIM 유사도 비교로 중복 프레임 제거 (threshold: 0.88)
Pass 4: Gemini 2.5 Flash Vision으로 악기 분류 — vocal(Gio🎤), guitar(Cora🎸), bass(Finn🎸), piano(Addy🎹), drums(Opie🥁), background(배경) 6개 카테고리로 분류. 품질 1~10점 채점 후 파트당 Best 5장 자동 선발.
후처리: Google Opal(Gems)에서 선별된 프레임 속 실제 밴드 멤버를 캐릭터(Gio, Cora, Addy, Opie, Finn)로 교체하는 3D 애니메이션 이미지 생성 워크플로우 연동.

Runtime: Node.js 20 (ESM), Express 5, Socket.io 4 (실시간 대시보드)
Image Processing: sharp (이미지 후처리, SSIM 계산, Laplacian 필터링)
Deployment: Docker (Node 20-Bullseye + Chromium + FFmpeg + CJK 폰트) → Google Cloud Run
대시보드: Express + Socket.io로 4/2단계 파이프라인 상태를 WebSocket 실시간 푸시, GlassMorphism UI
캐시 전략: 중간 산출물(JSON, 이미지)을 pipeline_output/band_output에 저장, 이미 완료된 단계는 자동 스킵 → API 비용 절감
원클릭 실행: node run_pipeline.js ./audio/recording.m4a / node run_band_pipeline.js "https://youtube.com/watch?v=..."
BandCoverAI.bat: 바탕화면 더블클릭으로 대시보드 서버 기동 + 브라우저 자동 열기

## Attachments
- 00_Raw/2026/04/16/source_src_20260416_c0400bd9/attachments/att_fb98b91.jpg (image/jpeg)