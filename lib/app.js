'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from './supabase';

export const eur = n => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
export const num = s => parseFloat(String(s).replace(',', '.'));

export function settle(exp, mem) {
  const paid = {}, w = {};
  mem.forEach(m => { w[m.username] = Number(m.weight); paid[m.username] = 0; });
  exp.forEach(e => {
    paid[e.username] = (paid[e.username] || 0) + Math.round(e.amount * 100);
    if (!(e.username in w)) w[e.username] = 1;
  });
  const names = Object.keys(paid);
  const total = names.reduce((a, n) => a + paid[n], 0);
  const W = names.reduce((a, n) => a + w[n], 0);
  const rows = names.map(n => {
    const owed = W ? (total * w[n]) / W : 0;
    return { n, w: w[n], paid: paid[n] / 100, owed: owed / 100, v: Math.round(paid[n] - owed) };
  });
  const cr = rows.filter(r => r.v > 0).map(r => ({ ...r })).sort((a, b) => b.v - a.v);
  const db = rows.filter(r => r.v < 0).map(r => ({ ...r, v: -r.v })).sort((a, b) => b.v - a.v);
  const out = []; let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const m = Math.min(db[i].v, cr[j].v);
    out.push({ from: db[i].n, to: cr[j].n, v: m / 100 });
    db[i].v -= m; cr[j].v -= m;
    if (!db[i].v) i++;
    if (!cr[j].v) j++;
  }
  return { rows, total: total / 100, out };
}

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

function Login() {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState('');
  const go = async mode => {
    setErr('');
    const name = u.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,20}$/.test(name)) return setErr('Nome utente: 3-20 caratteri (lettere, numeri, . _ -)');
    const email = `${name}@sharecosts.app`;
    const { error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password: p })
      : await supabase.auth.signUp({ email, password: p, options: { data: { username: name } } });
    if (error) setErr(error.message.includes('already') ? 'Nome utente già in uso' : error.message);
  };
  return (
    <div className="card">
      <h3>Entra</h3>
      <div className="f">
        <input placeholder="Nome utente" value={u} onChange={e => setU(e.target.value)} />
        <input type="password" placeholder="Password (min 6)" value={p} onChange={e => setP(e.target.value)} />
      </div>
      <div className="f" style={{ marginTop: 10 }}>
        <button onClick={() => go('in')}>Accedi</button>
        <button className="g" onClick={() => go('up')}>Registrati</button>
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

export function Shell({ children }) {
  const [user, setUser] = useState(undefined);
  const [lists, setLists] = useState([]);
  const [cur, setCur] = useState('');
  const path = usePathname();
  const uid = user?.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadLists = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('lists').select('*').order('created_at', { ascending: false });
    const all = data || [];
    setLists(all);
    let saved = ''; try { saved = localStorage.getItem('sc_list') || ''; } catch {}
    setCur(c => { const want = c || saved; return all.some(l => l.id === want) ? want : all[0]?.id || ''; });
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    loadLists();
    const ch = supabase.channel('sc-lists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, loadLists)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, loadLists]);

  const pick = id => { setCur(id); try { localStorage.setItem('sc_list', id); } catch {} };

  if (user === undefined) return null;
  if (!user) return (
    <main>
      <div className="hd"><h1>Sharecosts</h1></div>
      <small>by Cesare Mattu v1.0</small>
      <Login />
    </main>
  );

  const me = user.user_metadata.username;
  const tab = (href, label) => <Link href={href} className={path === href ? 'tab on' : 'tab'}>{label}</Link>;
  return (
    <Ctx.Provider value={{ me, lists, cur, pick, loadLists }}>
      <main>
        <div className="hd np">
          <h1>Sharecosts</h1>
          <select className="ls" value={cur} onChange={e => pick(e.target.value)} title="Elenco spese">
            {!lists.length && <option value="">Nessun elenco</option>}
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="f np" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <small>by Cesare Mattu v1.0 · ciao, <b>{me}</b></small>
          <button className="g" onClick={() => supabase.auth.signOut()}>Esci</button>
        </div>
        <nav className="nav np">
          {tab('/', 'Spese')}{tab('/quote', 'Partecipanti e quote')}{tab('/elenchi', 'Elenchi')}{tab('/riepilogo', 'Riepilogo PDF')}
        </nav>
        {children}
      </main>
    </Ctx.Provider>
  );
}
