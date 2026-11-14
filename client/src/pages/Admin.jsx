import { useEffect, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { SignIn } from './Host.jsx';

export default function Admin() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Shell><SignIn user={user} title="Admin sign in" /></Shell>;
  return <Shell wide><Bank /></Shell>;
}

const blank = { category: '', text: '', options: ['', '', '', ''], correctIndex: 0, difficulty: 'medium', explanation: '' };

function Bank() {
  const [cats, setCats] = useState([]);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [filter, setFilter] = useState({ category: '', difficulty: '', q: '', page: 1 });
  const [form, setForm] = useState(null);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => {
    const p = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
    api(`/questions?${p}`).then(setData).catch((e) => setErr(e.message));
  };
  useEffect(() => { api('/categories').then(setCats).catch(() => {}); }, []);
  useEffect(load, [filter]);

  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, options: form.options.map((o) => o.trim()).filter(Boolean) };
      if (form._id) await api(`/questions/${form._id}`, { method: 'PUT', body });
      else await api('/questions', { method: 'POST', body });
      setForm(null); setErr(''); setMsg('Question saved.'); load();
    } catch (x) { setErr(x.message); }
  };
  const edit = (q) => setForm({ _id: q._id, category: q.category?._id, text: q.text, options: [...q.options, '', '', '', ''].slice(0, 4), correctIndex: q.correctIndex, difficulty: q.difficulty, explanation: q.explanation || '' });
  const remove = async (q) => { if (window.confirm('Delete this question?')) { await api(`/questions/${q._id}`, { method: 'DELETE' }); load(); } };
  const toggle = async (q) => { await api(`/questions/${q._id}`, { method: 'PUT', body: { active: !q.active } }); load(); };
  const runImport = async () => {
    try {
      const res = await api('/questions/import', { method: 'POST', body: JSON.parse(importText) });
      setMsg(`Imported ${res.added} questions. ${res.skipped.length ? `Skipped ${res.skipped.length}: ${res.skipped.slice(0, 3).map((s) => `row ${s.row} (${s.reason})`).join('; ')}` : ''}`);
      setErr(''); setImportText(''); load();
    } catch (x) { setErr(x instanceof SyntaxError ? 'That is not valid JSON.' : x.message); }
  };

  return (
    <div>
      <div className="row between">
        <h1 style={{ marginBottom: 0 }}>Question bank</h1>
        <button className="btn copper" onClick={() => setForm({ ...blank, category: cats[0]?._id })}>Add question</button>
      </div>
      <p className="muted">{data.total} questions match. Questions marked hidden are never drawn for events.</p>
      {err && <p className="error" role="alert">{err}</p>}
      {msg && <p role="status"><strong>{msg}</strong></p>}

      {form && (
        <form onSubmit={save} className="section" style={{ maxWidth: 680 }}>
          <h2>{form._id ? 'Edit question' : 'New question'}</h2>
          <div className="field"><label htmlFor="qc">Category</label>
            <select id="qc" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>{cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></div>
          <div className="field"><label htmlFor="qt">Question</label><textarea id="qt" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} maxLength={400} required /></div>
          <div className="field"><span className="label">Answers (select the correct one)</span>
            {form.options.map((o, i) => (
              <div className="opt-edit" key={i}>
                <input type="radio" name="correct" aria-label={`Answer ${i + 1} is correct`} checked={form.correctIndex === i} onChange={() => setForm({ ...form, correctIndex: i })} />
                <input aria-label={`Answer ${i + 1}`} value={o} maxLength={120} onChange={(e) => { const options = [...form.options]; options[i] = e.target.value; setForm({ ...form, options }); }} />
              </div>
            ))}</div>
          <div className="row">
            <div className="field grow"><label htmlFor="qd">Difficulty</label><select id="qd" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option>easy</option><option>medium</option><option>hard</option></select></div>
            <div className="field grow"><label htmlFor="qe">Explanation (optional)</label><input id="qe" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} maxLength={400} /></div>
          </div>
          <div className="row"><button className="btn">Save question</button><button type="button" className="btn secondary" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}

      <div className="row section">
        <select aria-label="Category" value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value, page: 1 })} style={{ width: 'auto' }}>
          <option value="">All categories</option>{cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
        <select aria-label="Difficulty" value={filter.difficulty} onChange={(e) => setFilter({ ...filter, difficulty: e.target.value, page: 1 })} style={{ width: 'auto' }}>
          <option value="">Any difficulty</option><option>easy</option><option>medium</option><option>hard</option></select>
        <input aria-label="Search questions" placeholder="Search text" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value, page: 1 })} style={{ width: 240 }} />
      </div>
      <div className="scroll-x">
        <table className="table">
          <thead><tr><th>Question</th><th>Category</th><th>Level</th><th>Correct answer</th><th /></tr></thead>
          <tbody>
            {data.items.map((q) => (
              <tr key={q._id} style={{ opacity: q.active ? 1 : 0.5 }}>
                <td>{q.text}</td><td>{q.category?.icon} {q.category?.name}</td><td>{q.difficulty}</td><td>{q.options[q.correctIndex]}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn quiet small" onClick={() => edit(q)}>Edit</button>
                  <button className="btn quiet small" onClick={() => toggle(q)}>{q.active ? 'Hide' : 'Show'}</button>
                  <button className="btn quiet small" onClick={() => remove(q)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn secondary small" disabled={filter.page <= 1} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Previous</button>
        <span className="muted">Page {data.page} of {data.pages || 1}</span>
        <button className="btn secondary small" disabled={filter.page >= data.pages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Next</button>
      </div>

      <details className="section">
        <summary><strong>Bulk import (JSON)</strong></summary>
        <p className="muted small">Paste an array like <code>{'[{"category":"geography","text":"...","options":["a","b","c","d"],"correctIndex":0,"difficulty":"easy"}]'}</code>. Category is the slug.</p>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} aria-label="Questions JSON" />
        <button className="btn" style={{ marginTop: 10 }} disabled={!importText.trim()} onClick={runImport}>Import questions</button>
      </details>
    </div>
  );
}
