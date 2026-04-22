import fs from 'node:fs/promises';
import path from 'node:path';
import {
  GEMINI_MODEL,
  OUTPUT_JSON_SCHEMA,
  SYSTEM_PROMPT_TEMPLATE,
  buildKnowledgeUserPrompt,
} from '../src/lib/wikiNodeService.js';
import {
  buildKnowledgeProposal,
  serializeProposalForApply,
} from '../server/p-reinforce/proposalBuilder.js';
import { buildWorkspaceIntegrityReport } from '../server/p-reinforce/roadmap.js';
import { getStorageDescriptor } from '../server/p-reinforce/persistence.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return response.status(500).json({
      error: 'Server is missing GEMINI_API_KEY.',
    });
  }

  try {
    const { knowledgeType, rawText = '', attachments = [] } = request.body ?? {};

    if (!rawText.trim() && attachments.length === 0) {
      return response.status(400).json({
        error: '텍스트 또는 이미지를 하나 이상 입력해 주세요.',
      });
    }

    const prompt = buildKnowledgeUserPrompt({
      knowledgeType,
      rawText,
      attachmentCount: attachments.length,
    });

    const userParts = [
      { text: prompt },
      ...attachments.map((attachment) => ({
        inlineData: {
          mimeType: attachment.mimeType,
          data: stripDataUrlPrefix(attachment.base64),
        },
      })),
    ];

    const model = process.env.GEMINI_MODEL || GEMINI_MODEL;

    // --- Existing Tags Injection ---
    let existingTagsBlock = '';
    try {
      const storage = getStorageDescriptor();
      const graphCachePath = path.resolve(storage.workspaceRoot, '20_Meta', 'graph.cache.json');
      const raw = await fs.readFile(graphCachePath, 'utf-8');
      const graphCache = JSON.parse(raw);
      const tagNodes = (graphCache.nodes ?? []).filter((n) => n.node_kind === 'tag');
      if (tagNodes.length > 0) {
        const tagList = tagNodes.map((n) => n.label).slice(0, 150).join(', ');
        existingTagsBlock = `\n## Existing Tags in this Garden (PREFER reusing these)\n${tagList}`;
      }
    } catch {
      // graph cache not yet available — skip injection
    }
    const finalSystemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('${EXISTING_TAGS_SLOT}', existingTagsBlock);

    const geminiResponse = await fetch(`${GEMINI_API_URL}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: finalSystemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: userParts,
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: OUTPUT_JSON_SCHEMA,
          thinkingConfig: {
            thinkingLevel: 'minimal',
          },
        },
      }),
    });
    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      return response.status(geminiResponse.status).json({
        error: geminiData?.error?.message ?? 'Gemini API request failed.',
      });
    }

    const rawJson = extractGeminiText(geminiData);
    const parsed = JSON.parse(rawJson);
    const proposal = await buildKnowledgeProposal({
      knowledgeType,
      rawText,
      attachments,
      llmResult: parsed,
      model,
    });
    const reflection = [
      ...proposal.reflection,
      {
        severity: 'warning',
        code: 'proposal_requires_apply',
        message:
          'Generation now stops at the proposal stage. Use Apply to write durable artifacts when the runtime allows it.',
      },
    ];
    const integrity = await buildWorkspaceIntegrityReport({ reflection });

    return response.status(200).json({
      result: {
        title: proposal.title,
        markdown: proposal.markdown,
        graph: proposal.graph,
        responseMode: 'gemini',
        model,
      },
      proposal: {
        frontmatter: proposal.frontmatter,
        sourceManifest: proposal.sourceManifest,
        wikiPath: proposal.wikiPath,
        rawRoot: proposal.rawRoot,
      },
      applyPayload: serializeProposalForApply(proposal),
      reflection,
      integrity,
      mode: 'gemini',
      model,
    });
  } catch (error) {
    return response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : '알 수 없는 서버 오류가 발생했습니다.',
    });
  }
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part?.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini 응답에서 JSON 텍스트를 찾지 못했습니다.');
  }

  return text;
}

function stripDataUrlPrefix(value) {
  return String(value).replace(/^data:[^;]+;base64,/, '');
}
