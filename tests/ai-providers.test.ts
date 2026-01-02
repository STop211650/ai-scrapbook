import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({
  generateText: generateTextMock,
  embed: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    chat: vi.fn(() => ({ id: 'openai-model' })),
    textEmbeddingModel: vi.fn(() => ({ id: 'openai-embed' })),
  })),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ id: modelId })),
}));

import { OpenAIProvider } from '../src/services/ai/providers/openai.provider.js';
import { AnthropicProvider } from '../src/services/ai/providers/anthropic.provider.js';

describe('AI Providers JSON Parsing Error Handling', () => {
  describe('OpenAIProvider', () => {
    let provider: OpenAIProvider;

    beforeEach(() => {
      vi.clearAllMocks();
      provider = new OpenAIProvider('test-api-key');
    });

    it('should return default values when JSON parsing fails', async () => {
      generateTextMock.mockResolvedValueOnce({ text: '{title: no quotes}' });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await provider.enrich('test content', 'url');

      expect(result).toEqual({
        title: 'Untitled',
        description: '',
        tags: [],
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse OpenAI enrichment response:',
        expect.any(SyntaxError)
      );

      consoleSpy.mockRestore();
    });

    it('should handle null content gracefully', async () => {
      generateTextMock.mockResolvedValueOnce({ text: '' });

      const result = await provider.enrich('test content', 'url');

      // null content should parse as '{}' and return defaults
      expect(result).toEqual({
        title: 'Untitled',
        description: '',
        tags: [],
      });
    });

    it('should handle partial JSON response', async () => {
      // Valid JSON but missing some fields
      generateTextMock.mockResolvedValueOnce({ text: '{"title": "Test Title"}' });

      const result = await provider.enrich('test content', 'url');

      expect(result.title).toBe('Test Title');
      expect(result.description).toBe('');
      expect(result.tags).toEqual([]);
    });

    it('should handle valid JSON response correctly', async () => {
      generateTextMock.mockResolvedValueOnce({
        text: JSON.stringify({
          title: 'Valid Title',
          description: 'Valid description',
          tags: ['tag1', 'tag2'],
        }),
      });

      const result = await provider.enrich('test content', 'url');

      expect(result).toEqual({
        title: 'Valid Title',
        description: 'Valid description',
        tags: ['tag1', 'tag2'],
      });
    });

    it('should handle non-array tags gracefully', async () => {
      generateTextMock.mockResolvedValueOnce({
        text: JSON.stringify({
          title: 'Title',
          description: 'Desc',
          tags: 'not-an-array',
        }),
      });

      const result = await provider.enrich('test content', 'url');

      expect(result.tags).toEqual([]); // Should default to empty array
    });
  });

  describe('AnthropicProvider', () => {
    let provider: AnthropicProvider;

    beforeEach(() => {
      vi.clearAllMocks();
      provider = new AnthropicProvider('test-api-key', 'test-openai-key');
    });

    it('should return default values when JSON parsing fails', async () => {
      // Return text with no valid JSON
      generateTextMock.mockResolvedValueOnce({ text: 'This has no valid JSON anywhere!' });

      const result = await provider.enrich('test content', 'url');

      // Regex finds nothing, '{}' parses fine, returns defaults
      expect(result).toEqual({
        title: 'Untitled',
        description: '',
        tags: [],
      });
    });

    it('should handle malformed JSON in text', async () => {
      // Contains something that looks like JSON but is invalid
      generateTextMock.mockResolvedValueOnce({ text: 'Here is the result: {title: no quotes}' });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await provider.enrich('test content', 'url');

      expect(result).toEqual({
        title: 'Untitled',
        description: '',
        tags: [],
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse Anthropic enrichment response:',
        expect.any(SyntaxError)
      );

      consoleSpy.mockRestore();
    });

    it('should extract JSON from text with surrounding content', async () => {
      // Claude sometimes adds text around JSON
      generateTextMock.mockResolvedValueOnce({
        text: 'Here is the metadata:\n{"title": "Extracted Title", "description": "Extracted desc", "tags": ["extracted"]}\nHope this helps!',
      });

      const result = await provider.enrich('test content', 'url');

      expect(result).toEqual({
        title: 'Extracted Title',
        description: 'Extracted desc',
        tags: ['extracted'],
      });
    });

    it('should handle empty content array', async () => {
      generateTextMock.mockResolvedValueOnce({ text: '' });

      const result = await provider.enrich('test content', 'url');

      expect(result).toEqual({
        title: 'Untitled',
        description: '',
        tags: [],
      });
    });

    it('should handle non-text blocks gracefully', async () => {
      generateTextMock.mockResolvedValueOnce({ text: '' });

      const result = await provider.enrich('test content', 'url');

      expect(result).toEqual({
        title: 'Untitled',
        description: '',
        tags: [],
      });
    });
  });
});
