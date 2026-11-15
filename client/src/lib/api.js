// Empty = same origin (server serves the client). Set VITE_API_URL when the client is hosted separately, e.g. on Firebase.
export const API_BASE = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

export function savedAuth() {
  try {
    return JSON.parse(localStorage.getItem('gq:auth')) || null;
  } catch {
    return null;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const auth = savedAuth();
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}
