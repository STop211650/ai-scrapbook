import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  classifyUrlAsAsset,
  loadAssetFromPath,
  loadAssetFromUrl,
} from '../src/services/asset.service.js';

vi.mock('file-type', () => ({
  fileTypeFromBuffer: vi.fn(),
}));

import { fileTypeFromBuffer } from 'file-type';

const mockFileType = vi.mocked(fileTypeFromBuffer);

// Track temp files for cleanup in afterEach
const filesToCleanup: string[] = [];

const writeTempFile = async (bytes: Uint8Array, name: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-scrapbook-test-'));
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, bytes);
  filesToCleanup.push(filePath);
  return filePath;
};

describe('asset.service', () => {
  afterEach(async () => {
    // Clean up temp files even if assertions fail
    await Promise.all(filesToCleanup.map((f) => fs.unlink(f).catch(() => {})));
    filesToCleanup.length = 0;
  });

  it('loads supported images', async () => {
    mockFileType.mockResolvedValueOnce({ ext: 'png', mime: 'image/png' });
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const filePath = await writeTempFile(pngBytes, 'image.png');

    const asset = await loadAssetFromPath({ filePath });

    expect(asset.kind).toBe('image');
    expect(asset.mediaType).toBe('image/png');
  });

  it('accepts docx when mimeType is provided', async () => {
    mockFileType.mockResolvedValueOnce(undefined);
    const bytes = new Uint8Array([0x00, 0x01, 0x02]);
    const filePath = await writeTempFile(bytes, 'doc.docx');

    const asset = await loadAssetFromPath({
      filePath,
      providedMimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    expect(asset.kind).toBe('document');
    expect(asset.mediaType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('accepts preprocessable office formats', async () => {
    mockFileType.mockResolvedValueOnce(undefined);
    const bytes = new Uint8Array([0x00, 0x01, 0x02]);
    const filePath = await writeTempFile(bytes, 'slides.ppt');

    const asset = await loadAssetFromPath({
      filePath,
      providedMimeType: 'application/vnd.ms-powerpoint',
    });

    expect(asset.kind).toBe('document');
    expect(asset.mediaType).toBe('application/vnd.ms-powerpoint');
  });

  it('rejects archive types', async () => {
    mockFileType.mockResolvedValueOnce(undefined);
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const filePath = await writeTempFile(bytes, 'archive.zip');

    await expect(
      loadAssetFromPath({
        filePath,
        providedMimeType: 'application/zip',
      })
    ).rejects.toThrow(/Archive formats are not supported/i);
  });

  it('rejects files over the size limit', async () => {
    mockFileType.mockResolvedValueOnce(undefined);
    const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const filePath = await writeTempFile(bytes, 'tiny.bin');

    await expect(
      loadAssetFromPath({
        filePath,
        maxBytes: 1,
      })
    ).rejects.toThrow(/File too large/i);
  });

  it('classifies URLs with file extensions as assets without fetching', async () => {
    const fetchMock = vi.fn();
    const result = await classifyUrlAsAsset({
      url: 'https://example.com/report.pdf',
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ kind: 'asset' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifies URLs as assets based on HEAD content-type', async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        });
      }
      return new Response(null, { status: 404 });
    });

    const result = await classifyUrlAsAsset({
      url: 'https://example.com/download?id=123',
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ kind: 'asset' });
  });

  it('loads remote assets and detects media type', async () => {
    mockFileType.mockResolvedValueOnce({ ext: 'png', mime: 'image/png' });
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = vi.fn(async () => {
      return new Response(Buffer.from(bytes), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(bytes.byteLength) },
      });
    });

    const asset = await loadAssetFromUrl({
      url: 'https://example.com/image.png',
      fetchImpl: fetchMock,
    });

    expect(asset.kind).toBe('image');
    expect(asset.mediaType).toBe('image/png');
  });

  it('rejects HTML responses for asset URLs', async () => {
    mockFileType.mockResolvedValueOnce(undefined);
    const fetchMock = vi.fn(async () => {
      return new Response('<html><body>not a file</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });

    await expect(
      loadAssetFromUrl({
        url: 'https://example.com/not-a-file',
        fetchImpl: fetchMock,
      })
    ).rejects.toThrow(/HTML/i);
  });
});
