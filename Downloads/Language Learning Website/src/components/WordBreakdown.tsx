
import React from 'react';
import type { WordBreakdown as WordBreakdownType } from '../types';

interface Props {
    words: WordBreakdownType[];
    isRTL: boolean;
}

export const WordBreakdown: React.FC<Props> = ({ words, isRTL }) => {
    return (
        <div className={`flex flex-wrap gap-2 ${isRTL ? 'flex-row-reverse' : 'flex-row'} justify-center my-4`}>
            {words.map((word, index) => (
                <div key={index} className="word-card fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                    <span className="word-original">{word.original}</span>
                    <span className="word-phonetic">{word.phonetic}</span>
                    <span className="word-meaning">{word.meaning}</span>
                </div>
            ))}
        </div>
    );
};
