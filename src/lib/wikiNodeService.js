export const GEMINI_MODEL =
  import.meta.env?.VITE_GEMINI_MODEL ?? 'gemini-3-flash-preview';

export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_DIMENSION = 1600;
export const MAX_ATTACHMENT_PREVIEW_BYTES = 4_000_000;

export const KNOWLEDGE_TYPES = [
  {
    value: 'personal-identity',
    label: '나의 정체성',
    description: '성격, 취향, 가치관, 경험, 목표를 구조화합니다.',
  },
  {
    value: 'daily-reflection',
    label: '일상 생각',
    description: '감정, 관찰, 아이디어, 일기를 기록합니다.',
  },
  {
    value: 'learning-log',
    label: '배움 기록',
    description: '깨달음, 독서, 강의, 실험에서 얻은 교훈을 정리합니다.',
  },
  {
    value: 'image-prompt',
    label: '이미지 프롬프트',
    description: '장면, 스타일, 피사체, 촬영 조건을 구조화합니다.',
  },
  {
    value: 'business-insight',
    label: '비즈니스 인사이트',
    description: '가설, 기회 요소, 실행 포인트를 분리합니다.',
  },
  {
    value: 'development-code',
    label: '개발 코드',
    description: '코드 의도, 아키텍처 포인트, 개선안을 추출합니다.',
  },
  {
    value: 'youtube-planning',
    label: '유튜브 기획',
    description: '후킹 포인트와 콘텐츠 흐름을 노드화합니다.',
  },
  {
    value: 'research-note',
    label: '리서치 메모',
    description: '주장, 근거, 후속 질문으로 재구성합니다.',
  },
  {
    value: 'meeting-note',
    label: '회의 메모',
    description: '결정, 액션 아이템, 리스크를 명확히 분리합니다.',
  },
];

export const SYSTEM_PROMPT_TEMPLATE = `
You are the "LLM Wiki knowledge structuring agent".

Your task:
1. Read the user's raw text and any attached images.
2. Convert them into one structured Markdown wiki node.
3. Also return a lightweight knowledge graph JSON.

Rules:
1. Respond with JSON only.
2. The JSON schema must match the requested schema exactly.
3. The 'slug' field must be a short, English-only, hyphen-separated string suitable for filenames (e.g., "local-desktop-app").
4. The markdown field must include YAML frontmatter.
5. Frontmatter must include:
   - title
   - date
   - knowledge_type
   - tags (clean string array, NO wiki-link syntax here)
   - connected_nodes (clean slug array, NO wiki-link syntax here)
6. The markdown body must be written in Korean.
7. The markdown body MUST ALWAYS contain the following three global sections in order, regardless of knowledge_type:

   **Global Section 1:** "## 📌 한 줄 통찰 (The Karpathy Summary)"
   → A single profound sentence capturing the absolute essence. This is the most important line of the entire document.

   **Global Section 2:** "## 📖 구조화된 지식 (Synthesized Content)"
   → This section's internal structure depends on knowledge_type:
     - For "personal-identity": 나는 누구인가 (자기 정의), 핵심 가치관/성격, 취향과 선호, 경험에서 온 신념, 현재 목표
     - For "daily-reflection": 오늘의 감정/상태, 관찰한 것, 떠오른 생각, 연결된 과거 경험, 내일 해볼 것
     - For "learning-log": 핵심 교훈 한 줄, 배운 맥락 (어디서/어떻게), 구체적 내용 정리, 내 삶에 적용할 점, 더 탐구할 질문
     - For all other types: 핵심 요약, 추출 포인트, 다음 액션

   **Global Section 3:** "## ⚠️ 모순 및 업데이트 (Contradictions & RL Update)"
   → Note any conflicts with common sense, existing knowledge, or potential future updates.
   → If no contradictions exist, write "현재 식별된 모순 없음." and suggest one future verification point.

8. The graph must place the newly created node at the center and connect category, tags, and related nodes.
9. Use role values only from:
   - core
   - category
   - tag
   - related
10. When images are attached, incorporate visible information into the markdown and graph.
11. Do not wrap the JSON in markdown fences.
12. When referencing other knowledge nodes or concepts inside the markdown BODY text (not frontmatter), use Obsidian wiki-link format: [[slug-name]]. This enables cross-node navigation in local markdown tools.

## Tag Design Principles (CRITICAL — read carefully)

This knowledge graph will scale to 100,000+ nodes over 10 years.
It stores not only software engineering knowledge, but also philosophy, personal identity, daily reflections, business insights, art, and more.
Tags must be **timeless, concept-level, and reusable** across the entire graph.

### 3-Tier Tag Hierarchy (pick 3–5 tags, mixing tiers):
| Tier | Scope | Examples |
| --- | --- | --- |
| Domain (분야) | Broadest umbrella. Rarely changes. Covers ALL fields of human knowledge. | AI-ML, DevOps, Frontend, Philosophy, Psychology, Business-Strategy, Design, Education, Self-Development, Content-Creation |
| Pattern (패턴) | Reusable technique, methodology, or approach applicable across domains. | Pipeline-Automation, Real-Time-Processing, Mental-Model, Decision-Framework, Habit-Engineering, Storytelling, Critical-Thinking |
| Entity (개체) | Specific concept, framework, tool, or thinker WITHOUT version numbers. | Gemini-API, FFmpeg, Docker, React, Nietzsche, Stoicism, ADHD, Analog-Aesthetic, Literacy-Education |

### STRICT RULES:
- **NEVER** include version numbers in tags.
  BAD: "Gemini-2-5-Flash", "React-18", "Node-20", "Python-3-12"
  GOOD: "Gemini-API", "React", "Node-Runtime", "Python"
- **NEVER** use vendor-specific service names that may be renamed.
  BAD: "Cloud-Run", "Vercel-Edge", "AWS-Lambda"
  GOOD: "Container-Deployment", "Serverless-Compute", "Edge-Runtime"
- **NEVER** use vague compound descriptions as tags.
  BAD: "Web-Service-Optimization", "Local-Infrastructure-Dev"
  GOOD: "Performance-Engineering", "Developer-Experience", "Local-Dev-Environment"
- **ALWAYS** prefer concept-level nouns over action phrases.
  BAD: "Optimizing-Build-Speed"
  GOOD: "Build-Optimization"
- Tags must be English, hyphen-separated, Title-Case-Words.
- **PREFER reusing existing tags** over inventing new ones. If the user's Existing Tags list is provided below, choose from that list whenever a tag with the same or very similar meaning exists.

\${EXISTING_TAGS_SLOT}
`.trim();

