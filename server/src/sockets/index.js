import { GameSession } from '../services/GameSession.js';
import { UserError } from '../services/errors.js';
import { config } from '../config/env.js';
import { autopilotStep } from '../services/autopilot.js';

const room = (code) => `quiz:${code}`;
const ENDED_GRACE_MS = 15 * 60 * 1000; // keep an ended session around so phones can still show results

/**
 * deps (injected so the engine can be tested without a database):
 *  - store                      SessionStore
 *  - authorizeHost(token, id)   -> event summary, or throws UserError
 *  - loadQuestions(event)       -> live questions array
 *  - markLive(event)            optional
 *  - persistEnd(session)        optional, called once when the quiz ends
 */
export function registerSockets(io, deps) {
  const { store } = deps;
  const pending = new Set();

  function broadcast(session) {
    pending.delete(session.code);
    if (!store.getByCode(session.code)) return;
    const standings = session.standings();
    io.to(room(session.code)).emit('state', session.publicState(standings));
    for (const p of session.players.values()) {
      if (p.socketId) io.to(p.socketId).emit('me', session.meState(p, standings));
    }
    if (session.hostSocketId) io.to(session.hostSocketId).emit('hostInfo', session.hostInfo());
  }

  // Answers arrive in bursts; batch the fan-out.
  function schedule(session) {
    if (pending.has(session.code)) return;
    pending.add(session.code);
    setTimeout(() => broadcast(session), session.mode === 'blitz' ? 1500 : 150); // blitz answers are constant, so updates go out about once a second and a half
  }

  async function openSession(event, { auto = false } = {}) {
    let session = store.getByEvent(event.id);
    if (session) return session;
    const questions = await deps.loadQuestions(event);
    if (!questions.length) throw new UserError('No questions are available for the chosen categories');
    session = new GameSession({
      code: event.joinCode,
      eventId: event.id,
      title: event.title,
      prizes: event.prizes,
      questions,
      timeLimit: event.timeLimit,
      maxTeamSize: config.maxTeamSize,
      maxPlayers: event.maxPlayers ?? Infinity,
      branding: event.branding || { poweredBy: true },
      marks: event.marks,
      mode: event.mode,
      blitzSeconds: event.blitzSeconds,
    });
    session.event = event; // kept so the quiz master can reset it with a fresh set of questions
    session.onChange = () => broadcast(session);
    session.onTimeUp = () => { finish(session); }
    session.auto = auto;
    session.startAt = event.scheduledFor || 0;
    store.add(session);
    await deps.markLive?.(event);
    return session;
  }

  async function finish(s) {
    if (s.finishing) return; // the timer, the scheduler and the quiz master can all end a quiz; save it once
    s.finishing = true;
    try {
      await deps.persistEnd?.(s);
    } catch (e) {
      console.error('Could not save results', e);
    }
    s.removeTimer = setTimeout(() => store.remove(s.code), ENDED_GRACE_MS);
    s.removeTimer.unref?.();
  }

  // A finished quiz can be played again: it becomes live again and its saved results are cleared
  async function reopen(s) {
    if (s.status !== 'ended') return;
    clearTimeout(s.removeTimer);
    s.finishing = false;
    await deps.markLive?.({ id: s.eventId });
  }

  // Scheduled quizzes: the waiting room opens a little before the start time, and the quiz runs itself
  // at the scheduled time unless the quiz master has opened the console and taken over.
  let ticking = false;
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      for (const ev of (await deps.dueEvents?.()) || []) {
        try { await openSession(ev, { auto: true }); } catch (e) { console.error('Could not open scheduled quiz', ev.title, e.message); }
      }
      for (const s of store.byCode.values()) {
        const r = autopilotStep(s);
        if (r) broadcast(s);
        if (r === 'ended') await finish(s);
      }
    } catch (e) {
      console.error('Scheduler error', e);
    } finally {
      ticking = false;
    }
  }
  if (deps.dueEvents) setInterval(tick, 5000).unref?.();

  function on(socket, event, handler) {
    socket.on(event, async (data, cb) => {
      if (typeof data === 'function') {
        cb = data;
        data = {};
      }
      try {
        const res = await handler(data && typeof data === 'object' ? data : {});
        if (typeof cb === 'function') cb({ ok: true, ...(res || {}) });
      } catch (e) {
        if (!(e instanceof UserError)) console.error(`[socket:${event}]`, e);
        if (typeof cb === 'function') {
          cb({ ok: false, error: e instanceof UserError ? e.message : 'Something went wrong. Please try again.' });
        }
      }
    });
  }

  io.on('connection', (socket) => {
    socket.data = {};

    const hostSession = () => {
      const s = store.getByCode(socket.data.code);
      if (!s || socket.data.role !== 'host' || s.hostSocketId !== socket.id) {
        throw new UserError('Host session not found. Reopen the event.');
      }
      return s;
    };
    const playerCtx = () => {
      const s = store.getByCode(socket.data.code);
      if (!s || socket.data.role !== 'player') throw new UserError('You are not in a quiz');
      return { session: s, player: s.mustPlayer(socket.data.playerId) };
    };

    // ---------- host ----------
    on(socket, 'host:open', async ({ token, eventId }) => {
      const event = await deps.authorizeHost(token, eventId);
      const session = await openSession(event);
      session.auto = false; // the quiz master is here and in control
      // Re-read the plan each time the console opens, so an upgrade paid mid-event takes effect straight away
      if (event.maxPlayers != null) session.maxPlayers = event.maxPlayers;
      if (event.branding) session.branding = event.branding;
      session.hostSocketId = socket.id;
      session.touch();
      socket.data = { role: 'host', code: session.code };
      socket.join(room(session.code));
      broadcast(session);
      return { code: session.code, totalQuestions: session.questions.length };
    });

    on(socket, 'host:next', () => {
      const s = hostSession();
      s.begin();
      broadcast(s);
    });
    on(socket, 'host:lock', () => {
      const s = hostSession();
      s.lock();
      broadcast(s);
    });
    on(socket, 'host:reveal', () => {
      const s = hostSession();
      s.reveal();
      broadcast(s);
    });
    on(socket, 'host:end', async () => {
      const s = hostSession();
      s.end();
      broadcast(s);
      await finish(s);
    });
    // Back to the waiting room with a fresh set of questions. Players and teams stay, scores go to zero.
    on(socket, 'host:reset', async () => {
      const s = hostSession();
      const fresh = s.event ? await deps.loadQuestions(s.event) : null;
      await reopen(s);
      s.resetTo(fresh);
      s.auto = false;
      broadcast(s);
    });
    // Start again from question 1 right now, with the same questions and zeroed scores.
    on(socket, 'host:restart', async () => {
      const s = hostSession();
      if (s.players.size === 0) throw new UserError('Wait for at least one player to join');
      await reopen(s);
      s.resetTo();
      s.auto = false;
      s.begin();
      broadcast(s);
    });
    on(socket, 'host:setLeader', ({ teamId, playerId }) => {
      const s = hostSession();
      const team = s.teams.get(teamId);
      const target = [...s.players.values()].find((p) => p.nickname === playerId || p.id === playerId);
      if (!team || !target) throw new UserError('Team or player not found');
      s.setLeaderByHost(teamId, target.id);
      broadcast(s);
    });
    on(socket, 'host:kick', ({ nickname }) => {
      const s = hostSession();
      const p = [...s.players.values()].find((x) => x.nickname === nickname);
      if (!p) throw new UserError('Player not found');
      const sid = p.socketId;
      s.removePlayer(p.id);
      if (sid) io.to(sid).emit('kicked');
      broadcast(s);
    });

    // ---------- big screen (read only) ----------
    on(socket, 'screen:watch', ({ code }) => {
      const s = store.getByCode(code);
      if (!s) throw new UserError('No live quiz with that code');
      socket.data = { role: 'screen', code: s.code };
      socket.join(room(s.code));
      socket.emit('state', s.publicState());
      return {};
    });

    // ---------- players ----------
    on(socket, 'player:join', ({ code, nickname, playerId }) => {
      const s = store.getByCode(code);
      if (!s) throw new UserError('No live quiz with that code. Check the code on the big screen.');
      const p = s.join({ nickname, playerId, socketId: socket.id });
      socket.data = { role: 'player', code: s.code, playerId: p.id };
      socket.join(room(s.code));
      broadcast(s);
      return { playerId: p.id, title: s.title };
    });

    on(socket, 'team:create', ({ name }) => {
      const { session, player } = playerCtx();
      session.createTeam(player.id, name);
      broadcast(session);
    });
    on(socket, 'team:join', ({ teamId }) => {
      const { session, player } = playerCtx();
      session.joinTeam(player.id, teamId);
      broadcast(session);
    });
    on(socket, 'team:leave', () => {
      const { session, player } = playerCtx();
      session.leaveTeam(player.id);
      broadcast(session);
    });
    on(socket, 'team:transferLeader', ({ playerNickname }) => {
      const { session, player } = playerCtx();
      const target = [...session.players.values()].find((p) => p.nickname === playerNickname);
      if (!target) throw new UserError('Player not found');
      session.transferLeader(player.id, target.id);
      broadcast(session);
    });
    on(socket, 'team:claimLeader', () => {
      const { session, player } = playerCtx();
      session.claimLeader(player.id);
      broadcast(session);
    });

    // Blitz: answer (or skip with choice -1) and get your next question straight back
    on(socket, 'blitz:answer', ({ choice }) => {
      const { session, player } = playerCtx();
      const r = session.blitzAnswer(player.id, choice);
      schedule(session);
      return r;
    });

    on(socket, 'answer:submit', ({ choice }) => {
      const { session, player } = playerCtx();
      session.submit(player.id, choice);
      if (session.allAnswered()) {
        session.lock();
        broadcast(session);
      } else {
        schedule(session);
      }
    });

    socket.on('disconnect', () => {
      const s = store.getByCode(socket.data.code);
      if (!s) return;
      if (socket.data.role === 'host' && s.hostSocketId === socket.id) {
        s.hostSocketId = null;
      } else if (socket.data.role === 'player') {
        s.disconnect(socket.id);
        schedule(s);
      }
    });
  });
}
