import Snoowrap from 'snoowrap';
import { env } from '../config/env';

// Type definitions for snoowrap entities (simplified to avoid TS1062 errors)
interface RedditSubmission {
  id: string;
  title: string;
  author: { name?: string } | null;
  subreddit: { display_name?: string } | null;
  selftext: string;
  url: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  comments: {
    fetchMore: (opts: { amount: number }) => Promise<RedditComment[]>;
  };
}

interface RedditComment {
  id: string;
  author: { name?: string } | null;
  body: string;
  score: number;
  created_utc: number;
  replies?: RedditComment[];
}

// Helper to work around snoowrap's Promise type issues
async function fetchSubmission(client: Snoowrap, postId: string): Promise<RedditSubmission> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client.getSubmission(postId) as any).fetch();
}

async function fetchComments(submission: RedditSubmission, amount: number): Promise<RedditComment[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return submission.comments.fetchMore({ amount }) as any;
}

export interface RedditPostData {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  selftext: string;
  url: string;
  score: number;
  numComments: number;
  createdUtc: number;
  permalink: string;
}

export interface RedditCommentData {
  id: string;
  author: string;
  body: string;
  score: number;
  createdUtc: number;
  depth: number;
}

export interface RedditServiceConfig {
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  userAgent?: string;
}

// Extract post ID from Reddit URL
function extractRedditPostId(url: string): { subreddit: string; postId: string } | null {
  // Handle URLs like:
  // https://www.reddit.com/r/subreddit/comments/postid/title
  // https://old.reddit.com/r/subreddit/comments/postid/title
  // https://reddit.com/r/subreddit/comments/postid
  const match = url.match(/reddit\.com\/r\/([^/]+)\/comments\/([^/]+)/i);
  if (match) {
    return { subreddit: match[1], postId: match[2] };
  }
  return null;
}

/**
 * Check if a URL is a Reddit URL
 * @param url - The URL to check
 * @returns True if the URL is from reddit.com
 */
export function isRedditUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return ['reddit.com', 'old.reddit.com', 'new.reddit.com'].includes(host);
  } catch {
    return false;
  }
}

/**
 * Service for fetching and processing Reddit posts and comments using the Snoowrap API wrapper
 */
export class RedditService {
  private client: Snoowrap | null = null;
  private config: RedditServiceConfig;

  constructor(config?: RedditServiceConfig) {
    this.config = {
      clientId: config?.clientId ?? env.REDDIT_CLIENT_ID,
      clientSecret: config?.clientSecret ?? env.REDDIT_CLIENT_SECRET,
      username: config?.username ?? env.REDDIT_USERNAME,
      password: config?.password ?? env.REDDIT_PASSWORD,
      userAgent: config?.userAgent ?? 'AIScrapbook/1.0',
    };

    if (this.isConfigured()) {
      this.client = new Snoowrap({
        userAgent: this.config.userAgent!,
        clientId: this.config.clientId!,
        clientSecret: this.config.clientSecret!,
        username: this.config.username!,
        password: this.config.password!,
      });

      // Disable request throttling warnings
      this.client.config({ warnings: false });
    }
  }

  /**
   * Check if Reddit credentials are configured
   * @returns True if all required Reddit API credentials are set
   */
  isConfigured(): boolean {
    return Boolean(
      this.config.clientId &&
      this.config.clientSecret &&
      this.config.username &&
      this.config.password
    );
  }

