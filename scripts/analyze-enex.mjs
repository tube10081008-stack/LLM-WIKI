import { readFileSync } from 'node:fs';

const files = ['일기.enex', '일기2.enex'];

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf-8');
    const titleMatches = [...content.matchAll(/<title>(.*?)<\/title>/gs)];
    const dateMatches = [...content.matchAll(/<created>(.*?)<\/created>/gs)];
    
    console.log(`\n========== ${file} ==========`);
    console.log(`총 노트 수: ${titleMatches.length}`);
    
    // 날짜 범위
    const dates = dateMatches.map(m => m[1]).sort();
    if (dates.length) {
      console.log(`날짜 범위: ${dates[0]} ~ ${dates[dates.length - 1]}`);
    }
    
    // 처음 10개 샘플
    console.log(`\n--- 처음 10개 ---`);
    for (let i = 0; i < Math.min(10, titleMatches.length); i++) {
      const title = titleMatches[i][1].trim();
      const date = dateMatches[i]?.[1] ?? '?';
      console.log(`  [${date}] ${title}`);
    }
    
    // 마지막 5개 샘플
    console.log(`\n--- 마지막 5개 ---`);
    for (let i = Math.max(0, titleMatches.length - 5); i < titleMatches.length; i++) {
      const title = titleMatches[i][1].trim();
      const date = dateMatches[i]?.[1] ?? '?';
      console.log(`  [${date}] ${title}`);
    }
    
    // 제목 길이 통계
    const lengths = titleMatches.map(m => m[1].trim().length);
    const shortTitles = lengths.filter(l => l <= 3).length;
    const longTitles = lengths.filter(l => l > 10).length;
    console.log(`\n--- 제목 통계 ---`);
    console.log(`  제목 3자 이하 (짧은 제목): ${shortTitles}개 (${(shortTitles/lengths.length*100).toFixed(1)}%)`);
    console.log(`  제목 10자 초과 (긴 제목): ${longTitles}개 (${(longTitles/lengths.length*100).toFixed(1)}%)`);
    
    // 내용 길이 분석 (HTML 태그 제거 후)
    const contentMatches = [...content.matchAll(/<content>([\s\S]*?)<\/content>/g)];
    const contentLengths = contentMatches.map(m => {
      const text = m[1].replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
      return text.length;
    });
    const veryShort = contentLengths.filter(l => l < 50).length;
    const medium = contentLengths.filter(l => l >= 50 && l < 300).length;
    const long = contentLengths.filter(l => l >= 300).length;
    
    console.log(`\n--- 내용 길이 분류 ---`);
    console.log(`  매우 짧음 (<50자): ${veryShort}개 (${(veryShort/contentLengths.length*100).toFixed(1)}%) ← 필터 대상`);
    console.log(`  보통 (50~300자): ${medium}개 (${(medium/contentLengths.length*100).toFixed(1)}%)`);
    console.log(`  풍부함 (300자+): ${long}개 (${(long/contentLengths.length*100).toFixed(1)}%) ← 가치 높음`);
    
  } catch (err) {
    console.error(`${file} 읽기 실패:`, err.message);
  }
}
