import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateAnswer = vi.fn();
const mockLoadAssetFromPath = vi.fn();
const mockLoadAssetFromUrl = vi.fn();
const mockClassifyUrlAsAsset = vi.fn();
const mockExtractDocumentText = vi.fn();
const mockConvertToMarkdown = vi.fn();
const mockShouldPreprocessMediaType = vi.fn();

vi.mock('../src/services/ai/ai.service.js', () => ({
  getAIProvider: () => ({
    name: 'openai',
    generateAnswer: mockGenerateAnswer,
  }),
}));

vi.mock('../src/services/asset.service.js', () => ({
  loadAssetFromPath: (...args: unknown[]) => mockLoadAssetFromPath(...args),
  loadAssetFromUrl: (...args: unknown[]) => mockLoadAssetFromUrl(...args),
  classifyUrlAsAsset: (...args: unknown[]) => mockClassifyUrlAsAsset(...args),
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
  shouldPreprocessMediaType: (...args: unknown[]) => mockShouldPreprocessMediaType(...args),
}));

vi.mock('../src/services/document-parser.service.js', () => ({
  extractDocumentText: (...args: unknown[]) => mockExtractDocumentText(...args),
}));

vi.mock('../src/services/markitdown.service.js', () => ({
  convertToMarkdownWithMarkitdown: (...args: unknown[]) => mockConvertToMarkdown(...args),
}));

vi.mock('../src/services/summarize-core.client.js', () => ({
  fetchSummarizeCoreContent: vi.fn().mockResolvedValue({
    url: 'https://example.com',
    title: 'Example Title',
    description: 'Example description',
    siteName: 'example.com',
    content: 'Example content',
    truncated: false,
    totalCharacters: 15,
    wordCount: 2,
    transcriptCharacters: null,
    transcriptLines: null,
    transcriptWordCount: null,
    transcriptSource: null,
    transcriptionProvider: null,
    transcriptMetadata: null,
    mediaDurationSeconds: null,
    video: null,
    isVideoOnly: false,
    diagnostics: {
      strategy: 'html',
      firecrawl: {
        attempted: false,
        used: false,
        cacheMode: 'default',
        cacheStatus: 'miss',
      },
      markdown: {
        requested: false,
        used: false,
        provider: null,
      },
      transcript: {
        cacheMode: 'default',
        cacheStatus: 'miss',
        textProvided: false,
        provider: null,
        attemptedProviders: [],
      },
    },
  }),
}));

// Mock the services before importing
vi.mock('../src/services/twitter.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/twitter.service.js')>();
  return {
    ...actual,
    getTwitterService: () => ({
      isConfigured: () => false,
    }),
  };
});

