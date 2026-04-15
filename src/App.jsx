import { Suspense, lazy, startTransition, useDeferredValue, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  Check,
  Copy,
  Cpu,
  FileImage,
  FileText,
  ImagePlus,
  Loader2,
  Network,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import {
  GEMINI_MODEL,
  KNOWLEDGE_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_DIMENSION,
  MAX_ATTACHMENT_PREVIEW_BYTES,
  applyKnowledgeProposal,
  createAttachmentId,
  executeGitCheckpoint,
  executeRebuild,
  fetchRebuildPlan,
  fetchWorkspaceIntegrity,
  fetchWorkspaceNode,
  fetchWorkspaceSnapshot,
  generateKnowledgeNode,
  processWorkspaceAgentQueue,
  pushGitCheckpoint,
  runWorkspaceAgentScan,
  runWorkspaceLint,
  splitMarkdownSections,
  submitReinforcementFeedback,
} from './lib/wikiNodeService';

const GraphCanvas = lazy(() => import('./components/GraphCanvas'));

const TABS = [
  { id: 'markdown', label: '마크다운 뷰', icon: FileText },
  { id: 'graph', label: '지식 그래프 뷰', icon: Network },
];

const WORKSPACE_SECTIONS = [
  {
    id: 'inbox',
    label: 'Inbox',
    description: 'Capture raw evidence before it becomes knowledge.',
    icon: FileImage,
    blockedBy: 'step4',
  },
  {
    id: 'studio',
    label: 'Studio',
    description: 'Transform raw input into structured wiki proposals.',
    icon: Wand2,
    blockedBy: null,
  },
  {
    id: 'garden',
    label: 'Garden',
    description: 'Inspect category topology and graph health.',
    icon: Network,
    blockedBy: 'step4',
  },
  {
    id: 'reinforce',
    label: 'Reinforce',
    description: 'Turn corrections into policy signals.',
    icon: Cpu,
    blockedBy: 'step5',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    description: 'Trace capture, proposal, and persistence events.',
    icon: FileText,
    blockedBy: 'step4',
  },
  {
    id: 'schema-lab',
    label: 'Schema Lab',
    description: 'Audit contracts, gates, and derived artifacts.',
    icon: AlertCircle,
    blockedBy: null,
  },
];

const INITIAL_FORM = {
  knowledgeType: KNOWLEDGE_TYPES[1]?.value ?? KNOWLEDGE_TYPES[0].value,
  rawText: '',
  attachments: [],
};

const MARKDOWN_COMPONENTS = {
  code({ inline, children }) {
    if (inline) {
      return (
        <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.92em] text-slate-700">
          {children}
        </code>
      );
    }

    return (
      <pre className="overflow-x-auto rounded-[28px] bg-slate-950/95 p-5 text-[13px] leading-7 text-slate-100 shadow-2xl shadow-slate-950/15">
        <code>{children}</code>
      </pre>
    );
  },
  h2({ children }) {
    return <h2 className="mt-0 text-xl font-semibold text-slate-900">{children}</h2>;
  },
  p({ children }) {
    return <p className="m-0 text-sm leading-7 text-slate-600">{children}</p>;
  },
  ul({ children }) {
    return <ul className="m-0 space-y-2 pl-5 text-sm text-slate-700">{children}</ul>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {children}
      </blockquote>
    );
  },
};

