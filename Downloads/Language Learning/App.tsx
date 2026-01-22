
import React, { useState, useEffect, useRef } from 'react';
import { getGeminiChatResponse } from './services/geminiService';
import { ChatMessage, GeminiResponse, Language } from './types';
import { WordBreakdown } from './components/WordBreakdown';
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

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [targetLang, setTargetLang] = useState(TARGET_LANGUAGES[0]);
  const [instructionLang, setInstructionLang] = useState(INSTRUCTION_LANGUAGES[0]);
  const [isAutoplay, setIsAutoplay] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedTranscriptRef = useRef('');
  const isHandsFreeRef = useRef(false);
  const shouldRestartRef = useRef(true);
  const isSpeakingRef = useRef(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Update ref when isHandsFree changes
  useEffect(() => {
    isHandsFreeRef.current = isHandsFree;
  }, [isHandsFree]);

  const speakText = (text: string, langCode: string) => {
    if (!window.speechSynthesis) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    utterance.rate = 0.9; // Slightly slower for clarity

    // Critical: Track when speech starts and ends
    utterance.onstart = () => {
      isSpeakingRef.current = true;
      // Stop recognition while AI is speaking
      if (recognitionRef.current && isHandsFreeRef.current) {
        try {
          shouldRestartRef.current = false;
          recognitionRef.current.stop();
        } catch (e) {
          console.log("Could not stop recognition:", e);
        }
      }
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      // Auto-restart recognition after AI finishes speaking (hands-free mode)
      if (isHandsFreeRef.current && recognitionRef.current) {
        setTimeout(() => {
          try {
            shouldRestartRef.current = true;
            accumulatedTranscriptRef.current = '';
            setInterimTranscript('');
            recognitionRef.current.start();
          } catch (e) {
            console.log("Recognition restart after speech:", e);
          }
        }, 500); // Small delay to ensure clean transition
      }
    };

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      isSpeakingRef.current = false;
      // Still try to restart on error in hands-free mode
      if (isHandsFreeRef.current && recognitionRef.current) {
        setTimeout(() => {
          try {
            shouldRestartRef.current = true;
            recognitionRef.current.start();
          } catch (e) {
            console.log("Could not restart after speech error:", e);
          }
        }, 300);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognizer = new SpeechRecognition();
      recognizer.lang = targetLang.code;
      recognizer.continuous = true;
      recognizer.interimResults = true;

      recognizer.onstart = () => {
        setIsRecording(true);
      };

      recognizer.onend = () => {
        setIsRecording(false);
        // Only auto-restart if hands-free is on AND we should restart (not interrupted by AI speech)
        if (isHandsFreeRef.current && shouldRestartRef.current && !isSpeakingRef.current) {
          setTimeout(() => {
            try {
              recognizer.start();
            } catch (e) {
              console.log("Auto-restart failed:", e);
              // Try one more time after a longer delay
              setTimeout(() => {
                try { recognizer.start(); } catch (e2) { console.error("Second restart failed:", e2); }
              }, 1000);
            }
          }, 300);
        }
      };

      recognizer.onresult = (event: any) => {
        // Interruption detection: if user speaks while AI is talking, stop the AI immediately
        if (isSpeakingRef.current) {
          window.speechSynthesis.cancel();
          isSpeakingRef.current = false;
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

        // Silence Detection Logic (only in hands-free mode)
        if (isHandsFreeRef.current) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

          silenceTimerRef.current = setTimeout(() => {
            const finalSpeech = accumulatedTranscriptRef.current + currentInterim;
            if (finalSpeech.trim().length > 2) {
              // Send the message
              const userMessage: ChatMessage = {
                id: Date.now().toString(),
                role: 'user',
                content: finalSpeech.trim(),
                timestamp: new Date(),
              };

              setMessages(prev => [...prev, userMessage]);
              setInput('');
              setIsLoading(true);

              // Clear the transcript
              accumulatedTranscriptRef.current = '';
              setInterimTranscript('');

              // Get AI response
              (async () => {
                try {
                  const history = [...messages, userMessage].slice(0, -1).map(m => ({
                    role: m.role === 'user' ? 'user' as const : 'model' as const,
                    parts: [{ text: typeof m.content === 'string' ? m.content : (m.content as GeminiResponse).fullTranslation }]
                  }));

                  const responseData = await getGeminiChatResponse(
                    finalSpeech.trim(),
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

                  // Auto-speak the response
                  if (responseData.words) {
                    const fullText = responseData.words.map(w => w.script).join('');
                    speakText(fullText, targetLang.code);
                  }
                } catch (error) {
                  console.error("Chat error:", error);
                  const errorMessage: ChatMessage = {
                    id: (Date.now() + 3).toString(),
                    role: 'assistant',
                    content: "Sorry, I encountered an error. Please check your API key and connection.",
                    timestamp: new Date(),
                  };
                  setMessages(prev => [...prev, errorMessage]);
                  // Even on error, restart listening in hands-free
                  if (isHandsFreeRef.current && !isSpeakingRef.current) {
                    setTimeout(() => {
                      try {
                        accumulatedTranscriptRef.current = '';
                        setInterimTranscript('');
                        recognizer.start();
                      } catch (e) { console.log("Restart after error failed:", e); }
                    }, 1000);
                  }
                } finally {
                  setIsLoading(false);
                }
              })();
            }
          }, 2500); // 2.5 seconds of silence - more natural for conversation
        }
      };

      recognizer.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        // Don't restart on "no-speech" or "aborted" if we're stopping intentionally
        if (event.error === 'aborted' || (event.error === 'no-speech' && !isHandsFreeRef.current)) {
          return;
        }
      };

      recognitionRef.current = recognizer;
    }

    // Cleanup
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [targetLang.code, messages]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Clear any pending silence timer
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    accumulatedTranscriptRef.current = '';
    setInterimTranscript('');

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: typeof m.content === 'string' ? m.content : (m.content as GeminiResponse).fullTranslation }]
      }));

      const responseData = await getGeminiChatResponse(
        text,
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
        const fullText = responseData.words.map(w => w.script).join('');
        speakText(fullText, targetLang.code);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 3).toString(),
        role: 'assistant',
        content: "Sorry, I encountered an error. Please check your API key and connection.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      // Stopping recording
      shouldRestartRef.current = false;
      if (isHandsFree) {
        setIsHandsFree(false);
        isHandsFreeRef.current = false;
      }
      recognitionRef.current?.stop();
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    } else {
      // Starting recording (manual mode)
      shouldRestartRef.current = false; // Manual mode - don't auto-restart
      accumulatedTranscriptRef.current = '';
      setInterimTranscript('');
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.log("Failed to start manual recording:", e);
      }
    }
  };

  const toggleHandsFree = () => {
    const newMode = !isHandsFree;
    setIsHandsFree(newMode);

    if (newMode) {
      // Entering hands-free mode
      shouldRestartRef.current = true;
      accumulatedTranscriptRef.current = '';
      setInterimTranscript('');

      if (!isRecording) {
        try {
          recognitionRef.current?.start();
        } catch (e) {
          console.log("Failed to start recognition in hands-free mode:", e);
        }
      }
    } else {
      // Exiting hands-free mode
      shouldRestartRef.current = false;
      if (isRecording) {
        recognitionRef.current?.stop();
      }
      // Cancel any ongoing speech
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      isSpeakingRef.current = false;
    }
  };

  return (
    <div className="flex flex-col min-h-screen max-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/30 overflow-hidden font-sans relative selection:bg-indigo-100 selection:text-indigo-600">
      {/* Enhanced Dynamic Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-indigo-200/40 to-purple-200/40 blur-[120px] animate-pulse"></div>
        <div className="absolute top-[40%] -right-[10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-violet-200/40 to-pink-200/40 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-[10%] left-[30%] w-[40%] h-[40%] rounded-full bg-gradient-to-br from-blue-200/30 to-cyan-200/30 blur-[120px] animate-pulse" style={{ animationDelay: '4s' }}></div>

        {/* Animated particles */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-indigo-400/20 rounded-full animate-float"></div>
        <div className="absolute top-3/4 right-1/4 w-3 h-3 bg-violet-400/20 rounded-full animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-3/4 w-2 h-2 bg-purple-400/20 rounded-full animate-float" style={{ animationDelay: '2.5s' }}></div>
      </div>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-indigo-100/30 px-3 py-2.5 md:px-6 md:py-3 flex items-center justify-between shadow-[0_4px_20px_rgba(99,102,241,0.08)] z-30 flex-shrink-0">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="bg-white p-1 rounded-2xl shadow-[0_8px_16px_rgba(79,70,229,0.1)] border border-slate-100 overflow-hidden shrink-0">
            <img src="/logo.png" alt="Polyglot Logo" className="h-8 w-8 md:h-9 md:w-9 object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-black text-slate-900 tracking-tight leading-none mb-1 truncate">POLYGLOT</h1>
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-[9px] md:text-[10px] bg-slate-100 text-slate-600 px-1.5 md:px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-slate-200/50">
                {targetLang.flag} <span className="hidden sm:inline">{targetLang.name}</span><span className="sm:hidden">{targetLang.code.split('-')[0].toUpperCase()}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAutoplay(!isAutoplay)}
            className={`p-2.5 rounded-2xl transition-all active:scale-95 ${isAutoplay ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
          >
            {isAutoplay ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 14.828a1 1 0 01-1.414-1.414 5 5 0 000-7.072 1 1 0 111.414-1.414 7 7 0 010 9.9z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          <button
            onClick={toggleHandsFree}
            className={`p-2.5 rounded-2xl transition-all active:scale-95 group relative ${isHandsFree ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
            <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
              {isHandsFree && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isHandsFree ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
            </span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-600 hover:bg-slate-100 transition-all active:scale-95 shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 transition-all animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-white relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Settings</h2>
                <p className="text-sm text-slate-500 font-medium">Customize your session</p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-8">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Target Language</label>
                <div className="grid grid-cols-2 gap-2 md:gap-3">
                  {TARGET_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => { setTargetLang(lang); setMessages([]); }}
                      className={`flex items-center gap-2 md:gap-3 p-3 md:p-4 rounded-xl md:rounded-2xl border-2 transition-all hover:translate-y-[-2px] ${targetLang.code === lang.code ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-md ring-4 ring-indigo-50' : 'border-slate-50 bg-slate-50/50 text-slate-600 hover:border-slate-100 hover:bg-slate-100/50'}`}
                    >
                      <span className="text-xl md:text-2xl drop-shadow-sm">{lang.flag}</span>
                      <span className="text-xs md:text-sm font-bold tracking-tight text-left leading-tight">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Instruction Language</label>
                <div className="grid grid-cols-2 gap-2 md:gap-3">
                  {INSTRUCTION_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setInstructionLang(lang)}
                      className={`flex items-center gap-2 md:gap-3 p-3 md:p-4 rounded-xl md:rounded-2xl border-2 transition-all hover:translate-y-[-2px] ${instructionLang.code === lang.code ? 'border-slate-900 bg-slate-900 text-white shadow-xl ring-4 ring-slate-100' : 'border-slate-50 bg-slate-50/50 text-slate-600 hover:border-slate-100 hover:bg-slate-100/50'}`}
                    >
                      <span className="text-xl md:text-2xl drop-shadow-sm">{lang.flag}</span>
                      <span className="text-xs md:text-sm font-bold tracking-tight text-left leading-tight">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowSettings(false)}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-5 rounded-2xl font-black tracking-wide shadow-[0_12px_24px_-8px_rgba(79,70,229,0.5)] hover:shadow-[0_16px_32px_-8px_rgba(79,70,229,0.6)] active:scale-[0.98] transition-all"
              >
                APPLY CHANGES
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 space-y-6 md:space-y-8 max-w-4xl mx-auto w-full relative z-10 custom-scrollbar scroll-smooth" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        {isHandsFree && (
          <div className="sticky top-0 z-20 flex justify-center -mt-2 mb-4 md:-mt-4 md:mb-6">
            <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 backdrop-blur-md border border-emerald-400/40 px-4 py-2 md:px-5 md:py-2.5 rounded-full flex items-center gap-3 shadow-lg shadow-emerald-500/20 animate-in slide-in-from-top-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-lg shadow-emerald-500/50"></span>
              </span>
              {isRecording && (
                <div className="flex items-center gap-0.5">
                  <div className="w-0.5 h-3 bg-emerald-500 rounded-full" style={{ animation: 'wave 0.6s ease-in-out infinite' }}></div>
                  <div className="w-0.5 h-4 bg-emerald-500 rounded-full" style={{ animation: 'wave 0.6s ease-in-out infinite', animationDelay: '0.1s' }}></div>
                  <div className="w-0.5 h-5 bg-emerald-500 rounded-full" style={{ animation: 'wave 0.6s ease-in-out infinite', animationDelay: '0.2s' }}></div>
                  <div className="w-0.5 h-4 bg-emerald-500 rounded-full" style={{ animation: 'wave 0.6s ease-in-out infinite', animationDelay: '0.3s' }}></div>
                  <div className="w-0.5 h-3 bg-emerald-500 rounded-full" style={{ animation: 'wave 0.6s ease-in-out infinite', animationDelay: '0.4s' }}></div>
                </div>
              )}
              <span className="text-[10px] md:text-[11px] font-black text-emerald-700 uppercase tracking-widest">Hands-Free {isRecording ? 'Listening' : 'Active'}</span>
            </div>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center space-y-6 md:space-y-8 animate-in fade-in zoom-in duration-700" style={{ minHeight: 'calc(100vh - 280px)' }}>
            <div className="relative group animate-float">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-full blur-[60px] opacity-30 group-hover:opacity-50 transition-all duration-500"></div>
              <div className="w-28 h-28 md:w-36 md:h-36 bg-gradient-to-br from-white to-indigo-50 rounded-full flex items-center justify-center text-5xl md:text-6xl shadow-[0_20px_60px_rgba(99,102,241,0.15)] relative z-10 border-2 border-white transition-all hover:scale-110 duration-500 group-hover:shadow-[0_30px_80px_rgba(99,102,241,0.25)]">
                {targetLang.flag}
              </div>
            </div>
            <div className="max-w-md px-4">
              <h2 className="text-2xl md:text-4xl font-black text-slate-900 mb-3 tracking-tighter leading-tight">Master {targetLang.name.split(' ')[0]} <br /><span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 bg-clip-text text-transparent italic animate-gradient">Naturally.</span></h2>
              <p className="text-slate-600 mb-6 md:mb-8 text-sm md:text-lg font-semibold leading-relaxed">
                Achieve fluency through immersive conversation. Direct, intuitive, and fun.
              </p>
              <button
                onClick={() => handleSendMessage("Hi, let's start a conversation!")}
                className="group px-6 md:px-10 py-3.5 md:py-4 font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_20px_50px_rgba(79,70,229,0.4)] hover:shadow-[0_30px_60px_rgba(79,70,229,0.5)] hover:scale-105 active:scale-95 transition-all flex items-center gap-3 mx-auto relative overflow-hidden animate-gradient"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <span className="relative z-10">START LEARNING</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover:translate-x-1 relative z-10" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} space-y-3 animate-in slide-in-from-bottom-4 duration-500`}>
            <div className="group max-w-[90%] md:max-w-[85%] relative">
              {message.role === 'user' ? (
                <div className="bg-slate-900 text-white px-7 py-5 rounded-[2.5rem] rounded-tr-none shadow-[0_12px_24px_rgba(15,23,42,0.15)] border border-slate-800 transition-all hover:shadow-[0_16px_32px_rgba(15,23,42,0.2)]">
                  <p className={`text-lg font-medium leading-relaxed ${targetLang.isRTL ? 'text-right' : 'text-left'}`} dir={targetLang.isRTL ? 'rtl' : 'ltr'}>
                    {message.content as string}
                  </p>
                </div>
              ) : (
                <div className="space-y-8 w-full">
                  {typeof message.content === 'string' ? (
                    <div className="bg-white rounded-[2rem] p-7 shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-rose-100 flex items-center gap-4">
                      <div className="bg-rose-50 p-2 rounded-xl">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-rose-600 font-bold tracking-tight">{message.content}</p>
                    </div>
                  ) : (
                    <>
                      <WordBreakdown
                        words={message.content.words}
                        fullTranslation={message.content.fullTranslation}
                        isRTL={targetLang.isRTL}
                      />
                      <FeedbackPanel feedback={message.content.feedback} />
                    </>
                  )}
                </div>
              )}
              <span className={`text-[10px] font-black text-slate-300 mt-2 block px-2 opacity-0 group-hover:opacity-100 transition-opacity ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                {message.role === 'user' ? 'YOU' : 'POLYGLOT AI'} • {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start space-y-3 animate-in fade-in duration-300">
            <div className="bg-white/50 backdrop-blur-sm rounded-[2rem] p-8 shadow-sm border border-slate-100 w-full max-w-sm flex flex-col gap-4">
              <div className="h-6 w-4/5 bg-slate-100 rounded-full animate-pulse"></div>
              <div className="h-4 w-2/3 bg-slate-100/50 rounded-full animate-pulse"></div>
              <div className="flex gap-2">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl animate-pulse"></div>
                <div className="w-12 h-12 bg-slate-100 rounded-2xl animate-pulse"></div>
                <div className="w-12 h-12 bg-slate-100 rounded-2xl animate-pulse"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} className="h-10" />
      </main>

      {/* Footer / Input Bar */}
      <footer className="bg-white/80 backdrop-blur-2xl border-t border-indigo-100/30 p-3 md:p-4 lg:p-5 shadow-[0_-10px_40px_rgba(99,102,241,0.08)] z-40 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2 md:gap-6 w-full bg-gradient-to-r from-white/60 to-indigo-50/40 backdrop-blur-md p-2 md:p-3 rounded-[2rem] md:rounded-[2.5rem] border border-indigo-100/50 shadow-[0_10px_40px_rgba(99,102,241,0.1)] ring-1 ring-indigo-50 transition-all focus-within:ring-4 focus-within:ring-indigo-200 focus-within:shadow-[0_20px_60px_rgba(99,102,241,0.15)]">
            <button
              onClick={toggleRecording}
              className={`flex-shrink-0 w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all shadow-2xl relative overflow-hidden group ${isRecording ? 'bg-gradient-to-br from-rose-500 to-pink-600 scale-110 active:scale-100' : (isHandsFree ? 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:scale-105 active:scale-95' : 'bg-gradient-to-br from-indigo-600 to-violet-600 hover:scale-105 active:scale-95')}`}
            >
              {isRecording ? (
                <div className="flex items-center gap-0.5 md:gap-1 z-10">
                  <div className="w-0.5 h-3 md:w-1 md:h-5 bg-white rounded-full" style={{ animation: 'wave 0.6s ease-in-out infinite' }}></div>
                  <div className="w-0.5 h-5 md:w-1 md:h-8 bg-white rounded-full" style={{ animation: 'wave 0.6s ease-in-out infinite', animationDelay: '0.1s' }}></div>
                  <div className="w-0.5 h-6 md:w-1 md:h-10 bg-white rounded-full" style={{ animation: 'wave 0.6s ease-in-out infinite', animationDelay: '0.2s' }}></div>
                  <div className="w-0.5 h-5 md:w-1 md:h-8 bg-white rounded-full" style={{ animation: 'wave 0.6s ease-in-out infinite', animationDelay: '0.3s' }}></div>
                  <div className="w-0.5 h-3 md:w-1 md:h-5 bg-white rounded-full" style={{ animation: 'wave 0.6s ease-in-out infinite', animationDelay: '0.4s' }}></div>
                </div>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-8 md:w-8 text-white z-10 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
              {isRecording && <div className="absolute inset-0 rounded-full" style={{ animation: 'ripple 1.5s ease-out infinite', background: 'radial-gradient(circle, rgba(244,63,94,0.6) 0%, transparent 70%)' }}></div>}
              {!isRecording && isHandsFree && <div className="absolute inset-0 bg-emerald-400/30 animate-pulse rounded-full"></div>}
            </button>

            <div className="flex-1 relative hidden sm:block">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(input)}
                placeholder={isRecording ? (isHandsFree ? "Polyglot is listening hands-free..." : "Polyglot is listening...") : "Tap the mic for hands-free flow..."}
                className="w-full bg-transparent border-none py-3 md:py-4 px-3 focus:ring-0 outline-none text-sm md:text-base font-bold placeholder:text-slate-400 placeholder:italic text-slate-700"
              />
              <button
                onClick={() => handleSendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2 md:p-2.5 bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-600 rounded-xl md:rounded-2xl disabled:bg-slate-50 disabled:text-slate-300 transition-all active:scale-95 hover:scale-105 hover:shadow-lg disabled:hover:scale-100 disabled:hover:shadow-none"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 md:h-8 md:w-8" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>

            {/* Mobile simplified input / Transcript */}
            <div className="sm:hidden flex-1 text-center px-2 py-1">
              {isRecording ? (
                <div className="flex flex-col items-center">
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1 animate-pulse">Recording</p>
                  <p className="text-sm font-bold text-slate-700 line-clamp-1 italic">
                    {interimTranscript || accumulatedTranscriptRef.current || "..."}
                  </p>
                </div>
              ) : (
                <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase">
                  {isHandsFree ? "Hands-Free Active" : "Tap Mic to Start"}
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