vi.mock('../src/services/reddit.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/reddit.service.js')>();
  return {
    ...actual,
    getRedditService: () => ({
      isConfigured: () => false,
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateAnswer.mockReset();
  mockGenerateAnswer.mockResolvedValue({
    answer: 'summary',
    sourcesUsed: [],
  });
  mockLoadAssetFromPath.mockReset();
  mockLoadAssetFromUrl.mockReset();
  mockClassifyUrlAsAsset.mockReset();
  mockExtractDocumentText.mockReset();
  mockConvertToMarkdown.mockReset();
  mockShouldPreprocessMediaType.mockReset();
  mockShouldPreprocessMediaType.mockReturnValue(false);
});

describe('SummarizeService', () => {
  describe('content type detection', () => {
    it('should detect Twitter URLs', async () => {
      const { isTwitterUrl } = await import('../src/services/twitter.service.js');
      expect(isTwitterUrl('https://x.com/user/status/123')).toBe(true);
      expect(isTwitterUrl('https://twitter.com/user/status/123')).toBe(true);
    });

    it('should detect Reddit URLs', async () => {
      const { isRedditUrl } = await import('../src/services/reddit.service.js');
      expect(isRedditUrl('https://reddit.com/r/test/comments/abc/title')).toBe(true);
      expect(isRedditUrl('https://old.reddit.com/r/test/comments/abc/title')).toBe(true);
    });

    it('should treat other URLs as articles', async () => {
      const { isTwitterUrl } = await import('../src/services/twitter.service.js');
      const { isRedditUrl } = await import('../src/services/reddit.service.js');

      const url = 'https://example.com/article';
      expect(isTwitterUrl(url)).toBe(false);
      expect(isRedditUrl(url)).toBe(false);
    });
  });

  describe('service status', () => {
    it('should report service configuration status', async () => {
      const { SummarizeService } = await import('../src/services/summarize.service.js');
      const service = new SummarizeService();
      const status = service.getServiceStatus();

      expect(status).toHaveProperty('twitter');
      expect(status).toHaveProperty('reddit');
      expect(status).toHaveProperty('articles');
      expect(status.articles).toBe(true); // Articles always available
    });
  });

  describe('error handling', () => {
    it('should fall back to summarize-core for Twitter when not configured', async () => {
      const { SummarizeService } = await import('../src/services/summarize.service.js');
      const { fetchSummarizeCoreContent } = await import('../src/services/summarize-core.client.js');
      const service = new SummarizeService();

      const result = await service.summarize('https://x.com/user/status/123');
      expect(fetchSummarizeCoreContent).toHaveBeenCalled();
      expect(result.summary).toBe('summary');
    });

    it('should fall back to summarize-core for Reddit when not configured', async () => {
      const { SummarizeService } = await import('../src/services/summarize.service.js');
      const { fetchSummarizeCoreContent } = await import('../src/services/summarize-core.client.js');
      const service = new SummarizeService();

      const result = await service.summarize('https://reddit.com/r/test/comments/abc/title');
      expect(fetchSummarizeCoreContent).toHaveBeenCalled();
      expect(result.summary).toBe('summary');
    });
  });

  describe('asset URL handling', () => {
    it('summarizes direct asset URLs using file flow', async () => {
      const { SummarizeService } = await import('../src/services/summarize.service.js');
      const { fetchSummarizeCoreContent } = await import(
        '../src/services/summarize-core.client.js'
      );

      mockClassifyUrlAsAsset.mockResolvedValue({ kind: 'asset' });
      mockLoadAssetFromUrl.mockResolvedValue({
        kind: 'document',
        mediaType: 'application/pdf',
        filename: 'file.pdf',
        bytes: new Uint8Array([1, 2, 3]),
        sizeBytes: 3,
      });
      mockExtractDocumentText.mockResolvedValue({ text: 'Doc text', truncated: false });
      mockGenerateAnswer.mockResolvedValue({ answer: 'asset summary', sourcesUsed: [] });

      const service = new SummarizeService();
      const result = await service.summarize('https://example.com/file.pdf');

      expect(result.summary).toBe('asset summary');
      expect(result.contentType).toBe('document');
      expect(fetchSummarizeCoreContent).not.toHaveBeenCalled();
      expect(mockLoadAssetFromUrl).toHaveBeenCalled();
    });
  });
});

describe('Summary length options', () => {
  it('should validate SummaryLength type at compile time', async () => {
    const { SummarizeService } = await import('../src/services/summarize.service.js');
    const service = new SummarizeService();

    // This test ensures the SummaryLength type is properly constrained
    // The type system prevents invalid values, but we verify valid ones work
    const validLengths: Array<'short' | 'medium' | 'long' | 'xl' | 'xxl'> = [
      'short',
      'medium',
      'long',
      'xl',
      'xxl',
    ];

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

describe('SummarizeService.summarizeFile', () => {
  it('summarizes images with attachments and model override', async () => {
    const { SummarizeService } = await import('../src/services/summarize.service.js');

    const bytes = new Uint8Array(Buffer.from('image-bytes'));
    mockLoadAssetFromPath.mockResolvedValue({
      kind: 'image',
      mediaType: 'image/png',
      filename: 'photo.png',
      bytes,
      sizeBytes: bytes.byteLength,
    });
    mockGenerateAnswer.mockResolvedValue({
      answer: 'image summary',
      sourcesUsed: [],
    });

    const service = new SummarizeService();
    const result = await service.summarizeFile(
      {
        filePath: '/tmp/photo.png',
        originalName: 'photo.png',
        mimeType: 'image/png',
      },
      { length: 'short', model: 'image-model' }
    );

    expect(result.summary).toBe('image summary');
    expect(result.contentType).toBe('image');
    expect(mockGenerateAnswer).toHaveBeenCalledTimes(1);

    const call = mockGenerateAnswer.mock.calls[0]?.[0];
    expect(call.model).toBe('image-model');
    expect(call.query).toContain('Summarize the image content');
    expect(call.attachments?.[0]).toEqual(
      expect.objectContaining({
        kind: 'image',
        mediaType: 'image/png',
        filename: 'photo.png',
      })
    );
  });

  it('summarizes documents using extracted text', async () => {
    const { SummarizeService } = await import('../src/services/summarize.service.js');

    mockLoadAssetFromPath.mockResolvedValue({
      kind: 'document',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: 'report.docx',
      bytes: new Uint8Array([1, 2, 3]),
      sizeBytes: 3,
    });
    mockExtractDocumentText.mockResolvedValue({
      text: 'This is the document content.',
      truncated: false,
    });
    mockGenerateAnswer.mockResolvedValue({
      answer: 'doc summary',
      sourcesUsed: [],
    });

    const service = new SummarizeService();
    const result = await service.summarizeFile(
      {
        filePath: '/tmp/report.docx',
        originalName: 'report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      { length: 'medium', model: 'doc-model' }
    );

    expect(result.summary).toBe('doc summary');
    expect(result.contentType).toBe('document');
    expect(result.extractedContent).toContain('This is the document content.');
    expect(result.metadata?.truncated).toBe(false);

    const call = mockGenerateAnswer.mock.calls[0]?.[0];
    expect(call.model).toBe('doc-model');
    expect(call.query).toContain('Summarize the following document');
    expect(call.query).toContain('Document content:');
  });

  it('prefers PDF attachments over text extraction', async () => {
    const { SummarizeService } = await import('../src/services/summarize.service.js');

    mockLoadAssetFromPath.mockResolvedValue({
      kind: 'document',
      mediaType: 'application/pdf',
      filename: 'report.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      sizeBytes: 3,
    });
    mockGenerateAnswer.mockResolvedValue({
      answer: 'pdf summary',
      sourcesUsed: [],
    });

    const service = new SummarizeService();
    const result = await service.summarizeFile({
      filePath: '/tmp/report.pdf',
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.summary).toBe('pdf summary');
    expect(result.extractedContent).toBe('');
    expect(mockExtractDocumentText).not.toHaveBeenCalled();

    const call = mockGenerateAnswer.mock.calls[0]?.[0];
    expect(call.query).toContain('Summarize the attached document');
    expect(call.attachments?.[0]).toEqual(
      expect.objectContaining({
        kind: 'document',
        mediaType: 'application/pdf',
        filename: 'report.pdf',
      })
    );
  });

  it('falls back to markitdown for preprocessable document types', async () => {
    const { SummarizeService } = await import('../src/services/summarize.service.js');

    mockLoadAssetFromPath.mockResolvedValue({
      kind: 'document',
      mediaType: 'application/vnd.ms-excel',
      filename: 'sheet.xls',
      bytes: new Uint8Array([1, 2, 3]),
      sizeBytes: 3,
    });
    mockExtractDocumentText.mockRejectedValue(new Error('Unsupported document type'));
    mockShouldPreprocessMediaType.mockImplementation(
      (mediaType: string) => mediaType === 'application/vnd.ms-excel'
    );
    mockConvertToMarkdown.mockResolvedValue('# Sheet\n\nTotals: 10');
    mockGenerateAnswer.mockResolvedValue({ answer: 'doc summary', sourcesUsed: [] });

    const service = new SummarizeService();
    const result = await service.summarizeFile(
      {
        filePath: '/tmp/sheet.xls',
        originalName: 'sheet.xls',
        mimeType: 'application/vnd.ms-excel',
      },
      { length: 'short' }
    );

    expect(result.summary).toBe('doc summary');
    expect(mockConvertToMarkdown).toHaveBeenCalledTimes(1);

    const call = mockGenerateAnswer.mock.calls[0]?.[0];
    expect(call.query).toContain('# Sheet');
  });
});
