import { describe, it, expect } from 'vitest';
import { detectContentType } from '../src/services/url-extractor.service.js';

describe('URL Extractor Service', () => {
  describe('detectContentType', () => {
    it('should detect URLs', () => {
      expect(detectContentType('https://example.com')).toBe('url');
      expect(detectContentType('http://example.com/path')).toBe('url');
      expect(detectContentType('https://twitter.com/user/status/123')).toBe('url');
      expect(detectContentType('https://reddit.com/r/programming')).toBe('url');
    });

    it('should detect plain text', () => {
      expect(detectContentType('Hello world')).toBe('text');
      expect(detectContentType('This is a note about React performance')).toBe('text');
      expect(detectContentType('Short')).toBe('text');
    });

    it('should treat data URLs as URLs (not images)', () => {
      // Data URLs are valid URLs per the URL spec, so they're detected as 'url'
      // Image detection only works for raw base64 strings, not data URLs
      expect(detectContentType('data:image/png;base64,iVBORw0KGgo=')).toBe('url');
    });

    it('should handle edge cases', () => {
      // Empty-ish strings should be text
      expect(detectContentType('   ')).toBe('text');

      // Invalid URL formats should be text
      expect(detectContentType('not-a-url')).toBe('text');
      expect(detectContentType('example.com')).toBe('text'); // Missing protocol
    });
  });
});
