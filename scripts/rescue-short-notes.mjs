/**
 * 제거된 "짧은 노트" 250개를 재검사하여 개인적으로 중요한 내용이 있는지 확인
 */

import { readFileSync } from 'node:fs';

const ENEX_FILES = ['일기.enex', '일기2.enex'];
const MIN_CONTENT_LENGTH = 80;

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
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p|li|ul|ol|h[1-6]|blockquote|table|tr|td|th)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#[0-9]+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 개인적으로 중요할 수 있는 키워드
const rescueKeywords = [
  '나는', '내가', '나의', '나를', '내 ',
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

const allNotes = [];
for (const file of ENEX_FILES) {
  try {
    allNotes.push(...parseEnexNotes(file));
  } catch (e) {
    console.error(`${file} 읽기 실패:`, e.message);
  }
}

// 짧은 노트만 추출
const shortNotes = [];
for (const note of allNotes) {
  const plainText = htmlToPlainText(note.htmlContent);
  if (plainText.length < MIN_CONTENT_LENGTH && plainText.length > 0) {
    const keywordHits = rescueKeywords.filter(kw => 
      `${note.title} ${plainText}`.includes(kw)
    );
    shortNotes.push({
      title: note.title,
      created: note.created,
      plainText,
      length: plainText.length,
      keywordHits,
      score: keywordHits.length,
    });
  }
}

// 키워드 점수 순으로 정렬
shortNotes.sort((a, b) => b.score - a.score || b.length - a.length);

// 결과 출력
console.log(`\n🔍 제거된 짧은 노트 총: ${shortNotes.length}개\n`);

// 개인 키워드가 있는 노트들
const hasPersonal = shortNotes.filter(n => n.score > 0);
const noPersonal = shortNotes.filter(n => n.score === 0);

console.log(`\n==============================`);
console.log(`⚠️ 개인 키워드 포함 (구출 후보): ${hasPersonal.length}개`);
console.log(`==============================\n`);

for (const note of hasPersonal) {
  const date = note.created ? `${note.created.substring(0,4)}-${note.created.substring(4,6)}-${note.created.substring(6,8)}` : '?';
  console.log(`📌 [${date}] "${note.title}" (${note.length}자)`);
  console.log(`   키워드: ${note.keywordHits.join(', ')}`);
  console.log(`   내용: ${note.plainText.substring(0, 120).replace(/\n/g, ' ')}`);
  console.log('');
}

console.log(`\n==============================`);
console.log(`🗑️ 개인 키워드 없음 (안전하게 제거): ${noPersonal.length}개`);
console.log(`==============================\n`);

// 키워드 없는 것 중에서도 내용이 있는 상위 20개만 표시
for (const note of noPersonal.slice(0, 20)) {
  const date = note.created ? `${note.created.substring(0,4)}-${note.created.substring(4,6)}-${note.created.substring(6,8)}` : '?';
  console.log(`  [${date}] "${note.title}" (${note.length}자) → ${note.plainText.substring(0, 60).replace(/\n/g, ' ')}`);
}
if (noPersonal.length > 20) {
  console.log(`  ... 외 ${noPersonal.length - 20}개 (전부 의미 없는 메모/링크/숫자)`);
}
