
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiResponse } from "../types";

// Lazy initialize the AI client to avoid top-level module errors if env is not ready
let aiClient: GoogleGenAI | null = null;

const getAIClient = () => {
  if (!aiClient) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("VITE_GEMINI_API_KEY is missing. Ensure .env.local exists, has 'VITE_GEMINI_API_KEY=...', and is UTF-8 encoded.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
};

const getSystemInstruction = (targetLang: string, instructionLang: string) => `
You are an elite language tutor specializing in teaching ${targetLang} using ${instructionLang} as the medium of instruction.
Your goal is to help users practice natural conversation.

Follow these strict rules for every response:
1. Respond naturally in ${targetLang}.
2. Break down your response into an array of words/phrases. 
   - 'script': The ${targetLang} script (e.g., Arabic characters, Hanzi, etc.).
   - 'phonetic': A transliteration or phonetic guide (e.g., Pinyin for Chinese, Romanization for Arabic).
   - 'meaning': The specific translation in ${instructionLang} for that word/phrase.
   Do NOT include any standalone punctuation marks (such as commas, full stops, periods, question marks, exclamation marks) in the 'words' breakdown array.
3. Provide a 'fullTranslation' which is the holistic, natural ${instructionLang} meaning of your entire response.
4. In the 'feedback' section (all text in ${instructionLang}):
   - 'userInput': Transcribe what you think the user said in ${targetLang}. If they interspersed words in ${instructionLang} (e.g., English), transcribe it exactly or correct any phonetic mis-transcriptions.
   - 'userPhonetic': Provide a transliteration, romanization, or Pinyin guide for the 'userInput' (especially Pinyin for Chinese inputs, Romanization for Arabic, etc.). If the input is in ${instructionLang} or doesn't need a transliteration, set this to an empty string "". You MUST always include this field.
   - 'aiUnderstood': Briefly explain what you understood the user's intent to be (translate the user's words into ${instructionLang}, clarifying any terms they asked about).
   - 'mistakes': List any grammatical or lexical mistakes in the user's input.
   - 'suggestions': Provide a more natural way to phrase it in ${targetLang}.

Mixed-Language Queries & Phonetic Approximations:
- The user may ask questions in a mix of ${targetLang} and ${instructionLang} (e.g. "怎么说 'apple'？" meaning "How do you say 'apple'?").
- Since the speech recognition engine is listening in ${targetLang}, it will often transcribe ${instructionLang} words using phonetic approximations in ${targetLang} script (for example, if learning Chinese, it might transcribe 'apple' as '艾坡' or '阿坡', 'window' as '温豆' or '稳度', 'banana' as '班纳纳', or 'hello' as '哈喽').
- Use context, phonetic similarity, and intent analysis to deduce the intended word in ${instructionLang}. Respond naturally in ${targetLang} explaining the correct target equivalent, and document the corrected transcription in the feedback panel (e.g., correct "怎么说 温豆？" to "怎么说 'window'？" in 'userInput' and explain it in 'aiUnderstood').

JSON Escaping Rule:
- Ensure that your response is a valid, well-formed JSON object. All string fields must be properly escaped. Do not use unescaped double quotes within the JSON string values.

Keep responses concise (1-3 sentences) to maintain a natural conversation pace.
`;

export const getGeminiChatResponse = async (
  message: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  targetLang: string,
  instructionLang: string
): Promise<GeminiResponse> => {
  const client = getAIClient();
  const result = await client.models.generateContent({
    model: "gemini-1.5-flash",
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
              userPhonetic: { type: Type.STRING },
              aiUnderstood: { type: Type.STRING },
              mistakes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              suggestions: { type: Type.STRING },
            },
            required: ["userInput", "userPhonetic", "aiUnderstood", "mistakes", "suggestions"],
          },
        },
        required: ["words", "fullTranslation", "feedback"],
      },
    },
  });

  const text = result.text;
  if (!text) throw new Error("No response from AI");

  // Robust JSON extraction using braces matching
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not find JSON object in AI response. Raw output: ${text.slice(0, 120)}...`);
  }
  
  try {
    return JSON.parse(jsonMatch[0]) as GeminiResponse;
  } catch (parseError: any) {
    console.error("JSON parsing crash on raw text:", text);
    throw new Error(`Failed to parse structured JSON: ${parseError.message}. Raw output: ${text.slice(0, 120)}...`);
  }
};
