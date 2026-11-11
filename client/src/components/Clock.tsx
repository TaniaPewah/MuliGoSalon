import { useEffect, useState } from 'react';
import type { Color } from '@multigo/shared';
import type { TimedGameState } from '../store';

interface Props {
  game: TimedGameState;
  color: Color;
}

export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (clamped < 10_000) return `${seconds}.${Math.floor((clamped % 1000) / 100)}`;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Displays a player's remaining time. The server is authoritative: we only
 * interpolate from the last snapshot using the local time it was received.
 */
export function Clock({ game, color }: Props) {
  const { state, receivedAt } = game;
  const running = state.clock.running === color;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running, receivedAt]);

  const base = state.clock[color];
  const remaining = running ? base - (now - receivedAt) : base;
  const low = remaining < 10_000 && state.phase === 'playing';

  return (
    <div
      className={['clock', running ? 'clock--running' : '', low ? 'clock--low' : ''].join(' ')}
      data-testid={`clock-${color}`}
    >
      {formatClock(remaining)}
    </div>
  );
}
