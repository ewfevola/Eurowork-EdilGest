// Anteprima "a riquadri": home a piastrelle, barra in alto, colore per sezione.
(function () {
  const { $, esc, fmt, avviso, errore } = ui;

  const TINTE = { home: 'ardesia', cantieri: 'blu', cantiere: 'blu', giornale: 'blu', cronoprogramma: 'blu', documenti: 'blu', presenze: 'verde', mezzi: 'verde',
    preventivi: 'arancio', preventivo: 'arancio', anagrafiche: 'teal', contabilita: 'rosso', costifissi: 'bordeaux', personale: 'bordeaux', stipendi: 'bordeaux', lavoratore: 'bordeaux', mezzo: 'verde', scadenze: 'bordeaux', utenti: 'bordeaux' };
  const NOMI = { cantieri: 'Cantieri', cantiere: 'Cantieri', giornale: 'Giornale lavori', cronoprogramma: 'Cronoprogramma', documenti: 'Documenti', presenze: 'Presenze', mezzi: 'Mezzi e attrezzature',
    preventivi: 'Preventivi', preventivo: 'Preventivi', anagrafiche: 'Clienti e fornitori', contabilita: 'Contabilità', costifissi: 'Costi fissi aziendali',
    personale: 'Anagrafica dipendenti', lavoratore: 'Anagrafica dipendenti', stipendi: 'Elaborazione dati stipendio', mezzo: 'Mezzi e attrezzature', scadenze: 'Scadenze', utenti: 'Utenti' };
  const I = {
    cantieri: '<path d="M2 20h20M5 20V9l7-5 7 5v11"/><path d="M9 20v-6h6v6"/>',
    giornale: '<path d="M5 3h11l3 3v15H5z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
    piu: '<path d="M12 5v14M5 12h14"/>',
    foto: '<rect x="3" y="6" width="18" height="14"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>',
    orologio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tabella: '<rect x="3" y="4" width="18" height="16"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    mezzo: '<path d="M2 17V9h11v8M13 12h5l3 3v2h-8"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
    revisione: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    preventivo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    rubrica: '<rect x="3" y="4" width="18" height="16"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17c.6-2 1.8-3 3.5-3s2.9 1 3.5 3M15 9h3M15 13h3"/>',
    calendario: '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/>',
    fattura_su: '<path d="M6 3h9l3 3v15H6z"/><path d="M12 17v-6M9 13l3-3 3 3"/>',
    fattura_giu: '<path d="M6 3h9l3 3v15H6z"/><path d="M12 10v6M9 13l3 3 3-3"/>',
    nota: '<rect x="3" y="6" width="18" height="13"/><path d="M3 10h18M7 15h4"/>',
    importa: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v4h16v-4"/>',
    persone: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.2 2.5 3.5 5.4"/>',
    utente: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    sede: '<path d="M4 20V10l8-6 8 6v10z"/><path d="M9 14h6M9 17h6"/>',
    gantt: '<path d="M3 5h18M3 19h18"/><path d="M5 9h8M9 13h9M7 17h6" stroke-width="3"/>',
    griglia: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'
  };
  const ico = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k] || ''}</svg>`;

  // ---------- Colore e nome della sezione aperta ----------
  function sezione() {
    const n = ui.letturaHash().nome || 'home';
    document.body.dataset.tinta = TINTE[n] || 'ardesia';
    const t = document.getElementById('t-sezione'); if (t) t.textContent = NOMI[n] || '';
  }
  addEventListener('hashchange', sezione);

  // ---------- Barra in alto: pulsante "Sezioni" ----------
  const lat = $('#laterale'), menu = $('#menu-voci');
  const bottone = document.createElement('button');
  bottone.type = 'button'; bottone.id = 't-sezioni'; bottone.className = 't-sezioni';
  bottone.setAttribute('aria-expanded', 'false'); bottone.setAttribute('aria-controls', 'menu-voci');
  bottone.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${I.griglia}</svg>Sezioni`;
  const titolo = document.createElement('span'); titolo.id = 't-sezione'; titolo.className = 't-sezione';
  lat.querySelector('.marchio').after(bottone, titolo);
  const chiudi = () => { menu.classList.remove('aperto'); bottone.setAttribute('aria-expanded', 'false'); };
  bottone.addEventListener('click', e => { e.stopPropagation(); bottone.setAttribute('aria-expanded', menu.classList.toggle('aperto')); });
  document.addEventListener('click', e => { if (!e.target.closest('#menu-voci, #t-sezioni')) chiudi(); });
  menu.addEventListener('click', e => { if (e.target.closest('a')) chiudi(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudi(); });
  sezione();

  // ---------- Home a piastrelle ----------
  const apriScheda = (pagina, chiave, scheda) => {
    try { sessionStorage.setItem('scheda-' + chiave, scheda); } catch {}
    if (location.hash === '#' + pagina) ui.pagine[pagina]($('#contenuto')); else location.hash = pagina;
  };
  const AZIONI = {
    nuovoCantiere: () => ui.modulo({ titolo: 'Nuovo cantiere', campi: App.campiCantiere(), valori: { stato: 'aperto' },
      salva: async d => { const c = await db.inserisci('cantieri', d); ui.dimentica('cantieri'); avviso('Cantiere creato'); ui.vai('cantiere', c.id); } }),
    nuovoPreventivo: async () => { try { const p = await db.inserisci('preventivi', { oggetto: '', condizioni: 'Prezzi validi per lavori eseguiti in orario diurno. Esclusi oneri non indicati. Pagamento: 60 giorni data fattura.' }); ui.vai('preventivo', p.id); } catch (e) { errore(e); } },
    importaXml: () => App.importaFattureXml('ricevuta', () => ui.pagine.home($('#contenuto'))),
    riepilogo: () => apriScheda('presenze', 'timbra,riepilogo', 'riepilogo'),
    timbra: () => apriScheda('presenze', 'timbra,riepilogo', 'timbra'),
    revisioni: () => apriScheda('mezzi', 'elenco,scadenze', 'scadenze'),
    emesse: () => apriScheda('contabilita', 'scad,emesse,ricevute,nota,conti', 'emesse'),
    ricevute: () => apriScheda('contabilita', 'scad,emesse,ricevute,nota,conti', 'ricevute'),
    primaNota: () => apriScheda('contabilita', 'scad,emesse,ricevute,nota,conti', 'nota'),
    scadenziario: () => apriScheda('contabilita', 'scad,emesse,ricevute,nota,conti', 'scad')
  };

  const tessera = (t, i) => {
    const SEM = { verde: 'tutto a posto', giallo: 'da controllare', rosso: 'da sistemare' };
    const contenuto = `${t.sem ? `<span class="sem ${t.sem}" role="img" aria-label="${SEM[t.sem]}" title="${esc(t.semTesto || SEM[t.sem])}"></span>` : ''}${t.barra != null ? `<span class="t-barra" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, t.barra))}%"></i></span>` : ''}${ico(t.ico)}${t.vivo != null || t.segnale ? `<span class="vivo">${t.vivo != null ? esc(t.vivo) : ''}${t.sotto ? `<small>${esc(t.sotto)}</small>` : ''}${t.segnale ? `<span class="segnale">${esc(t.segnale)}</span>` : ''}</span>` : ''}<span class="etichetta">${esc(t.t)}</span>`;
    const cls = `tessera ${t.d} ${t.d === 'piccolo' ? '' : t.c}`;
    return t.vai ? `<a class="${cls}" style="--i:${i}" href="#${t.vai}">${contenuto}</a>` : `<button type="button" class="${cls}" style="--i:${i}" data-azione="${t.azione}">${contenuto}</button>`;
  };

  ui.pagina('home', async el => {
    const oggi = fmt.oggi(), vuoto = () => [];
    const capo = !App.admin;
    const [timb, cantieri, giorn, scad, fatt, prev, lav, econ, att, mezzi, ass, docs, salAperti, budget] = await Promise.all([
      db.lista('v_timbrature', { eq: { giorno: oggi, annullata: false }, ordina: 'ora' }).catch(vuoto),
      db.lista('cantieri', { eq: { stato: 'aperto' }, sel: 'id,nome' }).catch(vuoto),
      db.lista('giornale', { eq: { giorno: oggi }, sel: 'cantiere_id' }).catch(vuoto),
      capo ? [] : db.lista('scadenze', { eq: { completata: false }, lte: { data_scadenza: fmt.piuGiorni(oggi, 90) }, sel: 'ambito,data_scadenza,preavviso_giorni' }).catch(vuoto),
      capo ? [] : db.lista('fatture', { eq: { pagata: false }, sel: 'tipo,scadenza,da_pagare,importo_pagato' }).catch(vuoto),
      capo ? [] : db.lista('preventivi', { eq: { stato: 'inviato' }, sel: 'id' }).catch(vuoto),
      capo ? [] : db.lista('lavoratori', { eq: { attivo: true }, sel: 'id' }).catch(vuoto),
      capo ? [] : db.lista('v_economia_cantieri', { in: { stato: ['aperto', 'sospeso'] }, ordina: 'nome' }).catch(vuoto),
      capo ? [] : db.lista('attivita', { lte: { inizio: oggi } }).catch(vuoto),
      capo ? [] : db.lista('mezzi', { neq: { stato: 'dismesso' }, sel: 'id,stato' }).catch(vuoto),
      capo ? [] : db.lista('assegnazioni_mezzi', { lte: { dal: oggi } }).catch(vuoto),
      capo ? [] : db.lista('documenti_lavoratore', { nullo: { scadenza: false }, lte: { scadenza: fmt.piuGiorni(oggi, 30) }, sel: 'lavoratore_id,tipo,scadenza' }).catch(vuoto),
      capo ? [] : db.lista('sal', { nullo: { fattura_id: true } }).catch(vuoto),
      capo ? [] : db.lista('budget', { sel: 'cantiere_id,importo' }).catch(vuoto)
    ]);
    const padri = new Set(att.map(a => a.padre_id).filter(Boolean));
    const inCorso = att.filter(a => !padri.has(a.id) && Number(a.avanzamento) < 100 && fmt.piuGiorni(a.inizio, a.durata - 1) >= oggi).length;
    const ultima = new Map(); for (const t of timb) ultima.set(t.lavoratore_id, t);
    const dentro = [...ultima.values()].filter(t => t.tipo === 'entrata').length;
    const senzaGiornale = cantieri.filter(c => !giorn.some(g => g.cantiere_id === c.id)).length;
    const urgenti = scad.filter(s => fmt.giorniTra(oggi, s.data_scadenza) <= s.preavviso_giorni);
    const scadute = scad.filter(s => s.data_scadenza < oggi).length;
    const resto = f => Math.max(0, Number(f.da_pagare) - Number(f.importo_pagato || 0));
    const daIncassare = fatt.filter(f => f.tipo === 'emessa').reduce((s, f) => s + resto(f), 0);
    const creditiScaduti = fatt.filter(f => f.tipo === 'emessa' && f.scadenza && f.scadenza < oggi).length;
    const daPagare = fatt.filter(f => f.tipo === 'ricevuta').length;
    const ritardo = att.filter(a => !padri.has(a.id) && Number(a.avanzamento) < 100 && fmt.piuGiorni(a.inizio, a.durata - 1) < oggi).length;
    const guasti = mezzi.filter(m => m.stato === 'guasto' || m.stato === 'manutenzione').length;
    const impegnati = mezzi.filter(m => ass.some(a => a.mezzo_id === m.id && (!a.al || a.al >= oggi))).length;
    const docScad = docs.filter(d => d.scadenza < oggi).length;
    const budgetDi = id => budget.filter(b => b.cantiere_id === id).reduce((s, b) => s + Number(b.importo), 0);
    const inPerdita = econ.filter(c => c.costi_totali > c.fatturato && c.fatturato > 0).length, oltreBudget = econ.filter(c => budgetDi(c.cantiere_id) && c.costi_totali > budgetDi(c.cantiere_id)).length;
    const pagScaduti = fatt.filter(f => f.tipo === 'ricevuta' && f.scadenza && f.scadenza < oggi).length;
    const oraAdesso = Number(new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: 'numeric', hour12: false }).format(new Date()));
    const euroBreve = n => n >= 1000 ? new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(n / 1000) + 'k €' : fmt.euro(n);

    const gruppi = capo ? [
      { g: 'Il mio lavoro', tessere: [
        { d: 'grande', c: 'verde', t: 'Timbra presenze', ico: 'orologio', vai: 'presenze', vivo: dentro, sotto: 'in cantiere ora' },
        { d: 'medio', c: 'blu', t: 'Giornale lavori', ico: 'giornale', vai: 'giornale', vivo: senzaGiornale || null, sotto: senzaGiornale ? 'da compilare' : '' },
        { d: 'medio', c: 'teal', t: 'Foto e documenti', ico: 'foto', vai: 'documenti' }] }
    ] : [
      { g: 'Cantieri', tessere: [
        { d: 'grande', c: 'blu', t: 'Cantieri', ico: 'cantieri', vai: 'cantieri', vivo: cantieri.length, sotto: 'aperti', sem: oltreBudget || inPerdita ? 'rosso' : 'verde', semTesto: oltreBudget || inPerdita ? `${oltreBudget} oltre il budget, ${inPerdita} con costi sopra il fatturato` : 'Tutti entro il budget', segnale: oltreBudget ? `${oltreBudget} oltre il budget` : '' },
        { d: 'medio', c: 'blu-2', t: 'Giornale lavori', ico: 'giornale', vai: 'giornale', vivo: senzaGiornale || null, sotto: senzaGiornale ? 'da compilare oggi' : 'tutti compilati', sem: !senzaGiornale ? 'verde' : oraAdesso >= 15 ? 'rosso' : 'giallo', barra: cantieri.length ? (cantieri.length - senzaGiornale) / cantieri.length * 100 : null },
        { d: 'medio', c: 'teal', t: 'Cronoprogramma', ico: 'gantt', vai: 'cronoprogramma', vivo: inCorso || null, sotto: inCorso ? 'attività in corso' : '', sem: ritardo ? 'rosso' : 'verde', semTesto: ritardo ? `${ritardo} attività in ritardo` : 'Nessun ritardo', segnale: ritardo ? `${ritardo} in ritardo` : '' },
        { d: 'piccolo', t: 'Nuovo cantiere', ico: 'piu', azione: 'nuovoCantiere' },
        { d: 'piccolo', t: 'Documenti e foto', ico: 'foto', vai: 'documenti' }] },
      { g: 'Presenze e mezzi', tessere: [
        { d: 'grande', c: 'verde', t: 'Timbra presenze', ico: 'orologio', azione: 'timbra', vivo: dentro, sotto: `in cantiere ora su ${lav.length}`, barra: lav.length ? dentro / lav.length * 100 : null, sem: 'verde', semTesto: 'Aggiornato in tempo reale' },
        { d: 'medio', c: 'verde-2', t: 'Mezzi e attrezzature', ico: 'mezzo', vai: 'mezzi', vivo: `${impegnati}/${mezzi.length}`, sotto: 'impegnati in cantiere', sem: guasti ? 'rosso' : 'verde', semTesto: guasti ? `${guasti} fermi` : 'Nessun guasto', segnale: guasti ? `${guasti} ${guasti === 1 ? 'fermo' : 'fermi'}` : '' },
        { d: 'piccolo', t: 'Riepilogo ore ed Excel', ico: 'tabella', azione: 'riepilogo' },
        { d: 'piccolo', t: 'Revisioni e assicurazioni', ico: 'revisione', azione: 'revisioni', sem: scad.some(s => s.ambito === 'mezzi' && s.data_scadenza < oggi) ? 'rosso' : scad.some(s => s.ambito === 'mezzi' && fmt.giorniTra(oggi, s.data_scadenza) <= s.preavviso_giorni) ? 'giallo' : 'verde' }] },
      { g: 'Offerte', tessere: [
        { d: 'grande', c: 'arancio', t: 'Preventivi', ico: 'preventivo', vai: 'preventivi', vivo: prev.length, sotto: 'in attesa di risposta', sem: prev.length ? 'giallo' : 'verde', semTesto: prev.length ? 'Offerte inviate in attesa: sollecita il cliente' : 'Nessuna offerta in sospeso' },
        { d: 'medio', c: 'arancio-2', t: 'Nuovo preventivo', ico: 'piu', azione: 'nuovoPreventivo' },
        { d: 'medio', c: 'teal', t: 'Clienti e fornitori', ico: 'rubrica', vai: 'anagrafiche' }] },
      { g: 'Contabilità', tessere: [
        { d: 'grande', c: 'rosso', t: 'Scadenziario pagamenti', ico: 'calendario', azione: 'scadenziario', vivo: euroBreve(daIncassare), sotto: 'da incassare', sem: creditiScaduti ? 'rosso' : 'verde', semTesto: creditiScaduti ? `${creditiScaduti} incassi scaduti` : 'Nessun incasso scaduto', segnale: creditiScaduti ? `${creditiScaduti} scadut${creditiScaduti === 1 ? 'a' : 'e'}` : '' },
        { d: 'medio', c: 'rosso-2', t: 'Fatture emesse', ico: 'fattura_su', azione: 'emesse', vivo: salAperti.length || null, sotto: salAperti.length ? 'SAL da fatturare' : '', sem: salAperti.length ? 'giallo' : 'verde' },
        { d: 'medio', c: 'rosso-2', t: 'Fatture ricevute', ico: 'fattura_giu', azione: 'ricevute', vivo: daPagare || null, sotto: daPagare ? 'da pagare' : '', sem: pagScaduti ? 'rosso' : daPagare ? 'giallo' : 'verde', semTesto: pagScaduti ? `${pagScaduti} pagamenti scaduti` : '' },
        { d: 'piccolo', t: 'Prima nota', ico: 'nota', azione: 'primaNota' },
        { d: 'piccolo', t: 'Importa fatture XML', ico: 'importa', azione: 'importaXml' }] },
      { g: 'Personale', tessere: [
        { d: 'grande', c: 'bordeaux', t: 'Anagrafica dipendenti', ico: 'persone', vai: 'personale', vivo: lav.length, sotto: 'in forza', sem: docScad ? 'rosso' : docs.length ? 'giallo' : 'verde', semTesto: `${docScad} documenti scaduti, ${docs.length - docScad} in scadenza`, segnale: docScad ? `${docScad} documenti scaduti` : '' },
        { d: 'medio', c: 'bordeaux-2', t: 'Elaborazione dati stipendio', ico: 'calendario', vai: 'stipendi' },
        { d: 'medio', c: 'bordeaux-2', t: 'Scadenze', ico: 'calendario', vai: 'scadenze', sem: scadute ? 'rosso' : urgenti.length ? 'giallo' : 'verde', vivo: urgenti.length || null, sotto: urgenti.length ? 'da sistemare' : '', segnale: scadute ? `${scadute} scadut${scadute === 1 ? 'a' : 'e'}` : '' },
        { d: 'piccolo', t: 'Costi fissi aziendali', ico: 'sede', vai: 'costifissi' },
        { d: 'piccolo', t: 'Utenti', ico: 'utente', vai: 'utenti' }] }
    ];

    const ora = Number(new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: 'numeric', hour12: false }).format(new Date()));
    const saluto = ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
    const nome = (App.profilo.nome || '').split(' ')[0];
    const cose = [];
    if (urgenti.length) cose.push(`${urgenti.length} ${urgenti.length === 1 ? 'scadenza' : 'scadenze'} da sistemare`);
    if (creditiScaduti) cose.push(`${creditiScaduti} ${creditiScaduti === 1 ? 'fattura scaduta' : 'fatture scadute'} da sollecitare`);
    if (senzaGiornale) cose.push(`${senzaGiornale} ${senzaGiornale === 1 ? 'giornale' : 'giornali'} di cantiere da compilare`);
    const frase = cose.length ? `Oggi ci sono ${cose.length > 1 ? cose.slice(0, -1).join(', ') + ' e ' + cose[cose.length - 1] : cose[0]}.` : 'Nessuna urgenza per oggi.';

    let i = 0;
    el.innerHTML = `<div class="t-saluto"><div><div class="nota">${esc(fmt.dataLunga(oggi).replace(/^./, c => c.toUpperCase()))}</div>
        <h1>${saluto}${nome ? ', ' + esc(nome) : ''}</h1><p>${esc(frase)}</p></div></div>
      <div class="lanciatore-box"><div class="lanciatore">${gruppi.map(g => `<section class="gruppo-t" aria-label="${esc(g.g)}"><h2>${esc(g.g)}</h2><div class="tessere">${g.tessere.map(t => tessera(t, i++)).join('')}</div></section>`).join('')}</div></div>
      ${capo ? '' : `<div class="t-andamento"><h2>Andamento dei cantieri</h2><div class="scorri pannello"><table class="tabella"><thead><tr><th>Cantiere</th><th>Stato</th><th class="num">Contratto</th><th class="num">Fatturato</th><th class="num">Costi</th><th class="num">Margine attuale</th><th class="num">Avanzamento</th></tr></thead><tbody>${
        econ.map(c => { const m = c.fatturato - c.costi_totali, av = c.importo_contratto ? c.fatturato / c.importo_contratto * 100 : null;
          const bu = budgetDi(c.cantiere_id), col = (bu && c.costi_totali > bu) || m < 0 ? 'rosso' : bu && c.costi_totali > bu * 0.9 ? 'giallo' : 'verde';
          return `<tr class="cliccabile" data-c="${c.cantiere_id}" tabindex="0"><td><span class="sem-p ${col}" role="img" aria-label="${col === 'rosso' ? 'da sistemare' : col === 'giallo' ? 'da controllare' : 'a posto'}"></span><b>${esc(c.nome)}</b></td><td>${App.statoCantiere(c.stato)}</td><td class="num">${fmt.euro(c.importo_contratto)}</td><td class="num">${fmt.euro(c.fatturato)}</td><td class="num">${fmt.euro(c.costi_totali)}</td><td class="num" style="${m < 0 ? 'color:var(--t-rosso);font-weight:600' : ''}">${fmt.euro(m)}</td><td class="num">${fmt.pct(av)}</td></tr>`; }).join('')
        || '<tr><td class="vuota" colspan="7">Nessun cantiere aperto.</td></tr>'}</tbody></table></div></div>`}`;
    el.querySelectorAll('[data-azione]').forEach(b => b.onclick = () => AZIONI[b.dataset.azione]());
    const tab = el.querySelector('.t-andamento table');
    if (tab) tab.addEventListener('click', e => { const tr = e.target.closest('[data-c]'); if (tr) ui.vai('cantiere', tr.dataset.c); });
  });
})();
