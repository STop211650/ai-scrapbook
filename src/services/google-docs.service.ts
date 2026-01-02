import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { MAX_UPLOAD_BYTES } from './asset.service.js';

const GOOGLE_DOC_HOST = 'docs.google.com';

const normalizeUrl = (url: string): URL => {
  try {
    return new URL(url);
  } catch {
    throw new Error('Invalid Google Docs URL.');
  }
};

export const isGoogleDocUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.hostname === GOOGLE_DOC_HOST && /\/document\/d\//i.test(parsed.pathname);
  } catch {
    return false;
  }
};

export const extractGoogleDocId = (url: string): string | null => {
  const match = /\/document\/d\/([a-zA-Z0-9_-]+)/.exec(url);
  return match?.[1] ?? null;
};

const parseFilenameFromHeader = (header: string | null): string | null => {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8''|")?([^\";]+)[";]?/i.exec(header);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

export async function downloadGoogleDocAsDocx({
  url,
  maxBytes = MAX_UPLOAD_BYTES,
  timeoutMs = 60_000,
}: {
  url: string;
  maxBytes?: number;
  timeoutMs?: number;
}): Promise<{ filePath: string; filename: string }> {
  const parsed = normalizeUrl(url);
  const docId = extractGoogleDocId(parsed.toString());
  if (!docId) {
    throw new Error('Unsupported Google Docs URL format.');
  }

  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=docx`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(exportUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AIScrapbook/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Google Docs export failed (${response.status}).`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      throw new Error('Google Docs export returned HTML. Is the document public?');
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const parsedLength = Number(contentLengthHeader);
      if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
        throw new Error(`Google Doc too large (${parsedLength} bytes). Limit is ${maxBytes}.`);
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error(
        `Google Doc too large (${arrayBuffer.byteLength} bytes). Limit is ${maxBytes}.`
      );
    }

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-scrapbook-docs-'));
    const filenameFromHeader = parseFilenameFromHeader(response.headers.get('content-disposition'));
    const filename = filenameFromHeader ?? `google-doc-${docId}.docx`;
    const filePath = path.join(dir, `${randomUUID()}-${filename}`);
    await fs.writeFile(filePath, new Uint8Array(arrayBuffer));
    return { filePath, filename };
  } finally {
    clearTimeout(timeout);
  }
}
