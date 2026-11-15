import { Route, Routes } from 'react-router-dom';
import Join from './pages/Join.jsx';
import Play from './pages/Play.jsx';
import Screen from './pages/Screen.jsx';
import Register from './pages/Register.jsx';
import Host from './pages/Host.jsx';
import HostConsole from './pages/HostConsole.jsx';
import Admin from './pages/Admin.jsx';
import AdminHosts from './pages/AdminHosts.jsx';
import Billing from './pages/Billing.jsx';
import HostSignup from './pages/HostSignup.jsx';
import Poster from './pages/Poster.jsx';
import Shell from './components/Shell.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Join />} />
      <Route path="/play/:code" element={<Play />} />
      <Route path="/screen/:code" element={<Screen />} />
      <Route path="/register" element={<Register />} />
      <Route path="/host" element={<Host />} />
      <Route path="/host/signup" element={<HostSignup />} />
      <Route path="/host/billing" element={<Billing />} />
      <Route path="/host/:eventId" element={<HostConsole />} />
      <Route path="/poster/:code" element={<Poster />} />
      <Route path="/admin/hosts" element={<AdminHosts />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Shell><h1>Page not found</h1><p>Check the link, or go back to the start page.</p></Shell>} />
    </Routes>
  );
}
