
export class AudioService {
    private synthesis: SpeechSynthesis;
    private recognition: any;

    constructor() {
        this.synthesis = window.speechSynthesis;
        // @ts-ignore
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
        }
    }

    speak(text: string, lang: string) {
        if (this.synthesis.speaking) {
            this.synthesis.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9; // Slightly slower for learning

        // Attempt to pick a good voice
        const voices = this.synthesis.getVoices();
        const voice = voices.find(v => v.lang.startsWith(lang));
        if (voice) utterance.voice = voice;

        this.synthesis.speak(utterance);
    }

    stopSpeaking() {
        this.synthesis.cancel();
    }

    startListening(lang: string, onResult: (text: string) => void, onError: (err: any) => void) {
        if (!this.recognition) {
            onError("Speech recognition not supported in this browser.");
            return;
        }

        this.recognition.lang = lang;
        this.recognition.onresult = (event: any) => {
            const text = event.results[0][0].transcript;
            onResult(text);
        };
        this.recognition.onerror = (event: any) => {
            onError(event.error);
        };
        this.recognition.start();
    }

    stopListening() {
        if (this.recognition) {
            this.recognition.stop();
        }
    }
}

export const audioService = new AudioService();
