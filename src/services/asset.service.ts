import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import mime from 'mime';

// Adapted from summarize/src/content/asset.ts to align URL asset detection and MIME sniffing.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const DEFAULT_ASSET_TIMEOUT_MS = 10_000;

export type AssetKind = 'image' | 'document';

export interface AssetInput {
  kind: AssetKind;
  mediaType: string;
  filename: string | null;
  bytes: Uint8Array;
  sizeBytes: number;
}

export type UrlKind = { kind: 'website' } | { kind: 'asset' };

const SUPPORTED_DOCUMENT_TYPES = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const SUPPORTED_IMAGE_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const ARCHIVE_MEDIA_TYPES = new Set<string>([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/gzip',
]);

const normalizeMediaType = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.split(';')[0]?.trim() ?? null;
};

const detectMediaType = async ({
  bytes,
  filename,
  providedMimeType,
}: {
  bytes: Uint8Array;
  filename: string | null;
  providedMimeType?: string | null;
}): Promise<string> => {
  const sniffed = await fileTypeFromBuffer(bytes);
  if (sniffed?.mime) return sniffed.mime;

  const header = normalizeMediaType(providedMimeType ?? null);
  if (header && header !== 'application/octet-stream') return header;

  if (filename) {
    const byExt = mime.getType(filename);
    if (typeof byExt === 'string' && byExt.length > 0) return byExt;
  }

  return 'application/octet-stream';
};

const normalizeHeaderMediaType = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.split(';')[0]?.trim().toLowerCase() ?? null;
};

const isHtmlMediaType = (mediaType: string | null): boolean => {
  if (!mediaType) return false;
  return mediaType === 'text/html' || mediaType === 'application/xhtml+xml';
};

const isLikelyAssetMediaType = (mediaType: string | null): boolean => {
  if (!mediaType) return false;
  if (isHtmlMediaType(mediaType)) return false;
  return true;
};

const looksLikeHtml = (bytes: Uint8Array): boolean => {
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<head');
};

const parseContentDispositionFilename = (header: string | null): string | null => {
  if (!header) return null;
  const match = /filename\*\s*=\s*([^;]+)/i.exec(header) ?? /filename\s*=\s*([^;]+)/i.exec(header);
  if (!match?.[1]) return null;
  let value = match[1].trim();
  if (value.toLowerCase().startsWith("utf-8''")) {
    value = value.slice(7);
  }
  value = value.replace(/^"|"$/g, '');
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const isLikelyAssetPathname = (pathname: string): boolean => {
  const ext = path.extname(pathname).toLowerCase();
  if (!ext) return false;
  if (ext === '.html' || ext === '.htm' || ext === '.php' || ext === '.asp' || ext === '.aspx') {
    return false;
  }
  return true;
};

// Adapted from summarize/src/run/attachments.ts to inline text-like assets instead of attachments.
export const isTextLikeMediaType = (mediaType: string): boolean => {
  const mt = mediaType.toLowerCase();
  if (mt.startsWith('text/')) return true;
  return (
    mt === 'application/json' ||
    mt === 'application/xml' ||
    mt === 'application/x-yaml' ||
    mt === 'application/yaml' ||
    mt === 'application/toml' ||
    mt === 'application/rtf' ||
    mt === 'application/javascript'
  );
};

// Adapted from summarize/src/run/attachments.ts shouldMarkitdownConvertMediaType.
export const shouldPreprocessMediaType = (mediaType: string): boolean => {
  const mt = mediaType.toLowerCase();
  if (mt === 'application/pdf') return true;
  if (mt === 'application/rtf') return true;
  if (mt === 'text/html' || mt === 'application/xhtml+xml') return true;
  if (mt === 'application/msword') return true;
  if (mt.startsWith('application/vnd.openxmlformats-officedocument.')) return true;
  if (mt === 'application/vnd.ms-excel') return true;
  if (mt === 'application/vnd.ms-powerpoint') return true;
  return false;
};

export const classifyAssetKind = (mediaType: string): AssetKind | null => {
  if (mediaType.startsWith('image/')) {
    return SUPPORTED_IMAGE_TYPES.has(mediaType) ? 'image' : null;
  }
  if (isTextLikeMediaType(mediaType) && !isHtmlMediaType(mediaType)) return 'document';
  if (shouldPreprocessMediaType(mediaType)) return 'document';
  if (SUPPORTED_DOCUMENT_TYPES.has(mediaType)) return 'document';
  return null;
};

export async function classifyUrlAsAsset({
  url,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_ASSET_TIMEOUT_MS,
}: {
  url: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<UrlKind> {
  const parsed = new URL(url);
  if (isLikelyAssetPathname(parsed.pathname)) {
    return { kind: 'asset' };
  }

  const tryDetectFromHead = async (): Promise<boolean> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { method: 'HEAD', signal: controller.signal });
      if (!res.ok) return false;
      const mediaType = normalizeHeaderMediaType(res.headers.get('content-type'));
      if (isLikelyAssetMediaType(mediaType)) return true;
      const filename = parseContentDispositionFilename(res.headers.get('content-disposition'));
      if (filename && isLikelyAssetPathname(filename)) return true;
      return false;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };

  const tryDetectFromRange = async (): Promise<boolean> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-2047' },
        signal: controller.signal,
      });
      if (!res.ok) return false;
      const mediaType = normalizeHeaderMediaType(res.headers.get('content-type'));
      if (isLikelyAssetMediaType(mediaType)) return true;
      const buffer = new Uint8Array(await res.arrayBuffer());
      return !looksLikeHtml(buffer);
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };

  if (await tryDetectFromHead()) return { kind: 'asset' };
  if (await tryDetectFromRange()) return { kind: 'asset' };
  return { kind: 'website' };
}

