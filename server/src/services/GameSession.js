import { randomUUID } from 'node:crypto';
import { DEFAULT_MARKS, cleanMarks } from './scoring.js';
import { UserError } from './errors.js';

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * One live quiz. Holds players, teams, the current question and scores in memory.
 * Status flow: lobby -> question -> (locked) -> reveal -> question ... -> ended
 * Blitz mode: lobby -> blitz (everyone races the clock through their own shuffled copy of the questions) -> ended
 */
export class GameSession {
  constructor({ code, eventId, title, prizes = [], questions, timeLimit = 20, maxTeamSize = 10, maxPlayers = Infinity, branding = { poweredBy: true }, marks = DEFAULT_MARKS, mode = 'classic', blitzSeconds = 120 }) {
    this.code = code;
    this.eventId = eventId;
    this.title = title;
    this.prizes = prizes;
    this.questions = questions;
    this.timeLimit = timeLimit;
    this.maxTeamSize = maxTeamSize;
    this.maxPlayers = maxPlayers; // set from the plan; refreshed whenever the host opens the console
    this.branding = branding; // already filtered by plan: what guests are allowed to see

    this.mode = mode === 'blitz' ? 'blitz' : 'classic';
    this.blitzSeconds = Math.min(900, Math.max(30, Number(blitzSeconds) || 120)); // length of a blitz round
    this.onTimeUp = () => {}; // called when a blitz ends by itself
    this.marks = this.mode === 'blitz' ? 1 : cleanMarks(marks); // marks for every correct answer (blitz: one point per correct answer)
    this.scoredCount = 0; // questions revealed so far: the possible total grows by one question each time
    this.status = 'lobby';
    this.players = new Map(); // playerId -> { id, nickname, socketId, connected, teamId, score }
    this.teams = new Map(); // teamId -> { id, name, leaderId, memberIds:Set, score }
    this.index = -1;
    this.answers = new Map(); // entityKey -> { choice, elapsedMs, by }
    this.results = new Map(); // entityKey -> { answered, correct, points, choice }
    this.tally = null;
    this.startedAt = null;
    this.endsAt = null;
    this.timer = null;
    this.hostSocketId = null;
    this.touchedAt = Date.now();
    this.endedAt = null;
    this.finalStandings = null;
    this.onChange = () => {};
  }

  touch() {
    this.touchedAt = Date.now();
  }

  destroy() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  get question() {
    return this.questions[this.index] || null;
  }

  // ---------- players ----------
  mustPlayer(playerId) {
    const p = this.players.get(playerId);
    if (!p) throw new UserError('Player not found. Rejoin the quiz.');
    return p;
  }

  join({ nickname, playerId, socketId }) {
    this.touch();
    if (playerId && this.players.has(playerId)) {
      const p = this.players.get(playerId);
      p.socketId = socketId;
      p.connected = true;
      return p;
    }
    if (this.status === 'ended') throw new UserError('This quiz has ended');
    const name = clean(nickname, 20);
    if (name.length < 2) throw new UserError('Pick a nickname with at least 2 characters');
    for (const p of this.players.values()) {
      if (p.nickname.toLowerCase() === name.toLowerCase()) {
        throw new UserError('That nickname is taken. Try another one');
      }
    }
    if (this.players.size >= this.maxPlayers) {
      throw new UserError(`This quiz is full (${this.maxPlayers} players). Ask the quiz master to upgrade the event`);
    }
    const p = { id: randomUUID(), nickname: name, socketId, connected: true, teamId: null, score: 0 };
    this.players.set(p.id, p);
    return p;
  }

  disconnect(socketId) {
    for (const p of this.players.values()) {
      if (p.socketId === socketId) {
        p.connected = false;
        p.socketId = null;
        return p;
      }
    }
    return null;
  }

  removePlayer(playerId) {
    const p = this.players.get(playerId);
    if (!p) return null;
    if (p.teamId) this.detachFromTeam(p);
    this.players.delete(playerId);
    this.answers.delete(`p:${playerId}`);
    return p;
  }

  // ---------- teams ----------
  createTeam(playerId, name) {
    const p = this.mustPlayer(playerId);
    if (this.status !== 'lobby') throw new UserError('Teams can only be created before the quiz starts');
    if (p.teamId) throw new UserError('Leave your current team first');
    const n = clean(name, 24);
    if (n.length < 2) throw new UserError('Give your team a name (at least 2 characters)');
    for (const t of this.teams.values()) {
      if (t.name.toLowerCase() === n.toLowerCase()) throw new UserError('That team name is taken');
    }
    const team = { id: randomUUID().slice(0, 8), name: n, leaderId: p.id, memberIds: new Set([p.id]), score: 0 };
    this.teams.set(team.id, team);
    p.teamId = team.id;
    this.touch();
    return team;
  }

