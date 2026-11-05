// Cronoprogramma (diagramma di Gantt) dei cantieri: fasi e sotto-fasi, durate, dipendenze, avanzamento.
// Le barre si spostano trascinandole e si allungano dal bordo destro.
(function () {
  const { $, esc, fmt, avviso, errore } = ui;

  const COLORI = [['blu', 'Blu', '#1463d6'], ['verde', 'Verde', '#2e8b57'], ['arancio', 'Arancio', '#f08c2b'], ['rosso', 'Rosso', '#d6453d'],
    ['viola', 'Viola', '#7b4fc9'], ['teal', 'Verde acqua', '#1e7f87'], ['giallo', 'Giallo', '#e0a92b'], ['ardesia', 'Grigio', '#5d5f78']];
  const HEX = Object.fromEntries(COLORI.map(c => [c[0], c[2]]));
  const SCURO_SU = new Set(['arancio', 'giallo']);   // su questi colori il testo è scuro
  const ZOOM = { giorni: 30, settimane: 13, mesi: 4.5 };
  const RIGA = 34;
  const largoSx = () => matchMedia('(max-width:700px)').matches ? 210 : 530;

  // ---------- Date come numeri di giorno ----------
  const g = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);
  const iso = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const dow = n => (new Date(n * 864e5).getUTCDay() + 6) % 7;        // 0 = lunedì
  const breve = n => { const d = new Date(n * 864e5); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  let zoom = 'giorni';
  try { zoom = localStorage.getItem('gantt-zoom') || 'giorni'; } catch {}
  if (!ZOOM[zoom]) zoom = 'giorni';

  // opz: { cantiere } per un solo cantiere, altrimenti tutti i cantieri aperti
  App.cronoprogramma = async function (el, opz = {}) {
    const unico = opz.cantiere || null;
    const stato = { chiusi: new Set(), soloFasi: false };
    el.classList.add('pannello');
    el.innerHTML = `<div class="g-barra non-stampare">
        <div class="azioni"><button class="btn rosso" data-nuova>Nuova attività</button><button class="btn vuoto" data-oggi>Vai a oggi</button>
          <label class="spunta" style="min-height:0"><input type="checkbox" data-solofasi> Solo fasi principali</label></div>
        <div class="azioni"><div class="tema g-zoom" role="group" aria-label="Scala">${Object.keys(ZOOM).map(z => `<button type="button" data-zoom="${z}" aria-pressed="${z === zoom}">${z[0].toUpperCase() + z.slice(1)}</button>`).join('')}</div>
          <button class="btn vuoto" data-excel>Excel</button></div></div>
      <p class="nota g-aiuto">Trascina una barra per spostarla, tira il bordo destro per cambiarne la durata, cliccala per modificarla. Le attività collegate si spostano da sole.</p>
      <div class="g-scorri"><div class="g-vuoto nota">Caricamento…</div></div>`;
    const scorri = el.querySelector('.g-scorri');
    let attivita = [], cantieri = [];

    async function carica() {
      cantieri = unico ? [unico] : await db.lista('cantieri', { in: { stato: ['aperto', 'in preparazione', 'sospeso'] }, ordina: 'nome' });
      attivita = await db.lista('attivita', unico ? { eq: { cantiere_id: unico.id }, ordina: 'ordine,id' } : { in: { cantiere_id: cantieri.map(c => c.id) }, ordina: 'ordine,id' });
      disegna();
    }

    // ---------- Albero: fasi, sotto-fasi, date calcolate ----------
    function albero() {
      const figli = new Map();
      for (const a of attivita) { const k = a.padre_id || ('c' + a.cantiere_id); if (!figli.has(k)) figli.set(k, []); figli.get(k).push(a); }
      const righe = [];
      const visita = (lista, livello, nascosto) => {
        for (const a of lista) {
          const sotto = figli.get(a.id) || [];
          const r = { a, livello, gruppo: sotto.length > 0, nascosto };
          righe.push(r);
          visita(sotto, livello + 1, nascosto || stato.chiusi.has(a.id) || stato.soloFasi);
        }
      };
      if (unico) visita(figli.get('c' + unico.id) || [], 0, false);
      else for (const c of cantieri) {
        const r = { cantiere: c, livello: 0, gruppo: true, nascosto: false };
        righe.push(r);
        visita(figli.get('c' + c.id) || [], 1, stato.chiusi.has('c' + c.id));
      }
      // date delle fasi con sotto-attività = dalla prima all'ultima
      const calcola = r => {
        if (r.cantiere) { const fs = attivita.filter(a => a.cantiere_id === r.cantiere.id); return fs.length ? estremi(fs.map(a => intervallo(a))) : null; }
        return intervallo(r.a);
      };
      const memo = new Map();
      const intervallo = a => {
        if (memo.has(a.id)) return memo.get(a.id);
        const sotto = figli.get(a.id) || [];
        const v = sotto.length ? estremi(sotto.map(intervallo)) : { i: g(a.inizio), f: g(a.inizio) + Math.max(1, a.durata) - 1 };
        memo.set(a.id, v); return v;
      };
      const estremi = vv => ({ i: Math.min(...vv.map(v => v.i)), f: Math.max(...vv.map(v => v.f)) });
      for (const r of righe) r.dt = calcola(r);
      return righe;
    }

    function disegna() {
      const tutte = albero(), righe = tutte.filter(r => !r.nascosto);
      if (!righe.length || (unico && !attivita.length)) {
        scorri.innerHTML = `<div class="g-vuoto"><p>Nessuna attività ${unico ? 'in questo cantiere' : 'nei cantieri aperti'}.</p><p class="nota">Premi "Nuova attività" e inserisci le fasi del lavoro: ad esempio allestimento, scavi, posa, collaudo.</p></div>`;
        return;
      }
      const oggi = g(fmt.oggi()), dw = ZOOM[zoom];
      const conDate = tutte.filter(r => r.dt);
      let min = Math.min(oggi, ...conDate.map(r => r.dt.i)) - 7, max = Math.max(oggi, ...conDate.map(r => r.dt.f)) + 21;
      min -= dow(min);                                              // parto da un lunedì
      if (zoom === 'mesi') { max += 30; }
      const giorni = max - min + 1, W = Math.round(giorni * dw), H = righe.length * RIGA;
      const x = n => (n - min) * dw;

      // intestazione: mesi + settimane/giorni
      let mesi = '', sotto = '';
      for (let n = min; n <= max; n++) {
        const d = new Date(n * 864e5);
        if (d.getUTCDate() === 1 || n === min) {
          let fine = n; while (fine < max && new Date((fine + 1) * 864e5).getUTCDate() !== 1) fine++;
          mesi += `<div class="g-mese" style="left:${x(n)}px;width:${(fine - n + 1) * dw}px">${MESI[d.getUTCMonth()]} ${d.getUTCFullYear()}</div>`;
        }
        if (zoom === 'giorni') sotto += `<div class="g-giorno ${dow(n) > 4 ? 'festa' : ''} ${n === oggi ? 'oggi' : ''}" style="left:${x(n)}px;width:${dw}px">${d.getUTCDate()}</div>`;
        else if (zoom === 'settimane' && dow(n) === 0) sotto += `<div class="g-giorno" style="left:${x(n)}px;width:${7 * dw}px">${breve(n)}</div>`;
      }

      // sfondo: fine settimana, linee, oggi
      let sfondo = '';
      if (zoom !== 'mesi') for (let n = min; n <= max; n++) if (dow(n) === 5) sfondo += `<rect x="${x(n)}" y="0" width="${2 * dw}" height="${H}" class="g-weekend"/>`;
      for (let n = min; n <= max; n++) if (zoom === 'mesi' ? new Date(n * 864e5).getUTCDate() === 1 : dow(n) === 0) sfondo += `<line x1="${x(n)}" x2="${x(n)}" y1="0" y2="${H}" class="g-linea"/>`;
      righe.forEach((r, i) => { sfondo += `<line x1="0" x2="${W}" y1="${(i + 1) * RIGA}" y2="${(i + 1) * RIGA}" class="g-linea-riga"/>`; });
      sfondo += `<line x1="${x(oggi) + dw / 2}" x2="${x(oggi) + dw / 2}" y1="0" y2="${H}" class="g-oggi"/>`;

      // dipendenze (fine → inizio)
      const pos = new Map(); righe.forEach((r, i) => { if (r.a) pos.set(r.a.id, { i, r }); });
      let frecce = '';
      for (const [id, { i, r }] of pos) {
        const p = r.a.predecessore_id && pos.get(r.a.predecessore_id);
        if (!p || !r.dt || !p.r.dt) continue;
        const x1 = x(p.r.dt.f + 1), y1 = p.i * RIGA + RIGA / 2, x3 = x(r.dt.i), y2 = i * RIGA + RIGA / 2;
        const d = x3 >= x1 + 10 ? `M${x1} ${y1} H${x1 + 6} V${y2} H${x3 - 1}` : `M${x1} ${y1} H${x1 + 6} V${(p.i < i ? y2 - RIGA / 2 : y2 + RIGA / 2)} H${x3 - 10} V${y2} H${x3 - 1}`;
        frecce += `<path d="${d}" class="g-freccia" marker-end="url(#g-punta)"/>`;
      }

      // barre
      const barre = righe.map((r, i) => {
        if (!r.dt) return '';
        const col = r.cantiere ? 'ardesia' : (r.a.colore || 'blu');
        const l = x(r.dt.i), w = Math.max(dw, (r.dt.f - r.dt.i + 1) * dw), top = i * RIGA;
        const nome = r.cantiere ? r.cantiere.nome : r.a.nome;
        const av = r.a && !r.gruppo ? Math.max(0, Math.min(100, Number(r.a.avanzamento) || 0)) : null;
        const fuori = w < Math.min(220, nome.length * 7 + 24);
        const dati = r.a ? `data-id="${r.a.id}"` : `data-cantiere="${r.cantiere.id}"`;
        return `<div class="g-barra-att ${r.gruppo ? 'riepilogo' : ''} ${SCURO_SU.has(col) ? 'scura' : ''}" ${dati} style="left:${l}px;width:${w}px;top:${top + (r.gruppo ? 10 : 6)}px;--c:${HEX[col]}"
          title="${esc(nome)}: ${fmt.data(iso(r.dt.i))} – ${fmt.data(iso(r.dt.f))}${av != null ? ` – ${av}%` : ''}" tabindex="0">
          ${av ? `<i style="width:${av}%"></i>` : ''}${!r.gruppo ? `<span class="g-nome ${fuori ? 'fuori' : ''}">${esc(nome)}</span>` : ''}${!r.gruppo && r.a ? '<b class="g-maniglia" aria-hidden="true"></b>' : ''}</div>`;
      }).join('');

      // colonna a sinistra
      const sinistra = righe.map(r => {
        const nome = r.cantiere ? r.cantiere.nome : r.a.nome, chiave = r.cantiere ? 'c' + r.cantiere.id : r.a.id;
        const col = r.cantiere ? 'ardesia' : (r.a.colore || 'blu');
        const durata = r.dt ? r.dt.f - r.dt.i + 1 : null;
        const pallino = r.gruppo ? `<button class="g-apri" data-apri="${chiave}" aria-label="${stato.chiusi.has(chiave) ? 'Mostra' : 'Nascondi'} le sotto-attività" aria-expanded="${!stato.chiusi.has(chiave)}">${stato.chiusi.has(chiave) ? '▸' : '▾'}</button>` : '<span class="g-apri"></span>';
        return `<div class="g-riga ${r.gruppo ? 'gruppo' : ''} ${r.cantiere ? 'cantiere' : ''}" ${r.a ? `data-id="${r.a.id}"` : `data-cantiere="${r.cantiere.id}"`}>
          <div class="g-desc" style="padding-left:${8 + r.livello * 18}px">${pallino}<span class="g-colore" style="background:${HEX[col]}"></span><span class="g-testo">${esc(nome)}</span></div>
          <div class="num">${r.dt ? breve(r.dt.i) : ''}</div><div class="num">${r.dt ? breve(r.dt.f) : ''}</div><div class="num">${durata != null ? durata + ' g' : ''}</div>
          <div class="num">${r.a && !r.gruppo ? (Number(r.a.avanzamento) || 0) + '%' : ''}</div></div>`;
      }).join('');

      const sl = scorri.scrollLeft, st = scorri.scrollTop, primaVolta = !scorri.querySelector('.g-tela');
      scorri.innerHTML = `<div class="g-tela" style="width:${largoSx() + W}px">
        <div class="g-testa"><div class="g-testa-sx"><div>Attività</div><div class="num">Inizio</div><div class="num">Fine</div><div class="num">Durata</div><div class="num">Fatto</div></div>
          <div class="g-testa-dx" style="width:${W}px"><div class="g-fila">${mesi}</div><div class="g-fila">${sotto}</div></div></div>
        <div class="g-corpo"><div class="g-sx">${sinistra}</div>
          <div class="g-dx" style="width:${W}px;height:${H}px">
            <svg width="${W}" height="${H}" aria-hidden="true"><defs><marker id="g-punta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" class="g-punta"/></marker></defs>${sfondo}${frecce}</svg>${barre}</div></div></div>`;
      if (primaVolta) scorri.scrollLeft = Math.max(0, x(oggi) - 140); else { scorri.scrollLeft = sl; scorri.scrollTop = st; }
      scorri._x = x; scorri._dw = dw; scorri._oggi = oggi;
      scorri.style.setProperty('--sx', largoSx() + 'px');
    }

    // ---------- Comandi ----------
    el.querySelector('[data-oggi]').onclick = () => { if (scorri._x) scorri.scrollTo({ left: Math.max(0, scorri._x(scorri._oggi) - 140), behavior: 'smooth' }); };
    el.querySelector('[data-solofasi]').onchange = e => { stato.soloFasi = e.target.checked; disegna(); };
    el.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => {
      zoom = b.dataset.zoom; try { localStorage.setItem('gantt-zoom', zoom); } catch {}
      el.querySelectorAll('[data-zoom]').forEach(x => x.setAttribute('aria-pressed', x === b)); scorri.innerHTML = ''; disegna();
    });
    el.querySelector('[data-excel]').onclick = () => {
      const righe = albero();
      ui.excel(`Cronoprogramma ${unico ? unico.nome : 'cantieri'}`, [{ nome: 'Cronoprogramma', righe: righe.map(r => ({
        Cantiere: r.cantiere ? r.cantiere.nome : (unico ? unico.nome : (cantieri.find(c => c.id === r.a.cantiere_id) || {}).nome),
        Attività: '   '.repeat(r.livello) + (r.cantiere ? r.cantiere.nome : r.a.nome), Inizio: r.dt ? fmt.data(iso(r.dt.i)) : '', Fine: r.dt ? fmt.data(iso(r.dt.f)) : '',
        'Durata (giorni)': r.dt ? r.dt.f - r.dt.i + 1 : '', 'Fatto (%)': r.a && !r.gruppo ? Number(r.a.avanzamento) || 0 : '',
        'Dopo la fine di': r.a && r.a.predecessore_id ? (attivita.find(a => a.id === r.a.predecessore_id) || {}).nome || '' : '' })) }]);
    };
    el.querySelector('[data-nuova]').onclick = () => apriModulo(null);
    scorri.addEventListener('click', e => {
      const ap = e.target.closest('[data-apri]');
      if (ap) { const k = ap.dataset.apri, chiave = k.startsWith('c') ? k : Number(k); stato.chiusi.has(chiave) ? stato.chiusi.delete(chiave) : stato.chiusi.add(chiave); disegna(); return; }
      if (scorri._trascinato) return;
      const r = e.target.closest('[data-id],[data-cantiere]'); if (!r) return;
      if (r.dataset.cantiere) return ui.vai('cantiere', r.dataset.cantiere);
      apriModulo(attivita.find(a => a.id === Number(r.dataset.id)));
    });
    scorri.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const r = e.target.closest('.g-barra-att'); if (!r) return;
      if (r.dataset.cantiere) ui.vai('cantiere', r.dataset.cantiere); else apriModulo(attivita.find(a => a.id === Number(r.dataset.id)));
    });

    // ---------- Trascinamento delle barre ----------
    scorri.addEventListener('pointerdown', e => {
      const b = e.target.closest('.g-barra-att[data-id]:not(.riepilogo)'); if (!b || e.button !== 0) return;
      const a = attivita.find(x => x.id === Number(b.dataset.id)); if (!a) return;
      const allunga = !!e.target.closest('.g-maniglia'), dw = scorri._dw, x0 = e.clientX, l0 = b.offsetLeft, w0 = b.offsetWidth;
      let dg = 0; scorri._trascinato = false;
      b.setPointerCapture(e.pointerId); b.classList.add('presa');
      const muovi = ev => {
        dg = Math.round((ev.clientX - x0) / dw);
        if (Math.abs(ev.clientX - x0) > 4) scorri._trascinato = true;
        if (allunga) b.style.width = Math.max(dw, w0 + dg * dw) + 'px'; else b.style.left = (l0 + dg * dw) + 'px';
      };
      const lascia = async () => {
        b.removeEventListener('pointermove', muovi); b.removeEventListener('pointerup', lascia); b.removeEventListener('pointercancel', lascia);
        b.classList.remove('presa');
        setTimeout(() => { scorri._trascinato = false; }, 0);
        if (!scorri._trascinato || !dg) { if (scorri._trascinato) disegna(); return; }
        const nuovo = allunga ? { durata: Math.max(1, a.durata + dg) } : { inizio: iso(g(a.inizio) + dg) };
        try { await salva(a, nuovo); } catch (err) { errore(err); disegna(); }
      };
      b.addEventListener('pointermove', muovi); b.addEventListener('pointerup', lascia); b.addEventListener('pointercancel', lascia);
    });

    // Salva e sposta in avanti le attività che dipendono da questa (devono iniziare dopo la sua fine).
    async function salva(a, valori) {
      Object.assign(a, await db.aggiorna('attivita', a.id, valori));
      const spostate = [];
      const spingi = p => {
        const fine = g(p.inizio) + Math.max(1, p.durata) - 1;
        for (const s of attivita.filter(x => x.predecessore_id === p.id)) {
          if (g(s.inizio) <= fine) { s.inizio = iso(fine + 1); spostate.push(s); spingi(s); }
        }
      };
      spingi(a);
      for (const s of spostate) await db.aggiorna('attivita', s.id, { inizio: s.inizio });
      if (spostate.length) avviso(`Spostate anche ${spostate.length} ${spostate.length === 1 ? 'attività collegata' : 'attività collegate'}`);
      disegna();
    }

    function discendenti(id) { const out = new Set([id]); let cambiato = true; while (cambiato) { cambiato = false; for (const a of attivita) if (a.padre_id && out.has(a.padre_id) && !out.has(a.id)) { out.add(a.id); cambiato = true; } } return out; }

    function apriModulo(a) {
      const nuovo = !a, esclusi = a ? discendenti(a.id) : new Set();
      const altre = c => attivita.filter(x => !esclusi.has(x.id) && (!c || x.cantiere_id === c));
      const cantiereId = a ? a.cantiere_id : (unico ? unico.id : (cantieri[0] && cantieri[0].id));
      const opzAtt = c => altre(c).map(x => [String(x.id), (cantieri.length > 1 && !unico ? ((cantieri.find(k => k.id === x.cantiere_id) || {}).nome + ' › ') : '') + x.nome]);
      ui.modulo({
        titolo: nuovo ? 'Nuova attività' : a.nome, testoSalva: nuovo ? 'Aggiungi' : 'Salva',
        campi: [
          { k: 'nome', label: 'Attività', richiesto: true, largo: true, aiuto: 'es. Infissione paletti lato mare, Posa moduli campo 2' },
          ...(unico ? [] : [{ k: 'cantiere_id', label: 'Cantiere', tipo: 'select', richiesto: true, opzioni: cantieri.map(c => [String(c.id), c.nome]) }]),
          { k: 'padre_id', label: 'Fa parte della fase', tipo: 'select', opzioni: opzAtt(unico ? unico.id : null), aiuto: 'Lascia vuoto per una fase principale' },
          { k: 'predecessore_id', label: 'Inizia dopo la fine di', tipo: 'select', opzioni: opzAtt(unico ? unico.id : null) },
          { k: 'inizio', label: 'Inizio', tipo: 'data', richiesto: true },
          { k: 'durata', label: 'Durata (giorni di calendario)', tipo: 'numero', richiesto: true },
          { k: 'avanzamento', label: 'Già fatto (%)', tipo: 'numero' },
          { k: 'colore', label: 'Colore', tipo: 'select', richiesto: true, opzioni: COLORI.map(c => [c[0], c[1]]) },
          { k: 'note', label: 'Note', tipo: 'area' }
        ],
        valori: a ? { ...a, padre_id: a.padre_id ? String(a.padre_id) : '', predecessore_id: a.predecessore_id ? String(a.predecessore_id) : '', cantiere_id: String(a.cantiere_id) }
          : { inizio: fmt.oggi(), durata: 5, avanzamento: 0, colore: 'blu', cantiere_id: String(cantiereId) },
        salva: async d => {
          const v = { ...d, padre_id: d.padre_id ? Number(d.padre_id) : null, predecessore_id: d.predecessore_id ? Number(d.predecessore_id) : null,
            durata: Math.max(1, Math.round(d.durata || 1)), avanzamento: Math.max(0, Math.min(100, Math.round(d.avanzamento || 0))) };
          v.cantiere_id = unico ? unico.id : Number(d.cantiere_id || cantiereId);
          const perCantiere = x => !x || attivita.find(y => y.id === x).cantiere_id === v.cantiere_id;
          if (!perCantiere(v.padre_id) || !perCantiere(v.predecessore_id)) throw new Error('La fase e l\'attività precedente devono essere dello stesso cantiere.');
          if (nuovo) {
            v.ordine = attivita.length ? Math.max(...attivita.map(x => x.ordine || 0)) + 1 : 1;
            const r = await db.inserisci('attivita', v); attivita.push(r);
            // se dipende da un'altra, parte dopo la sua fine
            const p = r.predecessore_id && attivita.find(x => x.id === r.predecessore_id);
            if (p && g(r.inizio) <= g(p.inizio) + p.durata - 1) { Object.assign(r, await db.aggiorna('attivita', r.id, { inizio: iso(g(p.inizio) + p.durata) })); }
            avviso('Attività aggiunta'); disegna();
          } else await salva(a, v);
        },
        elimina: nuovo ? null : async () => {
          for (const x of attivita.filter(x => x.padre_id === a.id)) { await db.aggiorna('attivita', x.id, { padre_id: a.padre_id || null }); x.padre_id = a.padre_id || null; }
          for (const x of attivita.filter(x => x.predecessore_id === a.id)) { await db.aggiorna('attivita', x.id, { predecessore_id: null }); x.predecessore_id = null; }
          await db.elimina('attivita', a.id); attivita = attivita.filter(x => x.id !== a.id); disegna();
        }
      });
    }

    carica().catch(e => { scorri.innerHTML = `<p class="errore">${esc(e.message)}</p>`; });
  };

  ui.pagina('cronoprogramma', async el => {
    el.innerHTML = App.testata('Cronoprogramma') + '<p class="nota" style="margin:-10px 0 16px">Tutti i cantieri aperti e in preparazione. Clicca il nome di un cantiere per aprirlo; per lavorare su un cantiere solo usa la scheda Cronoprogramma dentro il cantiere.</p><div id="g-tutti"></div>';
    App.cronoprogramma($('#g-tutti', el));
  });
})();
