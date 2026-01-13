
export interface WordBreakdown {
  original: string;
  phonetic: string;
  meaning: string;
}

export interface AIResponse {
  originalSentence: string;
  phoneticSentence: string;
  englishTranslation: string;
  breakdown: WordBreakdown[];
  feedback?: {
    userSaid: string;
    understood: string;
    mistakes: string[];
  };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string; // Display text (e.g., translation for user, original for assistant)
  data?: AIResponse; // Full data for assistant
  audioUrl?: string;
}

export type LanguageCode = 'zh-CN' | 'ar-SA' | 'es-ES' | 'ja-JP' | 'en-US' | 'fr-FR';

export interface Language {
  code: LanguageCode;
  name: string;
  script: 'Left-to-Right' | 'Right-to-Left';
}

export const SUPPORTED_LANGUAGES: Language[] = [
    { code: 'zh-CN', name: 'Mandarin', script: 'Left-to-Right' },
    { code: 'ar-SA', name: 'Arabic', script: 'Right-to-Left' },
    { code: 'es-ES', name: 'Spanish', script: 'Left-to-Right' },
    { code: 'ja-JP', name: 'Japanese', script: 'Left-to-Right' },
];

export const INSTRUCTION_LANGUAGES: Language[] = [
    { code: 'en-US', name: 'English', script: 'Left-to-Right' },
    { code: 'fr-FR', name: 'French', script: 'Left-to-Right' },
];
