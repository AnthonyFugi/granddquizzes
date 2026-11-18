import { useEffect, useRef } from 'react';
import { cues, intensityOf, playMusic, setRole, stopMusic, themeFor } from '../lib/sound.js';

// How tense the clock should feel: 0 calm, 1 getting close, 2 nearly out, 3 last few seconds
const tensionAt = (left) => (left <= 3 ? 3 : left <= 5 ? 2 : left <= 10 ? 1 : 0);
const blitzTensionAt = (left) => (left <= 3 ? 3 : left <= 10 ? 2 : left <= 30 ? 1 : 0);

/**
 * Music and sound cues for one screen. Call it once per page.
 *   role  'screen' (big screen), 'host' (quiz master console) or 'phone' (a player)
 *   state the public quiz state
 *   left  seconds left on the question clock (classic) or the blitz clock
 *   me    the player's own state (phones only), used to play the right or wrong sound at the reveal
 * Effects and music can each be switched off by the person using the page; nothing plays until the
 * browser has had a click or tap.
 */
export function useQuizAudio({ role, state, left = 0, me = null }) {
  const prev = useRef({ status: null, index: -1, players: 0, tick: null, lastLeft: 99, revealed: -1, spec: null, warned: false, riser: false, tension: -1 });
  const timers = useRef([]);
  const status = state?.status;
  const index = state?.question?.index ?? -1;
  const players = state?.playerCount ?? 0;
  const result = me?.result;

  useEffect(() => { setRole(role); }, [role]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); stopMusic(0.3); }, []);

  // Moving between stages
  useEffect(() => {
    if (!status) return;
    const p = prev.current;
    const q = state.question;

    if (status === 'lobby') {
      if (p.status !== 'lobby') playMusic({ key: 'lobby', theme: 'lobby', intensity: 0 });
      if (role !== 'phone' && p.status === 'lobby' && players > p.players) cues.join();
    }

    if (status === 'question' && q && (p.status !== 'question' || p.index !== index)) {
      const final = index + 1 >= q.total && q.total > 1;
      const base = intensityOf(q.difficulty);
      p.tick = null;
      p.riser = false;
      p.tension = -1;
      p.spec = { key: `q${index}`, theme: themeFor(q.category?.slug), intensity: final ? Math.min(2, base + 1) : base, tension: final ? 1 : 0, level: 1, final };
      playMusic(p.spec);
      if (final) cues.finalQuestion();
      else cues.start();
    }

    if (status === 'locked' && p.status === 'question') {
      if (p.spec) playMusic({ ...p.spec, tension: 0, level: 0.35 });
      if (p.lastLeft <= 0.4) cues.timeUp();
      else if (role !== 'phone') cues.lock();
    }

    if (status === 'reveal' && p.status !== 'reveal') {
      stopMusic(0.3);
      if (role !== 'phone') cues.reveal();
    }

    if (status === 'blitz' && p.status !== 'blitz') {
      p.warned = false;
      p.riser = false;
      p.tick = null;
      p.spec = { key: 'blitz', theme: 'blitz', intensity: 2, tension: 0, level: 1 };
      playMusic(p.spec);
      cues.start();
    }

    if (status === 'ended' && p.status !== 'ended') {
      stopMusic(0.3);
      if (p.status === 'blitz') {
        cues.blitzEnd();
        timers.current.push(setTimeout(() => cues.win(), 1500));
      } else cues.win();
    }

    p.status = status;
    p.index = index;
    p.players = players;
  }, [status, index, players]); // eslint-disable-line react-hooks/exhaustive-deps

  // A player hears whether they were right or wrong when the answer is revealed. The result can arrive
  // a moment after the stage changes, so this waits for it.
  useEffect(() => {
    const p = prev.current;
    if (role !== 'phone' || status !== 'reveal' || p.revealed === index || !result) return;
    p.revealed = index;
    if (result.answered && result.correct) cues.correct();
    else cues.wrong();
  }, [status, index, result, role]);

  // The clock: speed the music up and add ticks as time runs out
  useEffect(() => {
    const p = prev.current;
    if (status !== 'question' && status !== 'blitz') return;
    p.lastLeft = left;
    const sec = Math.ceil(left);
    const blitz = status === 'blitz';
    if (!p.spec) return;

    let tension = blitz ? blitzTensionAt(left) : tensionAt(left);
    if (!blitz && p.spec.final) tension = Math.max(1, tension);
    if (tension !== p.tension) {
      p.tension = tension;
      playMusic({ ...p.spec, tension });
    }

    if (blitz && !p.warned && left <= 30 && left > 0) { p.warned = true; cues.warning(); }
    if (!p.riser && left <= (blitz ? 10 : 5) && left > 0) { p.riser = true; cues.riser(); }
    if (sec >= 1 && sec <= (blitz ? 10 : 5) && p.tick !== sec) {
      p.tick = sec;
      if (sec <= 3) cues.finalBeep(sec);
      else cues.tick(sec);
    }
  }, [left, status]);
}

// Kept for older callers
export const useScreenSounds = (state, left) => useQuizAudio({ role: 'screen', state, left });
