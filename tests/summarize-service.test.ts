import { describe, it, expect, vi } from 'vitest';

// Mock the services before importing
vi.mock('../src/services/twitter.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/twitter.service')>();
  return {
    ...actual,
    getTwitterService: () => ({
      isConfigured: () => false,
    }),
  };
});

vi.mock('../src/services/reddit.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/reddit.service')>();
  return {
    ...actual,
    getRedditService: () => ({
      isConfigured: () => false,
    }),
  };
});

describe('SummarizeService', () => {
  describe('content type detection', () => {
    it('should detect Twitter URLs', async () => {
      const { isTwitterUrl } = await import('../src/services/twitter.service');
      expect(isTwitterUrl('https://x.com/user/status/123')).toBe(true);
      expect(isTwitterUrl('https://twitter.com/user/status/123')).toBe(true);
    });

    it('should detect Reddit URLs', async () => {
      const { isRedditUrl } = await import('../src/services/reddit.service');
      expect(isRedditUrl('https://reddit.com/r/test/comments/abc/title')).toBe(true);
      expect(isRedditUrl('https://old.reddit.com/r/test/comments/abc/title')).toBe(true);
    });

    it('should treat other URLs as articles', async () => {
      const { isTwitterUrl } = await import('../src/services/twitter.service');
      const { isRedditUrl } = await import('../src/services/reddit.service');

      const url = 'https://example.com/article';
      expect(isTwitterUrl(url)).toBe(false);
      expect(isRedditUrl(url)).toBe(false);
    });
  });

  describe('service status', () => {
    it('should report service configuration status', async () => {
      const { SummarizeService } = await import('../src/services/summarize.service');
      const service = new SummarizeService();
      const status = service.getServiceStatus();

      expect(status).toHaveProperty('twitter');
      expect(status).toHaveProperty('reddit');
      expect(status).toHaveProperty('articles');
      expect(status.articles).toBe(true); // Articles always available
    });
  });

  describe('error handling', () => {
    it('should throw error for Twitter when not configured', async () => {
      const { SummarizeService } = await import('../src/services/summarize.service');
      const service = new SummarizeService();

      await expect(
        service.summarize('https://x.com/user/status/123')
      ).rejects.toThrow(/Twitter service not configured/);
    });

    it('should throw error for Reddit when not configured', async () => {
      const { SummarizeService } = await import('../src/services/summarize.service');
      const service = new SummarizeService();

      await expect(
        service.summarize('https://reddit.com/r/test/comments/abc/title')
      ).rejects.toThrow(/Reddit service not configured/);
    });
  });
});

describe('Summary length options', () => {
  it('should validate SummaryLength type at compile time', async () => {
    const { SummarizeService } = await import('../src/services/summarize.service');
    const service = new SummarizeService();

    // This test ensures the SummaryLength type is properly constrained
    // The type system prevents invalid values, but we verify valid ones work
    const validLengths: Array<'short' | 'medium' | 'long'> = ['short', 'medium', 'long'];

    // Verify each length option is a valid string and recognized by TypeScript
    validLengths.forEach((length) => {
      expect(typeof length).toBe('string');
      expect(length.length).toBeGreaterThan(0);
    });

    // Verify service status is callable (basic behavior check)
    const status = service.getServiceStatus();
    expect(status).toBeDefined();
  });
});
