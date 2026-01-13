
import React from 'react';
import { X } from 'lucide-react';
import { SUPPORTED_LANGUAGES, INSTRUCTION_LANGUAGES, type LanguageCode } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    apiKey: string;
    setApiKey: (key: string) => void;
    targetLang: LanguageCode;
    setTargetLang: (lang: LanguageCode) => void;
    instructionLang: LanguageCode;
    setInstructionLang: (lang: LanguageCode) => void;
}

export const SettingsModal: React.FC<Props> = ({
    isOpen, onClose, apiKey, setApiKey, targetLang, setTargetLang, instructionLang, setInstructionLang
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed top-0 left-0 right-0 bottom-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm fade-in">
            <div className="glass-panel w-full max-w-md m-4 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                    <X size={24} />
                </button>

                <h2 className="text-2xl font-bold mb-6">Settings</h2>

                <div className="flex flex-col gap-6">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Google Gemini API Key</label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="glass-input"
                            placeholder="Enter your API Key"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-2">I want to learn...</label>
                        <div className="flex flex-wrap gap-2">
                            {SUPPORTED_LANGUAGES.map(lang => (
                                <button
                                    key={lang.code}
                                    onClick={() => setTargetLang(lang.code)}
                                    className={`glass-button text-sm ${targetLang === lang.code ? 'bg-blue-600 border-blue-400' : 'secondary'}`}
                                >
                                    {lang.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-2">My instruction language...</label>
                        <div className="flex flex-wrap gap-2">
                            {INSTRUCTION_LANGUAGES.map(lang => (
                                <button
                                    key={lang.code}
                                    onClick={() => setInstructionLang(lang.code)}
                                    className={`glass-button text-sm ${instructionLang === lang.code ? 'bg-blue-600 border-blue-400' : 'secondary'}`}
                                >
                                    {lang.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button onClick={onClose} className="glass-button w-full justify-center mt-2">
                        Save & Close
                    </button>
                </div>
            </div>
        </div>
    );
};
