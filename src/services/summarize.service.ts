import fs from 'node:fs/promises';
import {
  buildLinkSummaryPrompt,
  SUMMARY_LENGTH_TO_TOKENS,
  type SummaryLength as CoreSummaryLength,
} from '@steipete/summarize-core/prompts';
import { getAIProvider } from './ai/ai.service.js';
import {
  classifyUrlAsAsset,
  loadAssetFromPath,
  loadAssetFromUrl,
  MAX_UPLOAD_BYTES,
  type AssetInput,
} from './asset.service.js';
import { extractDocumentText } from './document-parser.service.js';
import { downloadGoogleDocAsDocx, isGoogleDocUrl } from './google-docs.service.js';
import { fetchSummarizeCoreContent } from './summarize-core.client.js';
import { TwitterService, getTwitterService, isTwitterUrl } from './twitter.service.js';
import { RedditService, getRedditService, isRedditUrl } from './reddit.service.js';
import { env } from '../config/env.js';

export type ContentType = 'twitter' | 'reddit' | 'article' | 'unknown' | 'image' | 'document';
export type SummaryLength = CoreSummaryLength;

export interface SummarizeOptions {
  length?: SummaryLength;
  includeMetadata?: boolean;
  model?: string;
}

export interface SummarizeResult {
  summary: string;
  contentType: ContentType;
  title: string | null;
  sourceUrl: string;
  extractedContent: string;
  metadata?: {
    author?: string;
    domain?: string;
    engagement?: string;
    filename?: string | null;
    mediaType?: string;
    sizeBytes?: number;
    truncated?: boolean;
  };
}

export interface SummarizeFileResult {
  summary: string;
  contentType: 'image' | 'document';
  title: string | null;
  extractedContent: string;
  metadata?: {
    filename?: string | null;
    mediaType?: string;
    sizeBytes?: number;
    truncated?: boolean;
    sourceUrl?: string | null;
  };
}

type SummarizeFileInput = {
  filePath: string;
  originalName?: string | null;
  mimeType?: string | null;
  sourceUrl?: string | null;
};

const isHtmlAssetError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { message?: unknown };
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  return message.includes('html');
};

const FILE_SUMMARY_DIRECTIVES: Record<
  SummaryLength,
  { guidance: string; formatting: string }
> = {
  short: {
    guidance:
      'Write a tight summary in 2–3 sentences that delivers the primary point plus one key supporting detail.',
    formatting: 'Return a single short paragraph.',
  },
  medium: {
    guidance:
      'Write two short paragraphs covering the core point in the first paragraph and the most important supporting details in the second.',
    formatting: 'Each paragraph should contain 2–3 sentences. Separate paragraphs with a blank line.',
  },
  long: {
    guidance:
      'Write three short paragraphs that summarize the content in order of importance: (1) core point and scope, (2) key supporting facts, (3) other notable details or conclusions.',
    formatting: 'Each paragraph should contain 2–4 sentences. Separate paragraphs with a blank line.',
  },
  xl: {
    guidance:
      'Write a detailed summary in 4–6 short paragraphs. Focus on what the content says and include concrete numbers when present.',
    formatting: 'Use Markdown paragraphs separated by single blank lines.',
  },
  xxl: {
    guidance:
      'Write a comprehensive summary in 6–10 short paragraphs. Cover background, main points, evidence, and outcomes; avoid speculation.',
    formatting: 'Use Markdown paragraphs separated by single blank lines.',
  },
};

const buildDocumentSummaryPrompt = ({
  asset,
  content,
  truncated,
  summaryLength,
}: {
  asset: AssetInput;
  content: string;
  truncated: boolean;
  summaryLength: SummaryLength;
}): string => {
  const directive = FILE_SUMMARY_DIRECTIVES[summaryLength];
  const lines = [
    'Summarize the following document.',
    asset.filename ? `Filename: ${asset.filename}` : null,
    asset.mediaType ? `File type: ${asset.mediaType}` : null,
    directive.guidance,
    directive.formatting,
    truncated
      ? 'Note: The document content was truncated due to size limits. Focus on the available text.'
      : null,
    'Write in direct, factual language. Use Markdown.',
    '',
    'Document content:',
    content,
  ].filter((line) => typeof line === 'string' && line.length > 0);

  return lines.join('\n');
};

