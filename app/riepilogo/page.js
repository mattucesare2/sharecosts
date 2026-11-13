'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useApp, settle, eur } from '../../lib/app';

export default function Riepilogo() {
  const { cur, lists } = useApp();
  const [exp, setExp] = useState([]); const [mem, setMem] = useState([]);

  useEffect(() => {
    if (!cur) return;
    (async () => {
      const a = await supabase.from('expenses').select('*').eq('list_id', cur).order('created_at', { ascending: true });
      const b = await supabase.from('list_members').select('*').eq('list_id', cur);
      setExp(a.data || []); setMem(b.data || []);
    })();
  }, [cur]);

  if (!cur) return <div className="card">Nessun elenco. Creane uno nella pagina <Link href="/elenchi"><b>Elenchi</b></Link>.</div>;
  const s = settle(exp, mem);
  const name = lists.find(l => l.id === cur)?.name;
  const d = new Date().toLocaleDateString('it-IT');

  return (
    <div className="card">
      <div className="f noprint" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <small>Anteprima del riepilogo</small>
        <button onClick={() => window.print()}>Stampa / Salva PDF</button>
      </div>
      <h2 style={{ margin: '12px 0 2px' }}>Sharecosts — {name}</h2>
      <small>Riepilogo del {d}</small>

      <h3 style={{ marginTop: 16 }}>Spese</h3>
      <table className="tb">
        <thead><tr><th>Data</th><th>Descrizione</th><th>Pagato da</th><th className="r">Importo</th></tr></thead>
        <tbody>
          {exp.map(e => (
            <tr key={e.id}>
              <td>{new Date(e.created_at).toLocaleDateString('it-IT')}</td>
              <td>{e.description}</td><td>{e.username}</td><td className="r">{eur(Number(e.amount))}</td>
            </tr>
          ))}
          <tr><td colSpan={3}><b>Totale</b></td><td className="r"><b>{eur(s.total)}</b></td></tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 16 }}>Per persona</h3>
      <table className="tb">
        <thead><tr><th>Nome</th><th className="r">Quota (peso)</th><th className="r">Ha speso</th><th className="r">Deve sostenere</th><th className="r">Saldo</th></tr></thead>
        <tbody>
          {s.rows.map(r => (
            <tr key={r.n}>
              <td>{r.n}</td><td className="r">{r.w}</td><td className="r">{eur(r.paid)}</td>
              <td className="r">{eur(r.owed)}</td><td className="r">{r.v >= 0 ? '+' : ''}{eur(r.v / 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 16 }}>Chi deve a chi</h3>
      {!s.out.length && <small>Tutto pareggiato.</small>}
      {s.out.map((o, i) => <div className="row" key={i}><span>{o.from} → {o.to}</span><b>{eur(o.v)}</b></div>)}

      <p style={{ marginTop: 24 }}><small>Generato con Sharecosts by Cesare Mattu v1.0</small></p>
    </div>
  );
}
