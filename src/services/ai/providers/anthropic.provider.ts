import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  AIProvider,
  EnrichmentResult,
  EnrichmentOptions,
  GenerateAnswerOptions,
  GenerateAnswerResult,
} from '../../../types/ai';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private openaiClient: OpenAI | null = null;

  constructor(apiKey: string, openaiApiKey?: string) {
    this.client = new Anthropic({ apiKey });
    // Use OpenAI for embeddings since Anthropic doesn't offer them
    if (openaiApiKey) {
      this.openaiClient = new OpenAI({ apiKey: openaiApiKey });
    }
  }

  async enrich(
    content: string,
    contentType: string,
    options?: EnrichmentOptions
  ): Promise<EnrichmentResult> {
    // Build existing tags section if available
    const existingTagsSection =
      options?.existingTags && options.existingTags.length > 0
        ? `\nExisting tags in the user's library: ${options.existingTags.join(', ')}\nPrefer reusing these tags when relevant for consistency.`
        : '';

    const prompt = `Analyze this ${contentType} content and provide metadata.

Content: ${content.substring(0, 3000)}
${existingTagsSection}

Respond with a JSON object containing:
- title: A concise title (max 60 characters)
- description: A short paragraph of notes about this content - what it is, why it might be interesting or useful, and any key takeaways (2-4 sentences)
- tags: Up to 5 relevant tags (lowercase, no spaces, use hyphens for multi-word tags)

Tag guidelines:
- For music content: Always include the primary genre. For electronic music, also include the specific subgenre:
  - House variants: "house", "deep-house", "lo-fi-house", "tech-house", "progressive-house", "acid-house"
  - Techno variants: "techno", "minimal-techno", "industrial-techno", "dub-techno"
  - Other electronic: "ambient", "drum-and-bass", "dubstep", "trance", "idm", "breakbeat", "garage", "uk-garage", "jungle"
- Use your knowledge of artists to determine genre. Examples:
  - Lo-fi house: Galcher Lustwerk, Mall Grab, DJ Seinfeld, Ross From Friends, DJ Boring
  - Deep house: Kerri Chandler, Larry Heard, Moodymann
  - Techno: Charlotte de Witte, Amelie Lens, Adam Beyer, Ben Klock
  - House: Disclosure, Duke Dumont, MK
- Distinguish: House = groovy, soulful, warm; Techno = darker, industrial, driving
- Reuse existing tags from the user's library when they apply
- Use consistent naming: prefer "article" over "news", "tutorial" over "guide"

Respond ONLY with valid JSON, no other text.`;

    const response = await this.client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const text = textBlock?.type === 'text' ? textBlock.text : '{}';

    // Extract JSON from response (Claude might include extra text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    // Parse JSON with error handling to prevent crashes from malformed responses
    let result: { title?: string; description?: string; tags?: unknown } = {};
    try {
      result = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
    } catch (error) {
      console.error('Failed to parse Anthropic enrichment response:', error);
      return { title: 'Untitled', description: '', tags: [] };
    }

    return {
      title: result.title || 'Untitled',
      description: result.description || '',
      tags: Array.isArray(result.tags) ? result.tags : [],
    };
  }

  async embed(text: string): Promise<number[]> {
    // Anthropic doesn't offer embeddings, so we use OpenAI
    if (!this.openaiClient) {
      throw new Error('OpenAI API key required for embeddings when using Anthropic provider');
    }

    const response = await this.openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000),
    });

    return response.data[0].embedding;
  }

  async generateAnswer(options: GenerateAnswerOptions): Promise<GenerateAnswerResult> {
    const { query, sources, maxTokens = 1500 } = options;

    // Build context string with numbered sources for citation
    const contextParts = sources.map((source, index) => {
      const num = index + 1;
      const urlInfo = source.sourceUrl ? ` (${source.sourceUrl})` : '';
      return `[${num}] ${source.title || 'Untitled'}${urlInfo}\n${source.excerpt}`;
    });

    const contextString = contextParts.join('\n\n---\n\n');

    const prompt = `You are a helpful assistant that answers questions based on the user's saved content.
Use ONLY the provided sources to answer. If the sources don't contain relevant information, say so.

Sources:
${contextString}

Question: ${query}

Instructions:
- Answer using only information from the sources above
- Use inline numbered citations like [1], [2] to reference sources
- Format your response in markdown
- Do NOT include a sources list at the end - just use inline citations
- If sources don't contain relevant info, acknowledge this

Answer:`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251015',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const answer = textBlock?.type === 'text' ? textBlock.text : '';

    // Extract which sources were actually cited by finding [N] patterns
    const citationPattern = /\[(\d+)\]/g;
    const citedNumbers = new Set<number>();
    let match;
    while ((match = citationPattern.exec(answer)) !== null) {
      citedNumbers.add(parseInt(match[1], 10));
    }

    // Map citation numbers back to content IDs
    const sourcesUsed = Array.from(citedNumbers)
      .filter((num) => num >= 1 && num <= sources.length)
      .map((num) => sources[num - 1].id);

    return { answer, sourcesUsed };
  }
}
