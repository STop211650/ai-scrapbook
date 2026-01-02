import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { downloadGoogleDocAsDocx, extractGoogleDocId, isGoogleDocUrl } from '../src/services/google-docs.service.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('google-docs.service', () => {
  it('detects Google Docs URLs', () => {
    expect(
      isGoogleDocUrl('https://docs.google.com/document/d/abc123/edit')
    ).toBe(true);
    expect(isGoogleDocUrl('https://example.com')).toBe(false);
  });

  it('extracts document IDs', () => {
    expect(extractGoogleDocId('https://docs.google.com/document/d/abc123/edit')).toBe('abc123');
    expect(extractGoogleDocId('https://docs.google.com/document/u/0/')).toBeNull();
  });

  it('downloads a public docx export', async () => {
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const headers = new Headers({
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-length': `${fakeBytes.byteLength}`,
      'content-disposition': 'attachment; filename="Example.docx"',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers,
        arrayBuffer: async () => fakeBytes.buffer,
      }))
    );

    const result = await downloadGoogleDocAsDocx({
      url: 'https://docs.google.com/document/d/abc123/edit',
    });

    const stat = await fs.stat(result.filePath);
    expect(stat.size).toBe(fakeBytes.byteLength);
    expect(result.filename).toBe('Example.docx');

    await fs.unlink(result.filePath);
  });

  it('rejects non-public docs (HTML export)', async () => {
    const headers = new Headers({
      'content-type': 'text/html; charset=utf-8',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers,
        arrayBuffer: async () => new ArrayBuffer(0),
      }))
    );

    await expect(
      downloadGoogleDocAsDocx({ url: 'https://docs.google.com/document/d/abc123/edit' })
    ).rejects.toThrow(/returned HTML/i);
  });

  it('enforces size limits', async () => {
    const headers = new Headers({
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-length': '999',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers,
        arrayBuffer: async () => new ArrayBuffer(999),
      }))
    );

    await expect(
      downloadGoogleDocAsDocx({
        url: 'https://docs.google.com/document/d/abc123/edit',
        maxBytes: 10,
      })
    ).rejects.toThrow(/too large/i);
  });
});
