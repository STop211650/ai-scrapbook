import { describe, it, expect } from 'vitest';
import { isRedditUrl } from '../src/services/reddit.service.js';

describe('RedditService', () => {
  describe('isRedditUrl', () => {
    it('should detect reddit.com URLs', () => {
      expect(isRedditUrl('https://reddit.com/r/programming/comments/abc123/title')).toBe(true);
      expect(isRedditUrl('https://www.reddit.com/r/programming/comments/abc123/title')).toBe(true);
    });

    it('should detect old.reddit.com URLs', () => {
      expect(isRedditUrl('https://old.reddit.com/r/programming/comments/abc123/title')).toBe(true);
    });

    it('should detect new.reddit.com URLs', () => {
      expect(isRedditUrl('https://new.reddit.com/r/programming/comments/abc123/title')).toBe(true);
    });

    it('should reject non-Reddit URLs', () => {
      expect(isRedditUrl('https://twitter.com/user/status/123')).toBe(false);
      expect(isRedditUrl('https://example.com')).toBe(false);
      expect(isRedditUrl('https://notreddit.com/r/test')).toBe(false);
    });

    it('should handle invalid URLs gracefully', () => {
      expect(isRedditUrl('not-a-url')).toBe(false);
      expect(isRedditUrl('')).toBe(false);
    });
  });

  describe('RedditService configuration', () => {
    it('should report unconfigured when no credentials set', async () => {
      const { RedditService } = await import('../src/services/reddit.service.js');
      const service = new RedditService({
        clientId: undefined,
        clientSecret: undefined,
        username: undefined,
        password: undefined,
      });
      expect(service.isConfigured()).toBe(false);
    });

    it('should report unconfigured with partial credentials', async () => {
      const { RedditService } = await import('../src/services/reddit.service.js');
      const service = new RedditService({
        clientId: 'test-id',
        clientSecret: undefined,
        username: undefined,
        password: undefined,
      });
      expect(service.isConfigured()).toBe(false);
    });

    it('should report configured with all credentials', async () => {
      const { RedditService } = await import('../src/services/reddit.service.js');
      const service = new RedditService({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        username: 'test-user',
        password: 'test-pass',
      });
      expect(service.isConfigured()).toBe(true);
    });
  });
});
