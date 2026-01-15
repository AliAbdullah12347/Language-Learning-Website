
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getSystemInstruction = (targetLang: string, instructionLang: string) => `
You are an elite language tutor specializing in teaching ${targetLang} using ${instructionLang} as the medium of instruction.
Your goal is to help users practice natural conversation during short 10-minute sessions.

Follow these strict rules for every response:
1. Respond naturally in ${targetLang}.
2. Break down your response into an array of words/phrases. 
   - 'script': The ${targetLang} script (e.g., Arabic characters, Hanzi, etc.).
   - 'phonetic': A transliteration or phonetic guide (e.g., Pinyin for Chinese, Romanization for Arabic).
   - 'meaning': The specific translation in ${instructionLang} for that word/phrase.
3. Provide a 'fullTranslation' which is the holistic, natural ${instructionLang} meaning of your entire response.
4. In the 'feedback' section (all text in ${instructionLang}):
   - 'userInput': Transcribe what you think the user said in ${targetLang}.
   - 'aiUnderstood': Briefly explain what you understood the user's intent to be.
   - 'mistakes': List any grammatical or lexical mistakes in the user's input.
   - 'suggestions': Provide a more natural way to phrase it in ${targetLang}.

Keep responses concise (1-3 sentences) to maintain a fast flow for a walking learner.
`;

export const getGeminiChatResponse = async (
  message: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  targetLang: string,
  instructionLang: string
): Promise<GeminiResponse> => {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      ...history,
      { role: "user", parts: [{ text: message }] }
    ],
    config: {
      systemInstruction: getSystemInstruction(targetLang, instructionLang),
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          words: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                script: { type: Type.STRING },
                phonetic: { type: Type.STRING },
                meaning: { type: Type.STRING },
              },
              required: ["script", "phonetic", "meaning"],
            },
          },
          fullTranslation: { type: Type.STRING },
          feedback: {
            type: Type.OBJECT,
            properties: {
              userInput: { type: Type.STRING },
              aiUnderstood: { type: Type.STRING },
              mistakes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              suggestions: { type: Type.STRING },
            },
            required: ["userInput", "aiUnderstood", "mistakes", "suggestions"],
          },
        },
        required: ["words", "fullTranslation", "feedback"],
      },
    },
  });

  const response = await model;
  const text = response.text;
  if (!text) throw new Error("No response from AI");
  
  return JSON.parse(text) as GeminiResponse;
};