function App() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('markdown');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [integrity, setIntegrity] = useState(null);
  const [integrityStatus, setIntegrityStatus] = useState('loading');
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState(null);
  const [workspaceStatus, setWorkspaceStatus] = useState('loading');
  const [activeWorkspaceNodePath, setActiveWorkspaceNodePath] = useState('');
  const [workspaceNodeDetail, setWorkspaceNodeDetail] = useState(null);
  const [workspaceNodeStatus, setWorkspaceNodeStatus] = useState('idle');
  const [proposalMeta, setProposalMeta] = useState(null);
  const [applyPayload, setApplyPayload] = useState(null);
  const [persistenceMeta, setPersistenceMeta] = useState(null);
  const [reflectionItems, setReflectionItems] = useState([]);
  const [activeSection, setActiveSection] = useState('studio');
  const [applyStatus, setApplyStatus] = useState('idle');
  const [reinforcementStatus, setReinforcementStatus] = useState('idle');
  const [reinforcementNote, setReinforcementNote] = useState('');
  const [reinforcementMeta, setReinforcementMeta] = useState(null);
  const [lintStatus, setLintStatus] = useState('idle');
  const [lintMeta, setLintMeta] = useState(null);
  const [agentStatus, setAgentStatus] = useState('idle');
  const [agentMeta, setAgentMeta] = useState(null);
  const [agentProcessStatus, setAgentProcessStatus] = useState('idle');
  const [agentProcessMeta, setAgentProcessMeta] = useState(null);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    let active = true;

    async function loadIntegrity() {
      try {
        const nextIntegrity = await fetchWorkspaceIntegrity();

        if (!active) {
          return;
        }

        setIntegrity(nextIntegrity);
        setIntegrityStatus('ready');
      } catch (error) {
        if (!active) {
          return;
        }

        setIntegrityStatus('error');
        setReflectionItems((current) => [
          ...current,
          {
            severity: 'warning',
            code: 'integrity_load_failed',
            message:
              error instanceof Error
                ? error.message
                : 'Workspace integrity status could not be loaded.',
          },
        ]);
      }
    }

    void loadIntegrity();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const nextPath = workspaceSnapshot?.wiki?.recentEntries?.[0]?.path ?? '';

    if (!nextPath) {
      return;
    }

    const currentStillExists = (workspaceSnapshot?.wiki?.recentEntries ?? []).some(
      (entry) => entry.path === activeWorkspaceNodePath,
    );

    if (currentStillExists && workspaceNodeDetail?.path === activeWorkspaceNodePath) {
      return;
    }

    void handleSelectWorkspaceNode(nextPath);
  }, [workspaceSnapshot]);

  useEffect(() => {
    let active = true;

    async function loadWorkspaceSnapshot() {
      try {
        const nextSnapshot = await fetchWorkspaceSnapshot();

        if (!active) {
          return;
        }

        setWorkspaceSnapshot(nextSnapshot);
        setWorkspaceStatus('ready');
      } catch (error) {
        if (!active) {
          return;
        }

        setWorkspaceStatus('error');
        setReflectionItems((current) => [
          ...current,
          {
            severity: 'warning',
            code: 'workspace_snapshot_failed',
            message:
              error instanceof Error
                ? error.message
                : 'Workspace snapshot could not be loaded.',
          },
        ]);
      }
    }

    void loadWorkspaceSnapshot();

    return () => {
      active = false;
    };
  }, []);

  const deferredSection = useDeferredValue(activeSection);

  const selectedType =
    KNOWLEDGE_TYPES.find((item) => item.value === form.knowledgeType) ?? KNOWLEDGE_TYPES[0];
  const canSubmit =
    status !== 'loading' &&
    !uploadingImages &&
    (form.rawText.trim().length > 0 || form.attachments.length > 0);
  const graphStats = result ? getGraphStats(result.graph) : null;
  const gateSummary = getGateSummary(integrity);
  const activeSectionMeta =
    WORKSPACE_SECTIONS.find((section) => section.id === deferredSection) ?? WORKSPACE_SECTIONS[1];
  const selectedWorkspaceEntry =
    (workspaceSnapshot?.wiki?.recentEntries ?? []).find((entry) => entry.path === activeWorkspaceNodePath) ??
    workspaceSnapshot?.wiki?.recentEntries?.[0] ??
    null;

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setStatus('loading');
    setApplyStatus('idle');
    setErrorMessage('');
    setCopied(false);

    try {
      const nextResponse = await generateKnowledgeNode({
        knowledgeType: form.knowledgeType,
        rawText: form.rawText,
        attachments: form.attachments.map((item) => ({
          name: item.name,
          mimeType: item.mimeType,
          base64: item.base64,
        })),
      });

      setResult(nextResponse.result);
      setProposalMeta(nextResponse.proposal);
      setApplyPayload(nextResponse.applyPayload);
      setPersistenceMeta(null);
      setReflectionItems(nextResponse.reflection ?? []);
      setIntegrity(nextResponse.integrity ?? null);
      setIntegrityStatus(nextResponse.integrity ? 'ready' : 'error');
      setActiveTab('markdown');
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Gemini 요청 중 알 수 없는 오류가 발생했습니다.',
      );
    }
  }

  async function handleCopy() {
    if (!result?.markdown) {
      return;
    }

    await navigator.clipboard.writeText(result.markdown);
    setCopied(true);
  }

  async function handleApply() {
    if (!applyPayload || applyStatus === 'loading') {
      return;
    }

    setApplyStatus('loading');
    setErrorMessage('');

    try {
      const nextResponse = await applyKnowledgeProposal(applyPayload);
      const nextSnapshot = await fetchWorkspaceSnapshot().catch(() => null);

      setPersistenceMeta(nextResponse.persistence);
      setReflectionItems(nextResponse.reflection ?? []);
      setIntegrity(nextResponse.integrity ?? null);
      setIntegrityStatus(nextResponse.integrity ? 'ready' : 'error');
      setWorkspaceSnapshot(nextSnapshot);
      setWorkspaceStatus(nextSnapshot ? 'ready' : 'error');
      setApplyStatus(nextResponse.persistence?.persisted ? 'success' : 'blocked');
    } catch (error) {
      setApplyStatus('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Apply 단계에서 서버 오류가 발생했습니다.',
      );
    }
  }

  async function handleSelectWorkspaceNode(nodePath) {
    if (!nodePath) {
      return;
    }

    setActiveWorkspaceNodePath(nodePath);
    setWorkspaceNodeStatus('loading');

    try {
      const nextNode = await fetchWorkspaceNode(nodePath);
      setWorkspaceNodeDetail(nextNode);
      setWorkspaceNodeStatus('ready');
    } catch (error) {
      setWorkspaceNodeDetail(null);
      setWorkspaceNodeStatus('error');
      setReflectionItems((current) => [
        ...current,
        {
          severity: 'warning',
          code: 'workspace_node_failed',
          message:
            error instanceof Error ? error.message : 'Workspace node could not be loaded.',
        },
      ]);
    }
  }

  async function handleOpenWorkspaceNode(nodePath) {
    await handleSelectWorkspaceNode(nodePath);
    startTransition(() => {
      setActiveSection('garden');
    });
  }

  async function handleReinforcement(signalType, targetCategory = null) {
    const nodePath = activeWorkspaceNodePath || selectedWorkspaceEntry?.path;

    if (!nodePath || reinforcementStatus === 'loading') {
      return;
    }

    setReinforcementStatus('loading');
    setErrorMessage('');

    try {
      const nextResponse = await submitReinforcementFeedback({
        nodePath,
        signalType,
        targetCategory,
        note: reinforcementNote,
      });
      const nextSnapshot = await fetchWorkspaceSnapshot().catch(() => null);

      setReinforcementMeta(nextResponse.feedback);
      setIntegrity(nextResponse.integrity ?? null);
      setIntegrityStatus(nextResponse.integrity ? 'ready' : 'error');
      setReflectionItems(nextResponse.reflection ?? []);
      setWorkspaceSnapshot(nextSnapshot);
      setWorkspaceStatus(nextSnapshot ? 'ready' : 'error');
      setReinforcementStatus('success');
    } catch (error) {
      setReinforcementStatus('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Reinforcement feedback could not be applied.',
      );
    }
  }

  async function handleRunLint() {
    if (lintStatus === 'loading') {
      return;
    }

    setLintStatus('loading');
    setErrorMessage('');

    try {
      const nextResponse = await runWorkspaceLint();
      const nextSnapshot = await fetchWorkspaceSnapshot().catch(() => null);

      setLintMeta(nextResponse.lint);
      setIntegrity(nextResponse.integrity ?? null);
      setIntegrityStatus(nextResponse.integrity ? 'ready' : 'error');
      setReflectionItems(nextResponse.reflection ?? []);
      setWorkspaceSnapshot(nextSnapshot);
      setWorkspaceStatus(nextSnapshot ? 'ready' : 'error');
      setLintStatus(nextResponse.lint?.persisted ? 'success' : 'blocked');
    } catch (error) {
      setLintStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Workspace lint could not be executed.',
      );
    }
  }

  async function handleRunAgentScan() {
    if (agentStatus === 'loading') {
      return;
    }

    setAgentStatus('loading');
    setErrorMessage('');

    try {
      const nextResponse = await runWorkspaceAgentScan();
      const nextSnapshot = await fetchWorkspaceSnapshot().catch(() => null);

      setAgentMeta(nextResponse.scan);
      setIntegrity(nextResponse.integrity ?? null);
      setIntegrityStatus(nextResponse.integrity ? 'ready' : 'error');
      setReflectionItems(nextResponse.reflection ?? []);
      setWorkspaceSnapshot(nextSnapshot);
      setWorkspaceStatus(nextSnapshot ? 'ready' : 'error');
      setAgentStatus(nextResponse.scan?.executed ? 'success' : 'blocked');
    } catch (error) {
      setAgentStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Workspace agent scan could not be executed.',
      );
    }
  }

  async function handleProcessAgentQueue() {
    if (agentProcessStatus === 'loading') {
      return;
    }

    setAgentProcessStatus('loading');
    setErrorMessage('');

    try {
      const nextResponse = await processWorkspaceAgentQueue(3);
      const nextSnapshot = await fetchWorkspaceSnapshot().catch(() => null);

      setAgentProcessMeta(nextResponse.process);
      setIntegrity(nextResponse.integrity ?? null);
      setIntegrityStatus(nextResponse.integrity ? 'ready' : 'error');
      setReflectionItems(nextResponse.reflection ?? []);
      setWorkspaceSnapshot(nextSnapshot);
      setWorkspaceStatus(nextSnapshot ? 'ready' : 'error');
      setAgentProcessStatus(nextResponse.process?.executed ? 'success' : 'blocked');
    } catch (error) {
      setAgentProcessStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Workspace agent queue could not be processed.',
      );
    }
  }

  async function handleAttachmentChange(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    const roomLeft = MAX_ATTACHMENTS - form.attachments.length;
    const selectedFiles = files.slice(0, roomLeft);

    setUploadingImages(true);
    setErrorMessage('');

    try {
      const nextAttachments = await Promise.all(
        selectedFiles.map((file) => normalizeImageFile(file)),
      );

      setForm((current) => ({
        ...current,
        attachments: [...current.attachments, ...nextAttachments],
      }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '이미지 처리 중 오류가 발생했습니다.',
      );
    } finally {
      setUploadingImages(false);
    }
  }

  function removeAttachment(id) {
    setForm((current) => ({
      ...current,
      attachments: current.attachments.filter((item) => item.id !== id),
    }));
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-4 text-ink sm:px-6 lg:px-10 lg:py-6">
      <BackgroundOrbs />

      <div className="relative mx-auto flex max-w-[1560px] flex-col gap-6">
        <header className="rounded-[36px] border border-white/70 bg-white/80 p-6 shadow-card backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-medium uppercase tracking-[0.26em] text-white/90">
                <Sparkles className="h-3.5 w-3.5" />
                LLM Wiki
              </span>
              <h1 className="mt-4 max-w-4xl font-display text-4xl leading-tight text-slate-950 sm:text-5xl">
                Wiki Node Creator
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
                텍스트와 이미지를 함께 넣으면 Gemini가 위키 노드와 지식 그래프를 한 번에
                생성합니다.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroInfoCard title="Model" value={result?.model ?? GEMINI_MODEL} />
              <HeroInfoCard title="Input" value="Text + Image" />
              <HeroInfoCard title="Current Step" value={integrity?.currentStep?.label ?? 'Loading'} />
              <HeroInfoCard title="Storage" value={integrity?.storage?.mode ?? 'Checking'} />
            </div>
          </div>
        </header>

        <nav className="rounded-[32px] border border-white/70 bg-white/85 p-4 shadow-card backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">P-Reinforce Workspace</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Step dependencies decide what is preview-only and what is operational.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {WORKSPACE_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = deferredSection === section.id;
                const isBlocked =
                  section.blockedBy &&
                  integrity?.gates?.some(
                    (gate) =>
                      gate.blocksStep === section.blockedBy &&
                      ['blocked', 'fail'].includes(gate.status),
                  );

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      startTransition(() => {
                        setActiveSection(section.id);
                      });
                    }}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-slate-950 text-white shadow-soft'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                    {isBlocked ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                          isActive ? 'bg-white/15 text-white/80' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        Gate
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{activeSectionMeta.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {activeSectionMeta.description}
                </p>
              </div>
              <StatusBadge
                tone={
                  activeSectionMeta.blockedBy &&
                  integrity?.gates?.some(
                    (gate) =>
                      gate.blocksStep === activeSectionMeta.blockedBy &&
                      ['blocked', 'fail'].includes(gate.status),
                  )
                    ? 'amber'
                    : 'emerald'
                }
              >
                {activeSectionMeta.blockedBy
                  ? `Depends on ${activeSectionMeta.blockedBy}`
                  : 'Ready in current runtime'}
              </StatusBadge>
            </div>
          </div>
        </nav>

        {deferredSection === 'studio' ? (
          <main className="grid gap-6 lg:grid-cols-[440px_minmax(0,1fr)]">
          <section className="self-start rounded-[36px] border border-white/70 bg-white/85 p-6 shadow-card backdrop-blur-xl sm:p-7 lg:sticky lg:top-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky/10 text-sky shadow-soft">
                  <Wand2 className="h-6 w-6" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-slate-950">
                  새로운 지식 노드 추가
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  텍스트 없이 이미지 만으로도 생성할 수 있고, 이미지는 자동으로 압축해 전송합니다.
                </p>
              </div>
            </div>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
              <FieldLabel htmlFor="knowledge-type">지식의 종류</FieldLabel>
              <select
                id="knowledge-type"
                value={form.knowledgeType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    knowledgeType: event.target.value,
                  }))
                }
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-sky focus:bg-white focus:ring-4 focus:ring-sky/10"
              >
                {KNOWLEDGE_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>

              <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-medium text-slate-900">{selectedType.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{selectedType.description}</p>
              </div>

              <FieldLabel htmlFor="raw-data">Raw 데이터</FieldLabel>
              <textarea
                id="raw-data"
                value={form.rawText}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    rawText: event.target.value,
                  }))
                }
                placeholder="오늘 새롭게 알게 된 정보나 데이터를 편하게 입력하세요. 텍스트 없이 이미지 설명만으로도 구조화할 수 있습니다."
                className="min-h-[260px] w-full resize-none rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky focus:bg-white focus:ring-4 focus:ring-sky/10"
              />

              <FieldLabel htmlFor="image-upload">이미지 첨부</FieldLabel>
              <label
                htmlFor="image-upload"
                className="flex min-h-[152px] cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-white px-5 py-6 text-center transition hover:border-sky hover:bg-sky/5"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky/10 text-sky">
                  {uploadingImages ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-5 w-5" />
                  )}
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-900">
                  이미지를 올려 멀티모달 분석으로 확장하기
                </p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  최대 {MAX_ATTACHMENTS}장까지 첨부할 수 있고, 긴 변 {MAX_ATTACHMENT_DIMENSION}px
                  기준으로 자동 리사이즈됩니다.
                </p>
              </label>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleAttachmentChange}
                disabled={uploadingImages || form.attachments.length >= MAX_ATTACHMENTS}
              />

              {form.attachments.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {form.attachments.map((attachment) => (
                    <article
                      key={attachment.id}
                      className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-soft"
                    >
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.name}
                        className="h-36 w-full object-cover"
                      />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {attachment.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {attachment.mimeType} · {formatBytes(attachment.size)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(attachment.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                            aria-label="이미지 제거"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Cpu className="h-4 w-4 text-sky" />
                  Gemini Pipeline
                </div>
                <div className="mt-4 grid gap-3 text-sm text-slate-600">
                  <MetaLine label="Model">{result?.model ?? GEMINI_MODEL}</MetaLine>
                  <MetaLine label="Input mode">텍스트 + 이미지 멀티모달</MetaLine>
                  <MetaLine label="Output">Markdown + Knowledge Graph JSON</MetaLine>
                  <MetaLine label="Deploy">Vercel Serverless API</MetaLine>
                </div>
              </div>

              <IntegrityPanel
                integrity={integrity}
                integrityStatus={integrityStatus}
                gateSummary={gateSummary}
                proposalMeta={proposalMeta}
                persistenceMeta={persistenceMeta}
                applyStatus={applyStatus}
                hasApplyPayload={Boolean(applyPayload)}
                onApply={handleApply}
              />

              {errorMessage ? (
                <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gemini가 구조화 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 transition group-hover:rotate-12" />
                    구조화 및 연결망 생성
                  </>
                )}
              </button>
            </form>
          </section>

          <section className="rounded-[36px] border border-white/70 bg-white/85 p-6 shadow-card backdrop-blur-xl sm:p-7">
            <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {status === 'success' ? 'Gemini Result' : 'Result Panel'}
                </span>
                <h2 className="mt-3 text-2xl font-semibold text-slate-950">
                  {result?.title ?? '생성 결과'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  생성된 위키 노드와 그래프를 탭으로 오가며 바로 검토하고 복사할 수 있습니다.
                </p>
              </div>

              {graphStats ? (
                <div className="grid grid-cols-3 gap-3">
                  <ResultStat label="총 노드" value={graphStats.totalNodes} />
                  <ResultStat label="태그" value={graphStats.tags} />
                  <ResultStat label="연결선" value={graphStats.edges} />
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {TABS.map((tab) => {
                const Icon = tab.icon;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${
                      activeTab === tab.id
                        ? 'bg-slate-950 text-white shadow-soft'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 min-h-[720px]">
              {reflectionItems.length > 0 ? (
                <ReflectionPanel items={reflectionItems} persistenceMeta={persistenceMeta} />
              ) : null}
              {status === 'idle' && <EmptyState />}
              {status === 'loading' && <LoadingState attachmentsCount={form.attachments.length} />}
              {status === 'error' && (
                <ErrorState
                  message={errorMessage}
                  onRetry={() => {
                    if (canSubmit) {
                      void handleSubmit({ preventDefault() {} });
                    }
                  }}
                />
              )}
              {status === 'success' && result ? (
                activeTab === 'markdown' ? (
                  <MarkdownView result={result} copied={copied} onCopy={handleCopy} />
                ) : (
                  <Suspense fallback={<GraphLoadingShell />}>
                    <GraphCanvas graph={result.graph} />
                  </Suspense>
                )
              ) : null}
            </div>
          </section>
          </main>
        ) : (
          <WorkspaceSectionView
            sectionId={deferredSection}
            integrity={integrity}
            workspaceSnapshot={workspaceSnapshot}
            workspaceStatus={workspaceStatus}
            activeWorkspaceNodePath={activeWorkspaceNodePath}
            workspaceNodeDetail={workspaceNodeDetail}
            workspaceNodeStatus={workspaceNodeStatus}
            onSelectWorkspaceNode={handleSelectWorkspaceNode}
            onOpenWorkspaceNode={handleOpenWorkspaceNode}
            proposalMeta={proposalMeta}
            persistenceMeta={persistenceMeta}
            reflectionItems={reflectionItems}
            result={result}
            form={form}
            gateSummary={gateSummary}
          />
        )}
      </div>
    </div>
  );
}

function WorkspaceSectionView({
  sectionId,
  integrity,
  workspaceSnapshot,
  workspaceStatus,
  activeWorkspaceNodePath,
  workspaceNodeDetail,
  workspaceNodeStatus,
  onSelectWorkspaceNode,
  onOpenWorkspaceNode,
  proposalMeta,
  persistenceMeta,
  reflectionItems,
  result,
  form,
  gateSummary,
}) {
  const sectionMeta =
    WORKSPACE_SECTIONS.find((section) => section.id === sectionId) ?? WORKSPACE_SECTIONS[1];
  const blockedGate = integrity?.gates?.find(
    (gate) =>
      ['blocked', 'fail'].includes(gate.status) &&
      gate.blocksStep === sectionMeta.blockedBy,
  );

  if (sectionId === 'inbox') {
    return (
      <SectionShell
        eyebrow="Capture Layer"
        title="Inbox"
        description="Raw evidence should land here before it is promoted into a wiki node."
        blockedGate={blockedGate}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            title="Current Capture Draft"
            description="This is the raw payload that would become an immutable source bundle in Step 4."
          >
            <div className="space-y-3">
              <MetaLine label="Knowledge type">{form.knowledgeType}</MetaLine>
              <MetaLine label="Raw text chars">{String(form.rawText.trim().length)}</MetaLine>
              <MetaLine label="Attachments">{String(form.attachments.length)}</MetaLine>
              <MetaLine label="Predicted raw root">{proposalMeta?.rawRoot ?? 'Generate once to inspect.'}</MetaLine>
            </div>
          </SectionCard>

          <SectionCard
            title="Persisted Raw Ledger"
            description="Once Step 4 writes are enabled, raw bundles become inspectable evidence instead of UI-only drafts."
          >
            {workspaceStatus === 'ready' ? (
              workspaceSnapshot?.raw?.recentSources?.length ? (
                <div className="space-y-3">
                  <MetaLine label="Sources">{String(workspaceSnapshot.raw.sourceCount)}</MetaLine>
                  {workspaceSnapshot.raw.recentSources.map((source) => (
                    <div
                      key={source.sourceId}
                      className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-slate-900">{source.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{source.rawRoot}</p>
                      <p className="mt-2 text-sm text-slate-600">
                        {source.attachmentCount} attachments · {source.status}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptySectionMessage
                  title="No persisted raw bundles yet"
                  description="Apply a proposal in filesystem mode to materialize immutable raw evidence."
                />
              )
            ) : (
              <StepGateList gates={integrity?.gates ?? []} focusStep="step4" />
            )}
          </SectionCard>
        </div>
      </SectionShell>
    );
  }

  if (sectionId === 'garden') {
    return (
      <SectionShell
        eyebrow="Knowledge Garden"
        title="Garden"
        description="This view combines graph exploration with category topology and structural health."
        blockedGate={blockedGate}
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_380px]">
          <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-soft">
            <div className="border-b border-slate-200/80 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">Graph Preview</p>
              <p className="mt-1 text-sm text-slate-500">
                Persisted graph cache takes priority, and Studio proposals remain the fallback preview.
              </p>
            </div>
            <div className="h-[640px]">
              {workspaceNodeDetail?.graph ? (
                <Suspense fallback={<GraphLoadingShell />}>
                  <GraphCanvas graph={workspaceNodeDetail.graph} />
                </Suspense>
              ) : workspaceSnapshot?.graph?.focusedGraph ? (
                <Suspense fallback={<GraphLoadingShell />}>
                  <GraphCanvas graph={workspaceSnapshot.graph.focusedGraph} />
                </Suspense>
              ) : result?.graph ? (
                <Suspense fallback={<GraphLoadingShell />}>
                  <GraphCanvas graph={result.graph} />
                </Suspense>
              ) : (
                <EmptySectionMessage
                  title="No graph yet"
                  description="Generate a wiki proposal in Studio to seed the Garden preview."
                />
              )}
            </div>
          </div>

          <div className="space-y-5">
            <SectionCard
              title="Persisted Nodes"
              description="Select a stored node to reopen its markdown and graph context."
            >
              <PersistedNodeList
                entries={workspaceSnapshot?.wiki?.recentEntries ?? []}
                activePath={activeWorkspaceNodePath}
                onSelect={onSelectWorkspaceNode}
              />
            </SectionCard>
            <SectionCard
              title="Persisted Node Preview"
              description="This is the reopen flow for durable wiki pages."
            >
              <WorkspaceNodePreview
                node={workspaceNodeDetail}
                status={workspaceNodeStatus}
                fallbackItems={reflectionItems}
              />
            </SectionCard>
            <SectionCard
              title="Category Topology"
              description="These are the semantic roots visible in the live workspace."
            >
              <CategoryList workspaceSnapshot={workspaceSnapshot} />
            </SectionCard>
            <SectionCard
              title="Structural Health"
              description="Garden lint turns graph shape into actionable maintenance signals."
            >
              <GardenHealthCard
                lint={workspaceSnapshot?.lint}
                lintMeta={lintMeta}
                lintStatus={lintStatus}
                onRunLint={() => void handleRunLint()}
              />
            </SectionCard>
          </div>
        </div>
      </SectionShell>
    );
  }

  if (sectionId === 'reinforce') {
    return (
      <SectionShell
        eyebrow="Policy Loop"
        title="Reinforce"
        description="User corrections now update policy artifacts without mutating wiki truth."
        blockedGate={blockedGate}
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            title="Feedback Console"
            description="Signals update policy artifacts and append reinforce_update events, but never rewrite node truth."
          >
            <ReinforcementConsole
              blocked={Boolean(blockedGate)}
              node={workspaceNodeDetail}
              fallbackEntry={selectedWorkspaceEntry}
              note={reinforcementNote}
              status={reinforcementStatus}
              feedbackMeta={reinforcementMeta}
              onNoteChange={setReinforcementNote}
              onSignal={(signalType, targetCategory) =>
                void handleReinforcement(signalType, targetCategory)
              }
            />
          </SectionCard>

          <div className="space-y-5">
            <SectionCard
              title="Policy State"
              description="Classification weights and boundary adjustments are the durable memory of user guidance."
            >
              <PolicyStateCard policy={workspaceSnapshot?.policy} />
            </SectionCard>
            <SectionCard
              title="Dependency Gate"
              description="Reinforcement is only trustworthy when persistence is already real."
            >
              <StepGateList gates={integrity?.gates ?? []} focusStep="step5" />
            </SectionCard>
          </div>
        </div>
      </SectionShell>
    );
  }

  if (sectionId === 'timeline') {
    const timelineItems = buildTimelineItems({
      proposalMeta,
      persistenceMeta,
      gateSummary,
      workspaceSnapshot,
    });

    return (
      <SectionShell
        eyebrow="Semantic Timeline"
        title="Timeline"
        description="Operational durability grows as capture, reinforcement, and lint become traceable."
        blockedGate={blockedGate}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <SectionCard
            title="Current Event Story"
            description="This is the event chain implied by the current runtime and the persisted workspace."
          >
            <div className="space-y-4">
              {timelineItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
                    </div>
                    <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="space-y-5">
            <SectionCard
              title="Local Agent"
              description="The raw watcher writes queue and status artifacts before Git automation exists."
            >
              <AgentStatusCard
                agent={workspaceSnapshot?.agent}
                agentMeta={agentMeta}
                agentStatus={agentStatus}
                processMeta={agentProcessMeta}
                processStatus={agentProcessStatus}
                onScan={() => void handleRunAgentScan()}
                onProcess={() => void handleProcessAgentQueue()}
              />
            </SectionCard>

            <SectionCard
              title="Recent Events"
              description="Append-only event logs are the backbone of long-horizon traceability."
            >
              {workspaceSnapshot?.events?.length ? (
                <div className="space-y-3">
                  {workspaceSnapshot.events.map((event) => (
                    <div
                      key={event.eventId}
                      className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{event.eventType}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-500">{event.summary}</p>
                          {event.nodeTitle ? (
                            <p className="mt-2 text-xs font-medium text-sky">
                              {event.nodeTitle}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-slate-400">{event.timestamp}</p>
                        </div>
                        {event.nodePath ? (
                          <button
                            type="button"
                            onClick={() => void onOpenWorkspaceNode?.(event.nodePath)}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                          >
                            Open node
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptySectionMessage
                  title="No durable events yet"
                  description="Apply in filesystem mode to append capture and proposal events."
                />
              )}
            </SectionCard>
          </div>
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      eyebrow="Contracts and Gates"
      title="Schema Lab"
      description="This is where the Karpathy-first contracts and step dependencies stay visible."
      blockedGate={null}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard
          title="Contract Health"
          description="The app now compiles and reads machine contracts before claiming system progress."
        >
          <div className="space-y-3">
            <MetaLine label="Bundle version">{String(integrity?.contractHealth?.bundleVersion ?? '-')}</MetaLine>
            <MetaLine label="Contracts">
              {String(integrity?.contractHealth?.contracts?.length ?? 0)}
            </MetaLine>
            <MetaLine label="Current step">{integrity?.currentStep?.label ?? '-'}</MetaLine>
            <MetaLine label="Workspace root">{workspaceSnapshot?.workspaceRoot ?? 'Loading...'}</MetaLine>
          </div>
        </SectionCard>

        <SectionCard
          title="Dependency Model"
          description="Every future step must pass the gates below before it becomes more than UI."
        >
          <StepGateList gates={integrity?.gates ?? []} />
        </SectionCard>

        <SectionCard
          title="Agent Artifacts"
          description="Step 7 starts when queue and watcher status become durable first-class artifacts."
        >
          <AgentSchemaSummary agent={workspaceSnapshot?.agent} />
        </SectionCard>

        <SectionCard
          title="Git Readiness"
          description="Step 8 stays blocked until this workspace can be checkpointed with Git."
        >
          <GitReadinessCard git={workspaceSnapshot?.git} />
        </SectionCard>

        <SectionCard
          title="Migration & Rebuild"
          description="Step 9 — schema migrations, rebuild plans, and diff-based regeneration."
        >
          <RebuildCard />
        </SectionCard>
      </div>
    </SectionShell>
  );
}

function SectionShell({ eyebrow, title, description, blockedGate, children }) {
  return (
    <section className="rounded-[36px] border border-white/70 bg-white/85 p-6 shadow-card backdrop-blur-xl sm:p-7">
      <div className="border-b border-slate-200/80 pb-5">
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {eyebrow}
        </span>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
          </div>
          {blockedGate ? (
            <StatusBadge tone="amber">{`Blocked by ${blockedGate.blocksStep}`}</StatusBadge>
          ) : (
            <StatusBadge tone="emerald">Visible in current runtime</StatusBadge>
          )}
        </div>
      </div>

      {blockedGate ? (
        <div className="mt-5 rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
          {blockedGate.detail}
        </div>
      ) : null}

      <div className="mt-5">{children}</div>
    </section>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <article className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-soft">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function StepGateList({ gates, focusStep }) {
  const visibleGates = focusStep
    ? gates.filter((gate) => gate.blocksStep === focusStep)
    : gates;

  return (
    <div className="space-y-3">
      {visibleGates.map((gate) => (
        <div
          key={gate.id}
          className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{gate.label}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">{gate.detail}</p>
            </div>
            <StatusBadge tone={gate.status === 'pass' ? 'emerald' : 'amber'}>
              {gate.status}
            </StatusBadge>
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryList({ workspaceSnapshot }) {
  const categories = workspaceSnapshot?.wiki?.recentEntries?.length
    ? [
        ...new Set(
          workspaceSnapshot.wiki.recentEntries.map((entry) =>
            String(entry.path ?? '')
              .split('/')
              .slice(0, -1)
              .join('/'),
          ),
        ),
      ]
    : ['10_Wiki/Projects', '10_Wiki/Topics', '10_Wiki/Decisions', '10_Wiki/Skills', '10_Wiki/Views'];

  return (
    <div className="space-y-3">
      {categories.map((category) => (
        <div
          key={category}
          className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
        >
          {category}
        </div>
      ))}
    </div>
  );
}

function PersistedNodeList({ entries, activePath, onSelect }) {
  if (!entries.length) {
    return (
      <EmptySectionMessage
        title="No persisted nodes yet"
        description="Apply a proposal in filesystem mode to reopen it here later."
      />
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <button
          key={entry.path}
          type="button"
          onClick={() => void onSelect?.(entry.path)}
          className={`w-full rounded-[22px] border px-4 py-3 text-left transition ${
            activePath === entry.path
              ? 'border-sky bg-sky/5'
              : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
          <p className="mt-1 text-xs text-slate-500">{entry.path}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{entry.summary}</p>
        </button>
      ))}
    </div>
  );
}

function WorkspaceNodePreview({ node, status, fallbackItems }) {
  if (status === 'loading') {
    return (
      <EmptySectionMessage
        title="Loading persisted node"
        description="Reading markdown and graph context from the local workspace."
      />
    );
  }

  if (!node) {
    return <ReflectionSummary items={fallbackItems} />;
  }

  const sections = splitMarkdownSections(node.markdown);

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">{node.path}</p>
        <p className="mt-2 text-xs leading-6 text-slate-500">{sections.frontmatter || 'No frontmatter.'}</p>
      </div>
      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
        <ReactMarkdown components={MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
          {sections.body}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function ReinforcementConsole({
  blocked,
  node,
  fallbackEntry,
  note,
  status,
  feedbackMeta,
  onNoteChange,
  onSignal,
}) {
  const activeNode = node
    ? {
        title: node.frontmatter?.title ?? node.path,
        path: node.path,
        category:
          extractPathCategory(node.frontmatter?.category_path) ??
          extractPathCategory(fallbackEntry?.path),
      }
    : fallbackEntry
      ? {
          title: fallbackEntry.title,
          path: fallbackEntry.path,
          category: extractPathCategory(fallbackEntry.path),
        }
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Focused node</p>
        {activeNode ? (
          <>
            <p className="mt-2 text-sm font-semibold text-slate-900">{activeNode.title}</p>
            <p className="mt-1 text-xs text-slate-500">{activeNode.path}</p>
            <p className="mt-2 text-sm text-slate-600">
              Current category signal: {activeNode.category ?? 'Unknown'}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Open a persisted node first so reinforcement attaches to a durable page.
          </p>
        )}
      </div>

      <textarea
        value={note}
        onChange={(event) => onNoteChange?.(event.target.value)}
        placeholder="Why are you reinforcing this node? A short note becomes durable policy context."
        className="min-h-[120px] w-full resize-none rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky focus:bg-white focus:ring-4 focus:ring-sky/10"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <ReinforceActionButton
          disabled={blocked || !activeNode || status === 'loading'}
          onClick={() => onSignal?.('confirm_category', activeNode?.category)}
        >
          Confirm category
        </ReinforceActionButton>
        <ReinforceActionButton
          disabled={blocked || !activeNode || status === 'loading'}
          onClick={() => onSignal?.('tighten_links')}
        >
          Tighten links
        </ReinforceActionButton>
        {['Projects', 'Topics', 'Decisions', 'Skills'].map((category) => (
          <ReinforceActionButton
            key={category}
            disabled={blocked || !activeNode || status === 'loading'}
            onClick={() => onSignal?.('move_category', category)}
          >
            {`Move to ${category}`}
          </ReinforceActionButton>
        ))}
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">Reinforcement status</p>
          <StatusBadge
            tone={
              status === 'success'
                ? 'emerald'
                : status === 'error'
                  ? 'red'
                  : status === 'loading'
                    ? 'amber'
                    : 'slate'
            }
          >
            {status === 'success'
              ? 'Persisted'
              : status === 'loading'
                ? 'Applying'
                : status === 'error'
                  ? 'Error'
                  : 'Idle'}
          </StatusBadge>
        </div>
        {feedbackMeta ? (
          <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <p>{feedbackMeta.nodeTitle}</p>
            <p>{feedbackMeta.signalType}</p>
            {feedbackMeta.targetCategory ? <p>Target: {feedbackMeta.targetCategory}</p> : null}
            {feedbackMeta.note ? <p>Note: {feedbackMeta.note}</p> : null}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Quick feedback updates policy artifacts without rewriting the wiki document itself.
          </p>
        )}
      </div>
    </div>
  );
}

function ReinforceActionButton({ children, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-[48px] items-center justify-center rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
    >
      {children}
    </button>
  );
}

function PolicyStateCard({ policy }) {
  if (!policy?.version) {
    return (
      <EmptySectionMessage
        title="Policy not materialized yet"
        description="Apply a node in filesystem mode first so policy artifacts can become durable."
      />
    );
  }

  const weights = Object.entries(policy.classificationWeights ?? {});

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MetaLine label="Version">{policy.version}</MetaLine>
        <MetaLine label="Updated">{policy.updatedAt ?? '-'}</MetaLine>
        <MetaLine label="Link threshold">{policy.linkThreshold ?? '-'}</MetaLine>
        <MetaLine label="Boundary shifts">{policy.boundaryAdjustments?.length ?? 0}</MetaLine>
      </div>

      <div className="space-y-3">
        {weights.map(([category, value]) => (
          <div key={category} className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{category}</p>
              <span className="text-sm text-slate-500">{Number(value).toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
        <p className="text-sm font-semibold text-slate-900">Recent boundary shifts</p>
        {policy.boundaryAdjustments?.length ? (
          <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
            {policy.boundaryAdjustments.map((adjustment, index) => (
                <div key={`${adjustment.created_at}-${index}`}>
                  <p className="font-medium text-slate-800">
                    {`${adjustment.from} -> ${adjustment.to}`}
                  </p>
                  <p>{adjustment.reason}</p>
                </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-500">
            No durable boundary adjustments yet.
          </p>
        )}
      </div>
    </div>
  );
}

function GardenHealthCard({ lint, lintMeta, lintStatus, onRunLint }) {
  if (!lint) {
    return (
      <EmptySectionMessage
        title="No lint report yet"
        description="Persist the workspace first so Garden health can be measured."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge tone={lint.tone === 'amber' ? 'amber' : lint.tone === 'emerald' ? 'emerald' : 'slate'}>
          {lint.tone === 'emerald' ? 'Healthy' : lint.tone === 'amber' ? 'Needs attention' : 'Observing'}
        </StatusBadge>
        <button
          type="button"
          onClick={onRunLint}
          disabled={lintStatus === 'loading'}
          className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {lintStatus === 'loading' ? 'Running lint...' : 'Run lint'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ResultStat label="Orphans" value={lint.orphanCount ?? 0} />
        <ResultStat label="Weak" value={lint.weaklyLinkedCount ?? 0} />
        <ResultStat label="Stale" value={lint.staleCount ?? 0} />
        <ResultStat label="Contradictions" value={lint.contradictionCount ?? 0} />
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
        <p className="text-sm font-semibold text-slate-900">Highlights</p>
        {lint.highlights?.length ? (
          <div className="mt-3 space-y-3">
            {lint.highlights.map((item) => (
              <div key={`${item.nodeId}-${item.issue}`} className="rounded-[18px] bg-white px-3 py-3">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{item.issue}</p>
                <p className="mt-1 text-xs text-slate-500">{item.path}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-500">
            No structural hotspots were detected in the current graph cache.
          </p>
        )}
      </div>

      {lintMeta?.persisted ? (
        <p className="text-xs text-slate-500">Latest lint run was appended to the event log.</p>
      ) : null}
    </div>
  );
}

function AgentStatusCard({
  agent,
  agentMeta,
  agentStatus,
  processMeta,
  processStatus,
  onScan,
  onProcess,
}) {
  if (!agent) {
    return (
      <EmptySectionMessage
        title="Agent artifacts not materialized yet"
        description="Run a local scan in filesystem mode to create queue and watcher status artifacts."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge
          tone={
            agent.state === 'watching'
              ? 'emerald'
              : agent.state === 'error'
                ? 'red'
                : 'slate'
          }
        >
          {agent.state}
        </StatusBadge>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onScan}
            disabled={agentStatus === 'loading'}
            className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {agentStatus === 'loading' ? 'Scanning...' : 'Run scan'}
          </button>
          <button
            type="button"
            onClick={onProcess}
            disabled={processStatus === 'loading'}
            className="inline-flex h-10 items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-sky disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {processStatus === 'loading' ? 'Processing...' : 'Process queue'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetaLine label="Watch root">{agent.watchRoot ?? '-'}</MetaLine>
        <MetaLine label="Queue depth">{agent.queueDepth ?? 0}</MetaLine>
        <MetaLine label="Completed">{agent.completedCount ?? 0}</MetaLine>
        <MetaLine label="Failed">{agent.failedCount ?? 0}</MetaLine>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
        <p className="text-sm font-semibold text-slate-900">Last scan</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {agent.lastScanAt ?? 'No scan yet'}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {agent.lastEventSummary ?? 'No agent summary yet.'}
        </p>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
        <p className="text-sm font-semibold text-slate-900">Recent jobs</p>
        {agent.recentJobs?.length ? (
          <div className="mt-3 space-y-3">
            {agent.recentJobs.map((job) => (
              <div key={job.job_id} className="rounded-[18px] bg-white px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{job.job_type}</p>
                  <StatusBadge tone={job.status === 'queued' ? 'amber' : 'emerald'}>
                    {job.status}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{job.raw_root}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-500">
            No queued raw jobs yet.
          </p>
        )}
      </div>

      {agentMeta?.summary ? (
        <p className="text-xs text-slate-500">
          Latest manual scan saw {agentMeta.summary.manifestsScanned} manifests and queued {agentMeta.summary.queuedJobs} jobs.
        </p>
      ) : null}

      {processMeta?.summary ? (
        <p className="text-xs text-slate-500">
          Worker completed {processMeta.summary.completedCount} jobs, skipped {processMeta.summary.skippedCount}, and failed {processMeta.summary.failedCount}.
        </p>
      ) : null}
    </div>
  );
}

function AgentSchemaSummary({ agent }) {
  if (!agent) {
    return (
      <EmptySectionMessage
        title="No agent contracts on disk yet"
        description="`30_Ops/jobs/queue.json` and `agent-status.json` appear after the first local scan."
      />
    );
  }

  return (
    <div className="space-y-3">
      <MetaLine label="Queue depth">{agent.queueDepth ?? 0}</MetaLine>
      <MetaLine label="Watch mode">{agent.watchMode ?? 'manual'}</MetaLine>
      <MetaLine label="State">{agent.state ?? 'idle'}</MetaLine>
      <MetaLine label="Last summary">{agent.lastEventSummary ?? '-'}</MetaLine>
    </div>
  );
}

function GitReadinessCard({ git }) {
  const [checkpointStatus, setCheckpointStatus] = useState(null);
  const [checkpointLoading, setCheckpointLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState(null);
  const [pushLoading, setPushLoading] = useState(false);

  if (!git) {
    return (
      <EmptySectionMessage
        title="Git status unavailable"
        description="The workspace snapshot has not reported Git readiness yet."
      />
    );
  }

  const handleCheckpoint = async () => {
    setCheckpointLoading(true);
    setCheckpointStatus(null);
    try {
      const result = await executeGitCheckpoint();
      setCheckpointStatus(result.checkpoint);
    } catch (error) {
      setCheckpointStatus({ committed: false, message: error.message });
    } finally {
      setCheckpointLoading(false);
    }
  };

  const handlePush = async () => {
    setPushLoading(true);
    setPushStatus(null);
    try {
      const result = await pushGitCheckpoint();
      setPushStatus(result.push);
    } catch (error) {
      setPushStatus({ pushed: false, message: error.message });
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <MetaLine label="Repository">{git.repository ? 'Yes' : 'No'}</MetaLine>
      <MetaLine label="Branch">{git.branch ?? '-'}</MetaLine>
      <MetaLine label="Dirty files">{git.dirtyFiles ?? 0}</MetaLine>
      <MetaLine label="Can commit">{git.canCommit ? 'Yes' : 'No'}</MetaLine>
      <MetaLine label="Last commit">{git.lastCommit ?? '-'}</MetaLine>
      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
        {git.message}
      </div>
      {git.checkpointPlan ? (
        <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
          <p className="text-sm font-semibold text-slate-900">Checkpoint plan</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {git.checkpointPlan.commitMessage}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <MetaLine label="Touched areas">
              {git.checkpointPlan.touchedAreas?.length
                ? git.checkpointPlan.touchedAreas.join(', ')
                : 'workspace'}
            </MetaLine>
            <MetaLine label="Preview files">
              {git.checkpointPlan.additionalFileCount > 0
                ? `${git.checkpointPlan.touchedFiles.length}+`
                : git.checkpointPlan.touchedFiles.length}
            </MetaLine>
          </div>
          {git.checkpointPlan.touchedFiles?.length ? (
            <div className="mt-3 space-y-2">
              {git.checkpointPlan.touchedFiles.map((filePath) => (
                <div
                  key={filePath}
                  className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                >
                  {filePath}
                </div>
              ))}
            </div>
          ) : null}
          {git.checkpointPlan.additionalFileCount > 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              Plus {git.checkpointPlan.additionalFileCount} more changed files.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* --- Git Actions --- */}
      {git.repository ? (
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            id="git-checkpoint-btn"
            disabled={!git.canCommit || checkpointLoading}
            onClick={handleCheckpoint}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checkpointLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Checkpoint
          </button>
          <button
            type="button"
            id="git-push-btn"
            disabled={pushLoading}
            onClick={handlePush}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pushLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Push
          </button>
        </div>
      ) : null}

      {/* Checkpoint result */}
      {checkpointStatus ? (
        <div
          className={`rounded-[22px] border px-4 py-3 text-sm leading-6 ${
            checkpointStatus.committed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <p className="font-semibold">
            {checkpointStatus.committed ? '✅ Committed' : '⚠️ Not committed'}
          </p>
          <p className="mt-1">{checkpointStatus.message}</p>
          {checkpointStatus.commitHash ? (
            <p className="mt-1 font-mono text-xs">{checkpointStatus.commitHash}</p>
          ) : null}
        </div>
      ) : null}

      {/* Push result */}
      {pushStatus ? (
        <div
          className={`rounded-[22px] border px-4 py-3 text-sm leading-6 ${
            pushStatus.pushed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <p className="font-semibold">
            {pushStatus.pushed ? '✅ Pushed' : '⚠️ Push failed'}
          </p>
          <p className="mt-1">{pushStatus.message}</p>
        </div>
      ) : null}
    </div>
  );
}

function RebuildCard() {
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [rebuildResult, setRebuildResult] = useState(null);
  const [rebuildLoading, setRebuildLoading] = useState(false);

  const handleFetchPlan = async () => {
    setPlanLoading(true);
    setPlan(null);
    try {
      const result = await fetchRebuildPlan();
      setPlan(result.plan);
    } catch (error) {
      setPlan({ can_rebuild: false, message: error.message });
    } finally {
      setPlanLoading(false);
    }
  };

  const handleRebuild = async () => {
    setRebuildLoading(true);
    setRebuildResult(null);
    try {
      const result = await executeRebuild('manual');
      setRebuildResult(result.rebuild);
    } catch (error) {
      setRebuildResult({ executed: false, message: error.message });
    } finally {
      setRebuildLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          id="rebuild-plan-btn"
          disabled={planLoading}
          onClick={handleFetchPlan}
          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {planLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          Scan Plan
        </button>
        <button
          type="button"
          id="rebuild-execute-btn"
          disabled={rebuildLoading || (!plan?.can_rebuild && plan !== null)}
          onClick={handleRebuild}
          className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rebuildLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Rebuild
        </button>
      </div>

      {plan ? (
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6">
          <p className="font-semibold text-slate-900">{plan.message}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <MetaLine label="Wiki nodes">{plan.total_wiki_nodes ?? 0}</MetaLine>
            <MetaLine label="Need rebuild">{plan.rebuild_count ?? 0}</MetaLine>
            <MetaLine label="Raw sources">{plan.total_raw_sources ?? 0}</MetaLine>
          </div>
          {plan.needs_rebuild?.length > 0 ? (
            <div className="mt-3 space-y-2">
              {plan.needs_rebuild.slice(0, 5).map((node) => (
                <div
                  key={node.path}
                  className="rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-2"
                >
                  <p className="text-xs font-semibold text-amber-800">{node.path}</p>
                  <p className="mt-1 text-xs text-amber-700">
                    {node.rebuild_reasons?.join(', ')}
                  </p>
                </div>
              ))}
              {plan.needs_rebuild.length > 5 ? (
                <p className="text-xs text-slate-500">
                  +{plan.needs_rebuild.length - 5} more nodes need rebuild.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <EmptySectionMessage
          title="No rebuild plan loaded"
          description="Click 'Scan Plan' to analyze wiki nodes for rebuild needs."
        />
      )}

      {rebuildResult ? (
        <div
          className={`rounded-[22px] border px-4 py-3 text-sm leading-6 ${
            rebuildResult.executed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <p className="font-semibold">
            {rebuildResult.executed ? '✅ Rebuild complete' : '⚠️ Rebuild skipped'}
          </p>
          <p className="mt-1">{rebuildResult.message}</p>
          {rebuildResult.nodes_rebuilt > 0 ? (
            <p className="mt-1 text-xs">
              {rebuildResult.nodes_rebuilt} rebuilt, {rebuildResult.nodes_skipped} skipped
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReflectionSummary({ items }) {
  if (!items.length) {
    return (
      <EmptySectionMessage
        title="No reflection warnings"
        description="Generate or inspect a proposal to see live structural concerns."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={`${item.code ?? 'reflection'}-${index}`}
          className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-slate-900">{item.code ?? 'reflection'}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{item.message}</p>
        </div>
      ))}
    </div>
  );
}

function EmptySectionMessage({ title, description }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function IntegrityPanel({
  integrity,
  integrityStatus,
  gateSummary,
  proposalMeta,
  persistenceMeta,
  applyStatus,
  hasApplyPayload,
  onApply,
}) {
  if (integrityStatus === 'loading') {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
        <p className="text-sm font-semibold text-slate-900">P-Reinforce Integrity</p>
        <p className="mt-2 text-sm text-slate-500">Workspace 상태와 step dependency를 불러오는 중입니다.</p>
      </div>
    );
  }

  if (!integrity) {
    return (
      <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 shadow-soft">
        <p className="text-sm font-semibold text-amber-900">Integrity Unavailable</p>
        <p className="mt-2 text-sm leading-6 text-amber-700">
          현재 runtime의 step gate 상태를 읽지 못했습니다. 이 경우 결과는 제안으로만 취급하는 편이 안전합니다.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">P-Reinforce Integrity</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{integrity.currentPosition}</p>
        </div>
        <StatusBadge tone={gateSummary?.tone ?? 'slate'}>{gateSummary?.label ?? 'Checking'}</StatusBadge>
      </div>

      <div className="mt-4 grid gap-3">
        <MetaLine label="Current">{integrity.currentStep?.label ?? '-'}</MetaLine>
        <MetaLine label="Next Gate">{gateSummary?.detail ?? 'No dependency summary yet.'}</MetaLine>
        <MetaLine label="Storage">{integrity.storage?.reason ?? '-'}</MetaLine>
        {proposalMeta?.frontmatter?.id ? (
          <MetaLine label="Draft ID">{proposalMeta.frontmatter.id}</MetaLine>
        ) : null}
        {persistenceMeta ? (
          <MetaLine label="Persist">
            {persistenceMeta.persisted ? 'Filesystem write complete' : 'Proposal only'}
          </MetaLine>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <ResultStat label="Critical" value={integrity.criticalErrors?.length ?? 0} />
        <ResultStat label="Warnings" value={integrity.warnings?.length ?? 0} />
        <ResultStat label="Gates" value={integrity.gates?.length ?? 0} />
      </div>

      <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Apply and Persist</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Generate creates a draft. Apply is the explicit step that tries to write durable artifacts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onApply?.()}
            disabled={!hasApplyPayload || applyStatus === 'loading'}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-sky disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {applyStatus === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {applyStatus === 'success'
              ? 'Applied'
              : applyStatus === 'blocked'
                ? 'Apply Blocked'
                : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReflectionPanel({ items, persistenceMeta }) {
  return (
    <div className="mb-5 rounded-[28px] border border-amber-200 bg-amber-50/80 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-950">Reflection Layer</p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            step dependency를 넘기기 전에 시스템이 먼저 스스로 위험 신호를 정리합니다.
          </p>
        </div>
        {persistenceMeta ? (
          <StatusBadge tone={persistenceMeta.persisted ? 'emerald' : 'amber'}>
            {persistenceMeta.persisted ? 'Persisted' : 'Proposal only'}
          </StatusBadge>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div
            key={`${item.code ?? 'reflection'}-${index}`}
            className={`rounded-[22px] border px-4 py-3 text-sm leading-6 ${
              item.severity === 'critical'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-amber-200 bg-white text-amber-900'
            }`}
          >
            <p className="font-semibold">{item.code ?? 'reflection_note'}</p>
            <p className="mt-1">{item.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarkdownView({ result, copied, onCopy }) {
  const sections = splitMarkdownSections(result.markdown);
  const codeWrapped = `\`\`\`markdown\n${result.markdown}\n\`\`\``;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_360px]">
      <div className="rounded-[32px] border border-slate-200 bg-slate-50/80 p-5">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Generated Markdown Node</p>
            <p className="mt-1 text-sm text-slate-500">
              YAML Frontmatter가 포함된 결과를 그대로 복사해 저장할 수 있습니다.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void onCopy()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? '복사 완료' : '복사하기'}
          </button>
        </div>

        <div className="mt-5">
          <ReactMarkdown components={MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
            {codeWrapped}
          </ReactMarkdown>
        </div>
      </div>

      <div className="space-y-5">
        <aside className="rounded-[32px] border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-900">Frontmatter Snapshot</p>
          <p className="mt-1 text-sm text-slate-500">
            핵심 메타데이터만 빠르게 확인할 수 있습니다.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-[24px] bg-slate-950/95 p-4 text-xs leading-6 text-slate-100">
            <code>{sections.frontmatter || 'Frontmatter not found.'}</code>
          </pre>
        </aside>

        <aside className="rounded-[32px] border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-900">Rich Preview</p>
          <p className="mt-1 text-sm text-slate-500">
            본문이 실제 읽기 뷰에서 어떻게 보이는지 미리 확인합니다.
          </p>
          <div className="mt-4 rounded-[24px] bg-slate-50 p-4">
            <ReactMarkdown components={MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
              {sections.body}
            </ReactMarkdown>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[640px] flex-col items-center justify-center rounded-[36px] border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky/10 text-sky shadow-soft">
        <FileImage className="h-8 w-8 animate-float" />
      </div>
      <h3 className="mt-6 text-2xl font-semibold text-slate-950">
        텍스트와 이미지를 함께 넣으면 멀티모달 위키 노드가 생성됩니다
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
        메모, 회의 스크린샷, 화이트보드 사진, 코드 캡처를 붙여 넣으면 Gemini가 하나의
        구조화된 지식 노드와 연결 그래프로 재구성합니다.
      </p>

      <div className="mt-8 grid max-w-3xl gap-4 text-left sm:grid-cols-3">
        <HintCard title="1. 멀티모달" description="텍스트 없이 이미지만으로도 노드를 생성합니다." />
        <HintCard title="2. 구조화" description="YAML Frontmatter와 본문 섹션을 자동 작성합니다." />
        <HintCard title="3. 연결" description="태그와 관련 노드를 즉시 그래프로 펼쳐줍니다." />
      </div>
    </div>
  );
}

function LoadingState({ attachmentsCount }) {
  return (
    <div className="flex h-full min-h-[640px] flex-col justify-center rounded-[36px] border border-slate-200 bg-gradient-to-br from-[#fbfdff] to-[#fff8f5] p-8">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky text-white shadow-card animate-pulseRing">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>

      <div className="mx-auto mt-8 max-w-xl text-center">
        <h3 className="text-2xl font-semibold text-slate-950">
          Gemini가 지식 노드를 구성하고 있습니다
        </h3>
        <p className="mt-3 text-sm leading-7 text-slate-500 sm:text-base">
          텍스트와 이미지 {attachmentsCount > 0 ? `${attachmentsCount}장` : ''}을 함께 읽고,
          제목, 태그, 연결 후보, 그래프 구조를 생성하는 중입니다.
        </p>
      </div>

      <div className="mx-auto mt-8 grid w-full max-w-3xl gap-4 sm:grid-cols-3">
        <LoadingCard title="멀티모달 해석" description="텍스트와 시각 정보를 함께 분석" />
        <LoadingCard title="Markdown 정리" description="Frontmatter와 본문 섹션 생성" />
        <LoadingCard title="그래프 매핑" description="중심 노드와 연결선 구성" />
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex h-full min-h-[640px] flex-col items-center justify-center rounded-[36px] border border-red-200 bg-red-50/70 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-500">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h3 className="mt-6 text-2xl font-semibold text-red-950">생성 과정에서 오류가 발생했습니다</h3>
      <p className="mt-3 max-w-xl text-sm leading-7 text-red-700 sm:text-base">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-red-600 px-5 text-sm font-medium text-white transition hover:bg-red-700"
      >
        다시 시도
      </button>
    </div>
  );
}

function BackgroundOrbs() {
  return (
    <>
      <div className="pointer-events-none absolute left-[-120px] top-[72px] h-64 w-64 rounded-full bg-sky/10 blur-[96px]" />
      <div className="pointer-events-none absolute right-[-60px] top-[320px] h-72 w-72 rounded-full bg-coral/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-100px] left-[30%] h-64 w-64 rounded-full bg-emerald-200/30 blur-[110px]" />
    </>
  );
}

function HeroInfoCard({ title, value }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function FieldLabel({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-900">
      {children}
    </label>
  );
}

function MetaLine({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <span className="text-right text-sm text-slate-600">{children}</span>
    </div>
  );
}

function ResultStat({ label, value }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function StatusBadge({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        tones[tone] ?? tones.slate
      }`}
    >
      {children}
    </span>
  );
}

function HintCard({ title, description }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function LoadingCard({ title, description }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-soft">
      <div className="h-2 w-16 rounded-full bg-sky/20" />
      <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function GraphLoadingShell() {
  return (
    <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br from-white via-[#f7fbff] to-[#fff7f4]">
      <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Interactive Knowledge Graph</p>
          <p className="mt-1 text-sm text-slate-500">그래프 컴포넌트를 불러오는 중입니다.</p>
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-sky" />
      </div>
      <div className="flex h-[680px] items-center justify-center">
        <div className="grid w-full max-w-3xl gap-4 px-6 sm:grid-cols-3">
          <LoadingCard title="노드 레이아웃" description="중심 노드와 주변 노드 정렬" />
          <LoadingCard title="엣지 스타일" description="연결선과 라벨 스타일 구성" />
          <LoadingCard title="캔버스 초기화" description="확대, 축소, 미니맵 준비" />
        </div>
      </div>
    </div>
  );
}

function getGraphStats(graph) {
  return {
    totalNodes: graph.nodes.length,
    tags: graph.nodes.filter((node) => node.role === 'tag').length,
    edges: graph.edges.length,
  };
}

function buildTimelineItems({ proposalMeta, persistenceMeta, gateSummary, workspaceSnapshot }) {
  return [
    {
      id: 'capture',
      title: 'Capture',
      description: workspaceSnapshot?.raw?.recentSources?.[0]?.rawRoot
        ? `Latest raw bundle lives at ${workspaceSnapshot.raw.recentSources[0].rawRoot}.`
        : proposalMeta?.rawRoot
          ? `Raw bundle prepared at ${proposalMeta.rawRoot}.`
          : 'A raw bundle path will appear after the first proposal.',
      status:
        workspaceSnapshot?.raw?.sourceCount > 0 ? 'Stored' : proposalMeta?.rawRoot ? 'Prepared' : 'Waiting',
      tone: workspaceSnapshot?.raw?.sourceCount > 0 || proposalMeta?.rawRoot ? 'emerald' : 'amber',
    },
    {
      id: 'proposal',
      title: 'Proposal',
      description: workspaceSnapshot?.wiki?.recentEntries?.[0]?.node_id
        ? `Latest persisted node is ${workspaceSnapshot.wiki.recentEntries[0].node_id}.`
        : proposalMeta?.frontmatter?.id
          ? `Draft node ${proposalMeta.frontmatter.id} is ready for review.`
          : 'No draft node has been generated yet.',
      status:
        workspaceSnapshot?.wiki?.nodeCount > 0 ? 'Stored' : proposalMeta?.frontmatter?.id ? 'Ready' : 'Waiting',
      tone:
        workspaceSnapshot?.wiki?.nodeCount > 0 || proposalMeta?.frontmatter?.id ? 'emerald' : 'amber',
    },
    {
      id: 'persist',
      title: 'Persist',
      description: workspaceSnapshot?.derived?.hasIndex && workspaceSnapshot?.derived?.hasGraphCache
        ? 'Filesystem persistence completed and the derived index and graph cache are readable.'
        : persistenceMeta?.persisted
        ? 'Filesystem persistence completed and derived artifacts were regenerated.'
        : gateSummary?.detail ?? 'Persistence is gated in the current runtime.',
      status:
        workspaceSnapshot?.derived?.hasIndex && workspaceSnapshot?.derived?.hasGraphCache
          ? 'Written'
          : persistenceMeta?.persisted
            ? 'Written'
            : 'Blocked',
      tone:
        workspaceSnapshot?.derived?.hasIndex && workspaceSnapshot?.derived?.hasGraphCache
          ? 'emerald'
          : persistenceMeta?.persisted
            ? 'emerald'
            : 'amber',
    },
    {
      id: 'reinforce',
      title: 'Reinforce',
      description:
        (workspaceSnapshot?.policy?.version ?? 0) > 1
          ? `Policy advanced to version ${workspaceSnapshot.policy.version} and now remembers user guidance.`
          : 'No durable reinforcement signal has been written yet.',
      status: (workspaceSnapshot?.policy?.version ?? 0) > 1 ? 'Updated' : 'Waiting',
      tone: (workspaceSnapshot?.policy?.version ?? 0) > 1 ? 'emerald' : 'amber',
    },
    {
      id: 'lint',
      title: 'Lint',
      description: workspaceSnapshot?.lint
        ? `Garden health sees ${workspaceSnapshot.lint.orphanCount} orphan nodes, ${workspaceSnapshot.lint.weaklyLinkedCount} weakly linked nodes, and ${workspaceSnapshot.lint.staleCount} stale nodes.`
        : 'No garden lint report is available yet.',
      status:
        workspaceSnapshot?.lint?.tone === 'emerald'
          ? 'Healthy'
          : workspaceSnapshot?.lint
            ? 'Watching'
            : 'Waiting',
      tone:
        workspaceSnapshot?.lint?.tone === 'emerald'
          ? 'emerald'
          : workspaceSnapshot?.lint
            ? 'amber'
            : 'amber',
    },
    {
      id: 'agent',
      title: 'Local Agent',
      description: workspaceSnapshot?.agent
        ? `Local agent is ${workspaceSnapshot.agent.state} with ${workspaceSnapshot.agent.queueDepth} queued raw job(s).`
        : 'No local agent artifacts are visible yet.',
      status:
        workspaceSnapshot?.agent?.state === 'watching'
          ? 'Watching'
          : workspaceSnapshot?.agent
            ? 'Manual'
            : 'Waiting',
      tone:
        workspaceSnapshot?.agent?.state === 'watching'
          ? 'emerald'
          : workspaceSnapshot?.agent
            ? 'slate'
            : 'amber',
    },
    {
      id: 'git',
      title: 'Git',
      description: workspaceSnapshot?.git?.repository
        ? workspaceSnapshot.git.message
        : 'Workspace is not yet connected to a Git repository.',
      status: workspaceSnapshot?.git?.repository
        ? workspaceSnapshot.git.canCommit
          ? 'Ready'
          : 'Clean'
        : 'Blocked',
      tone: workspaceSnapshot?.git?.repository
        ? workspaceSnapshot.git.canCommit
          ? 'emerald'
          : 'slate'
        : 'amber',
    },
  ];
}

function getGateSummary(integrity) {
  if (!integrity) {
    return null;
  }

  const blockedGate = integrity.gates?.find((gate) => ['blocked', 'fail'].includes(gate.status));

  if (blockedGate) {
    return {
      label: `Blocked at ${blockedGate.blocksStep}`,
      detail: blockedGate.detail,
      tone: 'amber',
    };
  }

  if ((integrity.criticalErrors?.length ?? 0) > 0) {
    return {
      label: 'Critical issues',
      detail: integrity.criticalErrors[0],
      tone: 'red',
    };
  }

  return {
    label: 'Dependencies healthy',
    detail: 'Current contract and storage gates are satisfied for this runtime.',
    tone: 'emerald',
  };
}

function formatBytes(value) {
  if (!value) {
    return '0 B';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function extractPathCategory(value) {
  const segments = String(value ?? '')
    .split('/')
    .filter(Boolean);

  return segments.find((segment) =>
    ['Projects', 'Topics', 'Decisions', 'Skills', 'Views'].includes(segment),
  ) ?? null;
}

async function normalizeImageFile(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.');
  }

  const dataUrl = await resizeImageToDataUrl(file, MAX_ATTACHMENT_DIMENSION);
  const estimatedBytes = estimateDataUrlBytes(dataUrl);

  if (estimatedBytes > MAX_ATTACHMENT_PREVIEW_BYTES) {
    throw new Error('압축 후에도 이미지가 너무 큽니다. 다른 이미지를 사용해 주세요.');
  }

  return {
    id: createAttachmentId(),
    name: file.name,
    mimeType: extractMimeType(dataUrl) || 'image/jpeg',
    size: estimatedBytes,
    base64: dataUrl,
    previewUrl: dataUrl,
  };
}

async function resizeImageToDataUrl(file, maxDimension) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const ratio = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    image.src = src;
  });
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.floor((base64.length * 3) / 4);
}

function extractMimeType(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? '';
}

export default App;