export const OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    slug: { type: 'string', description: 'Short English-only hyphen-separated string for the filename' },
    markdown: { type: 'string' },
    graph: {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              role: {
                type: 'string',
                enum: ['core', 'category', 'tag', 'related'],
              },
              meta: { type: 'string' },
            },
            required: ['id', 'label', 'role'],
          },
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              source: { type: 'string' },
              target: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['id', 'source', 'target'],
          },
        },
      },
      required: ['nodes', 'edges'],
    },
  },
  required: ['title', 'slug', 'markdown', 'graph'],
};

export async function generateKnowledgeNode(payload) {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Gemini 요청 중 오류가 발생했습니다.');
  }

  return {
    result: normalizeKnowledgeResult({
      knowledgeType: payload.knowledgeType,
      rawText: payload.rawText,
      title: data?.result?.title,
      markdown: data?.result?.markdown,
      graph: data?.result?.graph,
      responseMode: data?.mode ?? 'gemini',
      model: data?.model ?? GEMINI_MODEL,
    }),
    proposal: data?.proposal ?? null,
    applyPayload: data?.applyPayload ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function applyKnowledgeProposal(proposal) {
  const response = await fetch('/api/apply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ proposal }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Knowledge proposal could not be applied.');
  }

  return {
    persistence: data?.persistence ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function fetchWorkspaceIntegrity() {
  const response = await fetch('/api/workspace-status', { cache: 'no-store' });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Workspace integrity status could not be loaded.');
  }

  return data?.integrity ?? null;
}

export async function fetchWorkspaceSnapshot() {
  const response = await fetch('/api/workspace-snapshot', { cache: 'no-store' });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Workspace snapshot could not be loaded.');
  }

  return data?.snapshot ?? null;
}

