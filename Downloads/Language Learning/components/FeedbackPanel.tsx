
import React from 'react';
import { Feedback } from '../types';

interface Props {
  feedback: Feedback;
}

export const FeedbackPanel: React.FC<Props> = ({ feedback }) => {
  return (
    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 mt-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">What you said</h4>
          <p className="text-sm text-slate-700 font-medium bg-white p-2 rounded border border-slate-100">
            {feedback.userInput || "..."}
          </p>
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">What I understood</h4>
          <p className="text-sm text-slate-700 italic">
            {feedback.aiUnderstood}
          </p>
        </div>
      </div>

      {feedback.mistakes.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-red-500 uppercase mb-2">Found {feedback.mistakes.length} Improvement{feedback.mistakes.length > 1 ? 's' : ''}</h4>
          <ul className="list-disc list-inside space-y-1">
            {feedback.mistakes.map((mistake, idx) => (
              <li key={idx} className="text-sm text-slate-600">
                {mistake}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-green-50 p-3 rounded-lg border border-green-100">
        <h4 className="text-xs font-bold text-green-600 uppercase mb-1">Teacher's Tip</h4>
        <p className="text-sm text-green-800">
          Try saying: <span className="font-semibold">{feedback.suggestions}</span>
        </p>
      </div>
    </div>
  );
};
