// Preventivi: elenco, compilazione voce per voce con analisi dei costi, stampa, cantiere.
(function () {
  const { $, $$, esc, fmt, avviso, errore, conferma } = ui;
  const STATI = { bozza: 'nero', inviato: 'giallo', accettato: 'verde', rifiutato: 'grigio' };
  const pill = s => `<span class="stato ${STATI[s]}">${esc(s)}</span>`;

  function calcola(p, voci) {
    const lordo = voci.reduce((s, v) => s + (Number(v.quantita) || 0) * (Number(v.prezzo) || 0), 0);
    const sconto = Math.round(lordo * (Number(p.sconto_pct) || 0)) / 100;
    const netto = Math.round((lordo - sconto) * 100) / 100;
    const iva = Math.round(netto * (Number(p.iva_pct) || 0)) / 100;
    const costi = voci.reduce((s, v) => s + (Number(v.quantita) || 0) * (Number(v.costo) || 0), 0);
    return { lordo, sconto, netto, iva, totale: netto + iva, costi, margine: netto - costi };
  }

  ui.pagina('preventivi', async el => {
    el.innerHTML = App.testata('Preventivi') + '<div id="el-prev"></div>';
    const anno = fmt.oggi().slice(0, 4);
    ui.elenco($('#el-prev', el), {
      tabella: 'preventivi', esporta: 'Preventivi', nuovo: 'Nuovo preventivo',
      q: { sel: '*,cliente:anagrafiche(ragione_sociale),voci:preventivo_voci(quantita,prezzo)' }, ordina: 'data.desc,numero.desc',
      cerca: ['numero', 'oggetto', 'luogo'],
      filtri: [
        { k: 'stato', label: 'Stato', opzioni: [['', 'Tutti'], ...Object.keys(STATI).map(s => [s, s])] },
        { k: 'anno', label: 'Anno', predef: anno, opzioni: [['', 'Tutti'], ...[0, 1, 2].map(i => [String(anno - i), String(anno - i)])], applica: (q, v) => { q.gte = { data: v + '-01-01' }; q.lte = { data: v + '-12-31' }; } }
      ],
      nuovoAzione: async () => {
        try { const p = await db.inserisci('preventivi', { oggetto: '', condizioni: 'Prezzi validi per lavori eseguiti in orario diurno. Esclusi oneri non indicati. Pagamento: 60 giorni data fattura.' }); ui.vai('preventivo', p.id); }
        catch (e) { errore(e); }
      },
      colonne: [
        { k: 'numero', t: 'Numero', f: r => `<b>${esc(r.numero)}</b>` },
        { k: 'data', t: 'Data', f: r => fmt.data(r.data) },
        { k: 'cliente', t: 'Cliente', f: r => esc(r.cliente ? r.cliente.ragione_sociale : '') },
        { k: 'oggetto', t: 'Oggetto', f: r => esc(r.oggetto || '(senza oggetto)') },
        { k: 'stato', t: 'Stato', f: r => pill(r.stato), x: r => r.stato },
        { k: 'importo', t: 'Imponibile', num: true, f: r => fmt.euro(calcola(r, r.voci).netto), x: r => calcola(r, r.voci).netto }
      ],
      apri: r => ui.vai('preventivo', r.id)
    });
  });

  ui.pagina('preventivo', async (el, id) => {
    const p = await db.uno('preventivi', id, '*,cliente:anagrafiche(*)');
    let voci = await db.lista('preventivo_voci', { eq: { preventivo_id: id }, ordina: 'ordine,id' });
    const tolte = new Set();
    let modificato = false;

    el.innerHTML = App.testata(`Preventivo ${p.numero}`, {
      sopra: `<a href="#preventivi">Preventivi</a> / ${pill(p.stato)}${p.cantiere_id ? ` / <a href="#cantiere-${p.cantiere_id}">vai al cantiere</a>` : ''}`,
      azioni: `<button class="btn vuoto" id="p-stampa">Stampa o salva PDF</button><button class="btn vuoto" id="p-duplica">Duplica</button>
        ${p.stato === 'accettato' && !p.cantiere_id ? '<button class="btn vuoto" id="p-cantiere">Crea il cantiere</button>' : ''}
        <button class="btn testo" id="p-elimina">Elimina</button><button class="btn rosso" id="p-salva">Salva</button>`
    }) + `
      <form id="p-testa" class="campi quattro non-stampare pannello" style="margin-bottom:18px"></form>
      <div class="non-stampare pannello">
        <div class="testata" style="margin-bottom:10px"><h2>Voci</h2><div class="azioni"><button class="btn vuoto piccolo" id="p-incolla">Incolla da Excel</button><button class="btn piccolo" id="p-voce">Aggiungi voce</button></div></div>
        <div class="scorri"><table class="tabella voci" id="p-voci"></table></div>
        <div class="due-col" style="margin-top:8px"><div class="nota" id="p-analisi" style="padding-top:16px"></div><div class="totali-prev" id="p-totali"></div></div>
      </div>
      <div class="solo-stampa" id="p-stampabile"></div>`;

    // Intestazione del preventivo (campi in pagina)
    const campiTesta = [
      { k: 'cliente_id', label: 'Cliente', tipo: 'rif', rif: App.RIF.cliente, largo: false },
      { k: 'data', label: 'Data', tipo: 'data', richiesto: true },
      { k: 'stato', label: 'Stato', tipo: 'select', opzioni: Object.keys(STATI), richiesto: true },
      { k: 'validita_giorni', label: 'Validità (giorni)', tipo: 'numero' },
      { k: 'oggetto', label: 'Oggetto dei lavori' },
      { k: 'luogo', label: 'Luogo' },
      { k: 'sconto_pct', label: 'Sconto', tipo: 'pct' },
      { k: 'iva_pct', label: 'IVA', tipo: 'pct' },
      { k: 'condizioni', label: 'Condizioni (compaiono in stampa)', tipo: 'area' },
      { k: 'note', label: 'Note interne (non stampate)', tipo: 'area' }
    ];
    const formTesta = $('#p-testa', el);
    for (const c of campiTesta) {
      const w = document.createElement('div'); w.innerHTML = await ui.campoHtml(c, p[c.k]);
      const box = w.firstElementChild;
      if (['oggetto', 'luogo'].includes(c.k) || c.tipo === 'area') { box.classList.remove('largo'); box.classList.add('doppio'); }
      formTesta.append(box);
    }
    formTesta.addEventListener('input', () => { modificato = true; aggiornaTotali(); });

    const leggiTesta = () => {
      const o = {};
      for (const c of campiTesta) {
        const v = formTesta.elements[c.k].value.trim();
        if (['pct', 'numero'].includes(c.tipo)) { const n = ui.leggiNumero(v); if (Number.isNaN(n)) throw new Error(`"${c.label}" non è un numero valido.`); o[c.k] = n ?? 0; }
        else if (c.tipo === 'rif') o[c.k] = v ? Number(v) : null;
        else o[c.k] = c.tipo === 'data' ? (v || null) : v;
      }
      if (!o.data) throw new Error('Inserisci la data del preventivo.');
      return o;
    };

    function disegnaVoci() {
      const t = $('#p-voci', el);
      t.innerHTML = `<thead><tr><th style="width:90px">Codice</th><th>Descrizione</th><th style="width:64px">U.m.</th><th class="num" style="width:96px">Quantità</th><th class="num" style="width:110px">Prezzo</th><th class="num" style="width:110px">Costo</th><th class="num" style="width:110px">Importo</th><th style="width:40px"></th></tr></thead>
        <tbody>${voci.map((v, i) => `<tr data-i="${i}">
          <td><input data-c="codice" value="${esc(v.codice)}" aria-label="Codice"></td>
          <td><textarea data-c="descrizione" aria-label="Descrizione" rows="1">${esc(v.descrizione)}</textarea></td>
          <td><input data-c="um" value="${esc(v.um)}" aria-label="Unità di misura"></td>
          <td><input data-c="quantita" value="${numIt(v.quantita)}" inputmode="decimal" style="text-align:right" aria-label="Quantità"></td>
          <td><input data-c="prezzo" value="${numIt(v.prezzo)}" inputmode="decimal" style="text-align:right" aria-label="Prezzo unitario"></td>
          <td><input data-c="costo" value="${numIt(v.costo)}" inputmode="decimal" style="text-align:right" aria-label="Costo unitario stimato"></td>
          <td class="num" data-importo>${fmt.euro((Number(v.quantita) || 0) * (Number(v.prezzo) || 0))}</td>
          <td><button class="btn testo piccolo" data-togli="${i}" aria-label="Togli voce">✕</button></td></tr>`).join('') ||
          '<tr><td colspan="8" class="vuota">Nessuna voce. Premi "Aggiungi voce" o incolla le righe da Excel.</td></tr>'}</tbody>`;
      aggiornaTotali();
    }
    const numIt = n => n == null || n === '' ? '' : String(n).replace('.', ',');

    $('#p-voci', el).addEventListener('input', e => {
      const inp = e.target.closest('[data-c]'); if (!inp) return;
      const i = Number(inp.closest('tr').dataset.i), c = inp.dataset.c;
      voci[i][c] = ['quantita', 'prezzo', 'costo'].includes(c) ? (ui.leggiNumero(inp.value) ?? 0) : inp.value;
      if (Number.isNaN(voci[i][c])) voci[i][c] = 0;
      inp.closest('tr').querySelector('[data-importo]').textContent = fmt.euro((Number(voci[i].quantita) || 0) * (Number(voci[i].prezzo) || 0));
      modificato = true; aggiornaTotali();
    });
    $('#p-voci', el).addEventListener('click', e => {
      const b = e.target.closest('[data-togli]'); if (!b) return;
      const [v] = voci.splice(Number(b.dataset.togli), 1); if (v.id) tolte.add(v.id);
      modificato = true; disegnaVoci();
    });
    $('#p-voce', el).onclick = () => { voci.push({ codice: '', descrizione: '', um: 'm', quantita: 1, prezzo: 0, costo: 0 }); modificato = true; disegnaVoci(); $$('#p-voci textarea', el).pop().focus(); };
    $('#p-incolla', el).onclick = () => {
      const w = ui.finestra(`<h2>Incolla voci da Excel</h2><p class="nota" style="margin-bottom:10px">Copia da Excel le righe con queste colonne, nell'ordine: <b>codice, descrizione, unità di misura, quantità, prezzo</b> (il costo è facoltativo, come sesta colonna). Funziona anche con le voci del prezzario regionale.</p>
        <textarea id="p-testo" rows="10" style="font-family:monospace"></textarea><div class="azioni"><button class="btn vuoto" data-no>Annulla</button><button class="btn rosso" data-si>Aggiungi voci</button></div>`);
      w.el.querySelector('[data-no]').onclick = w.chiudi;
      w.el.querySelector('[data-si]').onclick = () => {
        const righe = w.el.querySelector('#p-testo').value.split(/\r?\n/).filter(r => r.trim());
        let n = 0;
        for (const r of righe) {
          const c = r.split('\t');
          if (c.length < 2) continue;
          const q = ui.leggiNumero(c[3]), pr = ui.leggiNumero(c[4]), co = ui.leggiNumero(c[5]);
          voci.push({ codice: (c[0] || '').trim(), descrizione: (c[1] || '').trim(), um: (c[2] || '').trim(), quantita: Number.isNaN(q) || q == null ? 0 : q, prezzo: Number.isNaN(pr) || pr == null ? 0 : pr, costo: Number.isNaN(co) || co == null ? 0 : co });
          n++;
        }
        w.chiudi(); modificato = true; disegnaVoci();
        avviso(n ? `${n} voci aggiunte. Ricorda di salvare.` : 'Nessuna riga riconosciuta: copia le celle direttamente da Excel.', { errore: !n });
      };
    };

    function aggiornaTotali() {
      let t; try { t = calcola(leggiTesta(), voci); } catch { t = calcola(p, voci); }
      const sc = Number(formTesta.elements.sconto_pct.value.replace(',', '.')) || 0;
      $('#p-totali', el).innerHTML = `<div><span>Totale voci</span><span class="num">${fmt.euro(t.lordo)}</span></div>
        ${sc ? `<div><span>Sconto ${fmt.pct(sc)}</span><span class="num">− ${fmt.euro(t.sconto)}</span></div>` : ''}
        <div><span>Imponibile</span><span class="num">${fmt.euro(t.netto)}</span></div>
        <div><span>IVA</span><span class="num">${fmt.euro(t.iva)}</span></div>
        <div class="forte"><span>Totale</span><span class="num">${fmt.euro(t.totale)}</span></div>`;
      $('#p-analisi', el).innerHTML = t.costi ? `Analisi dei costi (non stampata): costi stimati <b class="forte">${fmt.euro(t.costi)}</b>, margine <b style="color:${t.margine < 0 ? 'var(--rosso)' : 'var(--testo)'}">${fmt.euro(t.margine)}</b> (${fmt.pct(t.netto ? t.margine / t.netto * 100 : null)} dell'imponibile).`
        : 'Inserisci il costo unitario stimato delle voci per vedere il margine.';
    }

    async function salva() {
      const testa = leggiTesta();
      await db.aggiorna('preventivi', id, testa);
      for (const t of tolte) await db.elimina('preventivo_voci', t);
      tolte.clear();
      const nuove = [];
      for (const [i, v] of voci.entries()) {
        const d = { preventivo_id: id, ordine: i, codice: v.codice || '', descrizione: v.descrizione || '', um: v.um || '', quantita: v.quantita || 0, prezzo: v.prezzo || 0, costo: v.costo || 0 };
        if (v.id) await db.aggiorna('preventivo_voci', v.id, d); else nuove.push([i, d]);
      }
      if (nuove.length) { const ins = await db.inserisci('preventivo_voci', nuove.map(x => x[1])); ins.forEach((r, k) => { voci[nuove[k][0]].id = r.id; }); }
      Object.assign(p, testa);
      modificato = false;
    }
    $('#p-salva', el).onclick = async () => { try { await salva(); avviso('Preventivo salvato'); if (testaCambiata()) ui.pagine.preventivo(el, id); } catch (e) { errore(e); } };
    let statoIniziale = p.stato;
    const testaCambiata = () => p.stato !== statoIniziale;

    $('#p-elimina', el).onclick = async () => {
      if (!await conferma(`Eliminare il preventivo ${p.numero}?`, { si: 'Elimina', pericolo: true })) return;
      try { await db.elimina('preventivi', id); avviso('Preventivo eliminato'); ui.vai('preventivi'); } catch (e) { errore(e); }
    };
    $('#p-duplica', el).onclick = async () => {
      try {
        await salva();
        const { id: _, numero, creato_il, creato_da, cliente, cantiere_id, ...copia } = p;
        const n = await db.inserisci('preventivi', { ...copia, numero: '', data: fmt.oggi(), stato: 'bozza' });
        if (voci.length) await db.inserisci('preventivo_voci', voci.map(({ id, ...v }, i) => ({ ...v, preventivo_id: n.id, ordine: i })));
        avviso(`Creato il preventivo ${n.numero}`); ui.vai('preventivo', n.id);
      } catch (e) { errore(e); }
    };
    const bc = $('#p-cantiere', el);
    if (bc) bc.onclick = async () => {
      try {
        await salva();
        const t = calcola(p, voci);
        const c = await db.inserisci('cantieri', { nome: p.oggetto || `Lavori preventivo ${p.numero}`, comune: p.luogo || '', committente_id: p.cliente_id, importo_contratto: t.netto, stato: 'in preparazione', note: `Da preventivo ${p.numero}` });
        if (t.costi) await db.inserisci('budget', { cantiere_id: c.id, categoria: 'Altro', importo: Math.round(t.costi * 100) / 100, note: `Costi stimati nel preventivo ${p.numero}: ripartiscili per voce` });
        await db.aggiorna('preventivi', id, { cantiere_id: c.id });
        ui.dimentica('cantieri'); avviso('Cantiere creato'); ui.vai('cantiere', c.id);
      } catch (e) { errore(e); }
    };

    $('#p-stampa', el).onclick = () => {
      let testa; try { testa = leggiTesta(); } catch (e) { return errore(e); }
      const t = calcola(testa, voci), cli = p.cliente;
      $('#p-stampabile', el).innerHTML = App.intestazioneStampa(`Preventivo n. ${esc(p.numero)}`, `del ${fmt.data(testa.data)}`) + `
        ${cli ? `<p style="margin-left:55%"><b>Spett.le ${esc(cli.ragione_sociale)}</b><br>${esc(cli.indirizzo)}<br>${esc([cli.comune, cli.provincia].filter(Boolean).join(' '))}${cli.piva ? '<br>P.IVA ' + esc(cli.piva) : ''}</p>` : ''}
        <p style="margin:18px 0 12px"><b>Oggetto:</b> ${esc(testa.oggetto)}${testa.luogo ? ` – ${esc(testa.luogo)}` : ''}</p>
        <table class="tabella"><thead><tr><th>Codice</th><th>Descrizione</th><th>U.m.</th><th class="num">Quantità</th><th class="num">Prezzo</th><th class="num">Importo</th></tr></thead>
        <tbody>${voci.map(v => `<tr><td>${esc(v.codice)}</td><td>${esc(v.descrizione).replace(/\n/g, '<br>')}</td><td>${esc(v.um)}</td><td class="num">${fmt.num(v.quantita)}</td><td class="num">${fmt.euro(v.prezzo)}</td><td class="num">${fmt.euro((v.quantita || 0) * (v.prezzo || 0))}</td></tr>`).join('')}</tbody></table>
        <div class="totali-prev">${$('#p-totali', el).innerHTML}</div>
        ${testa.condizioni ? `<h3 style="margin-top:20px">Condizioni</h3><p>${esc(testa.condizioni).replace(/\n/g, '<br>')}</p>` : ''}
        <p style="margin-top:12px">Offerta valida ${testa.validita_giorni || 30} giorni dalla data.</p>
        <div style="display:flex;justify-content:space-between;margin-top:48px"><span>EUROWORK s.r.l.</span><span>Per accettazione ______________________</span></div>`;
      window.print();
    };

    window.addEventListener('beforeunload', function avvisa(e) { if (!document.body.contains(el) || !$('#p-voci', el)) return window.removeEventListener('beforeunload', avvisa); if (modificato) e.preventDefault(); });
    disegnaVoci();
  });

})();
