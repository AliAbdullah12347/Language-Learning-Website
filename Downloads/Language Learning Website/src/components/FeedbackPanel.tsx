
import React from 'react';
import type { AIResponse } from '../types';
import { CheckCircle, AlertCircle, MessageSquare } from 'lucide-react';

interface Props {
    data: AIResponse;
}

export const FeedbackPanel: React.FC<Props> = ({ data }) => {
    if (!data.feedback) return null;

    const { userSaid, understood, mistakes } = data.feedback;

    return (
        <div className="glass-panel mt-6 fade-in">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <MessageSquare size={20} className="text-blue-400" />
                Feedback
            </h3>

            <div className="mb-4">
                <span className="text-gray-400 text-sm">I heard:</span>
                <p className="text-white text-lg italic">"{userSaid}"</p>
            </div>

            <div className="mb-4">
                <span className="text-gray-400 text-sm">Understood as:</span>
                <p className="text-green-300">"{understood}"</p>
            </div>

            <div>
                <span className="text-gray-400 text-sm">Corrections:</span>
                {mistakes.length === 0 || (mistakes.length === 1 && mistakes[0] === 'None') ? (
                    <div className="flex items-center gap-2 text-green-400 mt-1">
                        <CheckCircle size={16} />
                        <span>Perfect! No mistakes found.</span>
                    </div>
                ) : (
                    <ul className="mt-1 space-y-2">
                        {mistakes.map((m, i) => (
                            <li key={i} className="flex items-start gap-2 text-red-300">
                                <AlertCircle size={16} className="mt-1 shrink-0" />
                                <span>{m}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};