  joinTeam(playerId, teamId) {
    const p = this.mustPlayer(playerId);
    if (this.status !== 'lobby') throw new UserError('Teams are locked once the quiz starts');
    if (p.teamId) throw new UserError('Leave your current team first');
    const team = this.teams.get(teamId);
    if (!team) throw new UserError('That team no longer exists');
    if (team.memberIds.size >= this.maxTeamSize) throw new UserError('That team is full');
    team.memberIds.add(p.id);
    p.teamId = team.id;
    this.touch();
    return team;
  }

  leaveTeam(playerId) {
    const p = this.mustPlayer(playerId);
    if (this.status !== 'lobby') throw new UserError('Teams are locked once the quiz starts');
    if (!p.teamId) return;
    this.detachFromTeam(p);
    this.touch();
  }

  detachFromTeam(p) {
    const team = this.teams.get(p.teamId);
    p.teamId = null;
    if (!team) return;
    team.memberIds.delete(p.id);
    if (team.memberIds.size === 0) {
      this.teams.delete(team.id);
      this.answers.delete(`t:${team.id}`);
    } else if (team.leaderId === p.id) {
      const members = [...team.memberIds].map((id) => this.players.get(id)).filter(Boolean);
      const next = members.find((m) => m.connected) || members[0];
      team.leaderId = next.id;
    }
  }

  transferLeader(byPlayerId, newLeaderId) {
    const by = this.mustPlayer(byPlayerId);
    const team = by.teamId && this.teams.get(by.teamId);
    if (!team || team.leaderId !== by.id) throw new UserError('Only the team leader can do that');
    if (!team.memberIds.has(newLeaderId)) throw new UserError('That player is not in your team');
    team.leaderId = newLeaderId;
    this.touch();
  }

  // Any member can take over if the leader dropped off.
  claimLeader(playerId) {
    const p = this.mustPlayer(playerId);
    const team = p.teamId && this.teams.get(p.teamId);
    if (!team) throw new UserError('You are not in a team');
    const leader = this.players.get(team.leaderId);
    if (leader && leader.connected) throw new UserError('Your leader is still connected');
    team.leaderId = p.id;
    this.touch();
  }

  setLeaderByHost(teamId, playerId) {
    const team = this.teams.get(teamId);
    if (!team || !team.memberIds.has(playerId)) throw new UserError('That player is not in that team');
    team.leaderId = playerId;
    this.touch();
  }

  // ---------- question flow ----------
  entityKeyOf(p) {
    return p.teamId ? `t:${p.teamId}` : `p:${p.id}`;
  }

  holders() {
    const list = [];
    for (const t of this.teams.values()) list.push([`t:${t.id}`, t]);
    for (const p of this.players.values()) if (!p.teamId) list.push([`p:${p.id}`, p]);
    return list;
  }

  // Start the quiz in whichever mode it is
  begin() {
    return this.mode === 'blitz' ? this.startBlitz() : this.next();
  }