  /**
   * Fetch a Reddit post by URL
   * @param url - Reddit post URL (e.g., https://reddit.com/r/subreddit/comments/postid)
   * @returns Post data including title, content, author, and engagement metrics
   */
  async getPost(url: string): Promise<RedditPostData> {
    if (!this.client) {
      throw new Error('Reddit service not configured. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, and REDDIT_PASSWORD.');
    }

    const extracted = extractRedditPostId(url);
    if (!extracted) {
      throw new Error(`Invalid Reddit URL: ${url}`);
    }

    try {
      const submission = await fetchSubmission(this.client, extracted.postId);

      return {
        id: submission.id,
        title: submission.title,
        author: submission.author?.name ?? '[deleted]',
        subreddit: submission.subreddit?.display_name ?? extracted.subreddit,
        selftext: submission.selftext ?? '',
        url: submission.url,
        score: submission.score,
        numComments: submission.num_comments,
        createdUtc: submission.created_utc,
        permalink: `https://reddit.com${submission.permalink}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch Reddit post: ${message}`);
    }
  }

  /**
   * Fetch top comments for a post
   * @param url - Reddit post URL
   * @param limit - Maximum number of comments to fetch (default: 10)
   * @returns Array of comment data including nested replies
   */
  async getComments(url: string, limit: number = 10): Promise<RedditCommentData[]> {
    if (!this.client) {
      throw new Error('Reddit service not configured.');
    }

    const extracted = extractRedditPostId(url);
    if (!extracted) {
      throw new Error(`Invalid Reddit URL: ${url}`);
    }

    try {
      const submission = await fetchSubmission(this.client, extracted.postId);
      const comments = await fetchComments(submission, limit);

      const result: RedditCommentData[] = [];

      // Flatten and extract top-level and some nested comments
      const processComment = (comment: RedditComment, depth: number) => {
        if (result.length >= limit) return;
        if (!comment.body || comment.body === '[deleted]') return;

        result.push({
          id: comment.id,
          author: comment.author?.name ?? '[deleted]',
          body: comment.body,
          score: comment.score,
          createdUtc: comment.created_utc,
          depth,
        });

        // Process replies (limit depth to prevent too much nesting)
        if (depth < 2 && comment.replies && Array.isArray(comment.replies)) {
          for (const reply of comment.replies.slice(0, 3)) {
            if (reply && typeof reply === 'object' && 'body' in reply) {
              processComment(reply, depth + 1);
            }
          }
        }
      };

      for (const comment of comments) {
        if (result.length >= limit) break;
        if (comment && typeof comment === 'object' && 'body' in comment) {
          processComment(comment, 0);
        }
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch Reddit comments: ${message}`);
    }
  }

  /**
   * Get formatted content for summarization including post and top comments
   * @param url - Reddit post URL
   * @param commentLimit - Maximum number of comments to include (default: 5)
   * @returns Formatted string with post content, metadata, and top comments
   */
  async getContentForSummarization(url: string, commentLimit: number = 5): Promise<string> {
    const post = await this.getPost(url);

    const parts: string[] = [];
    parts.push(`Reddit Post: ${post.title}`);
    parts.push(`Subreddit: r/${post.subreddit}`);
    parts.push(`Author: u/${post.author}`);
    parts.push(`Score: ${post.score} | Comments: ${post.numComments}`);
    parts.push('');

    if (post.selftext) {
      parts.push('--- Post Content ---');
      parts.push(post.selftext);
      parts.push('');
    }

    // Fetch and include top comments
    try {
      const comments = await this.getComments(url, commentLimit);
      if (comments.length > 0) {
        parts.push('--- Top Comments ---');
        for (const comment of comments) {
          const indent = '  '.repeat(comment.depth);
          parts.push(`${indent}u/${comment.author} (${comment.score} points):`);
          // Truncate long comments for summarization context
          const body = comment.body.length > 500
            ? comment.body.substring(0, 500) + '...'
            : comment.body;
          parts.push(`${indent}${body}`);
          parts.push('');
        }
      }
    } catch (error) {
      // Continue without comments if fetching fails
      console.warn('Failed to fetch comments:', error);
    }

    return parts.join('\n');
  }
}

// Singleton instance
let redditService: RedditService | null = null;

export function getRedditService(): RedditService {
  if (!redditService) {
    redditService = new RedditService();
  }
  return redditService;
}
