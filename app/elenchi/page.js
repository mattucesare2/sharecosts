'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app';

export default function Elenchi() {
  const { me, lists, cur, pick, loadLists } = useApp();
  const router = useRouter();
  const [name, setName] = useState('');

  const addList = async () => {
    if (!name.trim()) return;
    const { data } = await supabase.from('lists').insert({ name: name.trim(), username: me }).select().single();
    setName('');
    await loadLists();
    if (data) { pick(data.id); router.push('/'); }
  };
  const open = id => { pick(id); router.push('/'); };

  return (
    <>
      <div className="card">
        <h3>Nuovo elenco</h3>
        <div className="f">
          <input placeholder="Nome dell'elenco…" value={name} onChange={e => setName(e.target.value)} />
          <button onClick={addList}>Crea</button>
        </div>
      </div>
      <div className="card">
        <h3>Tutti gli elenchi</h3>
        {!lists.length && <small>Nessun elenco</small>}
        {lists.map(l => (
          <div className="row" key={l.id} style={{ alignItems: 'center' }}>
            <span><b>{l.name}</b> <small>— di {l.username}, {new Date(l.created_at).toLocaleDateString('it-IT')}</small></span>
            {l.id === cur ? <small>✓ in uso</small> : <button className="g" onClick={() => open(l.id)}>Apri</button>}
          </div>
        ))}
      </div>
    </>
  );
}
