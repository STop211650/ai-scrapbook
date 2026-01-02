import { generateText, embed, type ImagePart, type TextPart } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  AIProvider,
  Attachment,
  EnrichmentResult,
  EnrichmentOptions,
  GenerateAnswerOptions,
  GenerateAnswerResult,
} from '../../../types/ai.js';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private provider;
  private defaultModelId: string;
  private embeddingModel;

  constructor(apiKey: string, defaultModelId?: string) {
    this.provider = createOpenAI({ apiKey });
    this.defaultModelId = defaultModelId?.trim() || 'gpt-5-mini';
    this.embeddingModel = this.provider.textEmbeddingModel('text-embedding-3-small');
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

    const model = this.provider.chat(options?.model ?? this.defaultModelId);
    const { text } = await generateText({
      model,
      prompt,
      maxOutputTokens: 500,
    });

    // Parse JSON with error handling to prevent crashes from malformed responses
    let result: { title?: string; description?: string; tags?: unknown } = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
    } catch (error) {
      console.error('Failed to parse OpenAI enrichment response:', error);
      return { title: 'Untitled', description: '', tags: [] };
    }

    return {
      title: result.title || 'Untitled',
      description: result.description || '',
      tags: Array.isArray(result.tags) ? result.tags : [],
    };
  }

  async embed(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: this.embeddingModel,
      value: text.substring(0, 8000),
    });

    return embedding;
  }

  async generateAnswer(options: GenerateAnswerOptions): Promise<GenerateAnswerResult> {
    const { query, sources, maxTokens = 1500, attachments } = options;

    // Build context string with numbered sources for citation
    const contextParts = sources.map((source, index) => {
      const num = index + 1;
      const urlInfo = source.sourceUrl ? ` (${source.sourceUrl})` : '';
      return `[${num}] ${source.title || 'Untitled'}${urlInfo}\n${source.excerpt}`;
    });

    const contextString = contextParts.join('\n\n---\n\n');

    const systemPrompt = `You are a helpful assistant that answers questions based on the user's saved content.
Use ONLY the provided sources to answer. If the sources don't contain relevant information, say so.

When citing sources, use inline numbered references like [1], [2], etc. that correspond to the source numbers.
Format your response in markdown. Include citations inline where you reference information.

After your answer, do NOT include a sources list - the frontend will render that from the metadata.`;

    const userPrompt =
      sources.length > 0
        ? `Sources:
${contextString}

Question: ${query}

Answer the question using only the information from the sources above. Use [1], [2], etc. to cite sources inline.`
        : query;

    const contentParts: Array<TextPart | ImagePart> = [{ type: 'text', text: userPrompt }];

    if (attachments?.length) {
      for (const attachment of attachments) {
        contentParts.push(toOpenAiContentPart(attachment));
      }
    }

    const messages =
      sources.length > 0
        ? [
            { role: 'system' as const, content: systemPrompt },
            {
              role: 'user' as const,
              content: attachments?.length ? contentParts : userPrompt,
            },
          ]
        : [
            {
              role: 'user' as const,
              content: attachments?.length ? contentParts : userPrompt,
            },
          ];

    const model = this.provider.chat(options.model ?? this.defaultModelId);
    const { text } = await generateText({
      model,
      messages,
      maxOutputTokens: maxTokens,
    });

    const answer = text || '';

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

function toOpenAiContentPart(attachment: Attachment): ImagePart {
  if (attachment.kind === 'image') {
    return {
      type: 'image',
      image: attachment.data,
      mediaType: attachment.mediaType,
    };
  }

  throw new Error(`Unsupported attachment kind: ${attachment.kind}`);
}
