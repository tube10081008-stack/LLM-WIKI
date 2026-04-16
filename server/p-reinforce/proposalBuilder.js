import crypto from 'node:crypto';

import { validateContract } from './contracts.js';
import {
  buildInsight,
  demoteHeadings,
  firstMeaningfulParagraph,
  parseSimpleFrontmatter,
  splitFrontmatter,
  stringifyFrontmatter,
} from './markdown.js';
import { slugify } from './utils.js';

const KNOWLEDGE_TYPE_PROFILE = {
  'personal-identity': {
    nodeType: 'topic',
    categoryPath: '10_Wiki/Topics/Identity',
    categoryLabel: 'Identity',
    rawSourceType: 'text',
  },
  'daily-reflection': {
    nodeType: 'topic',
    categoryPath: '10_Wiki/Topics/Journal',
    categoryLabel: 'Journal',
    rawSourceType: 'text',
  },
  'learning-log': {
    nodeType: 'topic',
    categoryPath: '10_Wiki/Topics/Learnings',
    categoryLabel: 'Learnings',
    rawSourceType: 'text',
  },
  'image-prompt': {
    nodeType: 'skill',
    categoryPath: '10_Wiki/Skills/Image-Prompts',
    categoryLabel: 'Image Prompts',
    rawSourceType: 'mixed',
  },
  'business-insight': {
    nodeType: 'topic',
    categoryPath: '10_Wiki/Topics/Business',
    categoryLabel: 'Business',
    rawSourceType: 'text',
  },
  'development-code': {
    nodeType: 'skill',
    categoryPath: '10_Wiki/Skills/Development',
    categoryLabel: 'Development',
    rawSourceType: 'text',
  },
  'youtube-planning': {
    nodeType: 'project',
    categoryPath: '10_Wiki/Projects/Content-Systems',
    categoryLabel: 'Content Systems',
    rawSourceType: 'text',
  },
  'research-note': {
    nodeType: 'topic',
    categoryPath: '10_Wiki/Topics/Research',
    categoryLabel: 'Research',
    rawSourceType: 'text',
  },
  'meeting-note': {
    nodeType: 'decision',
    categoryPath: '10_Wiki/Decisions/Working-Sessions',
    categoryLabel: 'Working Sessions',
    rawSourceType: 'meeting_note',
  },
};

