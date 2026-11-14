// Live quiz sessions exist only in server memory. Nothing here is written to the database.
export class SessionStore {
  constructor() {
    this.byCode = new Map();
    this.byEvent = new Map();
  }

  add(session) {
    this.byCode.set(session.code, session);
    this.byEvent.set(String(session.eventId), session.code);
    return session;
  }

  getByCode(code) {
    return this.byCode.get(String(code || '').trim().toUpperCase());
  }

  getByEvent(eventId) {
    const code = this.byEvent.get(String(eventId));
    return code ? this.byCode.get(code) : undefined;
  }

  remove(code) {
    const s = this.byCode.get(code);
    if (!s) return;
    s.destroy();
    this.byCode.delete(code);
    this.byEvent.delete(String(s.eventId));
  }

  // Drop sessions nobody has touched for a while (host walked away, event over, etc.)
  sweep(maxIdleMs) {
    const now = Date.now();
    const removed = [];
    for (const s of this.byCode.values()) {
      if (now - s.touchedAt > maxIdleMs) removed.push(s.code);
    }
    removed.forEach((c) => this.remove(c));
    return removed;
  }

  get size() {
    return this.byCode.size;
  }
}

export const store = new SessionStore();
