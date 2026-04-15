import fs from 'node:fs/promises';
import path from 'node:path';

import { buildKnowledgeProposal } from '../server/p-reinforce/proposalBuilder.js';
import { persistKnowledgeProposal } from '../server/p-reinforce/persistence.js';
import { readWorkspaceSnapshot } from '../server/p-reinforce/workspaceSnapshot.js';

const workspaceRoot = path.resolve(process.cwd(), 'examples', 'runtime-smoke');

process.env.P_REINFORCE_STORAGE_MODE = 'filesystem';
process.env.P_REINFORCE_WORKSPACE_ROOT = workspaceRoot;

await fs.rm(workspaceRoot, { recursive: true, force: true });

const proposal = await buildKnowledgeProposal({
  knowledgeType: 'research-note',
  rawText:
    'Karpathy-style persistent wiki should separate immutable raw evidence from durable synthesized notes.',
  attachments: [],
  model: 'gemini-3-flash-preview',
  llmResult: {
    title: 'Persistent Wiki Contracts',
    markdown: `---
title: "Persistent Wiki Contracts"
date: "2026-04-15"
knowledge_type: "Research"
tags:
  - "knowledge-ops"
  - "contracts"
connected_nodes:
  - "Karpathy LLM Wiki"
---

## 한 줄 요약
원본과 파생 지식을 분리해야 장기 위키가 무너지지 않는다.

## 추출된 패턴
- stable id
- append-only events

## 다음 액션
- apply를 명시적 단계로 유지한다.
`,
    graph: {
      nodes: [
        { id: 'core', label: 'Persistent Wiki Contracts', role: 'core', meta: 'draft' },
        { id: 'category', label: 'Research', role: 'category', meta: 'category' },
        { id: 'related-1', label: 'Karpathy LLM Wiki', role: 'related', meta: 'related' },
      ],
      edges: [
        { id: 'edge-category', source: 'core', target: 'category', label: 'category' },
        { id: 'edge-related-1', source: 'core', target: 'related-1', label: 'related' },
      ],
    },
  },
});

const persistence = await persistKnowledgeProposal(proposal);
const snapshot = await readWorkspaceSnapshot();

if (!persistence.persisted) {
  throw new Error('Workspace persistence smoke test did not persist artifacts.');
}

if ((snapshot.raw?.sourceCount ?? 0) < 1) {
  throw new Error('Workspace snapshot did not detect persisted raw sources.');
}

if ((snapshot.wiki?.nodeCount ?? 0) < 1) {
  throw new Error('Workspace snapshot did not detect persisted wiki nodes.');
}

if (!snapshot.derived?.hasIndex || !snapshot.derived?.hasGraphCache) {
  throw new Error('Derived artifacts were not materialized after persistence.');
}

console.log(
  JSON.stringify(
    {
      workspaceRoot,
      persisted: persistence.persisted,
      rawSources: snapshot.raw.sourceCount,
      wikiNodes: snapshot.wiki.nodeCount,
      graphNodes: snapshot.graph.nodeCount,
      events: snapshot.events.length,
    },
    null,
    2,
  ),
);
