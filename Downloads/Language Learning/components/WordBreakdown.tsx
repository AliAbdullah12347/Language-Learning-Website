
import React from 'react';
import { WordBreakdown as WordBreakdownType } from '../types';

interface Props {
  words: WordBreakdownType[];
  fullTranslation: string;
  isRTL?: boolean;
}

export const WordBreakdown: React.FC<Props> = ({ words, fullTranslation, isRTL }) => {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 transition-all hover:shadow-md">
      <div 
        className={`flex flex-wrap gap-4 mb-6 ${isRTL ? 'flex-row-reverse text-right' : 'flex-row text-left'}`}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {words.map((word, idx) => (
          <div key={idx} className="flex flex-col items-center group min-w-[3rem]">
            <span className="text-[10px] text-blue-500 font-medium mb-1 opacity-80 group-hover:opacity-100 transition-opacity">
              {word.phonetic}
            </span>
            <span className={`text-2xl font-bold text-gray-800 mb-1 ${isRTL ? 'font-serif' : 'chinese-text'}`}>
              {word.script}
            </span>
            <span className="text-[10px] text-gray-400 font-normal">
              {word.meaning}
            </span>
          </div>
        ))}
      </div>
      <div className={`pt-4 border-t border-gray-50 ${isRTL ? 'text-right' : 'text-left'}`}>
        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Full Meaning</h4>
        <p className="text-lg text-gray-700 italic leading-relaxed">
          "{fullTranslation}"
        </p>
      </div>
    </div>
  );
};
