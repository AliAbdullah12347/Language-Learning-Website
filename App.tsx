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

  const chatEndRef = useRef<HTMLDivElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Sync Hands-Free ref
  useEffect(() => {
    isHandsFreeRef.current = isHandsFree;
  }, [isHandsFree]);

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

  // Scroll insights / chats to bottom
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
    if (!speechText.trim() || isLoading) return;

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
        const fullText = responseData.words.map(w => w.script).join('');
        speakText(fullText, targetLang.code);
      } else {
        setConversationState('idle');
      }
    } catch (error) {
      console.error("AI response retrieval error:", error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 3).toString(),
        role: 'assistant',
        content: "Sorry, I couldn't get a response. Please check your network and API key.",
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
    }
  };

  // Handles manual keyboard send
  const handleKeyboardSend = () => {
    if (!input.trim() || isLoading) return;
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
      // Activating hands-free
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
      default: return 'Tap Mic to speak';
    }
  };

  // Get latest AI reply data
  const latestAIReply = [...messages]
    .reverse()
    .find(m => m.role === 'assistant' && typeof m.content !== 'string');

  return (
    <div className="flex flex-col h-full max-h-screen bg-slate-950 overflow-hidden font-sans relative safe-padding-bottom safe-padding-top selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Visual Ambient Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-indigo-900/20 via-purple-900/10 to-transparent blur-[120px]"></div>
        <div className="absolute bottom-[10%] -right-[10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tr from-violet-900/20 via-rose-950/10 to-transparent blur-[120px]"></div>
      </div>

      {/* Header Panel */}
      <header className="bg-slate-950/70 backdrop-blur-xl border-b border-slate-900/80 px-4 py-3 md:px-8 md:py-4 flex items-center justify-between z-30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-xl overflow-hidden shrink-0">
            <img src="/logo.png" alt="Polyglot Logo" className="h-7 w-7 md:h-8 md:w-8 object-contain" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-black text-slate-100 tracking-wider uppercase leading-none mb-1">
              POLYGLOT <span className="text-[10px] font-black text-indigo-400 normal-case tracking-normal pl-1.5">v2.0</span>
            </h1>
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-[9px] md:text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded-full font-extrabold uppercase border border-slate-800">
                {targetLang.flag} {targetLang.name}
              </span>
            </div>
          </div>
        </div>

        {/* Global Toolbar Options */}
        <div className="flex items-center gap-2">
          {/* Autoplay toggler */}
          <button
            onClick={() => setIsAutoplay(!isAutoplay)}
            title="Autoplay Voice Reply"
            className={`p-2.5 rounded-2xl transition-all active:scale-95 border ${isAutoplay ? 'bg-indigo-950/30 text-indigo-400 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'bg-slate-900 text-slate-500 border-slate-800'}`}
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
          </button>
          
          {/* Hands free toggler */}
          <button
            onClick={() => { unlockAudioContext(); setIsHandsFree(!isHandsFree); }}
            title="Hands-free Conversation Loop"
            className={`p-2.5 rounded-2xl transition-all active:scale-95 border relative ${isHandsFree ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'bg-slate-900 text-slate-500 border-slate-800'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
              {isHandsFree && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isHandsFree ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
            </span>
          </button>

          {/* Settings modal toggler */}
          <button
            onClick={() => setShowSettings(true)}
            title="Open Configurations"
            className="p-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-slate-300 hover:bg-slate-800 transition-all active:scale-95 shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Study Zone */}
      <main className="flex-1 flex flex-col items-center justify-between p-4 md:p-8 relative z-10 overflow-hidden" style={{ minHeight: 0 }}>
        
        {/* Zero-State Layout */}
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in duration-700 max-w-md mx-auto">
            <div className="relative group animate-float">
              {/* Outer radial glow */}
              <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-[50px] group-hover:bg-indigo-500/30 transition-all duration-500"></div>
              
              <div className="w-24 h-24 md:w-28 md:h-28 bg-gradient-to-br from-slate-900 to-slate-950 rounded-full flex items-center justify-center text-4xl shadow-[0_15px_45px_rgba(99,102,241,0.25)] relative z-10 border border-slate-800 transition-all hover:scale-105 duration-300">
                {targetLang.flag}
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-black text-slate-100 tracking-tight">
                Master {targetLang.name.split(' ')[0]} <br />
                <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent italic animate-gradient">
                  Through Voice.
                </span>
              </h2>
              <p className="text-slate-400 text-sm md:text-base font-medium leading-relaxed">
                Experience a truly hands-free language learning conversational flow. Just speak naturally.
              </p>
            </div>

            <button
              onClick={handleStartLearning}
              className="group w-full max-w-xs py-4 px-6 font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-2xl shadow-[0_12px_24px_-6px_rgba(99,102,241,0.5)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 relative overflow-hidden"
            >
              <span>START LEARNING</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover:translate-x-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ) : (
          /* Conversational Portal Zone */
          <div className="flex-1 w-full max-w-2xl flex flex-col justify-between items-center py-4 md:py-6 overflow-hidden" style={{ minHeight: 0 }}>
            
            {/* The Conversational Orb Widget */}
            <div className="flex-1 flex flex-col items-center justify-center space-y-8 min-h-0 w-full">
              
              {/* Outer Orb Layout */}
              <div className="relative flex items-center justify-center w-40 h-40 md:w-48 md:h-48">
                {/* Listening Pulsating Rings */}
                {conversationState === 'listening' && (
                  <>
                    <div className="absolute inset-0 rounded-full border border-emerald-500/40 animate-[rippleTeal_2.5s_ease-out_infinite]"></div>
                    <div className="absolute inset-0 rounded-full border border-emerald-500/20 animate-[rippleTeal_2.5s_ease-out_infinite_1.25s]"></div>
                  </>
                )}

                {/* Speaking Concentric Waves */}
                {conversationState === 'speaking' && (
                  <>
                    <div className="absolute inset-0 rounded-full border border-indigo-500/40 animate-[rippleBlue_2.5s_ease-out_infinite]"></div>
                    <div className="absolute inset-0 rounded-full border border-indigo-500/20 animate-[rippleBlue_2.5s_ease-out_infinite_1.25s]"></div>
                  </>
                )}

                {/* The Center Orb Element */}
                <div 
                  onClick={handleMicClick}
                  className={`w-28 h-28 md:w-32 md:h-32 rounded-full cursor-pointer flex items-center justify-center relative z-10 transition-all duration-500 border shadow-2xl active:scale-95 ${
                    conversationState === 'listening' ? 'bg-gradient-to-br from-emerald-600 to-teal-700 border-emerald-400/30' :
                    conversationState === 'thinking' ? 'bg-gradient-to-br from-slate-900 to-slate-950 border-indigo-500/20' :
                    conversationState === 'speaking' ? 'bg-slate-900 border-indigo-500/30' :
                    'bg-gradient-to-br from-indigo-700 to-violet-800 border-indigo-500/40 hover:scale-105'
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

              {/* Status Label & Active Transcripts */}
              <div className="text-center space-y-3 px-4 w-full">
                <span className={`text-[10px] font-black uppercase tracking-[0.25em] ${
                  conversationState === 'listening' ? 'text-emerald-400' :
                  conversationState === 'thinking' ? 'text-indigo-400 animate-pulse' :
                  conversationState === 'speaking' ? 'text-blue-400' :
                  'text-slate-500'
                }`}>
                  {getFeedbackLabel()}
                </span>

                {/* Live Speech transcript area */}
                {conversationState === 'listening' && (
                  <p className="text-sm md:text-base text-slate-300 font-medium italic max-w-md mx-auto line-clamp-2">
                    {input || "Start speaking..."}
                  </p>
                )}

                {/* Blinking loader or response indicator */}
                {conversationState === 'thinking' && (
                  <p className="text-xs text-slate-400 font-bold tracking-wider uppercase animate-pulse">
                    Translating and compiling feedback...
                  </p>
                )}

                {/* Speaking/Latest AI Text Card */}
                {conversationState !== 'listening' && conversationState !== 'thinking' && latestAIReply && (
                  <div className="max-w-md mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {typeof latestAIReply.content === 'string' ? (
                      <p className="text-sm font-semibold text-rose-500">{latestAIReply.content}</p>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-2">
                          <p className={`text-xl md:text-2xl font-black text-slate-100 ${targetLang.isRTL ? 'font-serif text-right' : 'text-left'}`}>
                            {latestAIReply.content.words.map(w => w.script).join('')}
                          </p>
                          <button 
                            onClick={() => handleReplayVoice(latestAIReply.content.words.map(w => w.script).join(''))}
                            className="p-1 text-slate-500 hover:text-slate-300 rounded-lg"
                            title="Replay Voice"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                        <p className="text-[10px] md:text-xs text-indigo-400 font-medium tracking-wide">
                          {latestAIReply.content.words.map(w => w.phonetic).join(' ')}
                        </p>
                        <p className="text-xs text-slate-400 italic">
                          "{latestAIReply.content.fullTranslation}"
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* COLLAPSIBLE HISTORICAL BREAKDOWN AND REVIEW TRAY */}
            {latestAIReply && typeof latestAIReply.content !== 'string' && !showHistory && (
              <div className="w-full px-4 animate-in fade-in duration-500 flex-shrink-0">
                <div className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Current Sentence Breakdown</span>
                    <button 
                      onClick={() => setShowHistory(true)}
                      className="text-xs text-indigo-400 font-bold hover:text-indigo-300"
                    >
                      View Full History
                    </button>
                  </div>
                  
                  {/* Micro list of vocabulary cards */}
                  <div className="flex flex-wrap gap-2 justify-center max-h-24 overflow-y-auto pr-1">
                    {latestAIReply.content.words.map((word, index) => (
                      <div key={index} className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl flex flex-col items-center">
                        <span className="text-xs font-bold text-slate-200">{word.script}</span>
                        <span className="text-[9px] text-indigo-400 font-medium">{word.phonetic}</span>
                        <span className="text-[8px] text-slate-500 uppercase font-black tracking-tight">{word.meaning}</span>
                      </div>
                    ))}
                  </div>

                  {/* Suggestions warning highlight */}
                  {latestAIReply.content.feedback.mistakes.length > 0 && (
                    <div className="bg-rose-950/20 border border-rose-900/30 p-3 rounded-2xl flex items-start gap-2.5">
                      <span className="text-rose-500 text-sm">💡</span>
                      <p className="text-[10px] text-slate-300 leading-relaxed font-semibold">
                        Correct pronunciation tip: <span className="text-rose-400 font-bold">{latestAIReply.content.feedback.suggestions}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={chatEndRef} />
      </main>

      {/* DETAILED FULL CHAT HISTORY TRAY */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col animate-in slide-in-from-bottom duration-300">
          <header className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center justify-between">
            <div>
              <h3 className="font-black text-slate-100 tracking-tight text-base">Conversational Review</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Feedback & Historical Cards</p>
            </div>
            <button 
              onClick={() => setShowHistory(false)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </header>

          {/* Scrollable list of full components */}
          <div className="flex-1 overflow-y-auto p-4 space-y-8 bg-slate-950">
            {messages.map((message) => (
              <div key={message.id} className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} space-y-2`}>
                {message.role === 'user' ? (
                  <div className="bg-indigo-650 text-white px-5 py-3 rounded-2xl rounded-tr-none max-w-[85%] border border-indigo-500/20 shadow-lg">
                    <p className={`text-sm font-medium leading-relaxed ${targetLang.isRTL ? 'text-right' : 'text-left'}`} dir={targetLang.isRTL ? 'rtl' : 'ltr'}>
                      {message.content as string}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6 w-full max-w-xl">
                    {typeof message.content === 'string' ? (
                      <div className="bg-slate-900 text-rose-400 p-4 rounded-2xl border border-slate-800 flex items-center gap-3">
                        <span className="text-rose-500 text-lg">⚠️</span>
                        <p className="text-xs font-bold">{message.content}</p>
                      </div>
                    ) : (
                      <>
                        <div className="p-0.5 rounded-3xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-xl shadow-indigo-950/20">
                          <div className="bg-slate-950 rounded-[1.4rem] p-6 space-y-6">
                            {/* Word breakdowns inside dark container */}
                            <div 
                              className={`flex flex-wrap gap-x-4 gap-y-4 ${targetLang.isRTL ? 'flex-row-reverse text-right' : 'flex-row text-left'}`} 
                              dir={targetLang.isRTL ? 'rtl' : 'ltr'}
                            >
                              {message.content.words.map((word, wIdx) => (
                                <div key={wIdx} className="flex flex-col items-center bg-slate-900 border border-slate-800/80 px-4 py-2.5 rounded-2xl min-w-[70px]">
                                  <span className="text-[10px] text-indigo-400 font-extrabold mb-1">{word.phonetic}</span>
                                  <span className="text-xl font-black text-slate-100 mb-1">{word.script}</span>
                                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-tight">{word.meaning}</span>
                                </div>
                              ))}
                            </div>

                            <div className="pt-4 border-t border-slate-900 space-y-1">
                              <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Holistic translation</span>
                              <p className="text-slate-100 font-bold text-base leading-normal">
                                "{message.content.fullTranslation}"
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Collateral feedback card */}
                        <div className="bg-slate-900/40 border border-slate-800/70 rounded-3xl p-6 space-y-5">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">I heard:</span>
                              <p className="text-xs text-slate-300 font-medium italic mt-1">"{message.content.feedback.userInput}"</p>
                            </div>
                            <div>
                              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Tutor understood:</span>
                              <p className="text-xs text-slate-300 font-medium mt-1">"{message.content.feedback.aiUnderstood}"</p>
                            </div>
                          </div>

                          {message.content.feedback.mistakes.length > 0 && (
                            <div className="space-y-2">
                              <span className="text-[9px] font-black uppercase text-rose-400 tracking-wider">Refinements</span>
                              <ul className="space-y-1">
                                {message.content.feedback.mistakes.map((mis, mIdx) => (
                                  <li key={mIdx} className="text-xs text-slate-400 flex items-start gap-1.5">
                                    <span className="text-rose-500">•</span>
                                    <span>{mis}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-2xl">
                            <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider">Try this phrasing:</span>
                            <p className="text-sm font-black text-slate-200 mt-1">{message.content.feedback.suggestions}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={historyEndRef} />
          </div>
        </div>
      )}

      {/* Settings Modal Component */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 transition-all animate-in fade-in duration-300">
          <div className="bg-slate-900 rounded-[2.5rem] w-full max-w-lg p-6 md:p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-100 tracking-tight">Configuration Settings</h2>
                <p className="text-xs text-slate-450 font-bold uppercase tracking-wider mt-0.5">Customize your lessons</p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 bg-slate-800 text-slate-400 hover:text-slate-200 rounded-full transition-colors"
              >
                <svg xmlns="http://www.w3.org/2500/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Target Language Selection */}
              <div>
                <label className="block text-[9px] font-black text-slate-450 uppercase tracking-[0.2em] mb-3">Target Language (I speak)</label>
                <div className="grid grid-cols-2 gap-2">
                  {TARGET_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => { setTargetLang(lang); setMessages([]); setConversationState('idle'); }}
                      className={`flex items-center gap-2.5 p-3.5 rounded-2xl border transition-all ${targetLang.code === lang.code ? 'border-indigo-500 bg-indigo-950/20 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-300'}`}
                    >
                      <span className="text-xl drop-shadow-sm select-none">{lang.flag}</span>
                      <span className="text-xs font-bold tracking-tight text-left leading-tight">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Instruction Language Selection */}
              <div>
                <label className="block text-[9px] font-black text-slate-450 uppercase tracking-[0.2em] mb-3">Instruction Language (Tutor replies in)</label>
                <div className="grid grid-cols-2 gap-2">
                  {INSTRUCTION_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setInstructionLang(lang)}
                      className={`flex items-center gap-2.5 p-3.5 rounded-2xl border transition-all ${instructionLang.code === lang.code ? 'border-indigo-500 bg-indigo-950/20 text-indigo-300' : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-300'}`}
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
                className="w-full border border-rose-900/50 bg-rose-950/10 text-rose-450 py-3.5 rounded-2xl text-xs font-bold uppercase tracking-wider hover:bg-rose-950/30 transition-colors"
              >
                Reset Chat History
              </button>

              <button
                onClick={() => setShowSettings(false)}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm tracking-wide shadow-lg shadow-indigo-900/30 hover:bg-indigo-500 active:scale-[0.98] transition-all"
              >
                APPLY CONFIGURATIONS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Input Dock */}
      <footer className="bg-slate-950/90 backdrop-blur-2xl border-t border-slate-900/60 p-3 md:p-4 z-40 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-3">
          <div className="flex items-center gap-3 w-full bg-slate-900/40 p-2 rounded-[2rem] border border-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.4)] focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all">
            
            {/* Mic Toggle Button */}
            <button
              onClick={handleMicClick}
              className={`flex-shrink-0 w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all shadow-xl relative overflow-hidden group ${
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
                className="w-full bg-transparent border-none py-3 px-3 focus:ring-0 outline-none text-sm font-semibold placeholder:text-slate-600 text-slate-200"
              />
              <button
                onClick={handleKeyboardSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2 bg-indigo-950 text-indigo-400 border border-indigo-900/50 rounded-xl disabled:bg-slate-900 disabled:text-slate-700 disabled:border-slate-800/80 transition-all hover:scale-105"
              >
                <svg xmlns="http://www.w3.org/2500/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>

            {/* Simplified mobile status / live logs */}
            <div className="sm:hidden flex-1 text-center px-2 py-1">
              {isRecording ? (
                <div className="flex flex-col items-center">
                  <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest animate-pulse">Recording</p>
                  <p className="text-xs font-semibold text-slate-300 line-clamp-1 italic">
                    {interimTranscript || accumulatedTranscriptRef.current || "..."}
                  </p>
                </div>
              ) : (
                <p className="text-[8px] font-black text-slate-500 tracking-widest uppercase">
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
