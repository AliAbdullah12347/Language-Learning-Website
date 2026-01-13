
import { useState, useRef, useEffect } from 'react';
import { Settings, Sparkles } from 'lucide-react';
import { GeminiService } from './services/gemini';
import { audioService } from './services/audio';
import { WordBreakdown } from './components/WordBreakdown';
import { FeedbackPanel } from './components/FeedbackPanel';
import { AudioControls } from './components/AudioControls';
import { SessionTimer } from './components/SessionTimer';
import { SettingsModal } from './components/SettingsModal';
import { SUPPORTED_LANGUAGES, type Message, type LanguageCode } from './types';

// Helper to get script direction
const getScriptDirection = (langCode: LanguageCode) => {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === langCode);
  return lang?.script === 'Right-to-Left';
};

function App() {
  const [apiKey, setApiKey] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [targetLang, setTargetLang] = useState<LanguageCode>('zh-CN');
  const [instructionLang, setInstructionLang] = useState<LanguageCode>('en-US');

  const [isListening, setIsListening] = useState(false);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: 'Welcome to LingoFlow! Tap the microphone to start practicing.' }
  ]);

  const geminiServiceDetails = useRef<GeminiService | null>(null);

  // Initialize Gemini when API key changes
  useEffect(() => {
    if (apiKey) {
      geminiServiceDetails.current = new GeminiService(apiKey);
    }
  }, [apiKey]);

  const handleToggleListening = () => {
    if (isListening) {
      audioService.stopListening();
      setIsListening(false);
    } else {
      audioService.startListening(
        targetLang, // Listen in target language
        handleSpeechResult,
        (err) => {
          console.error("Speech Error", err);
          setIsListening(false);
          alert("Could not access microphone. Please ensure permissions are granted.");
        }
      );
      setIsListening(true);
    }
  };

  const handleSpeechResult = async (text: string) => {
    audioService.stopListening();
    setIsListening(false);

    if (!text.trim()) return;

    // Add user message
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      if (!geminiServiceDetails.current) {
        setIsSettingsOpen(true);
        throw new Error("Please set your API Key first.");
      }

      const response = await geminiServiceDetails.current.generateResponse(text, targetLang, instructionLang);

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.originalSentence,
        data: response
      };
      setMessages(prev => [...prev, botMsg]);

      if (autoplayEnabled) {
        audioService.speak(response.originalSentence, targetLang);
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { id: 'error', role: 'assistant', content: "Sorry, I couldn't process that. Please check your API key." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const currentMessage = messages[messages.length - 1];
  const isRTL = getScriptDirection(targetLang);

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="p-4 flex justify-between items-center glass-panel rounded-none border-x-0 border-t-0 sticky top-0 bg-opacity-80 z-40">
        <div className="flex items-center gap-2">
          <Sparkles className="text-blue-400" />
          <h1 className="text-xl font-bold m-0" style={{ fontSize: '1.5rem' }}>LingoFlow</h1>
        </div>
        <div className="flex items-center gap-4">
          <SessionTimer durationMinutes={10} />
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/10 rounded-full transition">
            <Settings size={24} />
          </button>
        </div>
      </header>

      {/* Main Content area */}
      <main className="container flex flex-col items-center pt-8">

        {/* Dynamic Display */}
        {currentMessage.role === 'assistant' && currentMessage.data ? (
          <div className="w-full max-w-2xl text-center fade-in">
            <div className={`text-4xl md:text-6xl font-bold mb-2 ${isRTL ? 'font-[Amiri]' : ''}`} style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
              {currentMessage.data.originalSentence}
            </div>

            <div className="text-xl text-blue-300 mb-6 font-mono">
              {currentMessage.data.phoneticSentence}
            </div>

            <div className="glass-panel mb-8 inline-block px-8 py-3 bg-white/5">
              <p className="text-lg text-gray-200">{currentMessage.data.englishTranslation}</p>
            </div>

            <WordBreakdown words={currentMessage.data.breakdown} isRTL={isRTL} />

            <FeedbackPanel data={currentMessage.data} />
          </div>
        ) : (
          <div className="glass-panel p-8 text-center max-w-lg mt-10">
            <p className="text-xl text-gray-300">
              {isLoading ? "Thinking..." : (currentMessage.role === 'user' ? `You said: "${currentMessage.content}"` : currentMessage.content)}
            </p>
          </div>
        )}

        <div className="h-32"></div> {/* Spacer */}
      </main>

      {/* Fixed Bottom Controls */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0f172a] to-transparent z-40 flex justify-center">
        <AudioControls
          isListening={isListening}
          onToggleListening={handleToggleListening}
          autoplayEnabled={autoplayEnabled}
          onToggleAutoplay={() => setAutoplayEnabled(!autoplayEnabled)}
        />
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
        targetLang={targetLang}
        setTargetLang={setTargetLang}
        instructionLang={instructionLang}
        setInstructionLang={setInstructionLang}
      />
    </div>
  );
}

export default App;
