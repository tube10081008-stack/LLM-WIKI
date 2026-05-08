/**
 * 이미 생성된 Journal 위키 노드들에 대해,
 * 텍스트 내용을 기반으로 동적인(Semantic) 태그(related)를 주입하는 스크립트.
 * API 비용 없이 오프라인에서 키워드 매칭을 통해 지식 그래프 연결성을 확보합니다.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const TARGET_DIR = '10_Wiki/Topics/Journal';
const WORKSPACE_ROOT = process.cwd();

// 키워드 -> 태그 매핑 룰 (홍삼의 가치관과 보편적 개념어 기반)
const tagRules = [
  { 
    tags: ['node_topic_adhd', 'node_topic_adhd-work-efficiency'], 
    keywords: ['adhd', '집중', '산만', '충동', '몰입', '전두엽'] 
  },
  { 
    tags: ['node_topic_philosophy', 'node_topic_life-values'], 
    keywords: ['철학', '니체', '삶의', '가치관', '본질', '사상', '이타적', '실존'] 
  },
  { 
    tags: ['node_topic_love-and-relationships', 'node_topic_emotional-intelligence'], 
    keywords: ['사랑', '연인', '감정', '이별', '공감', '배려', '관계', '외로움', '그대'] 
  },
  { 
    tags: ['node_topic_health-and-fitness'], 
    keywords: ['운동', '클라이밍', '헬스', '건강', '데드리프트', '스쿼트', '근육', '하체', '어깨', '등운동'] 
  },
  { 
    tags: ['node_topic_business-and-investment', 'node_topic_entrepreneurship'], 
    keywords: ['비즈니스', '창업', '투자', '수익', '플랫폼', '자본주의', '마케팅', '매출', '점포'] 
  },
  { 
    tags: ['node_topic_personal-growth', 'node_topic_self-reflection'], 
    keywords: ['성장', '목표', '다짐', '반성', '회고', '계획', '실패', '극복', '도전', '용기', '초심'] 
  },
  { 
    tags: ['node_topic_family-and-roots'], 
    keywords: ['가족', '엄마', '아빠', '부모님', '동생', '형', '어머니', '아버지'] 
  },
  { 
    tags: ['node_topic_social-impact-small-steps'], 
    keywords: ['사회', '영향력', '선행', '기여', '연대', '세상'] 
  },
  { 
    tags: ['node_topic_foolishness-philosophy'], 
    keywords: ['우직함', '바보', '순수', '미련', '진심'] 
  },
  { 
    tags: ['node_topic_art-and-music', 'node_topic_expression'], 
    keywords: ['음악', '예술', '노래', '독창', '밴드', '기타', '건반', '공연', '연기', '배우', '대사', '표현'] 
  },
  {
    tags: ['node_topic_career-and-work'],
    keywords: ['직장', '퇴사', '업무', '회사', '출근', '퇴근', '이력서', '면접', '커리어']
  }
];

function injectDynamicTags() {
  const dirPath = path.resolve(WORKSPACE_ROOT, TARGET_DIR);
  let files = [];
  try {
    files = readdirSync(dirPath).filter(f => f.endsWith('.md'));
  } catch (e) {
    console.error('디렉토리 읽기 실패:', e);
    return;
  }

  let updatedCount = 0;
  let totalTagsAdded = 0;

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const content = readFileSync(filePath, 'utf-8');

    // 1. 기존 frontmatter와 body 분리
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) continue;

    const frontmatter = match[1];
    const body = match[2];

    // 2. 본문 내용에서 키워드 매칭하여 태그 추출
    const textToAnalyze = body.toLowerCase();
    const newTags = new Set();
    // 기본 태그 유지
    newTags.add('node_topic_hongsam-identity-core');

    for (const rule of tagRules) {
      for (const kw of rule.keywords) {
        if (textToAnalyze.includes(kw.toLowerCase())) {
          rule.tags.forEach(t => newTags.add(t));
          break; // 해당 룰에서 하나라도 매칭되면 태그 추가 후 다음 룰로
        }
      }
    }

    // 3. 기존 related 섹션 파싱 및 업데이트
    const relatedRegex = /related:\n((?:  - ".*"\n?)*)/;
    const relatedMatch = frontmatter.match(relatedRegex);
    
    if (relatedMatch) {
      // 기존 태그들도 세트에 포함 (중복 자동 제거)
      const existingLines = relatedMatch[1].split('\n').map(l => l.trim()).filter(l => l.startsWith('- "'));
      existingLines.forEach(line => {
        const tag = line.replace(/- "/, '').replace(/"$/, '');
        newTags.add(tag);
      });

      // 태그가 1개(hongsam-identity-core)를 초과하는 경우만 업데이트 (새로운 태그가 추가된 경우)
      if (newTags.size > 1) {
        const newRelatedStr = 'related:\n' + Array.from(newTags).map(t => `  - "${t}"`).join('\n') + '\n';
        const newFrontmatter = frontmatter.replace(relatedRegex, newRelatedStr);
        const newContent = `---\n${newFrontmatter}\n---\n${body}`;
        
        writeFileSync(filePath, newContent, 'utf-8');
        updatedCount++;
        totalTagsAdded += (newTags.size - 1); // 추가된 태그 수
      }
    }
  }

  console.log(`\n🎉 태그 동적 주입 완료!`);
  console.log(`  - 총 분석된 파일: ${files.length}개`);
  console.log(`  - 태그가 확장된 파일: ${updatedCount}개`);
  console.log(`  - 총 추가된 의미론적(Semantic) 태그 수: ${totalTagsAdded}개`);
}

injectDynamicTags();
