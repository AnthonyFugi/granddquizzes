import { useCallback, useEffect, useRef, useState } from 'react';
import { connectSocket, readPlayer, savePlayer, clearPlayer } from '../lib/socket.js';

const promisify = (ref) => (event, data) =>
  new Promise((resolve) => {
    if (!ref.current) return resolve({ ok: false, error: 'Not connected' });
    ref.current.timeout(8000).emit(event, data || {}, (err, res) => resolve(err ? { ok: false, error: 'No reply from the server. Check your connection.' } : res));
  });

/** Phone player. Rejoins automatically (same playerId) when the connection drops. */
export function usePlayer(code) {
  const [phase, setPhase] = useState('connecting'); // connecting | joined | reconnecting | error | kicked
  const [error, setError] = useState('');
  const [state, setState] = useState(null);
  const [me, setMe] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const socket = connectSocket();
    ref.current = socket;
    setPhase('connecting');
    const join = () => {
      const saved = readPlayer(code);
      const nickname = saved?.nickname || sessionStorage.getItem('gq:nick') || '';
      socket.emit('player:join', { code, nickname, playerId: saved?.playerId }, (res) => {
        if (res.ok) {
          savePlayer(code, { playerId: res.playerId, nickname });
          setPhase('joined');
          setError('');
        } else {
          setPhase('error');
          setError(res.error);
        }
      });
    };
    socket.on('connect', join);
    socket.on('state', setState);
    socket.on('me', setMe);
    socket.on('kicked', () => {
      clearPlayer(code);
      setPhase('kicked');
    });
    socket.on('disconnect', () => setPhase((p) => (p === 'joined' ? 'reconnecting' : p)));
    return () => socket.disconnect();
  }, [code, attempt]);

  const act = useCallback(promisify(ref), []);
  return { phase, error, state, me, act, retry: () => setAttempt((a) => a + 1) };
}

/** Big screen: read-only. */
export function useScreen(code) {
  const [phase, setPhase] = useState('connecting');
  const [error, setError] = useState('');
  const [state, setState] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const socket = connectSocket();
    const watch = () =>
      socket.emit('screen:watch', { code }, (res) => {
        setPhase(res.ok ? 'watching' : 'error');
        setError(res.ok ? '' : res.error);
      });
    socket.on('connect', watch);
    socket.on('state', setState);
    return () => socket.disconnect();
  }, [code, attempt]);
  return { phase, error, state, retry: () => setAttempt((a) => a + 1) };
}

/** Quiz master console. */
export function useHost(eventId, token) {
  const [phase, setPhase] = useState('connecting'); // connecting | ready | error
  const [error, setError] = useState('');
  const [state, setState] = useState(null);
  const [info, setInfo] = useState(null);
  const [meta, setMeta] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const socket = connectSocket();
    ref.current = socket;
    setPhase('connecting');
    socket.on('connect', () =>
      socket.emit('host:open', { token, eventId }, (res) => {
        if (res.ok) {
          setMeta(res);
          setPhase('ready');
          setError('');
        } else {
          setPhase('error');
          setError(res.error);
        }
      })
    );
    socket.on('state', setState);
    socket.on('hostInfo', setInfo);
    socket.on('disconnect', () => setPhase((p) => (p === 'ready' ? 'connecting' : p)));
    return () => socket.disconnect();
  }, [eventId, token, attempt]);

  const act = useCallback(promisify(ref), []);
  return { phase, error, state, info, meta, act, retry: () => setAttempt((a) => a + 1) };
}

/** Seconds left on the current question, using the server clock so phones with a wrong time still agree. */
export function useCountdown(state) {
  const offset = useRef(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (state?.serverTime) offset.current = state.serverTime - Date.now();
  }, [state?.serverTime]);
  const live = state?.status === 'question' && state.question;
  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [live, state?.question?.index]);
  if (!live) return { left: 0, fraction: 0 };
  const left = Math.max(0, state.question.endsAt - (Date.now() + offset.current));
  return { left: left / 1000, fraction: Math.min(1, left / (state.question.timeLimit * 1000)) };
}
