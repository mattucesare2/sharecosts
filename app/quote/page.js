'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useApp, settle, num } from '../../lib/app';

export default function Quote() {
  const { cur, lists } = useApp();
  const [exp, setExp] = useState([]); const [mem, setMem] = useState([]);
  const [mName, setMName] = useState(''); const [mW, setMW] = useState('1');

  const loadExp = useCallback(async () => {
    if (!cur) return setExp([]);
    const { data } = await supabase.from('expenses').select('*').eq('list_id', cur);
    setExp(data || []);
  }, [cur]);
  const loadMem = useCallback(async () => {
    if (!cur) return setMem([]);
    const { data } = await supabase.from('list_members').select('*').eq('list_id', cur);
    setMem(data || []);
  }, [cur]);
  useEffect(() => { loadExp(); loadMem(); }, [loadExp, loadMem]);
  useEffect(() => {
    const ch = supabase.channel('sc-quote-' + cur)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, loadExp)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_members' }, loadMem)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cur, loadExp, loadMem]);

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

  if (!cur) return <div className="card">Nessun elenco. Creane uno nella pagina <Link href="/elenchi"><b>Elenchi</b></Link>.</div>;
  const s = settle(exp, mem);
  const inMem = n => mem.some(m => m.username === n);
  const name = lists.find(l => l.id === cur)?.name;

  return (
    <div className="card">
      <h3>Partecipanti e quote{name ? ` — ${name}` : ''}</h3>
      <small>La quota è un peso: chi ha 2 paga il doppio di chi ha 1 (es. 0,5 per un bambino). Chi ha fatto una spesa partecipa con quota 1 se non indicato diversamente.</small>
      {!s.rows.length && <p><small>Nessun partecipante ancora.</small></p>}
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
  );
}
