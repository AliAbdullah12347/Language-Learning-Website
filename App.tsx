import React, { useState, useEffect, useRef } from 'react';
import { getGeminiChatResponse } from './services/geminiService';
import { ChatMessage, GeminiResponse, Language, WordBreakdown } from './types';
import { WordBreakdown as WordBreakdownComp } from './components/WordBreakdown';
import { FeedbackPanel } from './components/FeedbackPanel';

const TARGET_LANGUAGES: Language[] = [
  { code: 'zh-CN', name: 'Mandarin Chinese', flag: '🇨🇳' },
  { code: 'ar-SA', name: 'Arabic', flag: '🇸🇦', isRTL: true },
  { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
  { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
];

const INSTRUCTION_LANGUAGES: Language[] = [
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
  { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German', flag: '🇩🇪' },
];

// Helper to reconstruct target language scripts dynamically
const joinTargetScript = (words: WordBreakdown[], langCode: string) => {
  const isSpaceLang = !['zh-CN', 'ja-JP'].includes(langCode);
  return words.map(w => w.script).join(isSpaceLang ? ' ' : '');
};

const App: React.FC = () => {
  // Persistence initialization: Load messages from localStorage
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('polyglot_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
      }
    } catch (e) {
      console.error("Failed to load messages from localStorage:", e);
    }
    return [];
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Persistence initialization: Load target language
  const [targetLang, setTargetLang] = useState<Language>(() => {
    const saved = localStorage.getItem('polyglot_target_lang');
    if (saved) {
      try {
        const code = JSON.parse(saved);
        const match = TARGET_LANGUAGES.find(l => l.code === code);
        if (match) return match;
      } catch (e) {}
    }
    return TARGET_LANGUAGES[0];
  });

  // Persistence initialization: Load instruction language
  const [instructionLang, setInstructionLang] = useState<Language>(() => {
    const saved = localStorage.getItem('polyglot_instruction_lang');
    if (saved) {
      try {
        const code = JSON.parse(saved);
        const match = INSTRUCTION_LANGUAGES.find(l => l.code === code);
        if (match) return match;
      } catch (e) {}
    }
    return INSTRUCTION_LANGUAGES[0];
  });

  const [isAutoplay, setIsAutoplay] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  
  // Dynamic conversation state machine: 'idle' | 'listening' | 'thinking' | 'speaking'
  const [conversationState, setConversationState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedTranscriptRef = useRef('');
  const isHandsFreeRef = useRef(false);
  const shouldRestartRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const isRecognitionActiveRef = useRef(false);
  
  // Ref to prevent parallel duplicate API submissions in the same turn
  const isSubmittingRef = useRef(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Sync Hands-Free ref
  useEffect(() => {
    isHandsFreeRef.current = isHandsFree;
  }, [isHandsFree]);

  // Sync messages to localStorage
  useEffect(() => {
    localStorage.setItem('polyglot_messages', JSON.stringify(messages));
  }, [messages]);

  // Sync target language to localStorage
  useEffect(() => {
    localStorage.setItem('polyglot_target_lang', JSON.stringify(targetLang.code));
  }, [targetLang]);

  // Sync instruction language to localStorage
  useEffect(() => {
    localStorage.setItem('polyglot_instruction_lang', JSON.stringify(instructionLang.code));
  }, [instructionLang]);

  // Unlock iOS Safari Audio engines on first user gesture
  const unlockAudioContext = () => {
    if (window.speechSynthesis) {
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch (e) {
        console.warn("Could not unlock speech synthesis:", e);
      }
    }
  };

  // Speaks target language text using browser SpeechSynthesis
  const speakText = (text: string, langCode: string) => {
    if (!window.speechSynthesis) return;

    // Transition state
    setConversationState('speaking');

    // 1. Immediately pause microphone before speaking to prevent echo/feedback loops
    shouldRestartRef.current = false;
    if (recognitionRef.current && isRecognitionActiveRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn("Failed to stop recognition prior to speech:", e);
      }
    }

    // Cancel any ongoing speech synthesis queues
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    utterance.rate = 0.85; // Slightly slower for language learners

    utterance.onstart = () => {
      isSpeakingRef.current = true;
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      
      if (isHandsFreeRef.current) {
        setConversationState('listening');
        shouldRestartRef.current = true;
        
        // Wait 400ms buffer for iOS audio channels to fully clear, then restart recording
        setTimeout(() => {
          if (isHandsFreeRef.current && shouldRestartRef.current && !isSpeakingRef.current && !isRecognitionActiveRef.current) {
            try {
              recognitionRef.current?.start();
            } catch (e) {
              console.warn("Failed to auto-restart recognition after speech end:", e);
            }
          }
        }, 400);
      } else {
        setConversationState('idle');
      }
    };

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      isSpeakingRef.current = false;
      
      if (isHandsFreeRef.current) {
        setConversationState('listening');
        shouldRestartRef.current = true;
        setTimeout(() => {
          if (isHandsFreeRef.current && shouldRestartRef.current && !isSpeakingRef.current && !isRecognitionActiveRef.current) {
            try {
              recognitionRef.current?.start();
            } catch (e) {
              console.warn("Failed to auto-restart recognition after speech error:", e);
            }
          }
        }, 400);
      } else {
        setConversationState('idle');
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  // Main speech recognition initializer
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognizer = new SpeechRecognition();
      recognizer.lang = targetLang.code;
      recognizer.continuous = true;
      recognizer.interimResults = true;

      recognizer.onstart = () => {
        isRecognitionActiveRef.current = true;
        setIsRecording(true);
        setConversationState(prev => (prev === 'idle' ? 'listening' : prev));
      };

      recognizer.onend = () => {
        isRecognitionActiveRef.current = false;
        setIsRecording(false);

        // Auto-restart if hands-free is enabled and we are not speaking or thinking
        if (isHandsFreeRef.current && shouldRestartRef.current && !isSpeakingRef.current) {
          setTimeout(() => {
            if (isHandsFreeRef.current && shouldRestartRef.current && !isSpeakingRef.current && !isRecognitionActiveRef.current) {
              try {
                recognizer.start();
              } catch (e) {
                console.warn("Speech recognition restart retry failed:", e);
              }
            }
          }, 400);
        }
      };

      recognizer.onresult = (event: any) => {
        // Voice Interruption: if user speaks while AI is speaking, interrupt the voice playback
        if (isSpeakingRef.current) {
          window.speechSynthesis.cancel();
          isSpeakingRef.current = false;
          setConversationState('listening');
        }

        let currentInterim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            accumulatedTranscriptRef.current += transcript + ' ';
          } else {
            currentInterim += transcript;
          }
        }

        setInterimTranscript(currentInterim);
        const fullPartial = accumulatedTranscriptRef.current + currentInterim;
        if (fullPartial.trim()) setInput(fullPartial);

        // Hands-Free silence detection (1.8 seconds pause before committing)
        if (isHandsFreeRef.current) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

          silenceTimerRef.current = setTimeout(() => {
            const finalSpeech = accumulatedTranscriptRef.current + currentInterim;
            if (finalSpeech.trim().length > 1) {
              handleVoiceSubmit(finalSpeech.trim());
            }
          }, 1800);
        }
      };

      recognizer.onerror = (event: any) => {
        console.error("Speech recognition error hook:", event.error);
        if (event.error === 'not-allowed') {
          alert("Microphone permission was denied. Please allow microphone access in settings.");
          setIsHandsFree(false);
          isHandsFreeRef.current = false;
          setConversationState('idle');
        }
      };

      recognitionRef.current = recognizer;
    }

    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [targetLang.code, messages]);

  // Scroll active chats to bottom
  const scrollToChatBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToHistoryBottom = () => {
    if (showHistory) {
      setTimeout(() => {
        historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  useEffect(() => {
    scrollToChatBottom();
  }, [messages, isLoading, conversationState]);

  useEffect(() => {
    scrollToHistoryBottom();
  }, [showHistory]);

  // Core API Submission Handler
  const handleVoiceSubmit = async (speechText: string) => {
    if (!speechText.trim() || isLoading || isSubmittingRef.current) return;

    // Set lock ref
    isSubmittingRef.current = true;

    // Reset transcripts
    accumulatedTranscriptRef.current = '';
    setInterimTranscript('');
    setInput('');

    // Shift to thinking state
    setConversationState('thinking');
    setIsLoading(true);

    // Stop recognition to keep channel exclusive
    shouldRestartRef.current = false;
    if (recognitionRef.current && isRecognitionActiveRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn("Failed to stop recognition on submit:", e);
      }
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: speechText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      const history = [...messages, userMessage].slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: typeof m.content === 'string' ? m.content : (m.content as GeminiResponse).fullTranslation }]
      }));

      const responseData = await getGeminiChatResponse(
        speechText,
        history,
        targetLang.name,
        instructionLang.name
      );

      const aiMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: responseData,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);

      if (isAutoplay && responseData.words) {
        const fullText = joinTargetScript(responseData.words, targetLang.code);
        speakText(fullText, targetLang.code);
      } else {
        setConversationState('idle');
      }
    } catch (error: any) {
      console.error("AI response retrieval error:", error);
      const errDetail = error?.message || String(error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 3).toString(),
        role: 'assistant',
        content: `Sorry, I couldn't get a response. (Error: ${errDetail}). Please check your network, API key, or model configuration.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);

      if (isHandsFreeRef.current) {
        setConversationState('listening');
        shouldRestartRef.current = true;
        setTimeout(() => {
          if (isHandsFreeRef.current && shouldRestartRef.current && !isSpeakingRef.current && !isRecognitionActiveRef.current) {
            try { recognitionRef.current?.start(); } catch (e) {}
          }
        }, 500);
      } else {
        setConversationState('idle');
      }
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // Handles manual keyboard send
  const handleKeyboardSend = () => {
    if (!input.trim() || isLoading || isSubmittingRef.current) return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    unlockAudioContext();
    handleVoiceSubmit(input);
  };

  // Activates voice portal greeting
  const handleStartLearning = () => {
    unlockAudioContext();
    setIsHandsFree(true);
    isHandsFreeRef.current = true;
    shouldRestartRef.current = true;
    handleVoiceSubmit("Hi, let's start a conversation!");
  };

  // Toggle Hands-Free / Mic Button Press
  const handleMicClick = () => {
    unlockAudioContext();

    if (isHandsFree || isRecording) {
      // Deactivating
      setIsHandsFree(false);
      isHandsFreeRef.current = false;
      shouldRestartRef.current = false;
      setConversationState('idle');
      
      if (recognitionRef.current && isRecognitionActiveRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      isSpeakingRef.current = false;
    } else {
      // Activate hands-free
      setIsHandsFree(true);
      isHandsFreeRef.current = true;
      shouldRestartRef.current = true;
      setConversationState('listening');

      if (recognitionRef.current && !isRecognitionActiveRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error("Failed to start speech recognition manually:", e);
        }
      }
    }
  };

  // Replay AI voice synthesis
  const handleReplayVoice = (text: string) => {
    unlockAudioContext();
    speakText(text, targetLang.code);
  };

  // Get current state text
  const getFeedbackLabel = () => {
    switch (conversationState) {
      case 'listening': return 'Listening for speech...';
      case 'thinking': return 'Analyzing conversational cues...';
      case 'speaking': return 'Speaking...';
      default: return 'Tap Orb to speak';
    }
  };

  // Renders a high-contrast transition banner right under the header
  const getStatusBanner = () => {
    switch (conversationState) {
      case 'listening':
        return (
          <div className="w-full bg-emerald-50 border-y border-emerald-150 py-2.5 text-center animate-in slide-in-from-top duration-300 z-20 flex-shrink-0">
            <span className="text-[10px] font-black tracking-[0.2em] text-emerald-700 uppercase flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
              Live Mic Active — Speak in {targetLang.name}
            </span>
          </div>
        );
      case 'thinking':
        return (
          <div className="w-full bg-indigo-50 border-y border-indigo-150 py-2.5 text-center animate-in slide-in-from-top duration-300 z-20 flex-shrink-0">
            <span className="text-[10px] font-black tracking-[0.2em] text-indigo-700 uppercase flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
              AI Tutor is analyzing your voice input...
            </span>
          </div>
        );
      case 'speaking':
        return (
          <div className="w-full bg-blue-50 border-y border-blue-150 py-2.5 text-center animate-in slide-in-from-top duration-300 z-20 flex-shrink-0">
            <span className="text-[10px] font-black tracking-[0.2em] text-blue-700 uppercase flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
              Tutor is speaking
            </span>
          </div>
        );
      default:
        return (
          <div className="w-full bg-slate-100 border-y border-slate-200 py-2.5 text-center z-20 flex-shrink-0">
            <span className="text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">
              Standby — Tap the Orb to start practicing
            </span>
          </div>
        );
    }
  };

  const assistantMessageCount = messages.filter(m => m.role === 'assistant').length;

  return (
    <div className="flex flex-col h-full max-h-screen bg-slate-50 overflow-hidden font-sans relative safe-padding-bottom safe-padding-top selection:bg-indigo-200 selection:text-indigo-800">
      
      {/* Visual Ambient Background (Bright/Light Theme) */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-indigo-100/40 via-purple-100/20 to-transparent blur-[120px]"></div>
        <div className="absolute bottom-[10%] -right-[10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tr from-violet-100/45 via-rose-100/20 to-transparent blur-[120px]"></div>
      </div>

      {/* Header Panel (Light Theme) */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/80 px-4 py-3 md:px-8 md:py-4 flex items-center justify-between z-30 flex-shrink-0 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm overflow-hidden shrink-0">
            <img src="/logo.png" alt="Polyglot Logo" className="h-7 w-7 md:h-8 md:w-8 object-contain" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-black text-slate-800 tracking-wider uppercase leading-none mb-1">
              POLYGLOT <span className="text-[10px] font-black text-indigo-600 normal-case tracking-normal pl-1">v2.0</span>
            </h1>
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-[9px] md:text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-extrabold uppercase border border-slate-200/60">
                {targetLang.flag} {targetLang.name}
              </span>
            </div>
          </div>
        </div>

        {/* Global Toolbar Options */}
        <div className="flex items-center gap-2">
          {/* Quick Clear Chat History button */}
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to clear all chat history and start over?")) {
                  setMessages([]);
                  setConversationState('idle');
                  if (window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                }
              }}
              title="Clear Chat History"
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 border border-rose-100 hover:bg-rose-100 rounded-2xl text-rose-600 transition-all active:scale-95 shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="text-[10px] font-black uppercase tracking-wider hidden md:inline">Clear</span>
            </button>
          )}

          {/* Collapsible Review History button moved to header to keep main screen output clean */}
          {assistantMessageCount > 0 && (
            <button
              onClick={() => { unlockAudioContext(); setShowHistory(true); }}
              title="Review Insights & Vocabulary"
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 rounded-2xl text-indigo-650 transition-all active:scale-95 shadow-sm relative"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span className="text-[10px] font-black uppercase tracking-wider hidden md:inline">Review</span>
              <span className="bg-rose-500 text-white text-[8px] font-black h-4 w-4 rounded-full flex items-center justify-center border border-white animate-pulse">
                {assistantMessageCount}
              </span>
            </button>
          )}

          {/* Autoplay toggler */}
          <button
            onClick={() => setIsAutoplay(!isAutoplay)}
            title="Autoplay Voice Reply"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl transition-all active:scale-95 border ${isAutoplay ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
          >
            {isAutoplay ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 14.828a1 1 0 01-1.414-1.414 5 5 0 000-7.072 1 1 0 111.414-1.414 7 7 0 010 9.9z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
            <span className="text-[10px] font-black uppercase tracking-wider hidden md:inline">{isAutoplay ? "Auto-Speak" : "Muted"}</span>
          </button>
          
          {/* Hands free toggler */}
          <button
            onClick={() => { unlockAudioContext(); setIsHandsFree(!isHandsFree); }}
            title="Hands-free Conversation Loop"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl transition-all active:scale-95 border relative ${isHandsFree ? 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-wider hidden md:inline">{isHandsFree ? "Auto-Mic" : "Manual"}</span>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
              {isHandsFree && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isHandsFree ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
            </span>
          </button>

          {/* Settings modal toggler */}
          <button
            onClick={() => setShowSettings(true)}
            title="Open Configurations"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-200 transition-all active:scale-95 shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-wider hidden md:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* Dynamic Status Transition Banner */}
      {getStatusBanner()}

      {/* Main Study Zone (Scrollable to prevent clips/overlaps on short viewports like iPhone Safari) */}
      <main className="flex-1 overflow-y-auto w-full max-w-3xl mx-auto px-4 py-6 flex flex-col items-center justify-start space-y-6 relative z-10 scroll-smooth" style={{ minHeight: 0 }}>
        
        {/* The Conversational Orb Widget (Always rendered at the top of the viewport for visual continuity) */}
        <div className="flex flex-col items-center justify-center space-y-4 w-full flex-shrink-0 mt-2">
          <div className="relative flex items-center justify-center w-36 h-36 md:w-44 md:h-44 flex-shrink-0">
            {/* Listening Pulsating Rings */}
            {conversationState === 'listening' && (
              <>
                <div className="absolute inset-0 rounded-full border border-emerald-400/50 animate-[rippleTeal_2.5s_ease-out_infinite]"></div>
                <div className="absolute inset-0 rounded-full border border-emerald-400/25 animate-[rippleTeal_2.5s_ease-out_infinite_1.25s]"></div>
              </>
            )}

            {/* Speaking Concentric Waves */}
            {conversationState === 'speaking' && (
              <>
                <div className="absolute inset-0 rounded-full border border-indigo-400/50 animate-[rippleBlue_2.5s_ease-out_infinite]"></div>
                <div className="absolute inset-0 rounded-full border border-indigo-400/25 animate-[rippleBlue_2.5s_ease-out_infinite_1.25s]"></div>
              </>
            )}

            {/* The Center Orb Element */}
            <div 
              onClick={handleMicClick}
              className={`w-24 h-24 md:w-28 md:h-28 rounded-full cursor-pointer flex items-center justify-center relative z-10 transition-all duration-500 border shadow-xl active:scale-95 ${
                conversationState === 'listening' ? 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400/20 text-white shadow-emerald-250/20' :
                conversationState === 'thinking' ? 'bg-white border-indigo-150/40 text-indigo-650' :
                conversationState === 'speaking' ? 'bg-white border-indigo-150/40 text-indigo-600 shadow-indigo-100/40' :
                'bg-gradient-to-br from-indigo-500 to-violet-600 border-indigo-400/20 text-white hover:scale-105'
              }`}
            >
              {/* Outer spinning dash loader if thinking */}
              {conversationState === 'thinking' && (
                <div className="absolute -inset-1.5 rounded-full border-[3px] border-t-indigo-500 border-r-transparent border-b-purple-500 border-l-transparent animate-orb-spin"></div>
              )}

              {/* Inside Icons / Flags */}
              <div className="text-3xl md:text-4xl select-none animate-orb-breath">
                {conversationState === 'speaking' ? '🗣️' : 
                 conversationState === 'listening' ? '🎤' : 
                 conversationState === 'thinking' ? '🧠' : 
                 targetLang.flag}
              </div>
            </div>
          </div>

          {/* Status Label */}
          <span className={`text-[10px] font-black uppercase tracking-[0.25em] ${
            conversationState === 'listening' ? 'text-emerald-600' :
            conversationState === 'thinking' ? 'text-indigo-600 animate-pulse' :
            conversationState === 'speaking' ? 'text-indigo-600' :
            'text-slate-400'
          }`}>
            {getFeedbackLabel()}
          </span>
        </div>

        {/* Content Zone (Differentiates between Welcome and Active Output below the Orb) */}
        {messages.length === 0 ? (
          /* Welcome Card */
          <div className="w-full max-w-md text-center space-y-6 animate-in fade-in duration-500 mx-auto">
            <div className="space-y-3">
              <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">
                Master {targetLang.name.split(' ')[0]} <br />
                <span className="bg-gradient-to-r from-indigo-650 via-purple-600 to-pink-500 bg-clip-text text-transparent italic animate-gradient">
                  Through Voice.
                </span>
              </h2>
              <p className="text-slate-500 text-xs md:text-sm font-semibold leading-relaxed">
                Experience a truly hands-free language learning conversational flow. Just speak naturally.
              </p>
            </div>

            <button
              onClick={handleStartLearning}
              className="group w-full max-w-xs py-3.5 px-6 font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-2xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-3 mx-auto"
            >
              <span>START LEARNING</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 transition-transform group-hover:translate-x-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ) : (
          /* Active Chat Outputs below the Orb (Scrollable Chat History Thread) */
          <div className="w-full flex flex-col justify-start items-center overflow-visible space-y-6">
            
            {/* Live Speech transcript area (Shown during input) */}
            {conversationState === 'listening' && (
              <p className="text-sm md:text-base text-slate-700 font-semibold italic max-w-sm mx-auto text-center line-clamp-2 mt-2">
                {input || "Start speaking..."}
              </p>
            )}

            {/* Blinking loader or response indicator */}
            {conversationState === 'thinking' && (
              <p className="text-xs text-slate-500 font-bold tracking-wider uppercase animate-pulse text-center mt-2">
                Translating and compiling feedback...
              </p>
            )}

            {/* Scrollable list of previous and current split cards */}
            <div className="w-full space-y-6 overflow-visible flex flex-col items-center">
              {messages.map((message) => {
                if (message.role === 'user') {
                  // Only show the User's message if it is the very latest message (being processed)
                  // and we don't have the AI response split card representing this turn yet.
                  const isLatestUserMessage = messages[messages.length - 1].id === message.id;
                  if (!isLatestUserMessage) return null;

                  return (
                    <div key={message.id} className="flex justify-end w-full animate-in slide-in-from-right-4 duration-350 max-w-xl">
                      <div className="bg-indigo-600 text-white px-5 py-3 rounded-2xl rounded-tr-none max-w-[85%] shadow-md border border-indigo-500/10">
                        <p className={`text-sm font-semibold leading-relaxed ${targetLang.isRTL ? 'text-right' : 'text-left'}`} dir={targetLang.isRTL ? 'rtl' : 'ltr'}>
                          {message.content as string}
                        </p>
                      </div>
                    </div>
                  );
                } else {
                  // Assistant message: Render the split-screen cards representing the full conversation turn
                  return (
                    <div key={message.id} className="w-full animate-in slide-in-from-left-4 duration-350 max-w-2xl">
                      {typeof message.content === 'string' ? (
                        <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl border border-rose-100 flex items-center gap-3">
                          <span className="text-rose-500 text-lg">⚠️</span>
                          <p className="text-xs font-bold">{message.content}</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                          
                          {/* LEFT COLUMN: AI's Reply (Output) */}
                          <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex flex-col justify-center space-y-2 text-left">
                            <span className="text-[9px] font-black uppercase text-indigo-500 tracking-wider">Tutor Response</span>
                            <div className="flex items-center gap-2">
                              <p className={`text-base md:text-lg font-black text-slate-800 ${targetLang.isRTL ? 'font-serif text-right' : 'text-left'} leading-tight`} dir={targetLang.isRTL ? 'rtl' : 'ltr'}>
                                {joinTargetScript(message.content.words, targetLang.code)}
                              </p>
                              <button 
                                onClick={() => handleReplayVoice(joinTargetScript((message.content as GeminiResponse).words, targetLang.code))}
                                className="p-1 text-slate-400 hover:text-indigo-650 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Replay Voice"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                            <p className="text-[10px] md:text-xs text-indigo-600 font-bold tracking-wide">
                              {message.content.words.map(w => w.phonetic).join(' ')}
                            </p>
                            <p className="text-xs text-slate-500 font-semibold italic">
                              "{message.content.fullTranslation}"
                            </p>
                          </div>

                          {/* RIGHT COLUMN: What Tutor Understood from User (Explanation) */}
                          <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex flex-col justify-center space-y-2 text-left">
                            <span className="text-[9px] font-black uppercase text-emerald-600 tracking-wider">What I Understood You Said</span>
                            <p className={`text-base md:text-lg font-black text-slate-800 leading-tight ${targetLang.isRTL ? 'text-right' : 'text-left'}`} dir={targetLang.isRTL ? 'rtl' : 'ltr'}>
                              {message.content.feedback.userInput}
                            </p>
                            {message.content.feedback.userPhonetic && (
                              <p className="text-[10px] md:text-xs text-emerald-600 font-bold tracking-wide">
                                {message.content.feedback.userPhonetic}
                              </p>
                            )}
                            <p className="text-xs text-slate-500 font-semibold italic">
                              "{message.content.feedback.aiUnderstood}"
                            </p>
                            {message.content.feedback.mistakes.length > 0 && (
                              <span className="text-[9px] font-bold text-rose-500 flex items-center gap-1 mt-1">
                                <span>⚠️ Refinement needed</span>
                              </span>
                            )}
                          </div>

                        </div>
                      )}
                    </div>
                  );
                }
              })}
            </div>

          </div>
        )}

        <div ref={chatEndRef} />
      </main>

      {/* DETAILED FULL STUDY REVIEW PANEL (Clean Light Theme Slide-up Sheet) */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-300">
          <div className="bg-white w-full h-[85%] rounded-t-[2.5rem] flex flex-col shadow-[0_-15px_40px_rgba(0,0,0,0.1)] overflow-hidden">
            <header className="bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800 tracking-tight text-base">Conversational Review</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Grammar refinements & word breakdowns</p>
              </div>
              <button 
                onClick={() => setShowHistory(false)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </header>

            {/* Scrollable list of message insight blocks */}
            <div className="flex-1 overflow-y-auto p-5 space-y-8 bg-slate-50">
              {messages.map((message) => {
                if (message.role === 'user') return null; // We only aggregate AI feedbacks in this section

                return (
                  <div key={message.id} className="space-y-6 w-full max-w-xl mx-auto">
                    {typeof message.content === 'string' ? (
                      <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl border border-rose-100 flex items-center gap-3">
                        <span className="text-rose-500 text-lg">⚠️</span>
                        <p className="text-xs font-bold">{message.content}</p>
                      </div>
                    ) : (
                      <>
                        {/* Vocabulary breakdown card (Clean Light Theme) */}
                        <div className="p-0.5 rounded-3xl bg-gradient-to-r from-indigo-200 via-purple-200 to-pink-200 shadow-md">
                          <div className="bg-white rounded-[1.4rem] p-5 space-y-5">
                            <span className="block text-[9px] font-black uppercase text-indigo-400 tracking-wider">Vocabulary Cards</span>
                            <div 
                              className={`flex flex-wrap gap-x-3 gap-y-3 ${targetLang.isRTL ? 'flex-row-reverse text-right' : 'flex-row text-left'}`} 
                              dir={targetLang.isRTL ? 'rtl' : 'ltr'}
                            >
                              {message.content.words.map((word, wIdx) => {
                                // Skip punctuation only breakdown blocks to avoid layouts clutter
                                const isPunctuation = /^[\p{P}\p{S}]+$/u.test(word.script.trim());
                                if (isPunctuation) return null;

                                return (
                                  <div key={wIdx} className="flex flex-col items-center bg-slate-50 border border-slate-200/80 px-3.5 py-2.5 rounded-2xl min-w-[75px]">
                                    <span className="text-[9px] text-indigo-650 font-extrabold mb-1">{word.phonetic}</span>
                                    <span className="text-lg font-black text-slate-800 mb-1">{word.script}</span>
                                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-tight">{word.meaning}</span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="pt-4 border-t border-slate-100 space-y-1">
                              <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Full translation</span>
                              <p className="text-slate-800 font-bold text-base leading-normal">
                                "{message.content.fullTranslation}"
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Grammar feedback panel (Clean Light Theme) */}
                        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 space-y-5 shadow-sm">
                          <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-4">
                            <div>
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">I heard:</span>
                              <p className="text-xs text-slate-700 font-bold italic mt-1">"{message.content.feedback.userInput}"</p>
                              {message.content.feedback.userPhonetic && (
                                <p className="text-[9px] text-emerald-650 font-bold mt-0.5">{message.content.feedback.userPhonetic}</p>
                              )}
                            </div>
                            <div>
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Tutor understood:</span>
                              <p className="text-xs text-slate-600 font-semibold mt-1">"{message.content.feedback.aiUnderstood}"</p>
                            </div>
                          </div>

                          {message.content.feedback.mistakes.length > 0 && (
                            <div className="space-y-2">
                              <span className="text-[9px] font-black uppercase text-rose-500 tracking-wider">Refinements</span>
                              <ul className="space-y-1">
                                {message.content.feedback.mistakes.map((mis, mIdx) => (
                                  <li key={mIdx} className="text-xs text-slate-600 font-medium flex items-start gap-2">
                                    <span className="text-rose-500 font-bold">•</span>
                                    <span>{mis}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="bg-emerald-50 border border-emerald-200/60 p-4 rounded-2xl">
                            <span className="text-[9px] font-black uppercase text-emerald-600 tracking-wider">Try this phrasing:</span>
                            <p className="text-sm font-black text-slate-700 mt-1">{message.content.feedback.suggestions}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              <div ref={historyEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal Component (Light Theme Upgrade) */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-slate-950/40 backdrop-blur-md flex items-center justify-center p-4 transition-all animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-6 md:p-8 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">Configuration Settings</h2>
                <p className="text-xs text-slate-400 font-extrabold uppercase tracking-wider mt-0.5">Customize your lessons</p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 bg-slate-100 text-slate-500 hover:text-slate-700 rounded-full transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Target Language Selection */}
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Target Language (I speak)</label>
                <div className="grid grid-cols-2 gap-2">
                  {TARGET_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => { setTargetLang(lang); setMessages([]); setConversationState('idle'); }}
                      className={`flex items-center gap-2.5 p-3.5 rounded-2xl border transition-all ${targetLang.code === lang.code ? 'border-indigo-600 bg-indigo-50/50 text-indigo-750 shadow-md ring-4 ring-indigo-50' : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:border-slate-200 hover:bg-slate-100/50'}`}
                    >
                      <span className="text-xl drop-shadow-sm select-none">{lang.flag}</span>
                      <span className="text-xs font-bold tracking-tight text-left leading-tight">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Instruction Language Selection */}
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Instruction Language (Tutor replies in)</label>
                <div className="grid grid-cols-2 gap-2">
                  {INSTRUCTION_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setInstructionLang(lang)}
                      className={`flex items-center gap-2.5 p-3.5 rounded-2xl border transition-all ${instructionLang.code === lang.code ? 'border-slate-900 bg-slate-900 text-white shadow-md' : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:border-slate-200 hover:bg-slate-100/50'}`}
                    >
                      <span className="text-xl drop-shadow-sm select-none">{lang.flag}</span>
                      <span className="text-xs font-bold tracking-tight text-left leading-tight">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset session action button */}
              <button
                onClick={() => { setMessages([]); setConversationState('idle'); setShowSettings(false); }}
                className="w-full border border-rose-200 bg-rose-50/50 text-rose-600 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-wider hover:bg-rose-100/50 transition-colors"
              >
                Reset Chat History
              </button>

              <button
                onClick={() => setShowSettings(false)}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm tracking-wide shadow-md shadow-indigo-600/30 hover:bg-indigo-500 active:scale-[0.98] transition-all"
              >
                APPLY CONFIGURATIONS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Input Dock (Light Theme) */}
      <footer className="bg-white/80 backdrop-blur-2xl border-t border-slate-200/60 p-3 md:p-4 z-40 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-3">
          <div className="flex items-center gap-3 w-full bg-slate-50 p-2 rounded-[2rem] border border-slate-200/80 shadow-[0_5px_20px_rgba(99,102,241,0.03)] focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-50 transition-all">
            
            {/* Mic Toggle Button */}
            <button
              onClick={handleMicClick}
              className={`flex-shrink-0 w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all shadow-md relative overflow-hidden group ${
                isRecording ? 'bg-rose-600' : (isHandsFree ? 'bg-emerald-600' : 'bg-indigo-600 hover:scale-105')
              }`}
            >
              {isRecording ? (
                /* Equalizer Animation inside microphone trigger button */
                <div className="flex items-center gap-0.5 z-10">
                  <div className="w-0.5 h-3 bg-white rounded-full wave-bar-1"></div>
                  <div className="w-0.5 h-5 bg-white rounded-full wave-bar-2"></div>
                  <div className="w-0.5 h-6 bg-white rounded-full wave-bar-3"></div>
                  <div className="w-0.5 h-5 bg-white rounded-full wave-bar-4"></div>
                  <div className="w-0.5 h-3 bg-white rounded-full wave-bar-5"></div>
                </div>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white z-10 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>

            {/* Keyboard input box */}
            <div className="flex-1 relative hidden sm:block">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleKeyboardSend()}
                placeholder={isRecording ? "Listening to voice..." : "Type a reply or use mic..."}
                className="w-full bg-transparent border-none py-3 px-3 focus:ring-0 outline-none text-sm font-semibold placeholder:text-slate-400 text-slate-700"
              />
              <button
                onClick={handleKeyboardSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl disabled:bg-slate-100/50 disabled:text-slate-350 disabled:border-slate-200 transition-all hover:scale-105"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>

            {/* Simplified mobile status / live logs */}
            <div className="sm:hidden flex-1 text-center px-2 py-1">
              {isRecording ? (
                <div className="flex flex-col items-center">
                  <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest animate-pulse">Recording</p>
                  <p className="text-xs font-bold text-slate-700 line-clamp-1 italic">
                    {interimTranscript || accumulatedTranscriptRef.current || "..."}
                  </p>
                </div>
              ) : (
                <p className="text-[8px] font-black text-slate-450 tracking-widest uppercase">
                  {isHandsFree ? "Hands-Free Active" : "Tap Mic to Talk"}
                </p>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
