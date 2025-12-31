import {
  createLinkPreviewClient,
  type ExtractedLinkContent,
  type FetchLinkContentOptions,
  type LinkPreviewClient,
  type ReadTweetWithBird,
} from '@steipete/summarize-core/content';
import { env } from '../config/env.js';
import { getTwitterService } from './twitter.service.js';

let summarizeCoreClient: LinkPreviewClient | null = null;

/**
 * Creates a ReadTweetWithBird-compatible function that fetches a tweet by URL using the configured Twitter service.
 *
 * The produced function returns a simplified tweet object with `id`, `text`, `author`, and `createdAt`, or `null` when the Twitter service is not configured.
 *
 * @returns A function that accepts `{ url, timeoutMs? }` and returns the tweet object `{ id, text, author, createdAt }` if available, `null` otherwise.
 */
function buildReadTweetWithBird(): ReadTweetWithBird {
  return async ({ url, timeoutMs }) => {
    const twitterService = getTwitterService();
    if (!twitterService.isConfigured()) {
      return null;
    }
    const tweet = await twitterService.getTweet(url, { timeoutMs });
    return {
      id: tweet.id,
      text: tweet.text,
      author: tweet.author,
      createdAt: tweet.createdAt,
    };
  };
}

/**
 * Get the singleton LinkPreviewClient, initializing it on first use.
 *
 * @returns The initialized LinkPreviewClient instance
 */
export function getSummarizeCoreClient(): LinkPreviewClient {
  if (!summarizeCoreClient) {
    summarizeCoreClient = createLinkPreviewClient({
      apifyApiToken: env.APIFY_API_TOKEN ?? null,
      ytDlpPath: env.YT_DLP_PATH ?? null,
      falApiKey: env.FAL_KEY ?? null,
      openaiApiKey: env.OPENAI_API_KEY ?? null,
      readTweetWithBird: buildReadTweetWithBird(),
      scrapeWithFirecrawl: null,
      convertHtmlToMarkdown: null,
      transcriptCache: null,
    });
  }
  return summarizeCoreClient;
}

/**
 * Fetches and extracts preview content for a given URL using the summarize core client.
 *
 * @param url - The target URL to fetch and extract content from
 * @param options - Optional settings that control how the content is fetched and extracted
 * @returns The extracted link content as an `ExtractedLinkContent` object
 */
export async function fetchSummarizeCoreContent(
  url: string,
  options?: FetchLinkContentOptions
): Promise<ExtractedLinkContent> {
  const client = getSummarizeCoreClient();
  return client.fetchLinkContent(url, options);
}
