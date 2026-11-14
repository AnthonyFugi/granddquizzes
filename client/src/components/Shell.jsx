import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Band from './Band.jsx';

// Top bar for the quiz master / account pages. Players and the big screen use the bare layout.
export default function Shell({ children, wide = false }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <Band />
      <header className="topbar">
        <Link to="/" className="wordmark">Granddquiz</Link>
        <nav aria-label="Main">
          {user && ['host', 'admin'].includes(user.role) && <Link to="/host">Events</Link>}
          {user?.role === 'admin' && <Link to="/admin">Question bank</Link>}
          {user ? (
            <button className="btn quiet" onClick={() => { logout(); nav('/'); }}>Sign out</button>
          ) : (
            <Link to="/host">Quiz master sign in</Link>
          )}
        </nav>
      </header>
      <main className={`page ${wide ? 'wide' : ''}`}>{children}</main>
    </>
  );
}