const buildImageSummaryPrompt = ({
  asset,
  summaryLength,
}: {
  asset: AssetInput;
  summaryLength: SummaryLength;
}): string => {
  const directive = FILE_SUMMARY_DIRECTIVES[summaryLength];
  const lines = [
    'Summarize the image content.',
    asset.filename ? `Filename: ${asset.filename}` : null,
    asset.mediaType ? `Image type: ${asset.mediaType}` : null,
    'Describe the main subject, any visible text, and key details. If the image includes a document, summarize its content.',
    directive.guidance,
    directive.formatting,
    'Write in direct, factual language. Use Markdown.',
  ].filter((line) => typeof line === 'string' && line.length > 0);

  return lines.join('\n');
};

const resolveModelForKind = (kind: 'url' | 'image' | 'document'): string | undefined => {
  if (kind === 'image') return env.AI_MODEL_IMAGE ?? env.AI_MODEL_DEFAULT;
  if (kind === 'document') return env.AI_MODEL_DOCUMENT ?? env.AI_MODEL_DEFAULT;
  return env.AI_MODEL_URL ?? env.AI_MODEL_DEFAULT;
};

// Adapted from summarize/src/run/attachments.ts supportsNativeFileAttachment (PDF only).
const supportsPdfAttachment = (providerName: string): boolean =>
  providerName === 'openai' || providerName === 'anthropic';

/**
 * Determine the content type represented by a URL.
 *
 * Detects known social platforms and classifies other valid URLs as articles; invalid strings are classified as `unknown`.
 *
 * @param url - The URL string to classify
 * @returns `'twitter'`, `'reddit'`, `'article'`, or `'unknown'` depending on the URL
 */
function detectContentType(url: string): ContentType {
  if (isTwitterUrl(url)) {
    return 'twitter';
  }
  if (isRedditUrl(url)) {
    return 'reddit';
  }
  // Default to article for other URLs
  try {
    new URL(url);
    return 'article';
  } catch {
    return 'unknown';
  }
}

/**
 * Extracts the hostname from a URL string.
 *
 * @param url - The input string to parse as a URL
 * @returns The hostname portion of `url` (e.g., `example.com`), or `null` if `url` is not a valid URL
 */
function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Service for summarizing content from various sources (Twitter, Reddit, articles) using AI
 */
export class SummarizeService {
  private twitterService: TwitterService;
  private redditService: RedditService;

  constructor() {
    this.twitterService = getTwitterService();
    this.redditService = getRedditService();
  }

