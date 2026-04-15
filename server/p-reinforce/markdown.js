const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function splitFrontmatter(markdown = '') {
  const normalized = String(markdown).replace(/\r\n/g, '\n').trim();
  const match = normalized.match(FRONTMATTER_PATTERN);

  if (!match) {
    return {
      frontmatter: '',
      body: normalized,
    };
  }

  return {
    frontmatter: match[1].trim(),
    body: match[2].trim(),
  };
}

export function parseSimpleFrontmatter(frontmatter = '') {
  const result = {};
  const lines = String(frontmatter).split('\n');
  let activeListKey = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      continue;
    }

    const listMatch = line.match(/^\s*-\s+(.*)$/);

    if (activeListKey && listMatch) {
      result[activeListKey].push(parseScalar(listMatch[1]));
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);

    if (!keyMatch) {
      activeListKey = null;
      continue;
    }

    const [, key, rawValue] = keyMatch;

    if (!rawValue) {
      result[key] = [];
      activeListKey = key;
      continue;
    }

    result[key] = parseScalar(rawValue);
    activeListKey = null;
  }

  return result;
}

export function stringifyFrontmatter(record) {
  const lines = ['---'];

  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
        continue;
      }

      lines.push(`${key}:`);

      for (const item of value) {
        lines.push(`  - ${formatScalar(item)}`);
      }

      continue;
    }

    lines.push(`${key}: ${formatScalar(value)}`);
  }

  lines.push('---');

  return lines.join('\n');
}

export function extractWikiLinks(markdownBody = '') {
  const matches = String(markdownBody).matchAll(/\[\[([^[\]]+)\]\]/g);
  return [...matches].map((match) => match[1].trim()).filter(Boolean);
}

export function buildInsight(body, title) {
  const lines = String(body)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const quoteLine = lines.find((line) => line.startsWith('>'));

  if (quoteLine) {
    return quoteLine.replace(/^>\s*/, '').trim();
  }

  const proseLine = lines.find(
    (line) => !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('*'),
  );

  if (proseLine) {
    return proseLine.replace(/^[0-9]+\.\s*/, '').slice(0, 160);
  }

  return `${title}의 핵심 구조와 연결 가능성을 정리한 초안입니다.`;
}

export function demoteHeadings(markdownBody = '') {
  return String(markdownBody).replace(/^(#{1,5})\s+/gm, (_, hashes) => `${hashes}# `);
}

export function firstMeaningfulParagraph(markdownBody = '') {
  const lines = String(markdownBody)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    lines.find((line) => !line.startsWith('#') && !line.startsWith('>') && !line.startsWith('-')) ??
    ''
  );
}

function parseScalar(rawValue) {
  const value = rawValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (value === '[]') {
    return [];
  }

  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  if (/^-?\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }

  return value;
}

function formatScalar(value) {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const normalized = String(value).replace(/"/g, '\\"');
  return `"${normalized}"`;
}
