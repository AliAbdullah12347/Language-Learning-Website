
import React from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

interface Props {
    isListening: boolean;
    onToggleListening: () => void;
    autoplayEnabled: boolean;
    onToggleAutoplay: () => void;
}

export const AudioControls: React.FC<Props> = ({
    isListening,
    onToggleListening,
    autoplayEnabled,
    onToggleAutoplay
}) => {
    return (
        <div className="flex flex-col items-center gap-4 mt-8">
            <button
                className={`mic-button ${isListening ? 'recording' : ''}`}
                onClick={onToggleListening}
            >
                {isListening ? <MicOff size={32} /> : <Mic size={32} />}
            </button>
            <p className="text-sm text-secondary">
                {isListening ? "Listening..." : "Tap to Speak"}
            </p>

            <button
                className="glass-button secondary text-sm py-2 px-4 rounded-full flex items-center gap-2 opacity-80 hover:opacity-100"
                onClick={onToggleAutoplay}
            >
                {autoplayEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                {autoplayEnabled ? "Autoplay On" : "Autoplay Off"}
            </button>
        </div>
    );
};
