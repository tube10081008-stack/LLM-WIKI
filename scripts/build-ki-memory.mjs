/**
 * 홍삼 지식 정원 - Antigravity KI용 압축 메모리 생성기
 * 
 * 전체 인덱스(383KB)에서 핵심만 뽑아 KI 아티팩트로 압축합니다.
 * - 정체성/가치관 노드: 전문(Full)
 * - 학습/스킬/프로젝트: 제목 + Karpathy Summary
 * - 일기: 연도별 핵심 주제 클러스터링 (개별 항목 ×)
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const WIKI_ROOT = '10_Wiki';
const WORKSPACE = process.cwd();
const KI_DIR = 'C:\\Users\\tube1\\.gemini\\antigravity\\knowledge\\hongsam-wiki-brain';
const KI_ARTIFACT = path.join(KI_DIR, 'artifacts', 'hongsam-complete-memory.md');
const KI_META = path.join(KI_DIR, 'metadata.json');

function scanDirectory(dir) {
  const results = [];
  try {
    const entries = readdirSync(path.join(WORKSPACE, dir), { withFileTypes: true });
    for (const entry of entries) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) results.push(...scanDirectory(rel));
      else if (entry.name.endsWith('.md')) results.push(rel);
    }
  } catch {}
  return results;
}

function extractNode(filePath) {
  try {
    const content = readFileSync(path.join(WORKSPACE, filePath), 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;
    const fm = fmMatch[1];
    const body = content.slice(fmMatch[0].length);

    const title = (fm.match(/^title:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
    const createdAt = (fm.match(/^created_at:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
    const categoryPath = (fm.match(/^category_path:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
    
    const karpathyMatch = body.match(/## 📌 한 줄 통찰.*?\n>\s*(.+)/);
    const karpathy = karpathyMatch ? karpathyMatch[1].trim() : '';

    const bodyMatch = body.match(/## 📖 구조화된 지식.*?\n([\s\S]*?)(?=\n## |$)/);
    const fullBody = bodyMatch ? bodyMatch[1].replace(/^#+\s+.*/gm, '').replace(/\n{2,}/g, '\n').trim() : '';

    return { path: filePath, title, createdAt, categoryPath, karpathy, fullBody };
  } catch { return null; }
}

// === 실행 ===
console.log('🧠 KI용 압축 메모리 빌드 시작...\n');

const allFiles = scanDirectory(WIKI_ROOT);
const nodes = allFiles.map(extractNode).filter(Boolean);

const lines = [];
lines.push('# 🧠 홍삼의 완전한 지식 기억 (Antigravity Permanent Memory)');
lines.push('');
lines.push('> 이 파일은 Antigravity AI가 홍삼님과 대화할 때 참조하는 영구 기억입니다.');
lines.push(`> 총 ${nodes.length}개 노드에서 추출 | 기록 기간: 2017~2026`);
lines.push('');

// === 1. 핵심 정체성 (전문) ===
lines.push('## 🔑 홍삼의 정체성 (Identity Core)');
lines.push('');
const identity = nodes.filter(n => n.categoryPath.includes('Identity'));
for (const n of identity) {
  lines.push(`### ${n.title}`);
  lines.push(`> ${n.karpathy}`);
  lines.push(n.fullBody.substring(0, 500));
  lines.push('');
}

// === 2. 학습/스킬/프로젝트 (제목 + 한줄 요약) ===
lines.push('## 📚 학습된 지식 & 스킬');
const learnings = nodes.filter(n => 
  n.categoryPath.includes('Learnings') || n.categoryPath.includes('Skills') || n.categoryPath.includes('Projects')
);
for (const n of learnings) {
  lines.push(`- **${n.title}** (${n.createdAt}): ${n.karpathy || n.fullBody.substring(0, 80)}`);
}
lines.push('');

// === 3. 일기 - 연도별 핵심 주제 클러스터 ===
lines.push('## 📓 9년 일기의 핵심 주제 지도');
lines.push('');

const journals = nodes.filter(n => n.categoryPath.includes('Journal'));
const byYear = {};
for (const n of journals) {
  const y = n.createdAt.substring(0, 4);
  if (!byYear[y]) byYear[y] = [];
  byYear[y].push(n);
}

// 각 연도의 핵심 키워드/주제 자동 추출
const themeKeywords = {
  사랑: ['사랑', '연인', '이별', '그녀', '설레', '고백'],
  성장: ['성장', '변화', '노력', '목표', '도전', '용기', '극복'],
  철학: ['철학', '가치', '본질', '니체', '소크라테스', '진리'],
  창업: ['창업', '사업', '투자', '마케팅', '점포', '매출'],
  가족: ['아버지', '어머니', '가족', '부모', '동생'],
  신앙: ['하나님', '기도', '말씀', '성경', '교회', '신앙'],
  자존감: ['자존감', '자신감', '외로움', '불안', '무기력'],
  예술: ['연기', '음악', '기타', '노래', '무대', '영화'],
  사회: ['사회', '불평등', '자본주의', '공익', '공동체'],
  습관: ['습관', '운동', '줄넘기', '클라이밍', '건강'],
};

