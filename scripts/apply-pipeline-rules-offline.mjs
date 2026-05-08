import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const TARGET_DIR = '10_Wiki/Topics/Journal';
const WORKSPACE_ROOT = process.cwd();

// 파이프라인 생성 규칙 (SYSTEM_PROMPT_TEMPLATE)을 준수한 3-Tier 태그 체계 및 기존 그래프 노드
// Domain (분야), Pattern (패턴), Entity (개체 및 기존 노드)
const strictPipelineRules = [
  {
    keywords: ['철학', '니체', '가치관', '본질', '초인', '실존'],
    tags: [
      'node_domain_philosophy',
      'node_pattern_mental-model',
      'node_topic_modern-definition-of-ubermensch'
    ]
  },
  {
    keywords: ['바보', '순수', '미련', '진심', '착하게', '착한'],
    tags: [
      'node_domain_philosophy',
      'node_topic_foolishness-philosophy'
    ]
  },
  {
    keywords: ['adhd', '집중', '산만', '전두엽', '몰입'],
    tags: [
      'node_domain_psychology',
      'node_pattern_habit-engineering',
      'node_topic_adhd',
      'node_topic_adhd-work-efficiency'
    ]
  },
  {
    keywords: ['mbti', 't성향', 'f성향', '공감', '성향', '성격'],
    tags: [
      'node_domain_psychology',
      'node_topic_mbti',
      'node_topic_rethinking-thinking-personality-type'
    ]
  },
  {
    keywords: ['사회', '영향력', '선행', '기여', '봉사', '이타적'],
    tags: [
      'node_domain_philosophy',
      'node_pattern_social-impact',
      'node_topic_social-impact-small-steps'
    ]
  },
  {
    keywords: ['비즈니스', '창업', '투자', '자본주의', '점포', '수익', '매출', '마케팅'],
    tags: [
      'node_domain_business-strategy',
      'node_pattern_critical-thinking'
    ]
  },
  {
    keywords: ['사랑', '연인', '이별', '감정', '마음', '외로움', '그대', '배려'],
    tags: [
      'node_domain_psychology',
      'node_pattern_emotional-intelligence'
    ]
  },
  {
    keywords: ['성장', '목표', '반성', '후회', '도전', '용기', '극복', '초심'],
    tags: [
      'node_domain_self-development',
      'node_pattern_mental-model'
    ]
  },
  {
    keywords: ['음악', '노래', '기타', '건반', '연기', '배우', '무대', '예술'],
    tags: [
      'node_domain_art'
    ]
  },
  {
    keywords: ['운동', '클라이밍', '헬스', '데드리프트', '근육', '하체', '건강'],
    tags: [
      'node_domain_health',
      'node_pattern_habit-engineering'
    ]
  },
  {
    keywords: ['기록', '일기', '메모'],
    tags: [
      'node_pattern_habit-engineering'
    ]
  }
];

function applyStrictPipelineRules() {
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

    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) continue;

    const frontmatter = match[1];
    const body = match[2];
    const textToAnalyze = body.toLowerCase();

    // 항상 유지되는 코어 정체성 노드
    const validTags = new Set(['node_topic_hongsam-identity-core']);

    // 1. 파이프라인 규칙에 따른 매칭 스캔
    for (const rule of strictPipelineRules) {
      for (const kw of rule.keywords) {
        if (textToAnalyze.includes(kw.toLowerCase())) {
          rule.tags.forEach(t => validTags.add(t));
          break; 
        }
      }
    }

    // 2. 기존 frontmatter에서 related 항목을 찾아 깨끗하게 교체
    // (이전 스크립트로 잘못 들어간 의미없는 태그들을 제거하고 파이프라인 준수 태그로 덮어쓰기)
    const relatedRegex = /related:\n((?:  - ".*"\n?)*)/;
    
    // 만약 파이프라인 규칙을 통과한 태그가 있다면 업데이트
    if (validTags.size > 0) {
      const newRelatedStr = 'related:\n' + Array.from(validTags).map(t => `  - "${t}"`).join('\n') + '\n';
      
      let newFrontmatter;
      if (relatedRegex.test(frontmatter)) {
        newFrontmatter = frontmatter.replace(relatedRegex, newRelatedStr);
      } else {
        // 혹시 related가 없는 경우 대비 (보통은 존재함)
        newFrontmatter = frontmatter + '\n' + newRelatedStr;
      }

      const newContent = `---\n${newFrontmatter}\n---\n${body}`;
      
      // 파일이 실제로 변경되었을 때만 쓰기
      if (content !== newContent) {
        writeFileSync(filePath, newContent, 'utf-8');
        updatedCount++;
        totalTagsAdded += validTags.size;
      }
    }
  }

  console.log(`\n✅ 파이프라인 3-Tier 태그 규칙 & 기존 Graph 연동 완료!`);
  console.log(`  - 분석 파일: ${files.length}개`);
  console.log(`  - 재구조화된 파일: ${updatedCount}개`);
  console.log(`  - 주입된 정규화 태그(Domain/Pattern/Entity) 누적 수: ${totalTagsAdded}개`);
}

applyStrictPipelineRules();