  next() {
    if (this.mode === 'blitz') throw new UserError('This is a blitz quiz. Use Start blitz');
    if (!['lobby', 'reveal'].includes(this.status)) throw new UserError('Finish the current question first');
    if (this.players.size === 0) throw new UserError('Wait for at least one player to join');
    if (this.index + 1 >= this.questions.length) {
      throw new UserError('That was the last question. Finish the quiz to show the winners');
    }
    this.index += 1;
    this.answers = new Map();
    this.results = new Map();
    this.tally = null;
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + this.timeLimit * 1000;
    this.status = 'question';
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.status === 'question') {
        this.status = 'locked';
        this.onChange();
      }
    }, this.timeLimit * 1000 + 50);
    this.touch();
  }

  // ---------- blitz mode ----------
  startBlitz() {
    if (this.mode !== 'blitz') throw new UserError('This is not a blitz quiz');
    if (this.status !== 'lobby') throw new UserError('The blitz has already started');
    if (this.players.size === 0) throw new UserError('Wait for at least one player to join');
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + this.blitzSeconds * 1000;
    this.status = 'blitz';
    for (const p of this.players.values()) { p.order = null; this.prepBlitz(p); }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.status === 'blitz') {
        this.end();
        this.onTimeUp();
        this.onChange();
      }
    }, this.blitzSeconds * 1000 + 100);
    this.touch();
  }

  // Everyone gets the same questions in their own random order, so neighbours cannot copy
  prepBlitz(p) {
    if (p.order) return;
    const order = this.questions.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    p.order = order;
    p.pos = 0;
    p.correct = p.correct || 0;
    p.wrong = p.wrong || 0;
    p.skipped = p.skipped || 0;
    p.qStart = Date.now();
  }

  /** choice: option index, or -1 to skip. Returns what the player needs to see next. */
  blitzAnswer(playerId, choice) {
    const p = this.mustPlayer(playerId);
    if (this.status !== 'blitz') throw new UserError('The blitz is not running');
    const now = Date.now();
    if (now > this.endsAt + 400) throw new UserError('Time is up');
    this.prepBlitz(p);
    if (p.pos >= p.order.length) throw new UserError('You have answered every question');
    const q = this.questions[p.order[p.pos]];
    const c = Number(choice);
    let correct = false;
    if (c === -1) {
      p.skipped += 1;
    } else {
      if (!Number.isInteger(c) || c < 0 || c >= q.options.length) throw new UserError('Pick one of the options');
      correct = c === q.correctIndex;
      if (correct) {
        p.correct += 1;
        p.timeMs = (p.timeMs || 0) + Math.min(now - p.qStart, 120000);
      } else {
        p.wrong += 1;
      }
    }
    p.score = p.correct;
    p.pos += 1;
    p.qStart = now;
    this.touch();
    return { skipped: c === -1, correct, correctIndex: q.correctIndex, blitz: this.blitzView(p) };
  }

  // What one player sees: their own question and tallies. Never includes the answer.
  blitzView(p) {
    if (this.mode !== 'blitz') return null;
    if (this.status === 'lobby') return { pos: 0, total: this.questions.length, correct: 0, wrong: 0, skipped: 0, done: false, endsAt: null, question: null };
    this.prepBlitz(p);
    const q = this.status === 'blitz' && p.pos < p.order.length ? this.questions[p.order[p.pos]] : null;
    return {
      pos: p.pos,
      total: p.order.length,
      correct: p.correct,
      wrong: p.wrong,
      skipped: p.skipped,
      done: p.pos >= p.order.length,
      endsAt: this.endsAt,
      question: q ? { text: q.text, options: q.options, category: q.category } : null,
    };
  }

  submit(playerId, choice) {
    const p = this.mustPlayer(playerId);
    const q = this.question;
    if (this.status !== 'question' || !q) throw new UserError('No question is open right now');
    if (Date.now() > this.endsAt + 400) throw new UserError('Time is up');
    const c = Number(choice);
    if (!Number.isInteger(c) || c < 0 || c >= q.options.length) throw new UserError('Pick one of the options');

    let key;
    if (p.teamId) {
      const team = this.teams.get(p.teamId);
      if (team.leaderId !== p.id) throw new UserError('Only your team leader can submit the answer');
      key = `t:${team.id}`;
    } else {
      key = `p:${p.id}`;
    }
    if (this.answers.has(key)) throw new UserError('Answer already locked in');
    this.answers.set(key, {
      choice: c,
      elapsedMs: Math.min(Date.now() - this.startedAt, this.timeLimit * 1000),
      by: p.id,
    });
    this.touch();
  }

  expectedCount() {
    let n = 0;
    for (const [, holder] of this.holders()) {
      const members = holder.memberIds ? [...holder.memberIds].map((id) => this.players.get(id)) : [holder];
      if (members.some((m) => m && m.connected)) n += 1;
    }
    return n;
  }

  allAnswered() {
    return this.status === 'question' && this.expectedCount() > 0 && this.answers.size >= this.expectedCount();
  }

  lock() {
    if (this.status === 'question') {
      clearTimeout(this.timer);
      this.status = 'locked';
    }
  }

  reveal() {
    if (!['question', 'locked'].includes(this.status)) throw new UserError('There is no question to reveal');
    clearTimeout(this.timer);
    const q = this.question;
    const tally = q.options.map(() => 0);
    this.results = new Map();
    for (const [key, holder] of this.holders()) {
      const a = this.answers.get(key);
      if (!a) {
        this.results.set(key, { answered: false, correct: false, points: 0, choice: null });
        continue;
      }
      tally[a.choice] += 1;
      const correct = a.choice === q.correctIndex;
      const points = correct ? this.marks : 0;
      holder.score += points;
      if (correct) holder.timeMs = (holder.timeMs || 0) + a.elapsedMs; // only used to break ties
      this.results.set(key, { answered: true, correct, points, choice: a.choice });
    }
    this.tally = tally;
    this.scoredCount += 1;
    this.status = 'reveal';
    this.touch();
  }

  end() {
    if (this.status === 'ended') return;
    clearTimeout(this.timer);
    // If a question is still open, score it before finishing
    if (['question', 'locked'].includes(this.status)) this.reveal();
    this.status = 'ended';
    this.endedAt = Date.now();
    this.finalStandings = this.standings();
    this.touch();
  }

  // Marks available so far (questions already revealed) and for the whole quiz
  possibleScore() {
    if (this.mode === 'blitz') return 0; // blitz is scored by the number of correct answers, with no fixed total
    return this.scoredCount * this.marks;
  }

  // Which round a question belongs to (only when the quiz was built category by category)
  roundOf(i) {
    const q = this.questions[i];
    if (!q?.round) return null;
    let first = i;
    while (first > 0 && this.questions[first - 1]?.round?.index === q.round.index) first -= 1;
    let last = i;
    while (last + 1 < this.questions.length && this.questions[last + 1]?.round?.index === q.round.index) last += 1;
    const of = new Set(this.questions.map((x) => x.round?.index)).size;
    return { number: q.round.index + 1, of, name: q.round.name, icon: q.round.icon, position: i - first + 1, size: last - first + 1, last: i === last };
  }

  roundList() {
    const seen = new Map();
    this.questions.forEach((q) => {
      if (q.round && !seen.has(q.round.index)) seen.set(q.round.index, { name: q.round.name, icon: q.round.icon, size: 0 });
      if (q.round) seen.get(q.round.index).size += 1;
    });
    return [...seen.values()];
  }

  /** Back to the waiting room: scores and progress cleared, players and teams kept. Optionally with a fresh set of questions. */
  resetTo(questions) {
    clearTimeout(this.timer);
    this.timer = null;
    if (questions?.length) this.questions = questions;
    this.index = -1;
    this.status = 'lobby';
    this.answers = new Map();
    this.results = new Map();
    this.tally = null;
    this.startedAt = null;
    this.endsAt = null;
    this.endedAt = null;
    this.finalStandings = null;
    this.scoredCount = 0;
    this.revealAt = null;
    this.autoGo = null;
    for (const t of this.teams.values()) { t.score = 0; t.timeMs = 0; }
    for (const p of this.players.values()) { p.score = 0; p.timeMs = 0; p.order = null; p.pos = 0; p.correct = 0; p.wrong = 0; p.skipped = 0; }
    this.touch();
  }

  // ---------- views ----------
  standings() {
    const rows = [];
    if (this.mode === 'blitz') {
      // A team's score is the total correct answers of its members; ties go to fewer wrong answers, then faster correct answers
      for (const t of this.teams.values()) {
        const ms = [...t.memberIds].map((id) => this.players.get(id)).filter(Boolean);
        rows.push({ key: `t:${t.id}`, kind: 'team', id: t.id, name: t.name, score: ms.reduce((a, m) => a + (m.correct || 0), 0), wrong: ms.reduce((a, m) => a + (m.wrong || 0), 0), timeMs: ms.reduce((a, m) => a + (m.timeMs || 0), 0), size: t.memberIds.size });
      }
      for (const p of this.players.values()) {
        if (!p.teamId) rows.push({ key: `p:${p.id}`, kind: 'solo', id: p.id, name: p.nickname, score: p.correct || 0, wrong: p.wrong || 0, timeMs: p.timeMs || 0, size: 1 });
      }
      rows.sort((a, b) => b.score - a.score || a.wrong - b.wrong || a.timeMs - b.timeMs || a.name.localeCompare(b.name));
    } else {
      for (const t of this.teams.values()) {
        rows.push({ key: `t:${t.id}`, kind: 'team', id: t.id, name: t.name, score: t.score, timeMs: t.timeMs || 0, size: t.memberIds.size });
      }
      for (const p of this.players.values()) {
        if (!p.teamId) rows.push({ key: `p:${p.id}`, kind: 'solo', id: p.id, name: p.nickname, score: p.score, timeMs: p.timeMs || 0, size: 1 });
      }
      // Same marks: the one who answered correctly faster in total ranks higher. Equal on both = same place.
      rows.sort((a, b) => b.score - a.score || a.timeMs - b.timeMs || a.name.localeCompare(b.name));
    }
    let rank = 0;
    let prev = null;
    rows.forEach((r, i) => {
      const sig = `${r.score}:${r.wrong ?? ''}:${r.timeMs}`;
      if (sig !== prev) {
        rank = i + 1;
        prev = sig;
      }
      r.rank = rank;
    });
    return rows;
  }

  winners(standings) {
    const byPlace = new Map(this.prizes.map((p) => [p.place, p.label]));
    return standings
      .filter((r) => r.score > 0 && byPlace.has(r.rank))
      .map((r) => ({ ...r, prize: byPlace.get(r.rank) }));
  }

  publicState(standings = this.standings()) {
    const q = this.question;
    const showQuestion = q && ['question', 'locked', 'reveal'].includes(this.status);
    const state = {
      code: this.code,
      title: this.title,
      status: this.status,
      prizes: this.prizes,
      serverTime: Date.now(),
      playerCount: this.players.size,
      maxPlayers: Number.isFinite(this.maxPlayers) ? this.maxPlayers : null,
      branding: this.branding,
      connectedCount: [...this.players.values()].filter((p) => p.connected).length,
      teams: [...this.teams.values()].map((t) => ({
        id: t.id,
        name: t.name,
        size: t.memberIds.size,
        full: t.memberIds.size >= this.maxTeamSize,
        leader: this.players.get(t.leaderId)?.nickname,
        members: [...t.memberIds].map((id) => this.players.get(id)?.nickname).filter(Boolean),
      })),
      soloCount: [...this.players.values()].filter((p) => !p.teamId).length,
      // Nicknames only (no ids): lets the big screen and the host console list who is in the room
      players: [...this.players.values()].map((p) => ({
        nickname: p.nickname,
        connected: p.connected,
        team: p.teamId ? this.teams.get(p.teamId)?.name || null : null,
      })),
      question: showQuestion
        ? {
            index: this.index,
            total: this.questions.length,
            text: q.text,
            options: q.options,
            category: q.category,
            difficulty: q.difficulty,
            round: this.roundOf(this.index),
            timeLimit: this.timeLimit,
            startedAt: this.startedAt,
            endsAt: this.endsAt,
          }
        : null,
      answeredCount: this.answers.size,
      expectedCount: this.expectedCount(),
      totalQuestions: this.questions.length,
      mode: this.mode,
      blitz: this.mode === 'blitz' ? { seconds: this.blitzSeconds, startedAt: this.startedAt, endsAt: this.endsAt } : null,
      marks: this.marks, // marks per correct answer
      possible: this.possibleScore(), // marks available so far
      maxPossible: this.questions.length * this.marks,
      rounds: this.roundList(),
      timeLimit: this.timeLimit, // seconds per question, known from the lobby on
    };
    if (this.status === 'reveal' && q) {
      state.reveal = { correctIndex: q.correctIndex, explanation: q.explanation || '', tally: this.tally };
    }
    if (this.status === 'reveal' || this.status === 'blitz') state.leaderboard = standings;
    if (this.status === 'ended') {
      state.leaderboard = this.finalStandings || standings;
      state.winners = this.winners(state.leaderboard);
    }
    return state;
  }

  // Shown only to the quiz master: the answer while the question is still live.
  hostInfo() {
    const q = this.question;
    return {
      correctIndex: q ? q.correctIndex : null,
      explanation: q?.explanation || '',
      hasNext: this.index + 1 < this.questions.length,
    };
  }

  meState(p, standings = this.standings()) {
    const team = p.teamId ? this.teams.get(p.teamId) : null;
    const key = this.entityKeyOf(p);
    const ans = this.answers.get(key);
    const row = standings.find((r) => r.key === key);
    return {
      playerId: p.id,
      nickname: p.nickname,
      teamId: team?.id || null,
      teamName: team?.name || null,
      isLeader: !!team && team.leaderId === p.id,
      leaderName: team ? this.players.get(team.leaderId)?.nickname : null,
      leaderConnected: team ? !!this.players.get(team.leaderId)?.connected : true,
      canAnswer:
        this.status === 'question' && !ans && (!team || team.leaderId === p.id),
      answered: !!ans,
      choice: ans ? ans.choice : null,
      result: this.status === 'reveal' ? this.results.get(key) || null : null,
      score: row ? row.score : 0,
      possible: this.possibleScore(),
      blitz: this.blitzView(p),
      rank: row ? row.rank : null,
      of: standings.length,
    };
  }
}
