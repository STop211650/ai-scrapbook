import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rowToQueryMemory, QueryMemoryRow } from '../src/types/memory';

describe('Memory Types', () => {
  describe('rowToQueryMemory', () => {
    it('should convert a database row to QueryMemory model', () => {
      const row: QueryMemoryRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '987fcdeb-51a2-3bc4-d567-890123456789',
        query: 'React performance tips',
        search_mode: 'hybrid',
        endpoint: 'search',
        top_results: [
          { id: 'result-1', title: 'React Optimization', contentType: 'url' },
          { id: 'result-2', title: 'Memoization Guide', contentType: 'text' },
        ],
        result_count: 5,
        created_at: '2025-12-15T10:30:00.000Z',
      };

      const result = rowToQueryMemory(row);

      expect(result.id).toBe(row.id);
      expect(result.userId).toBe(row.user_id);
      expect(result.query).toBe(row.query);
      expect(result.searchMode).toBe('hybrid');
      expect(result.endpoint).toBe('search');
      expect(result.topResults).toHaveLength(2);
      expect(result.topResults[0].title).toBe('React Optimization');
      expect(result.resultCount).toBe(5);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.createdAt.toISOString()).toBe('2025-12-15T10:30:00.000Z');
    });

    it('should handle empty top_results', () => {
      const row: QueryMemoryRow = {
        id: '123',
        user_id: '456',
        query: 'test',
        search_mode: 'keyword',
        endpoint: 'ask',
        top_results: [],
        result_count: 0,
        created_at: '2025-12-15T00:00:00.000Z',
      };

      const result = rowToQueryMemory(row);

      expect(result.topResults).toEqual([]);
      expect(result.resultCount).toBe(0);
    });

    it('should handle null top_results gracefully', () => {
      const row = {
        id: '123',
        user_id: '456',
        query: 'test',
        search_mode: 'semantic',
        endpoint: 'search',
        top_results: null as unknown as [],
        result_count: 0,
        created_at: '2025-12-15T00:00:00.000Z',
      } as QueryMemoryRow;

      const result = rowToQueryMemory(row);

      expect(result.topResults).toEqual([]);
    });
  });
});

describe('MemoryService', () => {
  // Mock the Supabase client and repository methods
  const mockInsert = vi.fn();
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockGte = vi.fn();
  const mockOrder = vi.fn();
  const mockRange = vi.fn();
  const mockSingle = vi.fn();

  const mockSupabase = {
    from: vi.fn(() => ({
      insert: mockInsert.mockReturnValue({
        select: mockSelect.mockReturnValue({
          single: mockSingle,
        }),
      }),
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          gte: mockGte.mockReturnValue({
            order: mockOrder.mockReturnValue({
              range: mockRange,
            }),
          }),
          order: mockOrder.mockReturnValue({
            range: mockRange,
          }),
        }),
      }),
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordQuery', () => {
    it('should limit top results to 5 items when recording', async () => {
      const { MemoryService } = await import('../src/services/memory.service');

      const topResults = [
        { id: '1', title: 'Result 1', contentType: 'url' },
        { id: '2', title: 'Result 2', contentType: 'url' },
        { id: '3', title: 'Result 3', contentType: 'url' },
        { id: '4', title: 'Result 4', contentType: 'url' },
        { id: '5', title: 'Result 5', contentType: 'url' },
        { id: '6', title: 'Result 6', contentType: 'url' },
        { id: '7', title: 'Result 7', contentType: 'url' },
      ];

      mockSingle.mockResolvedValue({
        data: { id: 'test-id' },
        error: null,
      });

      const service = new MemoryService(mockSupabase as any);

      await service.recordQuery(
        'user-123',
        'test query',
        'hybrid',
        'search',
        topResults,
        7
      );

      // Verify insert was called
      expect(mockInsert).toHaveBeenCalled();

      // Get the data that was passed to insert
      const insertCall = mockInsert.mock.calls[0][0];

      // Should only include first 5 results
      expect(insertCall.top_results).toHaveLength(5);
      expect(insertCall.top_results[0].id).toBe('1');
      expect(insertCall.top_results[4].id).toBe('5');
      expect(insertCall.result_count).toBe(7);
    });

    it('should not throw errors even if database insert fails', async () => {
      const { MemoryService } = await import('../src/services/memory.service');

      mockSingle.mockResolvedValue({
        data: null,
        error: new Error('Database error'),
      });

      const service = new MemoryService(mockSupabase as any);

      // Should not throw even if insert fails
      await expect(
        service.recordQuery('user-123', 'test', 'keyword', 'ask', [], 0)
      ).resolves.not.toThrow();
    });
  });
});
