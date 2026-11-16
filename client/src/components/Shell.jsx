import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Band from './Band.jsx';
import Logo from './Logo.jsx';

// Top bar for the quiz master / account pages. Players and the big screen use the bare layout.
export default function Shell({ children, wide = false }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  return (
    <>
      <Band />
      <header className="topbar">
        <Link to="/" className="wordmark" aria-label="Granddquiz home"><Logo size={34} /></Link>
        <nav aria-label="Main">
          {user && ['host', 'admin'].includes(user.role) && <Link to="/host">Events</Link>}
          {user && ['host', 'admin'].includes(user.role) && <Link to="/host/billing">Plans</Link>}
          {user?.role === 'admin' && <Link to="/admin/hosts">Quiz masters</Link>}
          {user?.role === 'admin' && <Link to="/admin/messages">Messages</Link>}
          <Link to="/contact">Contact</Link>
          {user?.role === 'admin' && <Link to="/admin">Question bank</Link>}
          {user ? (
            <button className="btn quiet" onClick={() => { logout(); nav('/'); }}>Sign out</button>
          ) : pathname === '/host' ? (
            <Link to="/host/signup">Create account</Link>
          ) : (
            <Link to="/host">Sign in</Link>
          )}
        </nav>
      </header>
      <main className={`page ${wide ? 'wide' : ''}`}>{children}</main>
    </>
  );
}