export async function buildKnowledgeProposal({
  knowledgeType,
  rawText = '',
  attachments = [],
  llmResult,
  model,
}) {
  const profile = KNOWLEDGE_TYPE_PROFILE[knowledgeType] ?? KNOWLEDGE_TYPE_PROFILE['research-note'];
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10);
  const dateTimeStamp = now.toISOString();
  const dateParts = dateStamp.split('-');
  const sourceId = createSourceId(now);
  const legacy = extractLegacyMetadata(llmResult?.markdown);
  const title = sanitizeTitle(llmResult?.title || legacy.title || firstMeaningfulParagraph(rawText));
  const tags = uniqueList([
    ...legacy.tags,
    ...collectGraphLabels(llmResult?.graph, 'tag'),
    knowledgeType,
  ]).slice(0, 8);
  const relatedTitles = uniqueList([
    ...legacy.connectedNodes,
    ...collectGraphLabels(llmResult?.graph, 'related'),
  ]).slice(0, 6);
  const rawRoot = `00_Raw/${dateParts[0]}/${dateParts[1]}/${dateParts[2]}/source_${sourceId}`;
  const textPath = `${rawRoot}/source.md`;
  const attachmentRecords = attachments.map((attachment, index) =>
    buildAttachmentRecord({
      attachment,
      rawRoot,
      index,
    }),
  );
  const attachmentFiles = attachmentRecords.map(({ binary, ...attachment }) => ({
    ...attachment,
    binary,
  }));
  const sourceManifest = {
    source_id: sourceId,
    schema_version: 1,
    created_at: dateTimeStamp,
    source_type: inferSourceType(profile.rawSourceType, rawText, attachments),
    origin: {
      channel: 'web_app',
      captured_from: 'p-reinforce-studio',
    },
    title,
    description: `Captured from Studio as ${knowledgeType}.`,
    sha256: sha256Hex(
      JSON.stringify({
        rawText,
        attachments: attachmentRecords.map((item) => ({
          id: item.attachment_id,
          sha256: item.sha256,
        })),
      }),
    ),
    raw_root: rawRoot,
    text_path: textPath,
    attachments: attachmentRecords.map(({ binary, ...attachment }) => attachment),
    tags,
    status: 'proposed',
  };
  const relatedNodeIds = relatedTitles.map((item) => createHypotheticalRelatedId(item));
  const englishSlug = llmResult?.slug || title;
  const wikiFrontmatter = {
    id: createNodeId(profile.nodeType, englishSlug),
    schema_version: 1,
    node_type: profile.nodeType,
    title,
    status: 'draft',
    confidence_score: computeConfidenceScore({ rawText, attachments, tags, relatedNodeIds }),
    created_at: dateStamp,
    updated_at: dateStamp,
    last_reinforced: dateStamp,
    category_path: profile.categoryPath,
    source_refs: [sourceId],
    related: Array.from(new Set(relatedNodeIds)),
    contradicts: [],
    policy_version: 1,
    aliases: legacy.title && legacy.title !== title ? [legacy.title] : undefined,
  };
  const markdown = buildDurableMarkdown({
    title,
    body: legacy.body,
    frontmatter: wikiFrontmatter,
    insight: buildInsight(legacy.body, title),
    categoryLabel: profile.categoryLabel,
    relatedTitles,
    rawRoot,
  });
  const graph = buildUiGraph({
    title,
    categoryLabel: profile.categoryLabel,
    tags,
    relatedTitles,
  });
  const wikiPath = buildWikiPath(profile.categoryPath, englishSlug);
  const sourceText = buildSourceDocument({
    title,
    knowledgeType,
    rawText,
    attachments: attachmentRecords,
    createdAt: dateTimeStamp,
  });
  const captureEvent = {
    event_id: createEventId(now, 'cap1'),
    timestamp: dateTimeStamp,
    event_type: 'capture',
    source_ids: [sourceId],
    policy_version: 1,
    schema_version: 1,
    model,
    artifacts_touched: [`${rawRoot}/manifest.json`, textPath],
    summary: `Captured raw source ${sourceId} from Studio.`,
    details: {
      knowledge_type: knowledgeType,
      attachment_count: attachments.length,
    },
  };
  const proposeEvent = {
    event_id: createEventId(now, 'prop'),
    timestamp: dateTimeStamp,
    event_type: 'ingest_propose',
    source_ids: [sourceId],
    node_ids: [wikiFrontmatter.id],
    policy_version: 1,
    schema_version: 1,
    model,
    artifacts_touched: [wikiPath],
    summary: `Proposed wiki node ${wikiFrontmatter.id} from ${sourceId}.`,
    details: {
      category_path: wikiFrontmatter.category_path,
      related_count: wikiFrontmatter.related.length,
      confidence_score: wikiFrontmatter.confidence_score,
    },
  };

  await validateContract('RawSourceManifest', sourceManifest);
  await validateContract('WikiNodeFrontmatter', wikiFrontmatter);
  await validateContract('EventLogEntry', captureEvent);
  await validateContract('EventLogEntry', proposeEvent);

  return {
    title,
    markdown,
    graph,
    frontmatter: wikiFrontmatter,
    sourceManifest,
    sourceText,
    relatedTitles,
    rawRoot,
    wikiPath,
    attachmentFiles,
    events: [captureEvent, proposeEvent],
    reflection: buildProposalReflection({ attachments, relatedTitles }),
  };
}

export function serializeProposalForApply(proposal) {
  return {
    title: proposal.title,
    markdown: proposal.markdown,
    graph: proposal.graph,
    frontmatter: proposal.frontmatter,
    sourceManifest: proposal.sourceManifest,
    sourceText: proposal.sourceText,
    relatedTitles: proposal.relatedTitles,
    rawRoot: proposal.rawRoot,
    wikiPath: proposal.wikiPath,
    events: proposal.events,
    reflection: proposal.reflection,
    attachmentFiles: (proposal.attachmentFiles ?? []).map((attachment) => ({
      attachment_id: attachment.attachment_id,
      path: attachment.path,
      mime_type: attachment.mime_type,
      sha256: attachment.sha256,
      size_bytes: attachment.size_bytes,
      base64: attachment.binary.toString('base64'),
    })),
  };
}

