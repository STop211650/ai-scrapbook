import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import type { AssetInput } from './asset.service.js';

const MAX_EXTRACTED_TEXT_CHARS = 20000;

export type ExtractedDocumentText = {
  text: string;
  truncated: boolean;
};

const normalizeText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const truncateText = (value: string, maxChars: number): ExtractedDocumentText => {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }
  return { text: value.slice(0, maxChars), truncated: true };
};

export async function extractDocumentText(asset: AssetInput): Promise<ExtractedDocumentText> {
  if (asset.kind !== 'document') {
    throw new Error('Unsupported asset type for document extraction.');
  }

  if (asset.mediaType === 'text/plain') {
    const text = new TextDecoder('utf-8').decode(asset.bytes);
    const normalized = normalizeText(text);
    return truncateText(normalized, MAX_EXTRACTED_TEXT_CHARS);
  }

  if (asset.mediaType === 'application/pdf') {
    const result = await pdfParse(Buffer.from(asset.bytes));
    const normalized = normalizeText(result.text || '');
    return truncateText(normalized, MAX_EXTRACTED_TEXT_CHARS);
  }

  if (asset.mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(asset.bytes) });
    const normalized = normalizeText(result.value || '');
    return truncateText(normalized, MAX_EXTRACTED_TEXT_CHARS);
  }

  throw new Error(`Unsupported document type: ${asset.mediaType}`);
}
