// "I tuoi cantieri": elenco a sinistra, piastrelle delle azioni al centro, dettaglio a destra.
(function () {
  const { $, esc, fmt, avviso, errore } = ui;
  const elencoTabella = ui.pagine.cantieri;           // la vecchia vista resta disponibile
  const K = 'cockpit-cantiere', SCHEDE = 'panoramica,economia,resoconto,costi,fabbisogno,sal,fatturato,ore,giornale,cronoprogramma,documenti';
  const I = {
    euro: '<path d="M17 6.5A6.5 6.5 0 1 0 17 17.5"/><path d="M4 10h9M4 14h9"/>', conto: '<rect x="4" y="3" width="16" height="18"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    costi: '<path d="M4 4h16v6H4zM4 14h16v6H4z"/><path d="M8 7h2M8 17h2"/>', sal: '<path d="M4 20V4M4 20h16"/><path d="M8 16l4-5 3 3 5-7"/>',
    fattura: '<path d="M6 3h9l3 3v15H6z"/><path d="M12 10v6M9 13l3 3 3-3"/>', scad: '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    ore: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', gantt: '<path d="M3 5h18M3 19h18"/><path d="M5 9h8M9 13h9M7 17h6" stroke-width="3"/>',
    timbra: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>', giornale: '<path d="M5 3h11l3 3v15H5z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
    foto: '<rect x="3" y="6" width="18" height="14"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>', modifica: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    previsto: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="4"/>', piu: '<path d="M12 5v14M5 12h14"/>'
  };
  const ico = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;
  const apriScheda = (id, scheda) => { try { sessionStorage.setItem('scheda-' + SCHEDE, scheda); } catch {} ui.vai('cantiere', id); };

  ui.pagina('cantieri', async el => {
    let vista = 'cockpit'; try { vista = sessionStorage.getItem('cantieri-vista') || 'cockpit'; } catch {}
    const cambia = v => { try { sessionStorage.setItem('cantieri-vista', v); } catch {} ui.pagine.cantieri(el); };
    if (vista === 'tabella') {
      await elencoTabella(el);
      const t = el.querySelector('.testata .azioni'); if (t) { const b = document.createElement('button'); b.className = 'btn vuoto'; b.textContent = 'Vista a piastrelle'; b.onclick = () => cambia('cockpit'); t.prepend(b); }
      return;
    }
    const [cantieri, econ, att, salT] = await Promise.all([
      db.lista('cantieri', { sel: '*,committente:anagrafiche(ragione_sociale),responsabile:profili(nome,email)', ordina: 'codice.desc,nome' }),
      db.lista('v_economia_cantieri', {}).catch(() => []),
      db.lista('attivita', { ordina: 'inizio' }).catch(() => []),
      db.lista('sal', {}).catch(() => [])
    ]);
    let filtro = 'aperti', testo = '', scelto = null;
    try { scelto = Number(sessionStorage.getItem(K)) || null; } catch {}
    const anno = fmt.oggi().slice(0, 4);
    el.innerHTML = App.testata('I tuoi cantieri', { azioni: '<button class="btn vuoto" data-tabella>Elenco in tabella</button>' }) + `
      <div class="cockpit">
        <aside class="ck-elenco" aria-label="Elenco dei cantieri">
          <div class="ck-cerca"><label for="ck-q" class="ck-nascosto">Cerca cantiere</label><input id="ck-q" type="search" placeholder="Cerca per nome, codice, comune" autocomplete="off">
            <button class="ck-nuovo" data-nuovo aria-label="Nuovo cantiere" title="Nuovo cantiere">${ico('piu')}</button></div>
          <div class="ck-filtri" role="group" aria-label="Quali cantieri"><button data-f="aperti" aria-pressed="true">Aperti</button><button data-f="tutti" aria-pressed="false">Tutti</button><button data-f="chiuso" aria-pressed="false">Chiusi</button></div>
          <ul class="ck-lista" id="ck-lista"></ul>
          <div class="ck-conti"><div><span>Cantieri aperti</span><b>${cantieri.filter(c => c.stato === 'aperto').length}</b></div>
            <div><span>Iniziati nel ${anno}</span><b>${cantieri.filter(c => (c.data_inizio || '').startsWith(anno)).length}</b></div></div>
        </aside>
        <section class="ck-centro" aria-label="Azioni sul cantiere"><div id="ck-tessere"></div></section>
        <aside class="ck-dettaglio pannello" id="ck-dettaglio" aria-label="Dettaglio cantiere"></aside>
      </div>`;
    el.querySelector('[data-tabella]').onclick = () => cambia('tabella');

    const visibili = () => cantieri.filter(c => (filtro === 'tutti' || (filtro === 'aperti' ? c.stato !== 'chiuso' : c.stato === 'chiuso')) &&
      (!testo || `${c.codice} ${c.nome} ${c.comune}`.toLowerCase().includes(testo)));
    function lista() {
      const v = visibili();
      if (!v.some(c => c.id === scelto)) scelto = v[0] ? v[0].id : null;
      $('#ck-lista', el).innerHTML = v.map(c => `<li><button class="ck-voce" data-id="${c.id}" aria-current="${c.id === scelto}"><span class="ck-codice">${esc(c.codice || '—')}</span><span class="ck-nome">${esc(c.nome)}</span>${c.stato !== 'aperto' ? `<span class="ck-stato">${esc(c.stato)}</span>` : ''}</button></li>`).join('')
        || '<li class="ck-vuoto">Nessun cantiere trovato.</li>';
      dettaglio();
    }
    function dettaglio() {
      const c = cantieri.find(x => x.id === scelto);
      if (!c) { $('#ck-tessere', el).innerHTML = '<p class="nota">Scegli un cantiere dall\'elenco, oppure creane uno nuovo con il pulsante +.</p>'; $('#ck-dettaglio', el).innerHTML = ''; return; }
      try { sessionStorage.setItem(K, c.id); } catch {}
      const e = econ.find(x => x.cantiere_id === c.id) || {};
      const marg = (e.fatturato || 0) - (e.costi_totali || 0), av = c.importo_contratto ? (e.fatturato || 0) / c.importo_contratto * 100 : null;
      const mie = att.filter(a => a.cantiere_id === c.id), padri = new Set(mie.map(a => a.padre_id).filter(Boolean)), oggi = fmt.oggi();
      const prossime = mie.filter(a => !padri.has(a.id) && fmt.piuGiorni(a.inizio, a.durata - 1) >= oggi && Number(a.avanzamento) < 100).slice(0, 4);
      const foglie = mie.filter(a => !padri.has(a.id)), durT = foglie.reduce((s, a) => s + Number(a.durata), 0);
      const lavori = durT ? foglie.reduce((s, a) => s + Number(a.durata) * Number(a.avanzamento), 0) / durT : null, nSal = salT.filter(s => s.cantiere_id === c.id).length;
      let i = 0;
      const t = (d, c2, testo, icona, azione, extra = {}) => `<button type="button" class="tessera ${d} ${c2}" style="--i:${i++}" data-azione="${azione}">${ico(icona)}${extra.vivo != null ? `<span class="vivo">${esc(extra.vivo)}${extra.sotto ? `<small>${esc(extra.sotto)}</small>` : ''}</span>` : ''}<span class="etichetta">${esc(testo)}</span></button>`;
      $('#ck-tessere', el).innerHTML = `
        <div class="ck-gruppi">
          <div class="ck-gruppo"><h2>Economia</h2><div class="tessere">
            ${t('medio', 'rosso', 'Previsione di cantiere', 'previsto', 'economia', { vivo: lavori == null ? null : fmt.pct(lavori), sotto: 'lavori eseguiti' })}
            ${t('piccolo', 'rosso-2', 'SAL', 'sal', 'sal', { vivo: nSal || null })}${t('piccolo', 'rosso-2', 'Fabbisogno e acquisti', 'costi', 'fabbisogno')}
            ${t('piccolo', 'arancio', 'Costi e spese previste', 'costi', 'costi')}${t('piccolo', 'arancio-2', 'Resoconto', 'conto', 'resoconto')}</div></div>
          <div class="ck-gruppo"><h2>Lavori</h2><div class="tessere">
            ${t('medio', 'verde', 'Cronoprogramma', 'gantt', 'cronoprogramma', { vivo: prossime.length || null, sotto: prossime.length ? 'attività in corso o in arrivo' : '' })}
            ${t('piccolo', 'verde-2', 'Ore e presenze', 'ore', 'ore')}${t('piccolo', 'verde-2', 'Timbra presenze qui', 'timbra', 'timbra')}
            ${t('piccolo', 'teal', 'Giornale di oggi', 'giornale', 'giornaleOggi')}${t('piccolo', 'teal', 'Archivio giornale', 'giornale', 'giornale')}</div></div>
          <div class="ck-gruppo"><h2>Documenti</h2><div class="tessere">
            ${t('medio', 'blu', 'Documenti e foto', 'foto', 'documenti')}
            ${t('piccolo', 'blu-2', 'Fatture emesse', 'fattura', 'fatturato')}${t('piccolo', 'blu-2', 'Registra fattura ricevuta', 'fattura', 'fattura')}
            ${t('piccolo', '', 'Modifica dati', 'modifica', 'modifica')}${t('piccolo', '', 'Panoramica e analisi', 'sal', 'apri')}</div></div>
        </div>`;
      const riga = (k, v) => v ? `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>` : '';
      $('#ck-dettaglio', el).innerHTML = `<h2>Dettaglio cantiere</h2>
        <dl class="ck-dati">${riga('Codice', esc(c.codice))}${riga('Cantiere', `<b>${esc(c.nome)}</b>`)}${riga('Stato', App.statoCantiere(c.stato))}
          ${riga('Committente', esc(c.committente ? c.committente.ragione_sociale : ''))}${riga('Luogo', esc([c.indirizzo, c.comune].filter(Boolean).join(', ')))}
          ${riga('CIG', esc(c.cig))}${riga('CUP', esc(c.cup))}${riga('Inizio', fmt.data(c.data_inizio))}${riga('Fine prevista', fmt.data(c.data_fine_prevista))}
          ${riga('Responsabile', esc(c.responsabile ? (c.responsabile.nome || c.responsabile.email) : ''))}</dl>
        <h3>Numeri</h3>
        <dl class="ck-dati ck-numeri">${riga('Contratto', fmt.euro(c.importo_contratto))}${riga('Fatturato', fmt.euro(e.fatturato || 0))}${riga('Costi finora', fmt.euro(e.costi_totali || 0))}
          ${riga('Margine attuale', `<span style="${marg < 0 ? 'color:var(--t-rosso);font-weight:600' : ''}">${fmt.euro(marg)}</span>`)}${riga('Ore lavorate', fmt.ore(e.ore_manodopera || 0))}</dl>
        ${prossime.length ? `<h3>Prossime attività</h3><ul class="ck-prossime">${prossime.map(a => `<li><span>${esc(a.nome)}</span><span class="nota">${fmt.data(a.inizio)} · ${a.durata} g</span></li>`).join('')}</ul>` : ''}`;
      $('#ck-tessere', el).querySelectorAll('[data-azione]').forEach(b => b.onclick = () => azione(b.dataset.azione, c));
    }
    function azione(a, c) {
      if (SCHEDE.split(',').includes(a)) return apriScheda(c.id, a);
      if (a === 'apri') return apriScheda(c.id, 'panoramica');
      if (a === 'giornaleOggi') return App.apriGiornale(c.id, fmt.oggi());
      if (a === 'timbra') { try { localStorage.setItem('cantiere', c.id); sessionStorage.setItem('scheda-timbra,riepilogo', 'timbra'); } catch {} location.hash = 'presenze'; return; }
      if (a === 'fattura') return App.nuovaFatturaRicevuta({ cantiere_id: c.id, categoria: 'Materiali' }, () => { avviso('Fattura registrata sul cantiere'); ui.pagine.cantieri(el); });
      if (a === 'modifica') return ui.modulo({ titolo: 'Dati del cantiere', campi: App.campiCantiere(), valori: c,
        salva: async d => { await db.aggiorna('cantieri', c.id, d); ui.dimentica('cantieri'); avviso('Salvato'); ui.pagine.cantieri(el); } });
    }
    $('#ck-lista', el).addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; scelto = Number(b.dataset.id); lista(); });
    $('#ck-lista', el).addEventListener('dblclick', e => { const b = e.target.closest('[data-id]'); if (b) ui.vai('cantiere', b.dataset.id); });
    let attesa; $('#ck-q', el).addEventListener('input', e => { clearTimeout(attesa); attesa = setTimeout(() => { testo = e.target.value.trim().toLowerCase(); lista(); }, 150); });
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; el.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b)); lista(); });
    el.querySelector('[data-nuovo]').onclick = () => ui.modulo({ titolo: 'Nuovo cantiere', campi: App.campiCantiere(), valori: { stato: 'aperto' },
      salva: async d => { const c = await db.inserisci('cantieri', d); ui.dimentica('cantieri'); try { sessionStorage.setItem(K, c.id); } catch {} avviso('Cantiere creato'); ui.pagine.cantieri(el); } });
    lista();
  });
})();