export async function hydrateSerializedProposal(serializedProposal) {
  const proposal = {
    ...serializedProposal,
    attachmentFiles: (serializedProposal?.attachmentFiles ?? []).map((attachment) => ({
      attachment_id: attachment.attachment_id,
      path: attachment.path,
      mime_type: attachment.mime_type,
      sha256: attachment.sha256,
      size_bytes: attachment.size_bytes,
      binary: Buffer.from(String(attachment.base64 ?? ''), 'base64'),
    })),
  };

  await validateContract('RawSourceManifest', proposal.sourceManifest);
  await validateContract('WikiNodeFrontmatter', proposal.frontmatter);

  for (const event of proposal.events ?? []) {
    await validateContract('EventLogEntry', event);
  }

  return proposal;
}

function extractLegacyMetadata(markdown) {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const parsedFrontmatter = parseSimpleFrontmatter(frontmatter);

  return {
    title: parsedFrontmatter.title ? String(parsedFrontmatter.title) : '',
    tags: normalizeList(parsedFrontmatter.tags),
    connectedNodes: normalizeList(parsedFrontmatter.connected_nodes),
    body: body || '',
  };
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
}

function collectGraphLabels(graph, role) {
  if (!graph || !Array.isArray(graph.nodes)) {
    return [];
  }

  return graph.nodes
    .filter((node) => node?.role === role && node?.label)
    .map((node) => String(node.label).trim())
    .filter(Boolean);
}

function buildAttachmentRecord({ attachment, rawRoot, index }) {
  const attachmentId = createAttachmentId(index);
  const binary = extractAttachmentBuffer(attachment?.base64 ?? '');
  const extension = guessExtension(attachment?.mimeType ?? 'image/jpeg');
  const filename = `${attachmentId}.${extension}`;

  return {
    attachment_id: attachmentId,
    path: `${rawRoot}/attachments/${filename}`,
    mime_type: attachment?.mimeType ?? 'image/jpeg',
    sha256: sha256Buffer(binary),
    size_bytes: binary.length,
    binary,
  };
}

function buildDurableMarkdown({ title, body, frontmatter, insight, categoryLabel, relatedTitles, rawRoot }) {
  const normalizedBody = body
    ? demoteHeadings(stripDuplicateTitle(body, title))
    : '- 원시 입력을 바탕으로 기초 구조를 먼저 생성했습니다.';
  const humanRelated = relatedTitles.length
    ? relatedTitles.map((item) => `[[${item}]]`).join(', ')
    : '[[연결 대기]]';
  const sourceLink = `[[${rawRoot}/source]]`;

  return [
    stringifyFrontmatter(frontmatter),
    '',
    `# [[${title}]]`,
    '',
    '## 📌 한 줄 통찰 (The Karpathy Summary)',
    `> ${insight}`,
    '',
    '## 📖 구조화된 지식 (Synthesized Content)',
    normalizedBody,
    '',
    '## ⚠️ 모순 및 업데이트 (Contradictions & RL Update)',
    '- 과거 데이터와의 충돌: 아직 명시된 충돌 문서가 없습니다.',
    '- 정책 변화: 현재는 사용자 피드백 루프가 연결되기 전의 초안 상태입니다.',
    '',
    '## 🔗 지식 연결 (Graph)',
    `- Parent: [[${categoryLabel}]]`,
    `- Related: ${humanRelated}`,
    `- Raw Source: ${sourceLink}`,
  ].join('\n');
}

