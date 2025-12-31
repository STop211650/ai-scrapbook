import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock functions that we can control from tests
const mockOpenAICreate = vi.fn();
const mockAnthropicCreate = vi.fn();
const mockEmbeddingsCreate = vi.fn();

// Mock OpenAI SDK with a class constructor
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockOpenAICreate,
        },
      };
      embeddings = {
        create: mockEmbeddingsCreate,
      };
    },
  };
});

// Mock Anthropic SDK with a class constructor
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockAnthropicCreate,
      };
    },
  };
});

// Import after mocking so providers use mocked SDKs
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
      // Return invalid JSON that will fail to parse
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'This is not valid JSON at all!' } }],
      });

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
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

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
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: '{"title": "Test Title"}' } }],
      });

      const result = await provider.enrich('test content', 'url');

      expect(result.title).toBe('Test Title');
      expect(result.description).toBe('');
      expect(result.tags).toEqual([]);
    });

    it('should handle valid JSON response correctly', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Valid Title',
                description: 'Valid description',
                tags: ['tag1', 'tag2'],
              }),
            },
          },
        ],
      });

      const result = await provider.enrich('test content', 'url');

      expect(result).toEqual({
        title: 'Valid Title',
        description: 'Valid description',
        tags: ['tag1', 'tag2'],
      });
    });

    it('should handle non-array tags gracefully', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Title',
                description: 'Desc',
                tags: 'not-an-array', // Invalid tags format
              }),
            },
          },
        ],
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
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'This has no valid JSON anywhere!' }],
      });

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
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Here is the result: {title: no quotes}' }],
      });

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
      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'Here is the metadata:\n{"title": "Extracted Title", "description": "Extracted desc", "tags": ["extracted"]}\nHope this helps!',
          },
        ],
      });

      const result = await provider.enrich('test content', 'url');

      expect(result).toEqual({
        title: 'Extracted Title',
        description: 'Extracted desc',
        tags: ['extracted'],
      });
    });

    it('should handle empty content array', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [],
      });

      const result = await provider.enrich('test content', 'url');

      expect(result).toEqual({
        title: 'Untitled',
        description: '',
        tags: [],
      });
    });

    it('should handle non-text blocks gracefully', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'image', source: 'some-image' }],
      });

      const result = await provider.enrich('test content', 'url');

      expect(result).toEqual({
        title: 'Untitled',
        description: '',
        tags: [],
      });
    });
  });
});