export async function fetchWorkspaceNode(nodePath) {
  const response = await fetch(`/api/workspace-node?path=${encodeURIComponent(nodePath)}`, {
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Workspace node could not be loaded.');
  }

  return data?.node ?? null;
}

export async function submitReinforcementFeedback(feedback) {
  const response = await fetch('/api/reinforce-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ feedback }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Reinforcement feedback could not be applied.');
  }

  return {
    feedback: data?.feedback ?? null,
    policyState: data?.policyState ?? null,
    storage: data?.storage ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function runWorkspaceLint() {
  const response = await fetch('/api/run-lint', {
    method: 'POST',
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Workspace lint could not run.');
  }

  return {
    lint: data?.lint ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function runWorkspaceAgentScan() {
  const response = await fetch('/api/agent-scan', {
    method: 'POST',
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Workspace agent scan could not run.');
  }

  return {
    scan: data?.scan ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function processWorkspaceAgentQueue(limit = 3) {
  const response = await fetch('/api/agent-process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Workspace agent queue could not be processed.');
  }

  return {
    process: data?.process ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function executeGitCheckpoint(commitMessage) {
  const response = await fetch('/api/git-checkpoint', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'checkpoint',
      commitMessage: commitMessage || undefined,
    }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Git checkpoint could not be executed.');
  }

  return {
    checkpoint: data?.checkpoint ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function pushGitCheckpoint(remote) {
  const response = await fetch('/api/git-checkpoint', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'push',
      remote: remote || 'origin',
    }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Git push could not be executed.');
  }

  return {
    push: data?.push ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function fetchGitStatus() {
  const response = await fetch('/api/git-checkpoint', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'status' }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Git status could not be loaded.');
  }

  return {
    git: data?.git ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function fetchRebuildPlan() {
  const response = await fetch('/api/migration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'plan' }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Rebuild plan could not be loaded.');
  }

  return {
    plan: data?.plan ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function executeRebuild(trigger) {
  const response = await fetch('/api/migration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'rebuild', trigger: trigger || 'manual' }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Rebuild could not be executed.');
  }

  return {
    rebuild: data?.rebuild ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function fetchMigrationStatus() {
  const response = await fetch('/api/migration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status' }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Migration status could not be loaded.');
  }

  return {
    manifest: data?.manifest ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function fetchReliabilityReport() {
  const response = await fetch('/api/reliability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'report' }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Reliability report could not be loaded.');
  }

  return {
    report: data?.report ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export async function exportKnowledgeBase() {
  const response = await fetch('/api/reliability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'export' }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'Knowledge base export failed.');
  }

  return {
    export: data?.export ?? null,
    reflection: data?.reflection ?? [],
    integrity: data?.integrity ?? null,
  };
}

export function buildKnowledgeUserPrompt({
  knowledgeType,
  rawText,
  attachmentCount = 0,
}) {
  const selectedType =
    KNOWLEDGE_TYPES.find((item) => item.value === knowledgeType) ?? KNOWLEDGE_TYPES[0];

  return [
    `Selected knowledge type: ${selectedType.label}`,
    `Attachment count: ${attachmentCount}`,
    'Goal: transform fragmented raw data into one Markdown wiki node and one graph payload.',
    '',
    '[Important instructions]',
    '- The markdown body must be in Korean.',
    '- Use the images as factual context when they are present.',
    '- Keep tags specific and reusable.',
    '- connected_nodes should suggest realistic future wiki links.',
    '',
    '[Raw text]',
    rawText?.trim() || '(텍스트 없음. 이미지 정보 중심으로 구조화)',
  ].join('\n');
}

export function normalizeKnowledgeResult({
  knowledgeType,
  rawText,
  title,
  markdown,
  graph,
  responseMode,
  model,
}) {
  const fallbackTitle =
    title ||
    extractFrontmatterValue(markdown, 'title') ||
    buildFallbackTitle(rawText, knowledgeType);
  const normalizedMarkdown =
    markdown?.trim() || buildFallbackMarkdown(fallbackTitle, knowledgeType);
  const normalizedGraph =
    sanitizeGraph(graph) ||
    deriveGraphFromMarkdown(normalizedMarkdown, fallbackTitle, knowledgeType);

  return {
    title: fallbackTitle,
    markdown: normalizedMarkdown,
    graph: normalizedGraph,
    responseMode,
    model,
  };
}

export function splitMarkdownSections(markdown) {
  const match = markdown?.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    return {
      frontmatter: '',
      body: markdown?.trim() ?? '',
    };
  }

  return {
    frontmatter: match[1].trim(),
    body: match[2].trim(),
  };
}

export function createAttachmentId() {
  return `attachment-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return null;
  }

  return {
    nodes: graph.nodes
      .filter((node) => node?.id && node?.label)
      .map((node, index) => ({
        id: String(node.id ?? `node-${index + 1}`),
        label: String(node.label),
        role: ['core', 'category', 'tag', 'related'].includes(node.role)
          ? node.role
          : 'tag',
        meta: node.meta ? String(node.meta) : '',
      })),
    edges: graph.edges
      .filter((edge) => edge?.source && edge?.target)
      .map((edge, index) => ({
        id: String(edge.id ?? `edge-${index + 1}`),
        source: String(edge.source),
        target: String(edge.target),
        label: edge.label ? String(edge.label) : '',
      })),
  };
}

function deriveGraphFromMarkdown(markdown, title, knowledgeType) {
  const category =
    extractFrontmatterValue(markdown, 'knowledge_type') ||
    KNOWLEDGE_TYPES.find((item) => item.value === knowledgeType)?.label ||
    '미분류';
  const tags = extractYamlList(markdown, 'tags');
  const connectedNodes = extractYamlList(markdown, 'connected_nodes');

  return {
    nodes: [
      {
        id: 'core',
        label: title,
        role: 'core',
        meta: '생성된 메인 노드',
      },
      {
        id: 'category',
        label: category,
        role: 'category',
        meta: '지식 분류',
      },
      ...tags.map((tag, index) => ({
        id: `tag-${index + 1}`,
        label: tag,
        role: 'tag',
        meta: '추출 태그',
      })),
      ...connectedNodes.map((node, index) => ({
        id: `related-${index + 1}`,
        label: node,
        role: 'related',
        meta: '추천 연결 노드',
      })),
    ],
    edges: [
      {
        id: 'edge-category',
        source: 'core',
        target: 'category',
        label: '분류',
      },
      ...tags.map((tag, index) => ({
        id: `edge-tag-${index + 1}`,
        source: 'core',
        target: `tag-${index + 1}`,
        label: '태그',
      })),
      ...connectedNodes.map((node, index) => ({
        id: `edge-related-${index + 1}`,
        source: 'core',
        target: `related-${index + 1}`,
        label: '연결',
      })),
    ],
  };
}

function buildFallbackTitle(rawText, knowledgeType) {
  const selectedType =
    KNOWLEDGE_TYPES.find((item) => item.value === knowledgeType) ?? KNOWLEDGE_TYPES[0];
  const headline = rawText
    ?.split(/\n|[.!?]/)
    .map((line) => line.trim())
    .find((line) => line.length > 8);

  return headline || `${selectedType.label} 지식 노드`;
}

function buildFallbackMarkdown(title, knowledgeType) {
  const selectedType =
    KNOWLEDGE_TYPES.find((item) => item.value === knowledgeType) ?? KNOWLEDGE_TYPES[0];
  const today = new Date().toISOString().slice(0, 10);

  return `---
title: "${escapeYaml(title)}"
date: "${today}"
knowledge_type: "${escapeYaml(selectedType.label)}"
tags:
  - "정리 필요"
connected_nodes:
  - "후속 링크 보강 필요"
---

## 핵심 요약
응답은 받았지만 구조화 가능한 일부 정보가 부족해 기본 노드 형식으로 정리했습니다.

## 추출 포인트
- 제목과 태그를 조금 더 구체화하면 연결성이 좋아집니다.

## 다음 액션
- 텍스트를 보강하거나 이미지를 추가해 다시 생성합니다.`;
}

function extractFrontmatterValue(markdown, key) {
  const frontmatter = splitMarkdownSections(markdown).frontmatter;
  const match = frontmatter.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

function extractYamlList(markdown, key) {
  const frontmatter = splitMarkdownSections(markdown).frontmatter;
  const blockMatch = frontmatter.match(
    new RegExp(`${key}:\\s*\\n([\\s\\S]*?)(?:\\n[A-Za-z_]+:|$)`, 'm'),
  );

  return (blockMatch?.[1] ?? '')
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
}

function escapeYaml(value) {
  return String(value).replace(/"/g, '\\"');
}
