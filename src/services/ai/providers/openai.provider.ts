import OpenAI from 'openai';
import { AIProvider, EnrichmentResult, EnrichmentOptions } from '../../../types/ai';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
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

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      title: result.title || 'Untitled',
      description: result.description || '',
      tags: Array.isArray(result.tags) ? result.tags : [],
    };
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000),
    });

    return response.data[0].embedding;
  }
}
