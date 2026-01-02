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

/**
 * Extracts and normalizes text from a document asset and indicates if the result was truncated.
 *
 * @param asset - The asset to extract from; must have `kind === 'document'` and `bytes` containing the file data. Supported `mediaType` values: `text/plain`, `application/pdf`, and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
 * @returns An object with `text` containing the whitespace-normalized extracted text and `truncated` set to `true` if the text was cut to the maximum allowed length.
 * @throws Error('Unsupported asset type for document extraction.') if `asset.kind` is not `'document'`.
 * @throws Error(`Unsupported document type: ${asset.mediaType}`) if `asset.mediaType` is not supported.
 */
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