export async function loadAssetFromUrl({
  url,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_ASSET_TIMEOUT_MS,
  maxBytes = MAX_UPLOAD_BYTES,
}: {
  url: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<AssetInput> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }

    const contentLength = res.headers.get('content-length');
    if (contentLength) {
      const parsed = Number(contentLength);
      if (Number.isFinite(parsed) && parsed > maxBytes) {
        throw new Error(`Remote file too large (${parsed} bytes). Limit is ${maxBytes} bytes.`);
      }
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error(
        `Remote file too large (${arrayBuffer.byteLength} bytes). Limit is ${maxBytes} bytes.`
      );
    }

    const bytes = new Uint8Array(arrayBuffer);
    const parsedUrl = new URL(url);
    const headerFilename = parseContentDispositionFilename(res.headers.get('content-disposition'));
    const urlFilename = path.basename(parsedUrl.pathname) || null;
    const filename = headerFilename ?? urlFilename;
    const headerContentType = res.headers.get('content-type');
    const mediaType = await detectMediaType({
      bytes,
      filename,
      providedMimeType: headerContentType,
    });

    if (isHtmlMediaType(mediaType) || looksLikeHtml(bytes)) {
      throw new Error('URL appears to be a website (HTML), not a file.');
    }

    if (ARCHIVE_MEDIA_TYPES.has(mediaType)) {
      throw new Error(
        `Unsupported file type: ${filename ?? 'file'} (${mediaType}). Archive formats are not supported.`
      );
    }

    const kind = classifyAssetKind(mediaType);
    if (!kind) {
      throw new Error(`Unsupported file type: ${filename ?? 'file'} (${mediaType}).`);
    }

    return {
      kind,
      mediaType,
      filename,
      bytes,
      sizeBytes: bytes.byteLength,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadAssetFromPath({
  filePath,
  originalName,
  providedMimeType,
  maxBytes = MAX_UPLOAD_BYTES,
}: {
  filePath: string;
  originalName?: string | null;
  providedMimeType?: string | null;
  maxBytes?: number;
}): Promise<AssetInput> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  if (stat.size > maxBytes) {
    throw new Error(`File too large (${stat.size} bytes). Limit is ${maxBytes} bytes.`);
  }

  const bytes = new Uint8Array(await fs.readFile(filePath));
  const filename = originalName?.trim() || path.basename(filePath);
  const mediaType = await detectMediaType({
    bytes,
    filename,
    providedMimeType: providedMimeType ?? null,
  });

  if (ARCHIVE_MEDIA_TYPES.has(mediaType)) {
    throw new Error(
      `Unsupported file type: ${filename} (${mediaType}). Archive formats are not supported.`
    );
  }

  const kind = classifyAssetKind(mediaType);
  if (!kind) {
    throw new Error(`Unsupported file type: ${filename} (${mediaType}).`);
  }

  return {
    kind,
    mediaType,
    filename,
    bytes,
    sizeBytes: bytes.byteLength,
  };
}