function buildUiGraph({ title, categoryLabel, tags, relatedTitles }) {
  return {
    nodes: [
      { id: 'core', label: title, role: 'core', meta: 'current proposal' },
      { id: 'category', label: categoryLabel, role: 'category', meta: 'category view' },
      ...tags.map((tag, index) => ({
        id: `tag-${index + 1}`,
        label: tag,
        role: 'tag',
        meta: 'tag',
      })),
      ...relatedTitles.map((label, index) => ({
        id: `related-${index + 1}`,
        label,
        role: 'related',
        meta: 'related candidate',
      })),
    ],
    edges: [
      { id: 'edge-category', source: 'core', target: 'category', label: 'category' },
      ...tags.map((_, index) => ({
        id: `edge-tag-${index + 1}`,
        source: 'core',
        target: `tag-${index + 1}`,
        label: 'tag',
      })),
      ...relatedTitles.map((_, index) => ({
        id: `edge-related-${index + 1}`,
        source: 'core',
        target: `related-${index + 1}`,
        label: 'related',
      })),
    ],
  };
}

function buildSourceDocument({ title, knowledgeType, rawText, attachments, createdAt }) {
  const attachmentLines = attachments.length
    ? attachments.map((attachment) => `- ${attachment.path} (${attachment.mime_type})`).join('\n')
    : '- 없음';

  return [
    `# ${title}`,
    '',
    `- created_at: ${createdAt}`,
    `- knowledge_type: ${knowledgeType}`,
    '',
    '## Raw Text',
    rawText.trim() || '(텍스트 없음)',
    '',
    '## Attachments',
    attachmentLines,
  ].join('\n');
}

function buildProposalReflection({ attachments, relatedTitles }) {
  const reflection = [];

  if (relatedTitles.length > 0) {
    reflection.push({
      severity: 'warning',
      code: 'provisional_related_ids',
      message:
        'Related node IDs are provisional topic-style slugs until Step 4 persists against a real index.',
    });
  }

  if (attachments.length > 0) {
    reflection.push({
      severity: 'warning',
      code: 'attachment_derivative_only',
      message:
        'Uploaded images are compressed preview derivatives; Step 7 should add original-file capture for long-horizon archival.',
    });
  }

  return reflection;
}

function computeConfidenceScore({ rawText, attachments, tags, relatedNodeIds }) {
  let score = 0.52;

  if (rawText.trim()) {
    score += 0.12;
  }

  if (attachments.length > 0) {
    score += 0.12;
  }

  if (tags.length >= 2) {
    score += 0.08;
  }

  if (relatedNodeIds.length >= 2) {
    score += 0.08;
  }

  return Number(Math.min(0.92, score).toFixed(2));
}

function inferSourceType(profileSourceType, rawText, attachments) {
  if (profileSourceType === 'meeting_note') {
    return 'meeting_note';
  }

  if (rawText.trim() && attachments.length > 0) {
    return 'mixed';
  }

  if (attachments.length > 0) {
    return 'image';
  }

  return profileSourceType || 'text';
}

function buildWikiPath(categoryPath, title) {
  return `${categoryPath}/${slugify(title)}.md`;
}

function createSourceId(date) {
  return `src_${date.toISOString().slice(0, 10).replaceAll('-', '')}_${randomToken(8)}`;
}

function createNodeId(nodeType, title) {
  return `node_${nodeType}_${slugify(title)}`;
}

function createHypotheticalRelatedId(label) {
  return `node_topic_${slugify(label)}`;
}

function createEventId(date, suffix) {
  const iso = date.toISOString();
  const compactDate = iso.slice(0, 10).replaceAll('-', '');
  const compactTime = iso.slice(11, 19).replaceAll(':', '');
  return `evt_${compactDate}_${compactTime}_${suffix.toLowerCase()}`;
}

function createAttachmentId(index) {
  return `att_${randomToken(6)}${String(index + 1)}`;
}

function sanitizeTitle(title) {
  const normalized = String(title || 'Untitled Node').replace(/\s+/g, ' ').trim();
  return normalized || 'Untitled Node';
}

function stripDuplicateTitle(body, title) {
  const normalized = String(body).trim();
  return normalized.replace(new RegExp(`^#\\s+\\[?\\[?${escapeRegExp(title)}\\]?\\]?\\s*`, 'i'), '');
}

function guessExtension(mimeType) {
  if (mimeType.includes('png')) {
    return 'png';
  }

  if (mimeType.includes('webp')) {
    return 'webp';
  }

  return 'jpg';
}

function extractAttachmentBuffer(dataUrl) {
  const base64 = String(dataUrl).replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(base64, 'base64');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}




function randomToken(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean).map((item) => String(item).trim()))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
