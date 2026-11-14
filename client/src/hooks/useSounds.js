import { useEffect, useRef } from 'react';
import { cues } from '../lib/sound.js';

/**
 * Plays a cue when the quiz moves between stages. `left` is the seconds remaining from useCountdown.
 * Cues are no-ops until sound is switched on, so this is safe to call unconditionally.
 */
export function useScreenSounds(state, left) {
  const prev = useRef({ status: null, index: -1, players: 0, tick: null, lastLeft: 99 });
  const status = state?.status;
  const index = state?.question?.index ?? -1;
  const players = state?.playerCount ?? 0;

  useEffect(() => {
    if (!status) return;
    const p = prev.current;
    if (status === 'lobby' && p.status !== null && players > p.players) cues.join();
    if (status === 'question' && (p.status !== 'question' || p.index !== index)) {
      p.tick = null;
      cues.start();
    }
    if (status === 'locked' && p.status === 'question') {
      // Buzzer if the clock ran out; a friendly ding if everyone answered early
      if (p.lastLeft <= 0.4) cues.timeUp();
      else cues.lock();
    }
    if (status === 'reveal' && p.status !== 'reveal') cues.reveal();
    if (status === 'ended' && p.status !== 'ended') cues.win();
    p.status = status;
    p.index = index;
    p.players = players;
  }, [status, index, players]);

  useEffect(() => {
    if (status !== 'question') return;
    const p = prev.current;
    p.lastLeft = left;
    const sec = Math.ceil(left);
    if (sec >= 1 && sec <= 5 && p.tick !== sec) {
      p.tick = sec;
      cues.tick(sec);
    }
  }, [left, status]);
}
