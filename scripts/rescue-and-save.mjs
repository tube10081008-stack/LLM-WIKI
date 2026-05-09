/**
 * 짧은 노트 중 개인 키워드가 포함된 노트를 구출하여 Wiki Node로 생성
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import TurndownService from 'turndown';

const ENEX_FILES = ['일기.enex', '일기2.enex'];
const OUTPUT_DIR = '10_Wiki/Topics/Journal';
const MIN_CONTENT_LENGTH = 80; // 원래 기준
const WORKSPACE_ROOT = process.cwd();

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
turndown.remove(['style', 'script', 'meta']);

function parseEnexNotes(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const noteRegex = /<note>([\s\S]*?)<\/note>/g;
  const notes = [];
  let match;
  while ((match = noteRegex.exec(content)) !== null) {
    const noteXml = match[1];
    const title = (noteXml.match(/<title>(.*?)<\/title>/s) || [])[1]?.trim() || '';
    const created = (noteXml.match(/<created>(.*?)<\/created>/s) || [])[1]?.trim() || '';
    const contentMatch = noteXml.match(/<content>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/content>/);
    const htmlContent = contentMatch ? contentMatch[1] : '';
    notes.push({ title, created, htmlContent });
  }
  return notes;
}

function htmlToPlainText(html) {
  return html.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p|li|ul|ol|h[1-6]|blockquote)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#[0-9]+;/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

const rescueKeywords = [
  '나는', '내가', '나의', '나를', '내 ', '나한테',
  '사랑', '가족', '엄마', '아빠', '형', '동생', '친구',
  '감정', '마음', '기분', '행복', '슬프', '화가', '외로',
  '꿈', '목표', '다짐', '결심', '후회', '반성',
  '감사', '고마', '미안', '죄송',
  '인생', '삶', '성장', '깨달',
  'ADHD', '집중', '몰입',
  '자존감', '정체성', '가치관',
  '힘들', '지치', '포기', '극복', '도전', '용기',
  '일기', '오늘', '어제',
];

function parseEvernoteDate(dateStr) {
  if (!dateStr || dateStr.length < 8) return null;
  return { year: dateStr.substring(0,4), month: dateStr.substring(4,6), day: dateStr.substring(6,8), iso: `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}` };
}

function generateSlug(title, date) {
  const datePrefix = date ? `${date.year}${date.month}${date.day}` : 'undated';
  const cleaned = title.replace(/[^\w\s가-힣a-zA-Z0-9-]/g, '').trim().substring(0, 40);
  const shortTitle = cleaned.substring(0, 20).replace(/\s+/g, '-');
  return `diary-${datePrefix}-${shortTitle || 'rescued'}`;
}

// 기존 파일 목록 로드 (중복 방지)
const existingFiles = new Set();
try {
  const dir = path.resolve(WORKSPACE_ROOT, OUTPUT_DIR);
  const { readdirSync } = await import('node:fs');
  readdirSync(dir).forEach(f => existingFiles.add(f));
} catch {}

const allNotes = [];
for (const file of ENEX_FILES) {
  try { allNotes.push(...parseEnexNotes(file)); } catch {}
}

let rescued = 0;
for (const note of allNotes) {
  const plainText = htmlToPlainText(note.htmlContent);
  
  // 원래 기준에서 제거된 짧은 노트만 대상
  if (plainText.length >= MIN_CONTENT_LENGTH || plainText.length < 10) continue;
  
  const combined = `${note.title} ${plainText}`;
  const hits = rescueKeywords.filter(kw => combined.includes(kw));
  
  // 개인 키워드가 1개 이상 있는 노트만 구출
  if (hits.length === 0) continue;
  
  const date = parseEvernoteDate(note.created);
  if (!date) continue;
  
  let slug = generateSlug(note.title, date);
  const fileName = `${slug}.md`;
  
  // 이미 존재하면 스킵
  if (existingFiles.has(fileName)) continue;
  
  // 고유 슬러그 보장
  let counter = 1;
  let uniqueFileName = fileName;
  while (existingFiles.has(uniqueFileName)) {
    uniqueFileName = `${slug}-${counter++}.md`;
  }
  existingFiles.add(uniqueFileName);

  const nodeId = `node_topic_${slug}`;
  const title = note.title.trim() || `${date.iso} 짧은 기록`;
  
  let markdown;
  try { markdown = turndown.turndown(note.htmlContent); } catch { markdown = plainText; }

  const fileContent = `---
id: "${nodeId}"
schema_version: 1
node_type: "topic"
title: "${title.replace(/"/g, '\\"')}"
status: "draft"
confidence_score: 0.5
created_at: "${date.iso}"
updated_at: "${date.iso}"
last_reinforced: "${date.iso}"
category_path: "10_Wiki/Topics/Journal"
source_refs:
  - "src_enex_rescue_${date.year}${date.month}${date.day}"
related:
  - "node_topic_hongsam-identity-core"
contradicts: []
policy_version: 1
---

# [[${title}]]

## 📌 한 줄 통찰 (The Karpathy Summary)
> ${plainText.replace(/\n/g, ' ').trim()}

## 📖 구조화된 지식 (Synthesized Content)
${markdown}

## ⚠️ 모순 및 업데이트 (Contradictions & RL Update)
- 에버노트 짧은 기록 구출(rescue) 마이그레이션으로 생성되었습니다.
- 짧지만 홍삼의 가치관/감정이 담긴 기록입니다.
- 원본 작성일: ${date.iso}
`;

  writeFileSync(path.join(WORKSPACE_ROOT, OUTPUT_DIR, uniqueFileName), fileContent, 'utf-8');
  rescued++;
}

console.log(`\n🆘 구출 완료: ${rescued}개 짧은 노트 → Wiki Node로 추가 생성!`);
