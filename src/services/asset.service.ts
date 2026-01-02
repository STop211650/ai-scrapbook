import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import mime from 'mime';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type AssetKind = 'image' | 'document';

export interface AssetInput {
  kind: AssetKind;
  mediaType: string;
  filename: string | null;
  bytes: Uint8Array;
  sizeBytes: number;
}

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

export const classifyAssetKind = (mediaType: string): AssetKind | null => {
  if (mediaType.startsWith('image/')) {
    return SUPPORTED_IMAGE_TYPES.has(mediaType) ? 'image' : null;
  }
  if (SUPPORTED_DOCUMENT_TYPES.has(mediaType)) return 'document';
  return null;
};

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
