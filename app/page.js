'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useApp, settle, eur, num } from '../lib/app';

export default function Spese() {
  const { me, cur } = useApp();
  const [exp, setExp] = useState([]); const [mem, setMem] = useState([]);
  const [desc, setDesc] = useState(''); const [amt, setAmt] = useState('');
  const [ed, setEd] = useState(null);

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
  useEffect(() => { loadExp(); loadMem(); }, [loadExp, loadMem]);
  useEffect(() => {
    const ch = supabase.channel('sc-spese-' + cur)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, loadExp)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_members' }, loadMem)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cur, loadExp, loadMem]);

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

  if (!cur) return <div className="card">Nessun elenco. Creane uno nella pagina <Link href="/elenchi"><b>Elenchi</b></Link>.</div>;
  const s = settle(exp, mem);

  return (
    <>
      <div className="card">
        <h3>Nuova spesa</h3>
        <div className="f">
          <input placeholder="Cosa?" value={desc} onChange={e => setDesc(e.target.value)} />
          <input placeholder="€" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} style={{ maxWidth: 100 }} />
          <button onClick={addExp}>Aggiungi</button>
        </div>
      </div>

      <div className="card cmp">
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
    </>
  );
}
