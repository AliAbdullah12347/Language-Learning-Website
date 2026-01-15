
export interface WordBreakdown {
  script: string;
  phonetic: string;
  meaning: string;
}

export interface Feedback {
  userInput: string;
  aiUnderstood: string;
  mistakes: string[];
  suggestions: string;
}

export interface GeminiResponse {
  words: WordBreakdown[];
  fullTranslation: string;
  feedback: Feedback;
}

export interface Language {
  code: string;
  name: string;
  flag: string;
  isRTL?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string | GeminiResponse;
  timestamp: Date;
}
