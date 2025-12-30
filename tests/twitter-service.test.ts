import { describe, it, expect } from 'vitest';
import { isTwitterUrl } from '../src/services/twitter.service.js';

describe('TwitterService', () => {
  describe('isTwitterUrl', () => {
    it('should detect x.com URLs', () => {
      expect(isTwitterUrl('https://x.com/user/status/123456789')).toBe(true);
      expect(isTwitterUrl('https://www.x.com/user/status/123456789')).toBe(true);
    });

    it('should detect twitter.com URLs', () => {
      expect(isTwitterUrl('https://twitter.com/user/status/123456789')).toBe(true);
      expect(isTwitterUrl('https://www.twitter.com/user/status/123456789')).toBe(true);
    });

    it('should detect mobile.twitter.com URLs', () => {
      expect(isTwitterUrl('https://mobile.twitter.com/user/status/123456789')).toBe(true);
    });

    it('should reject non-Twitter URLs', () => {
      expect(isTwitterUrl('https://reddit.com/r/test')).toBe(false);
      expect(isTwitterUrl('https://example.com')).toBe(false);
      expect(isTwitterUrl('https://nottwitter.com/status/123')).toBe(false);
    });

    it('should handle invalid URLs gracefully', () => {
      expect(isTwitterUrl('not-a-url')).toBe(false);
      expect(isTwitterUrl('')).toBe(false);
    });
  });

  describe('TwitterService configuration', () => {
    it('should report unconfigured when no credentials set', async () => {
      // Import dynamically to avoid env pollution
      const { TwitterService } = await import('../src/services/twitter.service.js');
      const service = new TwitterService({
        authToken: undefined,
        ct0: undefined,
        sweetisticsApiKey: undefined,
      });
      expect(service.isConfigured()).toBe(false);
    });

    it('should report configured with auth token and ct0', async () => {
      const { TwitterService } = await import('../src/services/twitter.service.js');
      const service = new TwitterService({
        authToken: 'test-token',
        ct0: 'test-ct0',
      });
      expect(service.isConfigured()).toBe(true);
    });

    it('should report configured with sweetistics API key', async () => {
      const { TwitterService } = await import('../src/services/twitter.service.js');
      const service = new TwitterService({
        sweetisticsApiKey: 'test-key',
      });
      expect(service.isConfigured()).toBe(true);
    });
  });
});
