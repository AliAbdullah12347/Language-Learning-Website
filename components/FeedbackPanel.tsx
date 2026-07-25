
import React from 'react';
import { Feedback } from '../types';

interface Props {
  feedback: Feedback;
}

export const FeedbackPanel: React.FC<Props> = ({ feedback }) => {
  return (
    <div className="bg-gradient-to-br from-indigo-50/40 to-violet-50/30 backdrop-blur-sm rounded-[2rem] p-6 md:p-10 border border-indigo-200/50 space-y-6 md:space-y-8 relative overflow-hidden group shadow-lg shadow-indigo-100/50 hover:shadow-xl hover:shadow-indigo-200/50 transition-all duration-500">
      {/* Enhanced Accent Corner */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-indigo-500/10 to-violet-500/10 blur-[60px] rounded-full -mr-20 -mt-20 group-hover:from-indigo-500/20 group-hover:to-violet-500/20 transition-all duration-500"></div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 relative z-10">
        <div className="space-y-3 animate-in slide-in-from-left-4 duration-500">
          <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <div className="w-1 h-3 bg-gradient-to-b from-indigo-500 to-violet-500 rounded-full"></div>
            What you said
          </h4>
          <div className="bg-white/70 p-4 md:p-5 rounded-xl md:rounded-2xl border border-indigo-100 shadow-sm transition-all hover:scale-[1.02] hover:shadow-md duration-300 hover:bg-white/90">
            <p className="text-sm md:text-base text-slate-700 font-bold tracking-tight leading-relaxed italic">
              {feedback.userInput || "..."}
            </p>
          </div>
        </div>
        <div className="space-y-3 animate-in slide-in-from-right-4 duration-500" style={{ animationDelay: '100ms' }}>
          <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <div className="w-1 h-3 bg-gradient-to-b from-violet-500 to-purple-500 rounded-full"></div>
            What I understood
          </h4>
          <p className="text-sm md:text-base text-slate-700 font-semibold leading-relaxed bg-white/50 p-4 md:p-5 rounded-xl md:rounded-2xl border border-violet-100 hover:bg-white/70 transition-colors duration-300">
            {feedback.aiUnderstood}
          </p>
        </div>
      </div>

      {feedback.mistakes.length > 0 && (
        <div className="space-y-4 relative z-10 animate-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 bg-gradient-to-b from-rose-500 to-pink-500 rounded-full animate-pulse"></div>
            <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-[0.2em]">Refinement Points ({feedback.mistakes.length})</h4>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {feedback.mistakes.map((mistake, idx) => (
              <div
                key={idx}
                className="flex items-start gap-4 bg-gradient-to-br from-rose-50/70 to-pink-50/50 p-3 md:p-4 rounded-xl border border-rose-200/50 text-xs md:text-sm text-slate-700 font-medium italic transition-all hover:from-rose-100/70 hover:to-pink-100/50 hover:scale-[1.01] duration-300 animate-in slide-in-from-left-2"
                style={{ animationDelay: `${idx * 50 + 300}ms` }}
              >
                <span className="text-rose-500 font-black text-base leading-none">•</span>
                {mistake}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 p-6 md:p-8 rounded-[1.5rem] shadow-[0_20px_40px_-8px_rgba(16,185,129,0.5)] relative z-10 group/tip transition-all hover:translate-y-[-4px] hover:shadow-[0_25px_50px_-8px_rgba(16,185,129,0.6)] duration-500 overflow-hidden animate-in slide-in-from-bottom-4" style={{ animationDelay: '400ms' }}>
        {/* Animated border glow */}
        <div className="absolute inset-0 rounded-[1.5rem] bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-500 blur-xl"></div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-white/25 p-2 rounded-lg backdrop-blur-sm group-hover/tip:scale-110 transition-transform duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 className="text-[10px] font-black text-emerald-50 uppercase tracking-[0.2em]">Teacher's Secret</h4>
          </div>
          <p className="text-base md:text-lg text-white font-black tracking-tight leading-relaxed">
            Try this instead: <span className="bg-white/15 px-3 py-1 rounded-lg border border-white/20 break-words inline-block mt-2 backdrop-blur-sm hover:bg-white/25 transition-colors duration-300">{feedback.suggestions}</span>
          </p>
        </div>
      </div>
    </div>
  );
};
