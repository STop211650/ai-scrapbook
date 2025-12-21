import { getAIProvider } from './ai/ai.service';
import { extractUrlMetadata } from './url-extractor.service';
import { TwitterService, getTwitterService, isTwitterUrl } from './twitter.service';
import { RedditService, getRedditService, isRedditUrl } from './reddit.service';

export type ContentType = 'twitter' | 'reddit' | 'article' | 'unknown';
export type SummaryLength = 'short' | 'medium' | 'long';

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

// Length guidelines for summaries
const LENGTH_GUIDELINES: Record<SummaryLength, string> = {
  short: 'Provide a brief 2-3 sentence summary capturing only the main point.',
  medium: 'Provide a summary of 1-2 paragraphs covering the key points and main arguments.',
  long: 'Provide a comprehensive summary of 3-4 paragraphs with detailed coverage of all major points, arguments, and conclusions.',
};

// Detect content type from URL
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

// Build the summarization prompt
function buildSummarizePrompt(content: string, contentType: ContentType, length: SummaryLength): string {
  const lengthGuideline = LENGTH_GUIDELINES[length];

  let contextDescription: string;
  switch (contentType) {
    case 'twitter':
      contextDescription = 'a tweet or Twitter/X post';
      break;
    case 'reddit':
      contextDescription = 'a Reddit post with comments';
      break;
    case 'article':
    default:
      contextDescription = 'a web article or page';
      break;
  }

  return `You are a helpful assistant that summarizes content. You are given ${contextDescription}.

${lengthGuideline}

Focus on:
- The main topic or claim
- Key supporting points or evidence
- Any notable conclusions or takeaways

Do not include phrases like "This article discusses" or "The author mentions". Just provide the summary directly.

Content to summarize:
---
${content}
---

Summary:`;
}

export class SummarizeService {
  private twitterService: TwitterService;
  private redditService: RedditService;

  constructor() {
    this.twitterService = getTwitterService();
    this.redditService = getRedditService();
  }

  // Main summarization method
  async summarize(url: string, options: SummarizeOptions = {}): Promise<SummarizeResult> {
    const { length = 'medium', includeMetadata = true } = options;

    const contentType = detectContentType(url);

    let extractedContent: string;
    let title: string | null = null;
    let metadata: SummarizeResult['metadata'] = {};

    // Extract content based on type
    switch (contentType) {
      case 'twitter': {
        if (!this.twitterService.isConfigured()) {
          throw new Error('Twitter service not configured. Set TWITTER_AUTH_TOKEN and TWITTER_CT0, or SWEETISTICS_API_KEY.');
        }
        const tweet = await this.twitterService.getTweet(url);
        extractedContent = await this.twitterService.getContentForSummarization(url);
        title = `Tweet by @${tweet.author.username}`;
        metadata = {
          author: `@${tweet.author.username}`,
          domain: 'x.com',
          engagement: `${tweet.likeCount ?? 0} likes, ${tweet.retweetCount ?? 0} retweets`,
        };
        break;
      }

      case 'reddit': {
        if (!this.redditService.isConfigured()) {
          throw new Error('Reddit service not configured. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, and REDDIT_PASSWORD.');
        }
        const post = await this.redditService.getPost(url);
        extractedContent = await this.redditService.getContentForSummarization(url);
        title = post.title;
        metadata = {
          author: `u/${post.author}`,
          domain: `r/${post.subreddit}`,
          engagement: `${post.score} points, ${post.numComments} comments`,
        };
        break;
      }

      case 'article':
      default: {
        const articleData = await extractUrlMetadata(url);
        extractedContent = articleData.text;
        title = articleData.title;
        metadata = {
          domain: articleData.domain,
        };
        break;
      }
    }

    // Generate summary using AI provider
    const aiProvider = getAIProvider();
    const prompt = buildSummarizePrompt(extractedContent, contentType, length);

    // Use the generateAnswer method for summarization
    // We pass the content as a "source" to leverage existing infrastructure
    const result = await aiProvider.generateAnswer({
      query: prompt,
      sources: [],
      maxTokens: length === 'short' ? 150 : length === 'medium' ? 400 : 800,
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

  // Check which services are configured
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
