
import React, { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

interface Props {
    durationMinutes: number;
}

export const SessionTimer: React.FC<Props> = ({ durationMinutes }) => {
    const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
        <div className="glass-button secondary pointer-events-none">
            <Timer size={16} />
            <span>{minutes}:{seconds.toString().padStart(2, '0')}</span>
        </div>
    );
};
