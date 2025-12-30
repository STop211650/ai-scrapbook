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

export async function fetchSummarizeCoreContent(
  url: string,
  options?: FetchLinkContentOptions
): Promise<ExtractedLinkContent> {
  const client = getSummarizeCoreClient();
  return client.fetchLinkContent(url, options);
}
