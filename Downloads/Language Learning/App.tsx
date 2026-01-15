
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

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);



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
  }, [targetLang.code]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;


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
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#fdfdff] overflow-hidden font-sans relative selection:bg-indigo-100 selection:text-indigo-600">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-indigo-50/50 blur-[120px] animate-pulse"></div>
        <div className="absolute top-[40%] -right-[10%] w-[50%] h-[50%] rounded-full bg-violet-50/50 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-white/20 px-6 py-4 flex items-center justify-between shadow-[0_1px_10px_rgba(0,0,0,0.02)] z-30 sticky top-0">
        <div className="flex items-center gap-4">
          <div className="bg-white p-1 rounded-2xl shadow-[0_8px_16px_rgba(79,70,229,0.1)] border border-slate-100 overflow-hidden">
            <img src="/logo.png" alt="Polyglot Logo" className="h-9 w-9 object-contain" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900 tracking-tight leading-none mb-1">POLYGLOT</h1>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider uppercase border border-slate-200/50">
                {targetLang.flag} {targetLang.name}
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
                <div className="grid grid-cols-2 gap-3">
                  {TARGET_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => { setTargetLang(lang); setMessages([]); }}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all hover:translate-y-[-2px] ${targetLang.code === lang.code ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-md ring-4 ring-indigo-50' : 'border-slate-50 bg-slate-50/50 text-slate-600 hover:border-slate-100 hover:bg-slate-100/50'}`}
                    >
                      <span className="text-2xl drop-shadow-sm">{lang.flag}</span>
                      <span className="text-sm font-bold tracking-tight">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Instruction Language</label>
                <div className="grid grid-cols-2 gap-3">
                  {INSTRUCTION_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setInstructionLang(lang)}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all hover:translate-y-[-2px] ${instructionLang.code === lang.code ? 'border-slate-900 bg-slate-900 text-white shadow-xl ring-4 ring-slate-100' : 'border-slate-50 bg-slate-50/50 text-slate-600 hover:border-slate-100 hover:bg-slate-100/50'}`}
                    >
                      <span className="text-2xl drop-shadow-sm">{lang.flag}</span>
                      <span className="text-sm font-bold tracking-tight">{lang.name}</span>
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
      <main className="flex-1 overflow-y-auto px-4 py-8 md:px-8 space-y-10 max-w-4xl mx-auto w-full relative z-10 custom-scrollbar scroll-smooth">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-10 animate-in fade-in zoom-in duration-700">
            <div className="relative group">
              <div className="absolute inset-0 bg-indigo-600 rounded-full blur-[40px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
              <div className="w-40 h-40 bg-white rounded-full flex items-center justify-center text-6xl shadow-[0_12px_40px_rgba(0,0,0,0.08)] relative z-10 border border-slate-50 transition-transform hover:scale-105 duration-500">
                {targetLang.flag}
              </div>
            </div>
            <div className="max-w-md">
              <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter leading-tight">Master {targetLang.name.split(' ')[0]} <br /><span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent italic">Naturally.</span></h2>
              <p className="text-slate-500 mb-12 text-lg font-medium leading-relaxed px-4">
                Achieve fluency through immersive conversation. Direct, intuitive, and fun.
              </p>
              <button
                onClick={() => handleSendMessage("Hi, let's start a conversation!")}
                className="group px-12 py-5 font-black text-white bg-indigo-600 rounded-[2rem] shadow-[0_20px_40px_rgba(79,70,229,0.3)] hover:shadow-[0_25px_50px_rgba(79,70,229,0.4)] hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-3 mx-auto"
              >
                START LEARNING
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover:translate-x-1" viewBox="0 0 20 20" fill="currentColor">
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
      <footer className="bg-white/70 backdrop-blur-2xl border-t border-white/20 p-6 md:px-12 md:py-8 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] z-40 relative sticky bottom-0">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-8">
          <div className="flex items-center gap-4 md:gap-8 w-full bg-white/50 backdrop-blur-md p-3 md:p-4 rounded-[3rem] border border-white shadow-[0_20px_50px_rgba(0,0,0,0.05)] ring-1 ring-slate-100 transition-all focus-within:ring-4 focus-within:ring-indigo-100 focus-within:shadow-[0_25px_60px_rgba(0,0,0,0.08)]">
            <button
              onClick={toggleRecording}
              className={`flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all shadow-2xl relative overflow-hidden group ${isRecording ? 'bg-rose-500 scale-110 active:scale-105' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'}`}
            >
              {isRecording ? (
                <div className="flex items-center gap-1.5 z-10">
                  <div className="w-1.5 h-6 bg-white rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                  <div className="w-1.5 h-10 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-1.5 h-8 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1.5 h-6 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                </div>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 md:h-10 md:w-10 text-white z-10 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
              {isRecording && <div className="absolute inset-0 bg-rose-400 animate-ping opacity-25"></div>}
            </button>

            <div className="flex-1 relative hidden sm:block">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(input)}
                placeholder={isRecording ? "Listening..." : "Tap the red button to speak..."}
                className="w-full bg-transparent border-none py-5 px-4 focus:ring-0 outline-none text-lg font-bold placeholder:text-slate-300 text-slate-700"
              />
              <button
                onClick={() => handleSendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-indigo-50 text-indigo-600 rounded-2xl disabled:bg-slate-50 disabled:text-slate-300 transition-all active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>

            {/* Mobile simplified input */}
            <div className="sm:hidden flex-1 text-center text-sm font-black text-slate-400 tracking-widest">
              TAP MIC TO START
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
