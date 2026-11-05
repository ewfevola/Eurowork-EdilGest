// Indicatori in tempo reale (badge nel menu, semafori nella barra in alto, aggiornamento automatico)
// e ricerca rapida "spotlight" (Ctrl+K o /): cantieri, clienti, dipendenti, mezzi, offerte, fatture, sezioni, azioni.
(function () {
  const { $, $$, esc, fmt, avviso } = ui;
  const n = x => Number(x) || 0;

  // ---------- Stato generale ----------
  async function statoVivo() {
    const oggi = fmt.oggi(), vuoto = () => [];
    if (!App.admin) {
      const [timb, cantieri, giorn] = await Promise.all([
        db.lista('v_timbrature', { eq: { giorno: oggi, annullata: false }, ordina: 'ora' }).catch(vuoto), db.lista('cantieri', { eq: { stato: 'aperto' }, sel: 'id' }).catch(vuoto), db.lista('giornale', { eq: { giorno: oggi }, sel: 'cantiere_id' }).catch(vuoto)]);
      const ult = new Map(); for (const t of timb) ult.set(t.lavoratore_id, t);
      return { dentro: [...ult.values()].filter(t => t.tipo === 'entrata').length, giornale: cantieri.filter(c => !giorn.some(g => g.cantiere_id === c.id)).length };
    }
    const [scad, docs, fatt, mezzi, timb, cantieri, giorn] = await Promise.all([
      db.lista('scadenze', { eq: { completata: false }, lte: { data_scadenza: fmt.piuGiorni(oggi, 60) }, sel: 'ambito,data_scadenza,preavviso_giorni' }).catch(vuoto),
      db.lista('documenti_lavoratore', { nullo: { scadenza: false }, lte: { scadenza: fmt.piuGiorni(oggi, 30) }, sel: 'lavoratore_id,tipo,scadenza' }).catch(vuoto),
      db.lista('fatture', { eq: { pagata: false }, sel: 'tipo,scadenza' }).catch(vuoto),
      db.lista('mezzi', { neq: { stato: 'dismesso' }, sel: 'id,stato' }).catch(vuoto),
      db.lista('v_timbrature', { eq: { giorno: oggi, annullata: false }, ordina: 'ora' }).catch(vuoto),
      db.lista('cantieri', { eq: { stato: 'aperto' }, sel: 'id' }).catch(vuoto),
      db.lista('giornale', { eq: { giorno: oggi }, sel: 'cantiere_id' }).catch(vuoto)
    ]);
    // dei documenti conta solo il più recente per persona e tipo (gli altri sono già stati sostituiti)
    const tuttiDoc = docs.length ? await db.lista('documenti_lavoratore', { in: { lavoratore_id: [...new Set(docs.map(d => d.lavoratore_id))] }, sel: 'lavoratore_id,tipo,scadenza' }).catch(vuoto) : [];
    const docAttuali = docs.filter(d => !tuttiDoc.some(x => x.lavoratore_id === d.lavoratore_id && x.tipo === d.tipo && (!x.scadenza || x.scadenza > d.scadenza)));
    const urg = s => fmt.giorniTra(oggi, s.data_scadenza) <= n(s.preavviso_giorni ?? 30);
    const ult = new Map(); for (const t of timb) ult.set(t.lavoratore_id, t);
    return {
      scadScadute: scad.filter(s => s.data_scadenza < oggi).length + docAttuali.filter(d => d.scadenza < oggi).length,
      scadArrivo: scad.filter(s => s.data_scadenza >= oggi && urg(s)).length + docAttuali.filter(d => d.scadenza >= oggi).length,
      docScaduti: docAttuali.filter(d => d.scadenza < oggi).length, docArrivo: docAttuali.filter(d => d.scadenza >= oggi).length,
      mezziScadute: scad.filter(s => s.ambito === 'mezzi' && s.data_scadenza < oggi).length,
      incassiScaduti: fatt.filter(f => f.tipo === 'emessa' && f.scadenza && f.scadenza < oggi).length,
      pagamentiScaduti: fatt.filter(f => f.tipo === 'ricevuta' && f.scadenza && f.scadenza < oggi).length,
      guasti: mezzi.filter(m => m.stato === 'guasto' || m.stato === 'manutenzione').length,
      dentro: [...ult.values()].filter(t => t.tipo === 'entrata').length,
      giornale: cantieri.filter(c => !giorn.some(g => g.cantiere_id === c.id)).length
    };
  }
  App.statoVivo = statoVivo;

  // ---------- Badge nel menu e semafori in alto ----------
  const barra = document.createElement('div'); barra.className = 'vv-barra'; barra.setAttribute('aria-live', 'polite');
  const utente = document.querySelector('.laterale .utente, .laterale .profilo, #laterale .chi') || null;
  function metti() { const lat = $('#laterale'); if (!lat || barra.isConnected) return; const s = $('#t-cerca') || $('#t-sezione'); if (s) s.after(barra); else lat.append(barra); }
  const badge = (k, num, col, titolo) => { const a = document.querySelector(`#menu-voci a[data-voce="${k}"]`); if (!a) return; let b = a.querySelector('.vv-badge'); if (!num) { if (b) b.remove(); return; } if (!b) { b = document.createElement('span'); b.className = 'vv-badge'; a.append(b); } b.className = 'vv-badge ' + col; b.textContent = num; b.title = titolo; };
  let ultimoStato = null;
  async function aggiorna() {
    if (!App.profilo) return;
    metti();
    let s; try { s = await statoVivo(); } catch { return; }
    ultimoStato = s;
    const ora = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    const luce = (col, testo, num, vai, titolo) => `<a class="vv-luce ${col}" href="#${vai}" title="${esc(titolo)}"><i aria-hidden="true"></i>${esc(testo)}<b>${num}</b></a>`;
    if (App.admin) {
      barra.innerHTML = [
        luce(s.scadScadute ? 'rosso' : s.scadArrivo ? 'giallo' : 'verde', 'Scadenze', s.scadScadute + s.scadArrivo, 'scadenze', `${s.scadScadute} scadute, ${s.scadArrivo} in arrivo`),
        luce(s.incassiScaduti ? 'rosso' : 'verde', 'Incassi', s.incassiScaduti, 'contabilita', `${s.incassiScaduti} fatture emesse scadute da incassare`),
        luce(s.guasti ? 'rosso' : 'verde', 'Mezzi', s.guasti, 'mezzi', `${s.guasti} mezzi guasti o in manutenzione`),
        luce('blu', 'In cantiere', s.dentro, 'presenze', `${s.dentro} persone in cantiere adesso`)
      ].join('') + `<span class="vv-ora" title="Si aggiorna da solo ogni minuto"><i aria-hidden="true"></i>${ora}</span>`;
      badge('scadenze', s.scadScadute + s.scadArrivo, s.scadScadute ? 'rosso' : 'giallo', `${s.scadScadute} scadute, ${s.scadArrivo} in arrivo`);
      badge('personale', s.docScaduti + s.docArrivo, s.docScaduti ? 'rosso' : 'giallo', `${s.docScaduti} documenti scaduti, ${s.docArrivo} in scadenza`);
      badge('contabilita', s.incassiScaduti + s.pagamentiScaduti, 'rosso', `${s.incassiScaduti} incassi e ${s.pagamentiScaduti} pagamenti scaduti`);
      badge('mezzi', s.guasti + s.mezziScadute, 'rosso', `${s.guasti} fermi, ${s.mezziScadute} scadenze superate`);
    } else barra.innerHTML = luce('blu', 'In cantiere', s.dentro, 'presenze', 'persone in cantiere adesso') + `<span class="vv-ora"><i aria-hidden="true"></i>${ora}</span>`;
    badge('presenze', s.dentro, 'verde', `${s.dentro} in cantiere adesso`);
    badge('giornale', s.giornale, 'giallo', `${s.giornale} giornali da compilare oggi`);
  }
  // ogni minuto: indicatori e, se si è sulla home o su "I tuoi cantieri" senza finestre aperte, anche la pagina
  setInterval(() => {
    if (document.hidden) return;
    aggiorna();
    const nome = ui.letturaHash().nome || 'home', att = document.activeElement;
    if (['home', 'cantieri'].includes(nome) && !document.querySelector('.velo, .in-modifica') && !(att && att.matches('input,select,textarea'))) {
      document.body.classList.add('vv-quieto'); Promise.resolve(ui.pagine[nome]($('#contenuto'))).finally(() => setTimeout(() => document.body.classList.remove('vv-quieto'), 400));
    }
  }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) aggiorna(); });
  addEventListener('hashchange', () => setTimeout(aggiorna, 400));
  const attendi = setInterval(() => { if (App.profilo && $('#menu-voci a')) { clearInterval(attendi); aggiorna(); } }, 300);

  // ---------- Ricerca rapida ----------
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ICO = { cantiere: 'M2 20h20M5 20V9l7-5 7 5v11', persona: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6', mezzo: 'M3 16V8h10v8M13 11h4l3 3v2h-7M6 18a2 2 0 1 0 0-.1M17 18a2 2 0 1 0 0-.1',
    azienda: 'M4 21V5l8-2v18M12 9h8v12M7 9h2M7 13h2M15 13h2', offerta: 'M6 3h9l3 3v15H6zM9 10h6M9 14h6', fattura: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6', pagina: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', azione: 'M12 5v14M5 12h14' };
  let indice = null, preso = 0;
  async function costruisci() {
    if (indice && Date.now() - preso < 60000) return indice;
    const vuoto = () => [], A = App.admin;
    const [cant, anag, lav, mezzi, prev, fatt] = await Promise.all([
      db.lista('cantieri', { sel: '*,committente:anagrafiche(ragione_sociale)' }).catch(vuoto),
      A ? db.lista('anagrafiche', { sel: 'id,ragione_sociale,tipo,comune,piva' }).catch(vuoto) : [], A ? db.lista('lavoratori', { sel: 'id,cognome,nome,qualifica,attivo,telefono' }).catch(vuoto) : [],
      A ? db.lista('mezzi', { sel: 'id,nome,targa,stato' }).catch(vuoto) : [], A ? db.lista('preventivi', { sel: 'id,numero,oggetto,stato,cliente:anagrafiche(ragione_sociale)' }).catch(vuoto) : [],
      A ? db.lista('fatture', { sel: 'id,tipo,numero,data,descrizione,anagrafica:anagrafiche(ragione_sociale)', ordina: 'data.desc', limite: 400 }).catch(vuoto) : []
    ]);
    const voci = [];
    for (const c of cant) voci.push({ tipo: 'cantiere', gruppo: 'Cantieri', titolo: c.nome, sotto: [c.codice, c.comune, c.committente && c.committente.ragione_sociale, c.stato].filter(Boolean).join(' · '), testo: `${c.nome} ${c.codice} ${c.comune} ${c.cig} ${c.committente ? c.committente.ragione_sociale : ''}`, vai: () => ui.vai('cantiere', c.id) });
    for (const a of anag) voci.push({ tipo: 'azienda', gruppo: 'Clienti e fornitori', titolo: a.ragione_sociale, sotto: [a.tipo, a.comune, a.piva && 'P.IVA ' + a.piva].filter(Boolean).join(' · '), testo: `${a.ragione_sociale} ${a.piva} ${a.comune} ${a.tipo}`, vai: () => cercaIn('anagrafiche', 'anagrafiche', a.ragione_sociale) });
    for (const l of lav) voci.push({ tipo: 'persona', gruppo: 'Dipendenti', titolo: `${l.cognome} ${l.nome}`, sotto: [l.qualifica, l.attivo ? '' : 'non più in forza', l.telefono].filter(Boolean).join(' · '), testo: `${l.cognome} ${l.nome} ${l.nome} ${l.cognome} ${l.qualifica}`, vai: () => ui.vai('lavoratore', l.id) });
    for (const m of mezzi) voci.push({ tipo: 'mezzo', gruppo: 'Mezzi', titolo: m.nome, sotto: [m.targa, m.stato].filter(Boolean).join(' · '), testo: `${m.nome} ${m.targa}`, vai: () => ui.vai('mezzo', m.id) });
    for (const p of prev) voci.push({ tipo: 'offerta', gruppo: 'Offerte', titolo: `Offerta ${p.numero}`, sotto: [p.oggetto, p.cliente && p.cliente.ragione_sociale, p.stato].filter(Boolean).join(' · '), testo: `${p.numero} ${p.oggetto} ${p.cliente ? p.cliente.ragione_sociale : ''}`, vai: () => ui.vai('preventivo', p.id) });
    for (const f of fatt) voci.push({ tipo: 'fattura', gruppo: 'Fatture', titolo: `Fattura ${f.tipo === 'emessa' ? 'emessa' : 'ricevuta'} ${f.numero}`, sotto: [fmt.data(f.data), f.anagrafica && f.anagrafica.ragione_sociale, f.descrizione].filter(Boolean).join(' · '), testo: `fattura ${f.numero} ${f.anagrafica ? f.anagrafica.ragione_sociale : ''} ${f.descrizione}`, vai: () => { try { sessionStorage.setItem('scheda-scad,emesse,ricevute,nota,conti', f.tipo === 'emessa' ? 'emesse' : 'ricevute'); } catch {} cercaIn('contabilita', 'fatture', f.numero); } });
    for (const a of [...document.querySelectorAll('#menu-voci a[data-voce]')]) voci.push({ tipo: 'pagina', gruppo: 'Sezioni', titolo: a.textContent.replace(/\d+$/, '').trim(), sotto: 'Apri la sezione', testo: a.textContent, vai: () => { location.hash = a.dataset.voce; } });
    if (A) [['Nuovo cantiere', () => ui.modulo({ titolo: 'Nuovo cantiere', campi: App.campiCantiere(), valori: { stato: 'aperto' }, salva: async d => { const c = await db.inserisci('cantieri', d); ui.dimentica('cantieri'); ui.vai('cantiere', c.id); } })],
      ['Nuova offerta', async () => { const p = await db.inserisci('preventivi', { oggetto: '', condizioni: 'Pagamento: 60 giorni data fattura.' }); ui.vai('preventivo', p.id); }],
      ['Registra fattura ricevuta', () => App.nuovaFatturaRicevuta({}, () => avviso('Fattura registrata'))], ['Importa fatture XML', () => App.importaFattureXml('ricevuta', () => {})],
      ['Timbra presenze', () => { location.hash = 'presenze'; }], ['Elaborazione dati stipendio', () => { location.hash = 'stipendi'; }], ['Scadenziario dei dipendenti', () => { try { sessionStorage.setItem('scheda-lavoratori,pagelle,scadenziario', 'scadenziario'); } catch {} location.hash = 'personale'; }],
      ['Pagelle e crescita dei dipendenti', () => { try { sessionStorage.setItem('scheda-lavoratori,pagelle,scadenziario', 'pagelle'); } catch {} location.hash = 'personale'; }]]
      .forEach(([t, f]) => voci.push({ tipo: 'azione', gruppo: 'Azioni', titolo: t, sotto: 'Azione rapida', testo: t, vai: f }));
    for (const v of voci) v.n = norm(v.testo + ' ' + v.titolo), v.nt = norm(v.titolo);
    indice = voci; preso = Date.now(); return voci;
  }
  // apre un elenco e ci scrive dentro la ricerca
  function cercaIn(pagina, tabella, testo) {
    location.hash === '#' + pagina ? ui.pagine[pagina]($('#contenuto')) : (location.hash = pagina);
    let k = 0; const t = setInterval(() => { const i = document.getElementById('cerca-' + tabella); if (i || ++k > 40) { clearInterval(t); if (i) { i.value = testo; i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); } } }, 100);
  }
  const RECENTI = 'spot-recenti';
  const recenti = () => { try { return JSON.parse(localStorage.getItem(RECENTI) || '[]'); } catch { return []; } };
  function cerca(q, voci) {
    const t = norm(q).split(/\s+/).filter(Boolean);
    if (!t.length) { const r = recenti(); return r.map(x => voci.find(v => v.gruppo === x.g && v.titolo === x.t)).filter(Boolean).map(v => ({ ...v, gruppo: 'Aperti di recente' })).concat(voci.filter(v => v.tipo === 'azione').slice(0, 5)); }
    return voci.filter(v => t.every(p => v.n.includes(p))).map(v => ({ v, s: (v.nt.startsWith(t[0]) ? 30 : 0) + (v.nt.includes(t.join(' ')) ? 20 : 0) + ({ cantiere: 9, persona: 8, azienda: 7, mezzo: 6, offerta: 5, pagina: 5, azione: 4, fattura: 2 }[v.tipo] || 0) - v.titolo.length / 100 }))
      .sort((a, b) => b.s - a.s).map(x => x.v).slice(0, 40);
  }
  function apri() {
    if ($('.spot')) return;
    const velo = document.createElement('div'); velo.className = 'velo spot-velo';
    velo.innerHTML = `<div class="spot" role="dialog" aria-modal="true" aria-label="Ricerca rapida"><div class="spot-campo"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
      <input id="spot-q" type="search" placeholder="Cerca cantiere, cliente, dipendente, mezzo, offerta, fattura…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="spot-l" aria-autocomplete="list"><kbd>Esc</kbd></div>
      <ul class="spot-lista" id="spot-l" role="listbox"><li class="spot-vuoto">Carico…</li></ul><div class="spot-piede"><span><kbd>↑</kbd><kbd>↓</kbd> per scegliere</span><span><kbd>Invio</kbd> per aprire</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> da ogni pagina</span></div></div>`;
    document.body.append(velo);
    const inp = velo.querySelector('#spot-q'), lista = velo.querySelector('#spot-l'), prima = document.activeElement;
    let ris = [], sel = 0, voci = [];
    const chiudi = () => { velo.remove(); document.removeEventListener('keydown', tasti, true); prima && prima.focus && prima.focus(); };
    const vai = i => { const v = ris[i]; if (!v) return; try { const r = recenti().filter(x => !(x.g === v.gruppo && x.t === v.titolo)); r.unshift({ g: v.gruppo === 'Aperti di recente' ? (voci.find(x => x.titolo === v.titolo) || v).gruppo : v.gruppo, t: v.titolo }); localStorage.setItem(RECENTI, JSON.stringify(r.slice(0, 6))); } catch {} chiudi(); Promise.resolve(v.vai()).catch(e => ui.errore(e)); };
    const evid = (s, q) => { const t = norm(q).split(/\s+/).filter(Boolean); if (!t.length) return esc(s); const ns = norm(s); let i = -1, len = 0; for (const p of t) { const j = ns.indexOf(p); if (j >= 0) { i = j; len = p.length; break; } } return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + len)) + '</mark>' + esc(s.slice(i + len)); };
    function disegna() {
      ris = cerca(inp.value, voci); sel = Math.min(sel, Math.max(0, ris.length - 1));
      if (!ris.length) { lista.innerHTML = `<li class="spot-vuoto">Nessun risultato per "${esc(inp.value)}".</li>`; return; }
      let g = '';
      lista.innerHTML = ris.map((v, i) => (v.gruppo !== g ? `<li class="spot-gruppo" role="presentation">${esc(g = v.gruppo)}</li>` : '') + `<li role="option" id="spot-${i}" aria-selected="${i === sel}" data-i="${i}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICO[v.tipo]}"/></svg><span><b>${evid(v.titolo, inp.value)}</b><small>${esc(v.sotto || '')}</small></span></li>`).join('');
      inp.setAttribute('aria-activedescendant', 'spot-' + sel);
      const s = lista.querySelector('[aria-selected=true]'); if (s) s.scrollIntoView({ block: 'nearest' });
    }
    function tasti(e) {
      if (e.key === 'Escape') { e.preventDefault(); chiudi(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(ris.length - 1, sel + 1); disegna(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); disegna(); }
      else if (e.key === 'Enter' && document.activeElement === inp) { e.preventDefault(); vai(sel); }
    }
    document.addEventListener('keydown', tasti, true);
    velo.addEventListener('mousedown', e => { if (e.target === velo) chiudi(); });
    lista.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) vai(Number(li.dataset.i)); });
    lista.addEventListener('mousemove', e => { const li = e.target.closest('[data-i]'); if (li && Number(li.dataset.i) !== sel) { sel = Number(li.dataset.i); lista.querySelectorAll('[aria-selected]').forEach(x => x.setAttribute('aria-selected', x === li)); } });
    let att; inp.addEventListener('input', () => { clearTimeout(att); att = setTimeout(() => { sel = 0; disegna(); }, 80); });
    inp.focus();
    costruisci().then(v => { voci = v; disegna(); }).catch(() => { lista.innerHTML = '<li class="spot-vuoto">Ricerca non disponibile.</li>'; });
  }
  App.spotlight = apri;
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); apri(); }
    else if (e.key === '/' && !e.target.closest('input,textarea,select,[contenteditable]') && !document.querySelector('.velo')) { e.preventDefault(); apri(); }
  });
  addEventListener('hashchange', () => { preso = 0; });
  // pulsante nella barra in alto
  const b = document.createElement('button'); b.type = 'button'; b.id = 't-cerca'; b.className = 't-cerca';
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><span>Cerca cantiere, cliente, dipendente…</span><kbd>Ctrl K</kbd>';
  b.setAttribute('aria-label', 'Cerca (Ctrl+K)'); b.onclick = apri;
  const tsez = $('#t-sezione'); if (tsez) tsez.after(b);
  const cm = document.querySelector('.cima-mobile');
  if (cm) { const m = document.createElement('button'); m.type = 'button'; m.className = 'cm-cerca'; m.setAttribute('aria-label', 'Cerca'); m.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>'; m.onclick = apri; const ult = cm.lastElementChild; cm.insertBefore(m, ult); }
})();
