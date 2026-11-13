'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const eur = n => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const num = s => parseFloat(String(s).replace(',', '.'));

function settle(exp, mem) {
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

function App({ user }) {
  const me = user.user_metadata.username;
  const [lists, setLists] = useState([]); const [cur, setCur] = useState('');
  const [exp, setExp] = useState([]); const [mem, setMem] = useState([]);
  const [newList, setNewList] = useState('');
  const [desc, setDesc] = useState(''); const [amt, setAmt] = useState('');
  const [ed, setEd] = useState(null);
  const [mName, setMName] = useState(''); const [mW, setMW] = useState('1');

  const loadLists = useCallback(async () => {
    const { data } = await supabase.from('lists').select('*').order('created_at', { ascending: false });
    setLists(data || []);
    setCur(c => c || data?.[0]?.id || '');
  }, []);
  const loadExp = useCallback(async () => {
    if (!cur) return setExp([]);
    const { data } = await supabase.from('expenses').select('*').eq('list_id', cur).order('created_at', { ascending: false });
    setExp(data || []);
  }, [cur]);
  const loadMem = useCallback(async () => {
    if (!cur) return setMem([]);
    const { data } = await supabase.from('list_members').select('*').eq('list_id', cur);
    setMem(data || []);
  }, [cur]);

  useEffect(() => { loadLists(); }, [loadLists]);
  useEffect(() => { loadExp(); loadMem(); }, [loadExp, loadMem]);

  // Tempo reale: ogni modifica di altri utenti ricarica i dati
  useEffect(() => {
    const ch = supabase.channel('sharecosts-' + cur)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, loadLists)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, loadExp)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_members' }, loadMem)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cur, loadLists, loadExp, loadMem]);

  const addList = async () => {
    if (!newList.trim()) return;
    const { data } = await supabase.from('lists').insert({ name: newList.trim(), username: me }).select().single();
    setNewList(''); if (data) setCur(data.id); loadLists();
  };
  const addExp = async () => {
    const a = num(amt);
    if (!desc.trim() || !(a > 0)) return;
    await supabase.from('expenses').insert({ list_id: cur, username: me, description: desc.trim(), amount: a });
    setDesc(''); setAmt(''); loadExp();
  };
  const saveExp = async () => {
    const a = num(ed.amt);
    if (!ed.desc.trim() || !(a > 0)) return;
    await supabase.from('expenses').update({ description: ed.desc.trim(), amount: a }).eq('id', ed.id);
    setEd(null); loadExp();
  };
  const delExp = async id => {
    if (!confirm('Eliminare questa spesa?')) return;
    await supabase.from('expenses').delete().eq('id', id); loadExp();
  };
  const setWeight = async (username, v) => {
    const w = num(v);
    if (!(w > 0)) return loadMem();
    await supabase.from('list_members').upsert({ list_id: cur, username, weight: w }, { onConflict: 'list_id,username' });
    loadMem();
  };
  const addMember = async () => {
    const n = mName.trim().toLowerCase();
    if (!n) return;
    await setWeight(n, mW || '1'); setMName(''); setMW('1');
  };
  const delMember = async username => {
    await supabase.from('list_members').delete().eq('list_id', cur).eq('username', username); loadMem();
  };

  const s = settle(exp, mem);
  const inMem = n => mem.some(m => m.username === n);

  return (
    <>
      <div className="f" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <small>Ciao, <b>{me}</b></small>
        <button className="g" onClick={() => supabase.auth.signOut()}>Esci</button>
      </div>

      <div className="card">
        <h3>Elenco spese</h3>
        <div className="f">
          <select value={cur} onChange={e => setCur(e.target.value)}>
            {!lists.length && <option value="">Nessun elenco</option>}
            {lists.map(l => <option key={l.id} value={l.id}>{l.name} (di {l.username})</option>)}
          </select>
        </div>
        <div className="f" style={{ marginTop: 10 }}>
          <input placeholder="Nuovo elenco…" value={newList} onChange={e => setNewList(e.target.value)} />
          <button onClick={addList}>Crea</button>
        </div>
      </div>

      {cur && <>
        <div className="card">
          <h3>Nuova spesa</h3>
          <div className="f">
            <input placeholder="Cosa?" value={desc} onChange={e => setDesc(e.target.value)} />
            <input placeholder="€" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} style={{ maxWidth: 100 }} />
            <button onClick={addExp}>Aggiungi</button>
          </div>
        </div>

        <div className="card">
          <h3>Spese</h3>
          {!exp.length && <small>Nessuna spesa</small>}
          {exp.map(e => ed?.id === e.id ? (
            <div className="row" key={e.id}>
              <div className="f" style={{ flex: 1 }}>
                <input value={ed.desc} onChange={x => setEd({ ...ed, desc: x.target.value })} />
                <input inputMode="decimal" value={ed.amt} style={{ maxWidth: 90 }} onChange={x => setEd({ ...ed, amt: x.target.value })} />
                <button onClick={saveExp}>Salva</button>
                <button className="g" onClick={() => setEd(null)}>Annulla</button>
              </div>
            </div>
          ) : (
            <div className="row" key={e.id}>
              <span>{e.description} <small>— {e.username}</small></span>
              <span className="f" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
                <b>{eur(Number(e.amount))}</b>
                {e.username === me && <>
                  <button className="g" title="Modifica" onClick={() => setEd({ id: e.id, desc: e.description, amt: String(e.amount) })}>✎</button>
                  <button className="g" title="Elimina" onClick={() => delExp(e.id)}>🗑</button>
                </>}
              </span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Partecipanti e quote</h3>
          <small>La quota è un peso: chi ha 2 paga il doppio di chi ha 1 (es. 0,5 per un bambino).</small>
          {s.rows.map(r => (
            <div className="row" key={r.n + r.w}>
              <span>{r.n}</span>
              <span className="f" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
                <input style={{ maxWidth: 70, minWidth: 0 }} inputMode="decimal" defaultValue={r.w}
                  onBlur={x => num(x.target.value) !== r.w && setWeight(r.n, x.target.value)} />
                {inMem(r.n) && <button className="g" title="Rimuovi" onClick={() => delMember(r.n)}>✕</button>}
              </span>
            </div>
          ))}
          <div className="f" style={{ marginTop: 10 }}>
            <input placeholder="Aggiungi utente…" value={mName} onChange={e => setMName(e.target.value)} />
            <input inputMode="decimal" value={mW} onChange={e => setMW(e.target.value)} style={{ maxWidth: 70, minWidth: 0 }} />
            <button onClick={addMember}>Aggiungi</button>
          </div>
        </div>

        {exp.length > 0 && <>
          <div className="card">
            <h3>Totale: {eur(s.total)}</h3>
            {s.rows.map(r => (
              <div className="row" key={r.n}>
                <span>{r.n} <small>ha speso {eur(r.paid)} · quota {eur(r.owed)}</small></span>
                <b>{r.v >= 0 ? '+' : ''}{eur(r.v / 100)}</b>
              </div>
            ))}
          </div>
          <div className="card">
            <h3>Chi deve a chi</h3>
            {!s.out.length && <small>Tutto pareggiato 🎉</small>}
            {s.out.map((o, i) => <div className="row" key={i}><span>{o.from} → {o.to}</span><b>{eur(o.v)}</b></div>)}
          </div>
        </>}
      </>}
    </>
  );
}

export default function Home() {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  return (
    <main>
      <h1>Sharecosts</h1>
      <small>by Cesare Mattu v1.0</small>
      {user === undefined ? null : user ? <App user={user} /> : <Login />}
    </main>
  );
}
