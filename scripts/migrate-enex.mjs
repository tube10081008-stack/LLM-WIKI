/**
 * ENEX → LLM Wiki 일기 마이그레이션 스크립트
 * 
 * 목적: 에버노트 일기 데이터에서 '홍삼'의 개인적 기록만 선별하여
 *       10_Wiki/Topics/Journal/ 에 정규 Wiki Node로 변환합니다.
 * 
 * 필터링 기준:
 *   - 50자 미만의 짧은 메모 제거
 *   - 제목 없는 노트, 숫자만 있는 노트 제거
 *   - URL만 있는 스크랩 노트 제거
 *   - 개인적 생각/감정/일기/회고 내용만 선별
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import TurndownService from 'turndown';

// ─── 설정 ───
const ENEX_FILES = ['일기.enex', '일기2.enex'];
const OUTPUT_DIR = '10_Wiki/Topics/Journal';
const MIN_CONTENT_LENGTH = 80;  // 최소 80자 이상
const WORKSPACE_ROOT = process.cwd();

// ─── HTML → Markdown 변환기 ───
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

// 불필요한 태그 제거
turndown.remove(['style', 'script', 'meta']);

// ─── ENEX 파서 ───
function parseEnexNotes(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const noteRegex = /<note>([\s\S]*?)<\/note>/g;
  const notes = [];
  let match;

  while ((match = noteRegex.exec(content)) !== null) {
    const noteXml = match[1];
    const title = extractTag(noteXml, 'title') || '';
    const created = extractTag(noteXml, 'created') || '';
    const updated = extractTag(noteXml, 'updated') || '';
    
    // content는 CDATA 안에 HTML이 들어있음
    const contentMatch = noteXml.match(/<content>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/content>/);
    const htmlContent = contentMatch ? contentMatch[1] : '';
    
    notes.push({ title, created, updated, htmlContent });
  }

  return notes;
}

function extractTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 's'));
  return match ? match[1].trim() : null;
}

// ─── 날짜 변환 ───
function parseEvernoteDate(dateStr) {
  if (!dateStr || dateStr.length < 8) return null;
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return { year, month, day, iso: `${year}-${month}-${day}` };
}

// ─── HTML → 순수 텍스트 (필터링용) ───
function htmlToPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p|li|ul|ol|h[1-6]|blockquote|table|tr|td|th)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#[0-9]+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── 필터링 로직 ───
function isPersonalContent(title, plainText) {
  const combined = `${title} ${plainText}`.toLowerCase();
  
  // ❌ 제거 대상
  const skipPatterns = [
    /^#$/,                          // 제목이 '#'만
    /^제목 없는 노트$/,              // 제목 없음
    /^[0-9\s\-().+]+$/,             // 전화번호/숫자만
    /^https?:\/\//,                 // URL로 시작
    /^untitled/i,
  ];
  
  if (skipPatterns.some(p => p.test(title.trim()))) {
    // 제목이 의미없어도 내용이 풍부하면 살림
    if (plainText.length < 150) return false;
  }

  // ❌ 스크랩/링크 모음 제거
  const urlCount = (plainText.match(/https?:\/\/[^\s]+/g) || []).length;
  const textWithoutUrls = plainText.replace(/https?:\/\/[^\s]+/g, '').trim();
  if (urlCount > 3 && textWithoutUrls.length < 100) return false;

  // ❌ 너무 짧은 내용
  if (plainText.length < MIN_CONTENT_LENGTH) return false;

  // ✅ 개인적 내용 키워드 (가중치 부여)
  const personalKeywords = [
    '나는', '내가', '나의', '나를', '내 ', '나한테',
    '오늘', '어제', '내일', '이번 주', '요즘',
    '느끼', '느낀', '생각', '고민', '걱정', '불안', '행복', '기쁘', '슬프', '화가', '짜증',
    '감사', '감정', '마음', '기분', '느낌',
    '반성', '후회', '다짐', '결심', '목표', '계획', '꿈',
    '회고', '회상', '추억', '기억',
    '사랑', '가족', '친구', '엄마', '아빠', '형', '동생',
    '일기', '일상', '하루', '아침', '저녁', '밤',
    '성장', '배우', '배운', '깨달', '교훈', '인생', '삶',
    '힘들', '지치', '포기', '극복', '도전', '용기',
    'ADHD', '집중', '산만', '몰입',
    '감정노동', '직장', '퇴사', '이직',
    '자존감', '자신감', '정체성', '가치관',
  ];

  const personalScore = personalKeywords.filter(kw => combined.includes(kw)).length;
  
  // 개인 키워드 2개 이상이면 무조건 포함
  if (personalScore >= 2) return true;
  
  // 개인 키워드 1개 + 내용 풍부하면 포함
  if (personalScore >= 1 && plainText.length >= 200) return true;

  // 내용이 500자 이상으로 매우 풍부하면 포함 (에세이/회고일 확률)
  if (plainText.length >= 500) return true;

  return false;
}

// ─── 슬러그 생성 ───
function generateSlug(title, date) {
  const datePrefix = date ? `${date.year}${date.month}${date.day}` : 'undated';
  const cleaned = title
    .replace(/[^\w\s가-힣a-zA-Z0-9-]/g, '')
    .trim()
    .substring(0, 40);
  
  // 한글 제목 → 날짜 기반 슬러그
  const hasKorean = /[가-힣]/.test(cleaned);
  if (hasKorean) {
    const shortTitle = cleaned.substring(0, 20).replace(/\s+/g, '-');
    return `diary-${datePrefix}-${shortTitle}`;
  }
  
  return `diary-${datePrefix}-${cleaned.replace(/\s+/g, '-').toLowerCase()}`;
}

// ─── Frontmatter 생성 ───
function buildFrontmatter({ id, title, date, slug }) {
  return `---
id: "${id}"
schema_version: 1
node_type: "topic"
title: "${title.replace(/"/g, '\\"')}"
status: "draft"
confidence_score: 0.6
created_at: "${date.iso}"
updated_at: "${date.iso}"
last_reinforced: "${date.iso}"
category_path: "10_Wiki/Topics/Journal"
source_refs:
  - "src_enex_migration_${date.year}${date.month}${date.day}"
related:
  - "node_topic_hongsam-identity-core"
contradicts: []
policy_version: 1
---`;
}

// ─── 메인 실행 ───
function main() {
  const allNotes = [];

  for (const file of ENEX_FILES) {
    const filePath = path.resolve(WORKSPACE_ROOT, file);
    if (!existsSync(filePath)) {
      console.log(`⚠️ 파일 없음: ${file}`);
      continue;
    }
    const notes = parseEnexNotes(filePath);
    console.log(`📂 ${file}: ${notes.length}개 파싱 완료`);
    allNotes.push(...notes);
  }

  console.log(`\n📊 전체 파싱: ${allNotes.length}개`);

  // 필터링
  const filtered = [];
  const rejected = { tooShort: 0, notPersonal: 0, duplicate: 0 };
  const seenTitles = new Set();

  for (const note of allNotes) {
    const plainText = htmlToPlainText(note.htmlContent);
    
    // 중복 제거 (같은 제목 + 비슷한 날짜)
    const dedupeKey = `${note.title.trim()}_${(note.created || '').substring(0, 8)}`;
    if (seenTitles.has(dedupeKey)) {
      rejected.duplicate++;
      continue;
    }
    seenTitles.add(dedupeKey);

    if (plainText.length < MIN_CONTENT_LENGTH) {
      rejected.tooShort++;
      continue;
    }

    if (!isPersonalContent(note.title, plainText)) {
      rejected.notPersonal++;
      continue;
    }

    filtered.push({ ...note, plainText });
  }

  console.log(`\n🔍 필터링 결과:`);
  console.log(`  ✅ 선별됨: ${filtered.length}개`);
  console.log(`  ❌ 너무 짧음: ${rejected.tooShort}개`);
  console.log(`  ❌ 개인 내용 아님: ${rejected.notPersonal}개`);
  console.log(`  ❌ 중복: ${rejected.duplicate}개`);

  // 출력 디렉토리 생성
  const outputPath = path.resolve(WORKSPACE_ROOT, OUTPUT_DIR);
  mkdirSync(outputPath, { recursive: true });

  // Wiki Node 파일 생성
  let created = 0;
  const slugSet = new Set();

  for (const note of filtered) {
    const date = parseEvernoteDate(note.created);
    if (!date) continue;

    let slug = generateSlug(note.title, date);
    
    // 슬러그 중복 방지
    let counter = 1;
    let uniqueSlug = slug;
    while (slugSet.has(uniqueSlug)) {
      uniqueSlug = `${slug}-${counter++}`;
    }
    slug = uniqueSlug;
    slugSet.add(slug);

    const nodeId = `node_topic_${slug}`;
    const title = note.title.trim() || `${date.iso} 일기`;

    // HTML → Markdown
    let markdown;
    try {
      markdown = turndown.turndown(note.htmlContent);
    } catch {
      markdown = note.plainText;
    }

    // 최종 파일 내용 조립
    const frontmatter = buildFrontmatter({ id: nodeId, title, date, slug });
    const body = `# [[${title}]]

## 📌 한 줄 통찰 (The Karpathy Summary)
> ${note.plainText.substring(0, 120).replace(/\n/g, ' ').trim()}

## 📖 구조화된 지식 (Synthesized Content)
${markdown}

## ⚠️ 모순 및 업데이트 (Contradictions & RL Update)
- 에버노트 일기 마이그레이션으로 생성된 원본 기록입니다.
- 원본 작성일: ${date.iso}
- 향후 [[hongsam-identity-core]] 노드와의 연결 강화가 필요합니다.
`;

    const fileContent = `${frontmatter}\n\n${body}`;
    const filePath = path.join(outputPath, `${slug}.md`);

    writeFileSync(filePath, fileContent, 'utf-8');
    created++;
  }

  console.log(`\n✨ 생성 완료: ${created}개 Wiki Node → ${OUTPUT_DIR}/`);
  console.log(`📁 경로: ${outputPath}`);
}

main();
