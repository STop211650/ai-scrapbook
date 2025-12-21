import { execFile } from 'child_process';
import { promisify } from 'util';
import { env } from '../config/env';

const execFileAsync = promisify(execFile);

export interface TweetData {
  id: string;
  text: string;
  author: {
    username: string;
    name: string;
  };
  createdAt?: string;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
}

export interface TwitterServiceConfig {
  authToken?: string;
  ct0?: string;
  sweetisticsApiKey?: string;
  timeoutMs?: number;
}

// Extract tweet ID from URL or return as-is if already an ID
function extractTweetId(urlOrId: string): string {
  // Handle URLs like https://x.com/user/status/123456789 or https://twitter.com/user/status/123456789
  const match = urlOrId.match(/\/status\/(\d+)/);
  if (match) {
    return match[1];
  }
  // Assume it's already an ID
  return urlOrId;
}

/**
 * Check if a URL is a Twitter/X URL
 * @param url - The URL to check
 * @returns True if the URL is from twitter.com or x.com
 */
export function isTwitterUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return ['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host);
  } catch {
    return false;
  }
}

/**
 * Service for fetching and processing Twitter/X content using the bird CLI tool
 */
export class TwitterService {
  private config: TwitterServiceConfig;

  constructor(config?: TwitterServiceConfig) {
    this.config = {
      authToken: config?.authToken ?? env.TWITTER_AUTH_TOKEN,
      ct0: config?.ct0 ?? env.TWITTER_CT0,
      sweetisticsApiKey: config?.sweetisticsApiKey ?? env.SWEETISTICS_API_KEY,
      timeoutMs: config?.timeoutMs ?? 30000,
    };
  }

  /**
   * Check if Twitter credentials are configured (either direct auth or Sweetistics API key)
   * @returns True if the service has valid credentials
   */
  isConfigured(): boolean {
    return Boolean(
      (this.config.authToken && this.config.ct0) ||
      this.config.sweetisticsApiKey
    );
  }

  /**
   * Fetch a single tweet by URL or ID
   * @param urlOrId - Tweet URL (e.g., https://x.com/user/status/123) or tweet ID
   * @returns Tweet data including text, author, and engagement metrics
   */
  async getTweet(urlOrId: string): Promise<TweetData> {
    const tweetId = extractTweetId(urlOrId);

    const args = ['read', tweetId, '--json'];
    const envVars: Record<string, string> = { ...process.env } as Record<string, string>;

    // Set auth credentials in environment
    if (this.config.sweetisticsApiKey) {
      envVars.SWEETISTICS_API_KEY = this.config.sweetisticsApiKey;
    }
    if (this.config.authToken) {
      envVars.AUTH_TOKEN = this.config.authToken;
    }
    if (this.config.ct0) {
      envVars.CT0 = this.config.ct0;
    }

    try {
      const { stdout } = await execFileAsync('bird', args, {
        env: envVars,
        timeout: this.config.timeoutMs,
      });

      const tweet = JSON.parse(stdout.trim()) as TweetData;
      return tweet;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch tweet: ${message}`);
    }
  }

  /**
   * Fetch the entire thread containing the tweet
   * @param urlOrId - Tweet URL or ID
   * @returns Array of tweets in the thread
   */
  async getThread(urlOrId: string): Promise<TweetData[]> {
    const tweetId = extractTweetId(urlOrId);

    const args = ['thread', tweetId, '--json'];
    const envVars: Record<string, string> = { ...process.env } as Record<string, string>;

    if (this.config.sweetisticsApiKey) {
      envVars.SWEETISTICS_API_KEY = this.config.sweetisticsApiKey;
    }
    if (this.config.authToken) {
      envVars.AUTH_TOKEN = this.config.authToken;
    }
    if (this.config.ct0) {
      envVars.CT0 = this.config.ct0;
    }

    try {
      const { stdout } = await execFileAsync('bird', args, {
        env: envVars,
        timeout: this.config.timeoutMs,
      });

      const tweets = JSON.parse(stdout.trim()) as TweetData[];
      return tweets;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch thread: ${message}`);
    }
  }

  /**
   * Get formatted content for summarization including tweet text and metadata
   * @param url - Tweet URL
   * @returns Formatted string with tweet content and engagement metrics
   */
  async getContentForSummarization(url: string): Promise<string> {
    const tweet = await this.getTweet(url);

    const parts: string[] = [];
    parts.push(`Tweet by @${tweet.author.username} (${tweet.author.name}):`);
    parts.push('');
    parts.push(tweet.text);

    if (tweet.createdAt) {
      parts.push('');
      parts.push(`Posted: ${tweet.createdAt}`);
    }

    if (tweet.likeCount !== undefined || tweet.retweetCount !== undefined) {
      const engagement = [];
      if (tweet.likeCount !== undefined) engagement.push(`${tweet.likeCount} likes`);
      if (tweet.retweetCount !== undefined) engagement.push(`${tweet.retweetCount} retweets`);
      if (tweet.replyCount !== undefined) engagement.push(`${tweet.replyCount} replies`);
      parts.push(`Engagement: ${engagement.join(', ')}`);
    }

    return parts.join('\n');
  }
}

// Singleton instance
let twitterService: TwitterService | null = null;

export function getTwitterService(): TwitterService {
  if (!twitterService) {
    twitterService = new TwitterService();
  }
  return twitterService;
}