  /**
   * Summarize content from a URL using AI
   * @param url - URL to summarize (Twitter, Reddit, or article)
   * @param options - Summarization options (length, includeMetadata)
   * @returns Summary with content type, title, source URL, and optional metadata
   */
  async summarize(url: string, options: SummarizeOptions = {}): Promise<SummarizeResult> {
    const { length = 'medium', includeMetadata = true } = options;

    if (isGoogleDocUrl(url)) {
      const docResult = await this.summarizeGoogleDoc(url, { length, includeMetadata });
      return {
        summary: docResult.summary,
        contentType: 'article',
        title: docResult.title,
        sourceUrl: url,
        extractedContent: docResult.extractedContent,
        metadata: includeMetadata
          ? {
              domain: getDomain(url) ?? undefined,
            }
          : undefined,
      };
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error('Invalid URL provided. Please ensure the URL is properly formatted.');
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS URLs are supported.');
    }

    const contentType = detectContentType(url);

    if (contentType === 'article') {
      const assetSummary = await this.trySummarizeAssetUrl(url, options);
      if (assetSummary) {
        return assetSummary;
      }
    }

    // Throw clear error for invalid URLs
    if (contentType === 'unknown') {
      throw new Error('Invalid URL provided. Please ensure the URL is properly formatted.');
    }

    let extractedContent: string;
    let title: string | null = null;
    let description: string | null = null;
    let siteName: string | null = null;
    let truncated = false;
    let hasTranscript = false;
    let metadata: SummarizeResult['metadata'] = {};

    // Extract content based on type
    switch (contentType) {
      case 'twitter': {
        if (this.twitterService.isConfigured()) {
          const tweet = await this.twitterService.getTweet(url);
          extractedContent = await this.twitterService.getContentForSummarization(url);
          title = `Tweet by @${tweet.author.username}`;
          siteName = 'x.com';
          metadata = {
            author: `@${tweet.author.username}`,
            domain: 'x.com',
            engagement: `${tweet.likeCount ?? 0} likes, ${tweet.retweetCount ?? 0} retweets`,
          };
        } else {
          const extracted = await fetchSummarizeCoreContent(url);
          extractedContent = extracted.content;
          title = extracted.title;
          description = extracted.description;
          siteName = extracted.siteName;
          truncated = extracted.truncated;
          hasTranscript = extracted.transcriptSource !== null;
          metadata = {
            domain: getDomain(url) ?? undefined,
          };
        }
        break;
      }

      case 'reddit': {
        if (this.redditService.isConfigured()) {
          const post = await this.redditService.getPost(url);
          extractedContent = await this.redditService.getContentForSummarization(url);
          title = post.title;
          siteName = `r/${post.subreddit}`;
          metadata = {
            author: `u/${post.author}`,
            domain: `r/${post.subreddit}`,
            engagement: `${post.score} points, ${post.numComments} comments`,
          };
        } else {
          const extracted = await fetchSummarizeCoreContent(url);
          extractedContent = extracted.content;
          title = extracted.title;
          description = extracted.description;
          siteName = extracted.siteName;
          truncated = extracted.truncated;
          hasTranscript = extracted.transcriptSource !== null;
          metadata = {
            domain: getDomain(url) ?? undefined,
          };
        }
        break;
      }

      case 'article':
      default: {
        const extracted = await fetchSummarizeCoreContent(url);
        extractedContent = extracted.content;
        title = extracted.title;
        description = extracted.description;
        siteName = extracted.siteName;
        truncated = extracted.truncated;
        hasTranscript = extracted.transcriptSource !== null;
        metadata = {
          domain: getDomain(url) ?? undefined,
        };
        break;
      }
    }

    // Generate summary using AI provider
    const aiProvider = getAIProvider();
    const prompt = buildLinkSummaryPrompt({
      url,
      title,
      siteName,
      description,
      content: extractedContent,
      truncated,
      hasTranscript,
      summaryLength: length,
      shares: [],
    });
    const maxTokens = SUMMARY_LENGTH_TO_TOKENS[length] ?? 1536;

    // Use the generateAnswer method for summarization
    // We pass the content as a "source" to leverage existing infrastructure
    const result = await aiProvider.generateAnswer({
      query: prompt,
      sources: [],
      maxTokens,
      model: options.model ?? resolveModelForKind('url'),
    });

    const response: SummarizeResult = {
      summary: result.answer,
      contentType,
      title,
      sourceUrl: url,
      extractedContent: extractedContent.substring(0, 1000), // Truncate for response
    };

    if (includeMetadata) {
      response.metadata = metadata;
    }

    return response;
  }

  async summarizeFile(
    input: SummarizeFileInput,
    options: SummarizeOptions = {}
  ): Promise<SummarizeFileResult> {
    const asset = await loadAssetFromPath({
      filePath: input.filePath,
      originalName: input.originalName ?? null,
      providedMimeType: input.mimeType ?? null,
    });

    return this.summarizeAsset(asset, options, input.sourceUrl ?? null);
  }

