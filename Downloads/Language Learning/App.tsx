
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [sessionTime, setSessionTime] = useState(0);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Session timer
  useEffect(() => {
    let interval: any;
    if (isSessionActive) {
      interval = setInterval(() => {
        setSessionTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionActive]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const speakText = (text: string, langCode: string) => {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognizer = new SpeechRecognition();
      recognizer.lang = targetLang.code;
      recognizer.continuous = false;
      recognizer.interimResults = false;

      recognizer.onstart = () => setIsRecording(true);
      recognizer.onend = () => setIsRecording(false);
      recognizer.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        handleSendMessage(transcript);
      };

      recognitionRef.current = recognizer;
    }
  }, [targetLang]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    if (!isSessionActive) setIsSessionActive(true);

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
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseData,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);

      if (isAutoplay) {
        const fullText = responseData.words.map(w => w.script).join('');
        speakText(fullText, targetLang.code);
      }
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-800 tracking-tight uppercase">Polyglot Flow</h1>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold">{targetLang.flag} {targetLang.name}</span>
              {isSessionActive && (
                <span className="text-[10px] text-orange-500 font-bold animate-pulse">
                  {formatTime(sessionTime)} / 10:00
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsAutoplay(!isAutoplay)}
            className={`p-2 rounded-lg transition-colors ${isAutoplay ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}
            title="Toggle Autoplay Audio"
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
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">Learning Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Target Language</label>
                <div className="grid grid-cols-2 gap-2">
                  {TARGET_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {setTargetLang(lang); setMessages([]); setSessionTime(0); setIsSessionActive(false);}}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${targetLang.code === lang.code ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <span>{lang.flag}</span>
                      <span className="text-sm font-semibold">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Interface Language</label>
                <div className="grid grid-cols-2 gap-2">
                  {INSTRUCTION_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setInstructionLang(lang)}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${instructionLang.code === lang.code ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <span>{lang.flag}</span>
                      <span className="text-sm font-semibold">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200 active:scale-95 transition-transform"
              >
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 max-w-4xl mx-auto w-full relative">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-in fade-in duration-700">
            <div className="relative">
              <div className="w-32 h-32 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 relative z-10">
                <span className="text-4xl">{targetLang.flag}</span>
              </div>
              <div className="absolute inset-0 bg-indigo-200 rounded-full animate-ping opacity-25"></div>
            </div>
            <div className="max-w-md">
              <h2 className="text-3xl font-black text-slate-800 mb-3">Daily 10m Flow</h2>
              <p className="text-slate-500 mb-10 leading-relaxed font-medium">
                Unlock natural fluency in <strong>{targetLang.name}</strong> by practicing just 10 minutes a day. Use voice or text to start.
              </p>
              <button 
                onClick={() => handleSendMessage("Hi, let's start a conversation!")}
                className="group relative inline-flex items-center justify-center px-10 py-4 font-bold text-white transition-all duration-200 bg-indigo-600 font-pj rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 shadow-xl shadow-indigo-200"
              >
                Let's Begin!
              </button>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div 
            key={message.id} 
            className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} space-y-2`}
          >
            <div className={`max-w-[90%] md:max-w-[80%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
              {message.role === 'user' ? (
                <div className="bg-slate-800 text-white px-6 py-4 rounded-3xl rounded-tr-none shadow-md">
                  <p className={`text-lg ${targetLang.isRTL ? 'text-right' : 'text-left'}`} dir={targetLang.isRTL ? 'rtl' : 'ltr'}>
                    {message.content as string}
                  </p>
                </div>
              ) : (
                <div className="space-y-6 animate-in slide-in-from-left duration-500">
                  <WordBreakdown 
                    words={(message.content as GeminiResponse).words} 
                    fullTranslation={(message.content as GeminiResponse).fullTranslation}
                    isRTL={targetLang.isRTL}
                  />
                  <FeedbackPanel feedback={(message.content as GeminiResponse).feedback} />
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start space-y-2 animate-pulse">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 w-full max-w-sm">
              <div className="flex gap-3 mb-4">
                <div className="h-10 w-12 bg-slate-100 rounded-lg"></div>
                <div className="h-10 w-12 bg-slate-100 rounded-lg"></div>
                <div className="h-10 w-12 bg-slate-100 rounded-lg"></div>
              </div>
              <div className="h-4 w-4/5 bg-slate-100 rounded mb-3"></div>
              <div className="h-4 w-2/3 bg-slate-100 rounded"></div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* Voice Control Section */}
      <footer className="bg-white border-t p-4 md:p-8 shadow-2xl z-30">
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-6">
          <div className="flex items-center gap-6 w-full">
            <button
              onClick={toggleRecording}
              className={`flex-shrink-0 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
                isRecording 
                  ? 'bg-red-500 scale-110 shadow-red-200' 
                  : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105 shadow-indigo-200'
              }`}
            >
              {isRecording ? (
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-8 bg-white rounded-full animate-bounce delay-75"></div>
                  <div className="w-1.5 h-12 bg-white rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-8 bg-white rounded-full animate-bounce delay-75"></div>
                </div>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>

            <div className="flex-1 relative hidden sm:block">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(input)}
                placeholder={isRecording ? "Listening to your voice..." : "Type or click mic to speak..."}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-full py-5 px-8 text-slate-700 font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
              />
              <button
                onClick={() => handleSendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-600 hover:text-indigo-800 disabled:text-slate-300 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
          </div>
          
          <p className="text-center text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
            {isRecording ? "Release to process speech" : "Tap the mic for hands-free mode"}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
