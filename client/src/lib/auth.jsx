import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, savedAuth } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(savedAuth());

  const store = useCallback((next) => {
    if (next) localStorage.setItem('gq:auth', JSON.stringify(next));
    else localStorage.removeItem('gq:auth');
    setAuth(next);
  }, []);

  // Drop a stale or revoked token on load
  useEffect(() => {
    if (!savedAuth()?.token) return;
    api('/auth/me')
      .then(({ user }) => store({ token: savedAuth().token, user }))
      .catch((e) => e.status === 401 && store(null));
  }, [store]);

  const login = async (email, password) => {
    const res = await api('/auth/login', { method: 'POST', body: { email, password } });
    store({ token: res.token, user: res.user });
    return res.user;
  };
  const register = async (fields) => {
    const res = await api('/auth/register', { method: 'POST', body: fields });
    if (res.token) store({ token: res.token, user: res.user });
    return res; // { pending: true } for quiz masters waiting for approval
  };
  const logout = () => store(null);

  return (
    <AuthContext.Provider value={{ user: auth?.user || null, token: auth?.token || null, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
