
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIResponse, LanguageCode } from "../types";

const MODEL_NAME = "gemini-1.5-flash";

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: MODEL_NAME });
  }

  async generateResponse(
    userInput: string,
    targetLang: LanguageCode,
    instructionLang: LanguageCode
  ): Promise<AIResponse> {
    const prompt = `
      You are a language tutor. The user is learning ${targetLang} and speaks ${instructionLang}.
      
      User input (spoken): "${userInput}"

      Generate a JSON response with the following structure:
      {
        "originalSentence": "The sentence in ${targetLang} script (Hanzi, Arabic, etc.)",
        "phoneticSentence": "Phonetic transcription (Pinyin, Romanization, etc.)",
        "englishTranslation": "Natural translation in ${instructionLang}",
        "breakdown": [
          { "original": "word1", "phonetic": "phonetic1", "meaning": "meaning in ${instructionLang}" },
          { "original": "word2", "phonetic": "phonetic2", "meaning": "meaning in ${instructionLang}" }
        ],
        "feedback": {
          "userSaid": "What you understood the user said (in ${targetLang} or ${instructionLang} transliteration if completely wrong)",
          "understood": "What you think they meant (clarification)",
          "mistakes": ["List of specific grammar/pronunciation mistakes if any, or 'None'"]
        }
      }
      
      Keep the response fun, encouraging, and conversational.
      Ensure the 'originalSentence' uses the correct script for the target language (e.g., Hanzi for Mandarin, Arabic script for Arabic).
      Ensure 'phoneticSentence' is accurate (Pinyin with tone marks for Mandarin).
      Output ONLY raw JSON. Do not include markdown formatting.
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      let text = response.text();
      // Clean up markdown code blocks if present
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(text) as AIResponse;
    } catch (error) {
      console.error("Gemini Error:", error);
      throw error;
    }
  }
}
