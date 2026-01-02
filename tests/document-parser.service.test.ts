import { describe, it, expect, vi } from 'vitest';
import { extractDocumentText } from '../src/services/document-parser.service.js';

vi.mock('pdf-parse', () => ({
  default: vi.fn(async () => ({ text: 'Hello   world' })),
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: 'Docx\ntext' })),
  },
}));

describe('document-parser.service', () => {
  it('extracts and normalizes PDF text', async () => {
    const result = await extractDocumentText({
      kind: 'document',
      mediaType: 'application/pdf',
      filename: 'sample.pdf',
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      sizeBytes: 4,
    });

    expect(result.text).toBe('Hello world');
    expect(result.truncated).toBe(false);
  });

  it('extracts and normalizes DOCX text', async () => {
    const result = await extractDocumentText({
      kind: 'document',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: 'sample.docx',
      bytes: new Uint8Array([0x00]),
      sizeBytes: 1,
    });

    expect(result.text).toBe('Docx text');
    expect(result.truncated).toBe(false);
  });

  it('truncates very large text', async () => {
    const longText = 'x'.repeat(21000);
    const pdfParse = await import('pdf-parse');
    (pdfParse.default as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: longText,
    });

    const result = await extractDocumentText({
      kind: 'document',
      mediaType: 'application/pdf',
      filename: 'long.pdf',
      bytes: new Uint8Array([0x25]),
      sizeBytes: 1,
    });

    expect(result.text.length).toBe(20000);
    expect(result.truncated).toBe(true);
  });
});
