import {
  buildLinkSummaryPrompt,
  SUMMARY_LENGTH_TO_TOKENS,
  type SummaryLength as CoreSummaryLength,
} from '@steipete/summarize-core/prompts';
import { getAIProvider } from './ai/ai.service.js';
import { fetchSummarizeCoreContent } from './summarize-core.client.js';
import { TwitterService, getTwitterService, isTwitterUrl } from './twitter.service.js';
import { RedditService, getRedditService, isRedditUrl } from './reddit.service.js';

export type ContentType = 'twitter' | 'reddit' | 'article' | 'unknown';
export type SummaryLength = CoreSummaryLength;

export interface SummarizeOptions {
  length?: SummaryLength;
  includeMetadata?: boolean;
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
  };
}

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

    const contentType = detectContentType(url);

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