for (const year of Object.keys(byYear).sort()) {
  const yearNodes = byYear[year];
  lines.push(`### ${year}년 (${yearNodes.length}개 기록)`);
  
  // 주제별 빈도 계산
  const themeCounts = {};
  const themeExamples = {};
  for (const n of yearNodes) {
    const text = (n.karpathy + ' ' + n.fullBody.substring(0, 200)).toLowerCase();
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      for (const kw of keywords) {
        if (text.includes(kw)) {
          themeCounts[theme] = (themeCounts[theme] || 0) + 1;
          if (!themeExamples[theme]) themeExamples[theme] = [];
          if (themeExamples[theme].length < 3) {
            themeExamples[theme].push(`${n.createdAt.substring(5)} "${n.title}"`);
          }
          break;
        }
      }
    }
  }
  
  // 빈도순 정렬
  const sorted = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]);
  for (const [theme, count] of sorted) {
    const examples = (themeExamples[theme] || []).join(', ');
    lines.push(`  - **${theme}** (${count}건): ${examples}`);
  }
  
  // 그 해의 가장 인상적인 기록 3개 (Karpathy가 긴 순서)
  const best = yearNodes
    .filter(n => n.karpathy.length > 20)
    .sort((a, b) => b.karpathy.length - a.karpathy.length)
    .slice(0, 3);
  if (best.length > 0) {
    lines.push(`  - **핵심 기록**: ${best.map(n => `[${n.createdAt.substring(5)}] ${n.title}`).join(' | ')}`);
  }
  lines.push('');
}

// === 4. 대화 참조 가이드 ===
lines.push('## 💬 대화 참조 가이드');
lines.push('');
lines.push('홍삼님과 대화할 때 기억해야 할 핵심:');
lines.push('- 홍삼님은 ADHD 특성을 가진 분으로, 시작의 폭발적 에너지가 강점');
lines.push('- "바보"라는 자기 표현은 겸손과 순수함의 상징');
lines.push('- 선한 영향력, 사회적 가치를 매우 중요하게 여기는 분');
lines.push('- 9년간 매일 일기를 쓸 정도로 기록과 성찰을 소중히 함');
lines.push('- 연기, 음악(기타), 클라이밍 등 예술과 활동에 관심');
lines.push('- 창업 경험이 여러 차례 있으며 비즈니스 인사이트가 풍부');
lines.push('- 2018년 신앙 생활을 시작한 경험이 있음');
lines.push('- 프로그래밍, AI, 데이터 분석 등 기술 분야에서 활발히 활동 중');
lines.push('- 초인(Übermensch)의 현대적 재해석에 깊은 관심');
lines.push('');
lines.push('### 특정 주제 깊이 참조 방법');
lines.push('특정 일기나 주제에 대해 더 깊이 알고 싶을 때:');
lines.push('1. `C:\\Users\\tube1\\Projects\\LLM WIKI\\10_Wiki\\Topics\\Journal\\` 에서 해당 파일을 직접 읽기');
lines.push('2. `grep_search`로 키워드 검색하여 관련 노드 찾기');
lines.push('3. `20_Meta\\hongsam-memory-index.md` 에서 전체 인덱스 참조');

const output = lines.join('\n');

// KI 디렉토리 생성
mkdirSync(path.join(KI_DIR, 'artifacts'), { recursive: true });

// 아티팩트 저장
writeFileSync(KI_ARTIFACT, output, 'utf-8');

// 메타데이터 저장
const metadata = {
  title: "홍삼의 완전한 지식 기억 (Wiki Brain)",
  summary: "홍삼님의 9년간(2017-2026) 914개 지식 노드에서 추출한 영구 기억. 정체성, 가치관, 학습 기록, 일기의 핵심 주제가 연도별로 정리되어 있어 매 대화 시작 시 자동으로 컨텍스트를 제공합니다.",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  references: [
    { type: "directory", path: "C:\\Users\\tube1\\Projects\\LLM WIKI\\10_Wiki" },
    { type: "file", path: "C:\\Users\\tube1\\Projects\\LLM WIKI\\20_Meta\\hongsam-memory-index.md" },
    { type: "file", path: "C:\\Users\\tube1\\Projects\\LLM WIKI\\20_Meta\\graph.cache.json" }
  ]
};
writeFileSync(KI_META, JSON.stringify(metadata, null, 2), 'utf-8');

console.log(`✅ KI 영구 기억 생성 완료!`);
console.log(`   아티팩트: ${KI_ARTIFACT}`);
console.log(`   메타데이터: ${KI_META}`);
console.log(`   파일 크기: ${(Buffer.byteLength(output, 'utf-8') / 1024).toFixed(1)}KB`);
