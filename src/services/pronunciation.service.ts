import OpenAI from 'openai';
import { writeFile, mkdir, access, readFile } from 'fs/promises';
import { createHash } from 'crypto';
import * as path from 'path';

export interface PronunciationData {
    kanji: string;
    romaji: string;
    translation: string;
}

export interface EnhancementRequest {
    kanji: string;
    currentRomaji: string;
    currentTranslation: string;
}

export interface EnhancementResult {
    kanji: string;
    romaji: string;
    translation: string;
}

export class PronunciationService {
    private openai: OpenAI;
    private audioDir: string;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY || import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API key not found in environment variables');
        }

        this.openai = new OpenAI({
            apiKey: apiKey,
        });

        // Audio files will be stored in ./audio directory
        this.audioDir = path.join(process.cwd(), 'audio');
        this.ensureAudioDirectory();
    }

    /**
     * Ensure audio directory exists
     */
    private async ensureAudioDirectory(): Promise<void> {
        try {
            await access(this.audioDir);
        } catch {
            await mkdir(this.audioDir, { recursive: true });
        }
    }

    /**
     * Generate audio for romaji pronunciation using OpenAI TTS
     * Returns audio buffer and base64 data (no filesystem storage)
     */
    async generateAudio(romaji: string, kanji: string): Promise<{ buffer: Buffer, base64: string }> {
        try {
            console.log(`Generating audio for: ${romaji} (${kanji})`);

            // Use OpenAI TTS with female voice
            const mp3 = await this.openai.audio.speech.create({
                model: "gpt-4o-mini-tts", // Lightweight model
                voice: "nova", // Female voice
                input: romaji,
                response_format: "mp3",
                instructions: "Please pronounce the japanese phrase in a natural, clear, and conversational tone."
            });

            // Convert response to buffer
            const buffer = Buffer.from(await mp3.arrayBuffer());

            // Convert to base64
            const base64 = buffer.toString('base64');

            console.log(`Audio generated successfully for: ${romaji}`);
            return {
                buffer: buffer,
                base64: base64
            };

        } catch (error) {
            console.error('Error generating audio:', error);
            throw new Error('Failed to generate audio');
        }
    }

    /**
     * Enhance pronunciation data using OpenAI batch processing
     * This processes multiple items in one request for efficiency
     */
    async enhancePronunciationData(items: EnhancementRequest[]): Promise<EnhancementResult[]> {
        try {
            // Filter items that need enhancement
            const needsEnhancement = items.filter(item =>
                item.currentRomaji === 'pronunciation_needed' ||
                item.currentTranslation === 'translation_needed'
            );

            if (needsEnhancement.length === 0) {
                return items.map(item => ({
                    kanji: item.kanji,
                    romaji: item.currentRomaji,
                    translation: item.currentTranslation,
                }));
            }

            console.log(`Enhancing ${needsEnhancement.length} pronunciation items`);

            // Construct batch prompt for OpenAI
            const prompt = this.constructEnhancementPrompt(needsEnhancement);

            const completion = await this.openai.chat.completions.create({
                model: "gpt-5-nano", // Cost-effective model
                messages: [
                    {
                        role: "system",
                        content: "You are a Japanese language expert specializing in pronunciation and translation. Always respond with valid JSON format."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
            });

            const responseText = completion.choices[0]?.message?.content;
            if (!responseText) {
                throw new Error('No response from OpenAI');
            }

            // Parse the JSON response
            const enhancedData = JSON.parse(responseText);

            if (!Array.isArray(enhancedData) || enhancedData.length !== needsEnhancement.length) {
                throw new Error('Invalid response format from OpenAI');
            }

            // Merge enhanced data with original items
            const results: EnhancementResult[] = [];
            let enhancedIndex = 0;

            for (const item of items) {
                if (item.currentRomaji === 'pronunciation_needed' || item.currentTranslation === 'translation_needed') {
                    results.push(enhancedData[enhancedIndex]);
                    enhancedIndex++;
                } else {
                    results.push({
                        kanji: item.kanji,
                        romaji: item.currentRomaji,
                        translation: item.currentTranslation,
                    });
                }
            }

            console.log(`Enhanced ${needsEnhancement.length} items successfully`);
            return results;

        } catch (error) {
            console.error('Error enhancing pronunciation data:', error);
            throw new Error('Failed to enhance pronunciation data');
        }
    }

    /**
     * Construct the prompt for batch enhancement
     */
    private constructEnhancementPrompt(items: EnhancementRequest[]): string {
        const itemsJson = items.map(item => ({
            kanji: item.kanji,
            needs_romaji: item.currentRomaji === 'pronunciation_needed',
            needs_translation: item.currentTranslation === 'translation_needed'
        }));

        return `
Please provide accurate romaji pronunciation and English translation for the following Japanese kanji/phrases. 
Return the response as a JSON array with exactly ${items.length} objects in the same order as provided.

Input data:
${JSON.stringify(itemsJson, null, 2)}

Instructions:
1. For each item, provide accurate romaji pronunciation using standard Hepburn romanization
2. Provide clear, concise English translation (no more than 3-4 words when possible)
3. For compound words or phrases, provide the most common/natural pronunciation and meaning
4. Return ONLY valid JSON format, no explanations or extra text
5. Each object must have: {"kanji": "original_kanji", "romaji": "pronunciation", "translation": "meaning"}

Example response format:
[
  {"kanji": "こんにちは", "romaji": "konnichiwa", "translation": "hello"},
  {"kanji": "ありがとう", "romaji": "arigatou", "translation": "thank you"}
]

Respond with the JSON array now:`;
    }

    /**
     * Generate audio base64 for pronunciation (no filesystem storage)
     */
    async generateAudioBase64(romaji: string, kanji: string): Promise<string> {
        try {
            const result = await this.generateAudio(romaji, kanji);
            return result.base64;
        } catch (error) {
            console.error('Error generating audio base64:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const pronunciationService = new PronunciationService();