  private async summarizeAsset(
    asset: AssetInput,
    options: SummarizeOptions,
    sourceUrl: string | null
  ): Promise<SummarizeFileResult> {
    const { length = 'medium', includeMetadata = true } = options;
    const aiProvider = getAIProvider();
    const maxTokens = SUMMARY_LENGTH_TO_TOKENS[length] ?? 1536;

    if (asset.kind === 'image') {
      const prompt = buildImageSummaryPrompt({ asset, summaryLength: length });
      const result = await aiProvider.generateAnswer({
        query: prompt,
        sources: [],
        maxTokens,
        model: options.model ?? resolveModelForKind('image'),
        attachments: [
          {
            kind: 'image',
            mediaType: asset.mediaType,
            data: Buffer.from(asset.bytes).toString('base64'),
            filename: asset.filename,
          },
        ],
      });

      return {
        summary: result.answer,
        contentType: 'image',
        title: asset.filename ?? null,
        extractedContent: '',
        metadata: includeMetadata
          ? {
              filename: asset.filename,
              mediaType: asset.mediaType,
              sizeBytes: asset.sizeBytes,
              sourceUrl,
            }
          : undefined,
      };
    }

    const extracted = await extractDocumentText(asset);
    if (!extracted.text) {
      throw new Error('No readable text found in the document.');
    }

    const prompt = buildDocumentSummaryPrompt({
      asset,
      content: extracted.text,
      truncated: extracted.truncated,
      summaryLength: length,
    });
    const attachments =
      asset.mediaType === 'application/pdf' &&
      asset.sizeBytes <= MAX_UPLOAD_BYTES &&
      supportsPdfAttachment(aiProvider.name)
        ? [
            {
              kind: 'document' as const,
              mediaType: asset.mediaType,
              data: Buffer.from(asset.bytes).toString('base64'),
              filename: asset.filename,
            },
          ]
        : undefined;
    const result = await aiProvider.generateAnswer({
      query: prompt,
      sources: [],
      maxTokens,
      model: options.model ?? resolveModelForKind('document'),
      attachments,
    });

    return {
      summary: result.answer,
      contentType: 'document',
      title: asset.filename ?? null,
      extractedContent: extracted.text.substring(0, 1000),
      metadata: includeMetadata
        ? {
            filename: asset.filename,
            mediaType: asset.mediaType,
            sizeBytes: asset.sizeBytes,
            truncated: extracted.truncated,
            sourceUrl,
          }
        : undefined,
    };
  }

  private async summarizeGoogleDoc(
    url: string,
    options: SummarizeOptions
  ): Promise<SummarizeFileResult> {
    const { filePath, filename } = await downloadGoogleDocAsDocx({ url });
    try {
      return await this.summarizeFile(
        {
          filePath,
          originalName: filename,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sourceUrl: url,
        },
        options
      );
    } finally {
      await fs.unlink(filePath).catch(() => {});
    }
  }

  // Adapted from summarize CLI URL asset handling (src/content/asset.ts + src/run/flows/asset/input.ts).
  private async trySummarizeAssetUrl(
    url: string,
    options: SummarizeOptions
  ): Promise<SummarizeResult | null> {
    const { includeMetadata = true } = options;
    const kind = await classifyUrlAsAsset({ url });
    if (kind.kind !== 'asset') return null;

    try {
      const asset = await loadAssetFromUrl({ url });
      const fileResult = await this.summarizeAsset(asset, options, url);

      return {
        summary: fileResult.summary,
        contentType: fileResult.contentType,
        title: fileResult.title,
        sourceUrl: url,
        extractedContent: fileResult.extractedContent,
        metadata: includeMetadata
          ? {
              domain: getDomain(url) ?? undefined,
              filename: fileResult.metadata?.filename ?? null,
              mediaType: fileResult.metadata?.mediaType,
              sizeBytes: fileResult.metadata?.sizeBytes,
              truncated: fileResult.metadata?.truncated,
            }
          : undefined,
      };
    } catch (error) {
      if (isHtmlAssetError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check which content sources are configured and available
   * @returns Object indicating availability of Twitter, Reddit, and article services
   */
  getServiceStatus(): { twitter: boolean; reddit: boolean; articles: boolean } {
    return {
      twitter: this.twitterService.isConfigured(),
      reddit: this.redditService.isConfigured(),
      articles: true, // Always available via basic URL extraction
    };
  }
}

// Singleton instance
let summarizeService: SummarizeService | null = null;

export function getSummarizeService(): SummarizeService {
  if (!summarizeService) {
    summarizeService = new SummarizeService();
  }
  return summarizeService;
}
