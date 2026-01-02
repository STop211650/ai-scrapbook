import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadAssetFromPath } from '../src/services/asset.service.js';

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
});
