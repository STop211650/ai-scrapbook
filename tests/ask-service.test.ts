import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AskService } from '../src/services/ask.service';

// Mock the AI service module
vi.mock('../src/services/ai/ai.service', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  generateAnswer: vi.fn().mockResolvedValue({
    answer: 'This is the answer based on [1] and [2].',
    sourcesUsed: ['item-1', 'item-2'],
  }),
}));

describe('AskService', () => {
  describe('ask batch fetching', () => {
    let mockSupabase: any;
    let askService: AskService;

    beforeEach(() => {
      vi.clearAllMocks();

      mockSupabase = {
        from: vi.fn(),
        rpc: vi.fn(),
      };

      askService = new AskService(mockSupabase);
    });

    it('should use findByIds for batch fetching instead of N individual queries', async () => {
      // Track how many times .from('content_items') is called
      const fromCalls: string[] = [];
      const mockContentItems = [
        {
          id: 'item-1',
          user_id: 'user-123',
          content_type: 'url',
          raw_content: 'This is the full content of item 1 for RAG context.',
          source_url: 'https://example.com/1',
          source_domain: 'example.com',
          image_path: null,
          title: 'Title 1',
          description: 'Desc 1',
          tags: ['tag1'],
          enrichment_status: 'completed',
          search_vector: null,
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'item-2',
          user_id: 'user-123',
          content_type: 'text',
          raw_content: 'This is the full content of item 2 for RAG context.',
          source_url: null,
          source_domain: null,
          image_path: null,
          title: 'Title 2',
          description: 'Desc 2',
          tags: ['tag2'],
          enrichment_status: 'completed',
          search_vector: null,
          created_at: '2025-01-02T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z',
        },
      ];

      // Mock RPC call for semantic search (used by SearchService internally)
      mockSupabase.rpc.mockResolvedValue({
        data: [
          { id: 'item-1', similarity: 0.95 },
          { id: 'item-2', similarity: 0.85 },
        ],
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        fromCalls.push(table);

        if (table === 'content_items') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: mockContentItems, error: null }),
          };
        }

        return {};
      });

      const result = await askService.ask('user-123', {
        query: 'What is this about?',
        limit: 5,
        mode: 'semantic',
      });

      // Verify batch fetch was used
      // SearchService uses 1 call, AskService uses 1 call = 2 total calls to content_items
      // But both now use batch fetching (findByIds) instead of N individual queries
      const contentItemsCalls = fromCalls.filter((t) => t === 'content_items');
      expect(contentItemsCalls).toHaveLength(2); // SearchService + AskService both use batch

      // Verify results
      expect(result.answer).toContain('This is the answer');
      expect(result.sources).toHaveLength(2);
    });

    it('should return empty response when no search results found', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

      const result = await askService.ask('user-123', {
        query: 'What is this about?',
        limit: 5,
        mode: 'semantic',
      });

      expect(result.answer).toContain("couldn't find any relevant content");
      expect(result.sources).toHaveLength(0);
      expect(result.totalSourcesSearched).toBe(0);
    });

    it('should handle items deleted between search and fetch gracefully', async () => {
      // RPC returns 2 items
      mockSupabase.rpc.mockResolvedValue({
        data: [
          { id: 'item-1', similarity: 0.95 },
          { id: 'item-deleted', similarity: 0.85 }, // This item was deleted
        ],
        error: null,
      });

      // Only 1 item exists when we do batch fetch
      const mockContentItems = [
        {
          id: 'item-1',
          user_id: 'user-123',
          content_type: 'url',
          raw_content: 'Content 1',
          source_url: 'https://example.com/1',
          source_domain: 'example.com',
          image_path: null,
          title: 'Title 1',
          description: 'Desc 1',
          tags: [],
          enrichment_status: 'completed',
          search_vector: null,
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        },
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'content_items') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: mockContentItems, error: null }),
          };
        }
        return {};
      });

      // Should not throw, should handle gracefully
      const result = await askService.ask('user-123', {
        query: 'Test query',
        limit: 5,
        mode: 'semantic',
      });

      // Should still return a result with available sources
      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
    });
  });
});
