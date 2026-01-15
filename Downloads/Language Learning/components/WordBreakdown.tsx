
import React from 'react';
import { WordBreakdown as WordBreakdownType } from '../types';

interface Props {
  words: WordBreakdownType[];
  fullTranslation: string;
  isRTL?: boolean;
}

export const WordBreakdown: React.FC<Props> = ({ words, fullTranslation, isRTL }) => {
  return (
    <div className="bg-white/80 backdrop-blur-md rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-10 shadow-[0_12px_40px_rgba(0,0,0,0.04)] border border-white transition-all hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)] group/card">
      <div
        className={`flex flex-wrap gap-x-4 md:gap-x-6 gap-y-6 md:gap-y-8 mb-8 md:mb-10 ${isRTL ? 'flex-row-reverse text-right' : 'flex-row text-left'}`}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {words.map((word, idx) => (
          <div key={idx} className="flex flex-col items-center group/word relative">
            {/* Hover Background Effect */}
            <div className="absolute -inset-x-3 -inset-y-2 bg-indigo-50/0 group-hover/word:bg-indigo-50/50 rounded-xl md:rounded-2xl transition-all duration-300 -z-10"></div>

            <span className="text-[10px] md:text-[11px] text-indigo-500 font-extrabold mb-1 md:mb-2 opacity-60 group-hover/word:opacity-100 transition-all tracking-tight">
              {word.phonetic}
            </span>
            <span className={`text-3xl md:text-5xl font-black text-slate-900 mb-1 md:mb-2 transition-transform group-hover/word:scale-110 duration-300 ${isRTL ? 'font-serif' : 'tracking-tighter'}`}>
              {word.script}
            </span>
            <span className="text-[10px] md:text-[11px] text-slate-400 font-black uppercase tracking-[0.1em]">
              {word.meaning}
            </span>
          </div>
        ))}
      </div>

      <div className={`pt-6 md:pt-8 border-t border-slate-50 flex flex-col gap-2 ${isRTL ? 'text-right' : 'text-left'}`}>
        <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Full Translation</h4>
        <p className="text-lg md:text-2xl text-slate-800 font-bold tracking-tight leading-relaxed">
          <span className="text-indigo-600 opacity-40 mr-1 italic text-base md:text-2xl">"</span>
          {fullTranslation}
          <span className="text-indigo-600 opacity-40 ml-1 italic text-base md:text-2xl">"</span>
        </p>
      </div>
    </div>
  );
};
