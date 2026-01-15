
import React from 'react';
import { Feedback } from '../types';

interface Props {
  feedback: Feedback;
}

export const FeedbackPanel: React.FC<Props> = ({ feedback }) => {
  return (
    <div className="bg-indigo-50/30 backdrop-blur-sm rounded-[2rem] p-6 md:p-10 border border-indigo-100/50 space-y-8 md:space-y-10 relative overflow-hidden group">
      {/* Accent Corner */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-[40px] rounded-full -mr-16 -mt-16 group-hover:bg-indigo-600/10 transition-colors"></div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 relative z-10">
        <div className="space-y-3">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">What you said</h4>
          <div className="bg-white/60 p-4 md:p-5 rounded-xl md:rounded-2xl border border-white shadow-sm transition-transform hover:scale-[1.02] duration-300">
            <p className="text-sm md:text-base text-slate-700 font-bold tracking-tight leading-relaxed italic">
              {feedback.userInput || "..."}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">What I understood</h4>
          <p className="text-sm md:text-base text-slate-600 font-medium leading-relaxed">
            {feedback.aiUnderstood}
          </p>
        </div>
      </div>

      {feedback.mistakes.length > 0 && (
        <div className="space-y-4 relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-rose-500 rounded-full"></div>
            <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Refinement Points ({feedback.mistakes.length})</h4>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {feedback.mistakes.map((mistake, idx) => (
              <div key={idx} className="flex items-start gap-4 bg-rose-50/50 p-3 md:p-4 rounded-xl border border-rose-100/50 text-xs md:text-sm text-slate-700 font-medium italic transition-all hover:bg-rose-50">
                <span className="text-rose-400 font-black tracking-widest leading-none">•</span>
                {mistake}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 md:p-8 rounded-[1.5rem] shadow-[0_12px_24px_-8px_rgba(5,150,105,0.4)] relative z-10 group/tip transition-transform hover:translate-y-[-4px] duration-300">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h4 className="text-[10px] font-black text-emerald-50 uppercase tracking-[0.2em]">Teacher's Secret</h4>
        </div>
        <p className="text-base md:text-lg text-white font-black tracking-tight leading-relaxed">
          Try this instead: <span className="bg-white/10 px-2 py-0.5 rounded-lg border border-white/10 break-words">{feedback.suggestions}</span>
        </p>
      </div>
    </div>
  );
};
