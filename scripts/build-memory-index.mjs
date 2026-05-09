/**
 * 홍삼의 지식 정원 메모리 인덱스 생성기
 * 
 * 모든 마크다운 노드에서 핵심 정보(제목, 날짜, 한 줄 통찰, 태그)를 추출하여
 * Antigravity Knowledge Item용 컴팩트 인덱스를 생성합니다.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const WIKI_ROOT = '10_Wiki';
const WORKSPACE = process.cwd();
const OUTPUT_FILE = path.join(WORKSPACE, '20_Meta', 'hongsam-memory-index.md');

function scanDirectory(dir) {
  const results = [];
  try {
    const entries = readdirSync(path.join(WORKSPACE, dir), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        results.push(...scanDirectory(relativePath));
      } else if (entry.name.endsWith('.md')) {
        results.push(relativePath);
      }
    }
  } catch {}
  return results;
}

function extractNodeInfo(filePath) {
  try {
    const content = readFileSync(path.join(WORKSPACE, filePath), 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    const fm = fmMatch[1];
    
    const title = (fm.match(/^title:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
    const nodeType = (fm.match(/^node_type:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
    const createdAt = (fm.match(/^created_at:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
    const categoryPath = (fm.match(/^category_path:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
    
    // related 태그 추출
    const relatedMatch = fm.match(/related:\n((?:\s+- ".*"\n?)*)/);
    const related = relatedMatch 
      ? relatedMatch[1].split('\n').map(l => l.trim().replace(/^- "/, '').replace(/"$/, '')).filter(Boolean)
      : [];

    // 한 줄 통찰 (Karpathy Summary) 추출
    const karpathyMatch = content.match(/## 📌 한 줄 통찰.*?\n>\s*(.+)/);
    const karpathy = karpathyMatch ? karpathyMatch[1].trim() : '';

    // 본문 핵심 (첫 200자)
    const bodyMatch = content.match(/## 📖 구조화된 지식.*?\n([\s\S]*?)(?=\n## |$)/);
    let bodySnippet = '';
    if (bodyMatch) {
      bodySnippet = bodyMatch[1]
        .replace(/^#+\s+.*/gm, '') // 하위 헤딩 제거
        .replace(/\n{2,}/g, ' ')
        .trim()
        .substring(0, 200);
    }

    return {
      path: filePath,
      title,
      nodeType,
      createdAt,
      categoryPath,
      related,
      karpathy,
      bodySnippet
    };
  } catch {
    return null;
  }
}

// === 실행 ===
console.log('🧠 홍삼의 지식 정원 메모리 인덱스 빌드 시작...\n');

const allFiles = scanDirectory(WIKI_ROOT);
const nodes = allFiles.map(extractNodeInfo).filter(Boolean);

// 카테고리별 분류
const byCategory = {};
for (const node of nodes) {
  const cat = node.categoryPath || 'Uncategorized';
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(node);
}

// 날짜순 정렬
for (const cat of Object.keys(byCategory)) {
  byCategory[cat].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// === 인덱스 파일 생성 ===
const lines = [];

lines.push('# 🧠 홍삼의 지식 정원 메모리 인덱스');
lines.push('');
lines.push(`> 이 인덱스는 ${nodes.length}개의 지식 노드에서 자동 추출되었습니다.`);
lines.push(`> 생성 시각: ${new Date().toISOString()}`);
lines.push('');

// 통계
lines.push('## 📊 정원 통계');
lines.push(`- 총 노드 수: ${nodes.length}`);
for (const [cat, catNodes] of Object.entries(byCategory)) {
  lines.push(`  - ${cat}: ${catNodes.length}개`);
}

const years = [...new Set(nodes.map(n => n.createdAt.substring(0, 4)).filter(Boolean))].sort();
lines.push(`- 기록 기간: ${years[0] || '?'} ~ ${years[years.length - 1] || '?'}`);
lines.push('');

// === 핵심 정체성 노드 (전문) ===
lines.push('## 🔑 핵심 정체성 노드');
const identityNodes = nodes.filter(n => 
  n.categoryPath.includes('Identity') || 
  n.title.includes('홍삼') ||
  n.title.includes('정체성')
);
for (const node of identityNodes) {
  lines.push(`### ${node.title} (${node.createdAt})`);
  lines.push(`> ${node.karpathy}`);
  if (node.bodySnippet) lines.push(`${node.bodySnippet}`);
  lines.push('');
}

// === 학습/성장 노드 ===
lines.push('## 📚 학습 및 성장 기록');
const learningNodes = nodes.filter(n => 
  n.categoryPath.includes('Learnings') || n.categoryPath.includes('Skills')
);
for (const node of learningNodes) {
  lines.push(`- **${node.title}** (${node.createdAt}): ${node.karpathy || node.bodySnippet.substring(0, 80)}`);
}
lines.push('');

// === 프로젝트 노드 ===
lines.push('## 🚀 프로젝트');
const projectNodes = nodes.filter(n => n.categoryPath.includes('Projects'));
for (const node of projectNodes) {
  lines.push(`- **${node.title}** (${node.createdAt}): ${node.karpathy || node.bodySnippet.substring(0, 80)}`);
}
lines.push('');

// === 일기 노드 (연도별 요약) ===
lines.push('## 📓 일기 기록 (연도별 요약)');
const journalNodes = nodes.filter(n => n.categoryPath.includes('Journal'));
const journalByYear = {};
for (const node of journalNodes) {
  const year = node.createdAt.substring(0, 4);
  if (!journalByYear[year]) journalByYear[year] = [];
  journalByYear[year].push(node);
}

for (const year of Object.keys(journalByYear).sort()) {
  const yearNodes = journalByYear[year];
  lines.push(`### ${year}년 (${yearNodes.length}개 기록)`);
  
  // 각 노드의 핵심 한 줄만 추출
  for (const node of yearNodes) {
    const month = node.createdAt.substring(5, 7);
    const day = node.createdAt.substring(8, 10);
    const summary = node.karpathy || node.bodySnippet.substring(0, 60);
    if (summary) {
      lines.push(`- [${month}/${day}] **${node.title}**: ${summary.substring(0, 100)}`);
    }
  }
  lines.push('');
}

// === 전체 노드 빠른 검색용 인덱스 ===
lines.push('## 🔍 전체 노드 인덱스 (빠른 검색용)');
for (const node of nodes) {
  const tags = node.related.filter(r => !r.includes('hongsam-identity')).join(', ');
  lines.push(`- ${node.createdAt} | ${node.title} | ${tags}`);
}

const output = lines.join('\n');
writeFileSync(OUTPUT_FILE, output, 'utf-8');

console.log(`✅ 메모리 인덱스 생성 완료!`);
console.log(`   파일: ${OUTPUT_FILE}`);
console.log(`   노드 수: ${nodes.length}`);
console.log(`   파일 크기: ${(Buffer.byteLength(output, 'utf-8') / 1024).toFixed(1)}KB`);
