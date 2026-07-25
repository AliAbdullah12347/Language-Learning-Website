
import React from 'react';
import { WordBreakdown as WordBreakdownType } from '../types';

interface Props {
  words: WordBreakdownType[];
  fullTranslation: string;
  isRTL?: boolean;
}

export const WordBreakdown: React.FC<Props> = ({ words, fullTranslation, isRTL }) => {
  return (
    <div className="bg-gradient-to-br from-white/90 to-indigo-50/50 backdrop-blur-md rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-10 shadow-[0_20px_60px_rgba(99,102,241,0.12)] border border-indigo-100/50 transition-all hover:shadow-[0_30px_80px_rgba(99,102,241,0.18)] hover:scale-[1.01] group/card duration-500">
      <div
        className={`flex flex-wrap gap-x-4 md:gap-x-6 gap-y-6 md:gap-y-8 mb-8 md:mb-10 ${isRTL ? 'flex-row-reverse text-right' : 'flex-row text-left'}`}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {words.map((word, idx) => (
          <div
            key={idx}
            className="flex flex-col items-center group/word relative animate-in fade-in slide-in-from-bottom-4 duration-500"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            {/* Enhanced Hover Background Effect */}
            <div className="absolute -inset-x-4 -inset-y-3 bg-gradient-to-br from-indigo-100/0 to-violet-100/0 group-hover/word:from-indigo-100/70 group-hover/word:to-violet-100/70 rounded-2xl md:rounded-3xl transition-all duration-500 -z-10 group-hover/word:shadow-lg group-hover/word:shadow-indigo-200/50"></div>

            <span className="text-[10px] md:text-[11px] text-indigo-600 font-extrabold mb-1 md:mb-2 opacity-70 group-hover/word:opacity-100 transition-all tracking-tight group-hover/word:scale-110 duration-300">
              {word.phonetic}
            </span>
            <span className={`text-3xl md:text-5xl font-black bg-gradient-to-br from-slate-900 to-slate-700 bg-clip-text text-transparent mb-1 md:mb-2 transition-all group-hover/word:scale-125 duration-500 relative ${isRTL ? 'font-serif' : 'tracking-tighter'}`}>
              {word.script}
              <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 scale-x-0 group-hover/word:scale-x-100 transition-transform duration-500 rounded-full"></span>
            </span>
            <span className="text-[10px] md:text-[11px] text-slate-500 font-black uppercase tracking-[0.15em] group-hover/word:text-indigo-600 transition-colors duration-300">
              {word.meaning}
            </span>
          </div>
        ))}
      </div>

      <div className={`pt-6 md:pt-8 border-t border-indigo-100/50 flex flex-col gap-3 ${isRTL ? 'text-right' : 'text-left'} animate-in slide-in-from-bottom-2 duration-700`} style={{ animationDelay: `${words.length * 100 + 200}ms` }}>
        <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2">
          <div className="w-1 h-3 bg-gradient-to-b from-indigo-500 to-violet-500 rounded-full"></div>
          Full Translation
        </h4>
        <p className="text-lg md:text-2xl text-slate-800 font-bold tracking-tight leading-relaxed relative">
          <span className="text-indigo-500 opacity-50 mr-1 italic text-base md:text-2xl">"</span>
          {fullTranslation}
          <span className="text-indigo-500 opacity-50 ml-1 italic text-base md:text-2xl">"</span>
        </p>
      </div>
    </div>
  );
};
