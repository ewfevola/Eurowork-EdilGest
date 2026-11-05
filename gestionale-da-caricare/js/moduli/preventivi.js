// Preventivi (offerte): testata, voci con analisi prezzi, fabbisogno risorse, stampa, ordine di cantiere.
// Il costo di ogni voce nasce dalla sua analisi (materiali, manodopera, noli, subappalti per unità di misura):
// così il preventivo produce da solo il fabbisogno di risorse, il budget del cantiere, le richieste d'acquisto e il cronoprogramma.
(function () {
  const { $, $$, esc, fmt, avviso, errore, conferma } = ui;
  const STATI = { bozza: 'nero', inviato: 'giallo', accettato: 'verde', rifiutato: 'grigio' };
  const pill = s => `<span class="stato ${STATI[s]}">${esc(s)}</span>`;
  const n = x => Number(x) || 0;
  const r2 = x => Math.round(x * 100) / 100;
  const costoVoce = v => v.risorse && v.risorse.length ? r2(v.risorse.reduce((s, r) => s + n(r.resa) * n(r.costo), 0)) : n(v.costo);

  function calcola(p, voci) {
    const lordo = voci.reduce((s, v) => s + n(v.quantita) * n(v.prezzo), 0);
    const sconto = Math.round(lordo * n(p.sconto_pct)) / 100;
    const netto = r2(lordo - sconto);
    const iva = Math.round(netto * n(p.iva_pct)) / 100;
    const costi = voci.reduce((s, v) => s + n(v.quantita) * costoVoce(v), 0);
    return { lordo, sconto, netto, iva, totale: netto + iva, costi, margine: netto - costi };
  }
  App.calcolaPreventivo = calcola;
  App.costoVoce = costoVoce;

  // Carica le voci di uno o più preventivi con le loro analisi (risorse).
  App.vociConRisorse = async function (preventiviIds) {
    if (!preventiviIds.length) return [];
    const voci = await db.lista('preventivo_voci', { in: { preventivo_id: preventiviIds }, ordina: 'preventivo_id,ordine,id' });
    const ris = voci.length ? await db.lista('voce_risorse', { in: { voce_id: voci.map(v => v.id) }, ordina: 'id' }) : [];
    for (const v of voci) v.risorse = ris.filter(r => r.voce_id === v.id);
    return voci;
  };

  ui.pagina('preventivi', async el => {
    el.innerHTML = App.testata('Offerte e preventivi') + '<div id="el-prev"></div>';
    const anno = fmt.oggi().slice(0, 4);
    ui.elenco($('#el-prev', el), {
      tabella: 'preventivi', esporta: 'Preventivi', nuovo: 'Nuova offerta',
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
        { k: 'stato', t: 'Stato', f: r => pill(r.stato) + (r.cantiere_id ? ' <span class="stato blu">ordine</span>' : ''), x: r => r.stato },
        { k: 'importo', t: 'Imponibile', num: true, f: r => fmt.euro(calcola(r, r.voci).netto), x: r => calcola(r, r.voci).netto }
      ],
      apri: r => ui.vai('preventivo', r.id)
    });
  });

  ui.pagina('preventivo', async (el, id) => {
    const p = await db.uno('preventivi', id, '*,cliente:anagrafiche(*)');
    let voci = await App.vociConRisorse([id]);
    const tolte = new Set();
    let modificato = false;
    let scheda = 'voci'; try { scheda = sessionStorage.getItem('prev-scheda') || 'voci'; } catch {}

    el.innerHTML = App.testata(`Offerta ${p.numero}`, {
      sopra: `<a href="#preventivi">Offerte</a> / ${pill(p.stato)}${p.cantiere_id ? ` / <a href="#cantiere-${p.cantiere_id}">vai al cantiere</a>` : ''}`,
      azioni: `<button class="btn vuoto" id="p-stampa">Stampa o salva PDF</button><button class="btn vuoto" id="p-duplica">Duplica</button>
        ${!p.cantiere_id && p.stato !== 'rifiutato' ? '<button class="btn vuoto" id="p-ordine">Crea ordine di cantiere</button>' : ''}
        <button class="btn testo" id="p-elimina">Elimina</button><button class="btn rosso" id="p-salva">Salva</button>`
    }) + `
      <div class="schede non-stampare" role="tablist" id="p-schede">
        <button role="tab" data-s="testa">Testata – dati generali</button><button role="tab" data-s="voci">Voci e analisi prezzi</button><button role="tab" data-s="fabb">Fabbisogno risorse</button>
      </div>
      <div class="pannello non-stampare p-scheda" data-s="testa"><form id="p-testa" class="campi quattro"></form></div>
      <div class="pannello non-stampare p-scheda" data-s="voci">
        <div class="testata" style="margin-bottom:10px"><h2>Voci dell'offerta</h2><div class="azioni"><button class="btn vuoto piccolo" id="p-incolla">Incolla da Excel</button><button class="btn piccolo" id="p-voce">Aggiungi voce</button></div></div>
        <div class="scorri"><table class="tabella voci" id="p-voci"></table></div>
        <div class="due-col" style="margin-top:8px"><div class="nota" id="p-analisi" style="padding-top:16px"></div><div class="totali-prev" id="p-totali"></div></div>
      </div>
      <div class="pannello non-stampare p-scheda" data-s="fabb" id="p-fabb"></div>
      <div class="solo-stampa" id="p-stampabile"></div>`;

    const mostraScheda = s => {
      scheda = s; try { sessionStorage.setItem('prev-scheda', s); } catch {}
      $$('#p-schede [data-s]', el).forEach(b => b.setAttribute('aria-selected', b.dataset.s === s));
      $$('.p-scheda', el).forEach(d => { d.hidden = d.dataset.s !== s; });
      if (s === 'fabb') disegnaFabbisogno();
    };
    $('#p-schede', el).onclick = e => { const b = e.target.closest('[data-s]'); if (b) mostraScheda(b.dataset.s); };

    // Testata
    const campiTesta = [
      { k: 'cliente_id', label: 'Cliente', tipo: 'rif', rif: App.RIF.cliente, largo: false },
      { k: 'data', label: 'Data', tipo: 'data', richiesto: true },
      { k: 'stato', label: 'Stato', tipo: 'select', opzioni: Object.keys(STATI), richiesto: true },
      { k: 'validita_giorni', label: 'Validità (giorni)', tipo: 'numero' },
      { k: 'oggetto', label: 'Descrizione dell\'opera' },
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
        if (['pct', 'numero'].includes(c.tipo)) { const x = ui.leggiNumero(v); if (Number.isNaN(x)) throw new Error(`"${c.label}" non è un numero valido.`); o[c.k] = x ?? 0; }
        else if (c.tipo === 'rif') o[c.k] = v ? Number(v) : null;
        else o[c.k] = c.tipo === 'data' ? (v || null) : v;
      }
      if (!o.data) throw new Error('Inserisci la data dell\'offerta.');
      return o;
    };

    // Voci
    const numIt = x => x == null || x === '' ? '' : String(x).replace('.', ',');
    function disegnaVoci() {
      const t = $('#p-voci', el);
      t.innerHTML = `<thead><tr><th style="width:90px">Codice</th><th>Descrizione</th><th style="width:60px">U.m.</th><th class="num" style="width:92px">Quantità</th><th class="num" style="width:104px">Prezzo</th><th class="num" style="width:150px">Costo unitario</th><th class="num" style="width:110px">Importo</th><th class="num" style="width:74px">Margine</th><th style="width:40px"></th></tr></thead>
        <tbody>${voci.map((v, i) => {
          const cu = costoVoce(v), ha = v.risorse && v.risorse.length, mg = n(v.prezzo) ? (n(v.prezzo) - cu) / n(v.prezzo) * 100 : null;
          return `<tr data-i="${i}">
          <td><input data-c="codice" value="${esc(v.codice)}" aria-label="Codice"></td>
          <td><textarea data-c="descrizione" aria-label="Descrizione" rows="1">${esc(v.descrizione)}</textarea></td>
          <td><input data-c="um" value="${esc(v.um)}" aria-label="Unità di misura"></td>
          <td><input data-c="quantita" value="${numIt(v.quantita)}" inputmode="decimal" style="text-align:right" aria-label="Quantità"></td>
          <td><input data-c="prezzo" value="${numIt(v.prezzo)}" inputmode="decimal" style="text-align:right" aria-label="Prezzo unitario"></td>
          <td class="cella-analisi">${ha ? `<button class="btn-analisi pieno" data-analisi="${i}" title="Apri l'analisi del prezzo">${fmt.euro(cu)}<small>${v.risorse.length} risorse</small></button>`
            : `<div class="costo-libero"><input data-c="costo" value="${numIt(v.costo)}" inputmode="decimal" style="text-align:right" aria-label="Costo unitario stimato"><button class="btn-analisi" data-analisi="${i}" title="Scomponi il costo in materiali, manodopera, noli e subappalti">Analisi</button></div>`}</td>
          <td class="num" data-importo>${fmt.euro(n(v.quantita) * n(v.prezzo))}</td>
          <td class="num ${mg != null && mg < 0 ? 'negativo' : ''}" data-margine>${mg == null || !cu ? '' : fmt.pct(mg)}</td>
          <td><button class="btn testo piccolo" data-togli="${i}" aria-label="Togli voce">✕</button></td></tr>`;
        }).join('') || '<tr><td colspan="9" class="vuota">Nessuna voce. Premi "Aggiungi voce" o incolla le righe da Excel.</td></tr>'}</tbody>`;
      aggiornaTotali();
    }
    $('#p-voci', el).addEventListener('input', e => {
      const inp = e.target.closest('[data-c]'); if (!inp) return;
      const tr = inp.closest('tr'), i = Number(tr.dataset.i), c = inp.dataset.c;
      voci[i][c] = ['quantita', 'prezzo', 'costo'].includes(c) ? (ui.leggiNumero(inp.value) ?? 0) : inp.value;
      if (Number.isNaN(voci[i][c])) voci[i][c] = 0;
      const v = voci[i], cu = costoVoce(v);
      tr.querySelector('[data-importo]').textContent = fmt.euro(n(v.quantita) * n(v.prezzo));
      tr.querySelector('[data-margine]').textContent = n(v.prezzo) && cu ? fmt.pct((n(v.prezzo) - cu) / n(v.prezzo) * 100) : '';
      modificato = true; aggiornaTotali();
    });
    $('#p-voci', el).addEventListener('click', e => {
      const a = e.target.closest('[data-analisi]'); if (a) return analisi(Number(a.dataset.analisi));
      const b = e.target.closest('[data-togli]'); if (!b) return;
      const [v] = voci.splice(Number(b.dataset.togli), 1); if (v.id) tolte.add(v.id);
      modificato = true; disegnaVoci();
    });
    $('#p-voce', el).onclick = () => { voci.push({ codice: '', descrizione: '', um: 'm', quantita: 1, prezzo: 0, costo: 0, risorse: [] }); modificato = true; disegnaVoci(); $$('#p-voci textarea', el).pop().focus(); };
    $('#p-incolla', el).onclick = () => {
      const w = ui.finestra(`<h2>Incolla voci da Excel</h2><p class="nota" style="margin-bottom:10px">Copia da Excel le righe con queste colonne, nell'ordine: <b>codice, descrizione, unità di misura, quantità, prezzo</b> (il costo è facoltativo, come sesta colonna). Funziona anche con le voci del prezzario regionale.</p>
        <textarea id="p-testo" rows="10" style="font-family:monospace"></textarea><div class="azioni"><button class="btn vuoto" data-no>Annulla</button><button class="btn rosso" data-si>Aggiungi voci</button></div>`);
      w.el.querySelector('[data-no]').onclick = w.chiudi;
      w.el.querySelector('[data-si]').onclick = () => {
        const righe = w.el.querySelector('#p-testo').value.split(/\r?\n/).filter(r => r.trim());
        let k = 0;
        for (const r of righe) {
          const c = r.split('\t'); if (c.length < 2) continue;
          const q = ui.leggiNumero(c[3]), pr = ui.leggiNumero(c[4]), co = ui.leggiNumero(c[5]);
          const ok = x => Number.isNaN(x) || x == null ? 0 : x;
          voci.push({ codice: (c[0] || '').trim(), descrizione: (c[1] || '').trim(), um: (c[2] || '').trim(), quantita: ok(q), prezzo: ok(pr), costo: ok(co), risorse: [] }); k++;
        }
        w.chiudi(); modificato = true; disegnaVoci();
        avviso(k ? `${k} voci aggiunte. Ricorda di salvare.` : 'Nessuna riga riconosciuta: copia le celle direttamente da Excel.', { errore: !k });
      };
    };

    // Analisi del prezzo di una voce: le risorse che servono per UNA unità di misura.
    function analisi(i) {
      const v = voci[i];
      let righe = (v.risorse || []).map(r => ({ ...r }));
      if (!righe.length && n(v.costo)) righe = [{ categoria: 'Materiali', descrizione: '', um: '', resa: 1, costo: n(v.costo) }];
      if (!righe.length) righe = [{ categoria: 'Materiali', descrizione: '', um: '', resa: 1, costo: 0 }];
      const altre = voci.filter((x, k) => k !== i && x.risorse && x.risorse.length);
      const w = ui.finestra(`<h2>Analisi del prezzo</h2>
        <p class="nota" style="margin-bottom:12px"><b class="forte">${esc(v.codice || '')} ${esc(v.descrizione || 'Voce senza descrizione')}</b> · prezzo ${fmt.euro(v.prezzo)} al ${esc(v.um || 'pezzo')} · quantità ${fmt.num(v.quantita)}</p>
        <p class="nota" style="margin-bottom:12px">Indica cosa serve per <b>1 ${esc(v.um || 'unità')}</b>: per esempio 0,25 paletti, 1 m di nastro, 0,18 ore di operaio. Il gestionale moltiplica per la quantità e ricava il fabbisogno di tutto il lavoro.</p>
        <div class="scorri"><table class="tabella voci" id="an-t"></table></div>
        <div class="an-piede"><div><button class="btn vuoto piccolo" id="an-agg">Aggiungi risorsa</button>
          ${altre.length ? `<label class="an-copia">Copia da <select id="an-copia"><option value="">un'altra voce…</option>${altre.map(x => `<option value="${voci.indexOf(x)}">${esc((x.codice ? x.codice + ' ' : '') + (x.descrizione || '').slice(0, 50))}</option>`).join('')}</select></label>` : ''}</div>
          <div class="an-tot" id="an-tot"></div></div>
        <div class="azioni"><button class="btn vuoto" data-no>Annulla</button><button class="btn rosso" data-si>Applica alla voce</button></div>`, { chiudiFuori: false }); w.el.classList.add('larga');
      const t = w.el.querySelector('#an-t');
      const opz = cat => App.CATEGORIE_BUDGET.map(k => `<option ${k === cat ? 'selected' : ''}>${esc(k)}</option>`).join('');
      const UM = { Manodopera: 'h', 'Mezzi interni': 'h', 'Noli esterni': 'h' };
      function disegna() {
        t.innerHTML = `<thead><tr><th style="width:170px">Voce di costo</th><th>Risorsa</th><th style="width:60px">U.m.</th><th class="num" style="width:110px">Per 1 ${esc(v.um || 'unità')}</th><th class="num" style="width:110px">Costo unit.</th><th class="num" style="width:100px">Costo</th><th class="num" style="width:110px">Su tutto il lavoro</th><th style="width:36px"></th></tr></thead>
          <tbody>${righe.map((r, k) => `<tr data-k="${k}"><td><select data-c="categoria" aria-label="Voce di costo">${opz(r.categoria)}</select></td>
            <td><input data-c="descrizione" value="${esc(r.descrizione)}" placeholder="es. Paletto C120 h 1,95" aria-label="Risorsa"></td>
            <td><input data-c="um" value="${esc(r.um)}" aria-label="Unità di misura"></td>
            <td><input data-c="resa" value="${numIt(r.resa)}" inputmode="decimal" style="text-align:right" aria-label="Quantità per unità"></td>
            <td><input data-c="costo" value="${numIt(r.costo)}" inputmode="decimal" style="text-align:right" aria-label="Costo unitario"></td>
            <td class="num" data-p>${fmt.euro(n(r.resa) * n(r.costo))}</td><td class="num" data-t>${fmt.num(r2(n(r.resa) * n(v.quantita)))} ${esc(r.um)}</td>
            <td><button class="btn testo piccolo" data-via="${k}" aria-label="Togli risorsa">✕</button></td></tr>`).join('')}</tbody>`;
        totale();
      }
      function totale() {
        const cu = righe.reduce((s, r) => s + n(r.resa) * n(r.costo), 0), mg = n(v.prezzo) ? (n(v.prezzo) - cu) / n(v.prezzo) * 100 : null;
        const per = {}; for (const r of righe) per[App.bloccoDi(r.categoria).nome] = (per[App.bloccoDi(r.categoria).nome] || 0) + n(r.resa) * n(r.costo);
        w.el.querySelector('#an-tot').innerHTML = `${Object.entries(per).filter(x => x[1]).map(([k, x]) => `<span>${esc(k)} <b>${fmt.euro(x)}</b></span>`).join('')}
          <span class="forte-tot">Costo al ${esc(v.um || 'pezzo')} <b>${fmt.euro(cu)}</b></span><span class="${mg != null && mg < 0 ? 'negativo' : ''}">Margine <b>${fmt.pct(mg)}</b></span>`;
      }
      t.addEventListener('input', e => {
        const x = e.target.closest('[data-c]'); if (!x) return;
        const tr = x.closest('tr'), r = righe[Number(tr.dataset.k)], c = x.dataset.c;
        if (['resa', 'costo'].includes(c)) { const val = ui.leggiNumero(x.value); r[c] = Number.isNaN(val) || val == null ? 0 : val; } else r[c] = x.value;
        if (c === 'categoria' && !r.um && UM[r.categoria]) { r.um = UM[r.categoria]; tr.querySelector('[data-c=um]').value = r.um; }
        tr.querySelector('[data-p]').textContent = fmt.euro(n(r.resa) * n(r.costo));
        tr.querySelector('[data-t]').textContent = `${fmt.num(r2(n(r.resa) * n(v.quantita)))} ${r.um || ''}`;
        totale();
      });
      t.addEventListener('change', e => { if (e.target.matches('select')) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
      t.addEventListener('click', e => { const b = e.target.closest('[data-via]'); if (b) { righe.splice(Number(b.dataset.via), 1); disegna(); } });
      w.el.querySelector('#an-agg').onclick = () => { righe.push({ categoria: 'Manodopera', descrizione: '', um: 'h', resa: 0, costo: 0 }); disegna(); t.querySelectorAll('tbody tr:last-child input')[0].focus(); };
      const cp = w.el.querySelector('#an-copia');
      if (cp) cp.onchange = () => { const src = voci[Number(cp.value)]; if (src) { righe = src.risorse.map(({ id, voce_id, ...r }) => ({ ...r })); disegna(); } };
      w.el.querySelector('[data-no]').onclick = w.chiudi;
      w.el.querySelector('[data-si]').onclick = () => {
        v.risorse = righe.filter(r => r.descrizione.trim() || n(r.costo)).map(r => ({ ...r, descrizione: r.descrizione.trim() || r.categoria }));
        v.costo = costoVoce(v); v.risorseCambiate = true;
        modificato = true; w.chiudi(); disegnaVoci();
      };
      disegna();
    }

    function aggiornaTotali() {
      let t; try { t = calcola(leggiTesta(), voci); } catch { t = calcola(p, voci); }
      const sc = Number(formTesta.elements.sconto_pct.value.replace(',', '.')) || 0;
      $('#p-totali', el).innerHTML = `<div><span>Totale voci</span><span class="num">${fmt.euro(t.lordo)}</span></div>
        ${sc ? `<div><span>Sconto ${fmt.pct(sc)}</span><span class="num">− ${fmt.euro(t.sconto)}</span></div>` : ''}
        <div><span>Imponibile</span><span class="num">${fmt.euro(t.netto)}</span></div>
        <div><span>IVA</span><span class="num">${fmt.euro(t.iva)}</span></div>
        <div class="forte"><span>Totale</span><span class="num">${fmt.euro(t.totale)}</span></div>`;
      const senza = voci.filter(v => !(v.risorse && v.risorse.length)).length;
      $('#p-analisi', el).innerHTML = t.costi ? `Analisi dei costi (non stampata): costi previsti <b class="forte">${fmt.euro(t.costi)}</b>, margine <b style="color:${t.margine < 0 ? 'var(--t-rosso)' : 'var(--testo)'}">${fmt.euro(t.margine)}</b> (${fmt.pct(t.netto ? t.margine / t.netto * 100 : null)} dell'imponibile).${senza ? `<br>${senza} ${senza === 1 ? 'voce non ha' : 'voci non hanno'} ancora l'analisi: premi "Analisi" per scomporne il costo.` : ''}`
        : 'Premi "Analisi" su ogni voce per scomporre il costo in materiali, manodopera, noli e subappalti: il fabbisogno e il budget del cantiere si calcolano da soli.';
    }

    function disegnaFabbisogno() {
      let testa; try { testa = leggiTesta(); } catch { testa = p; }
      App.disegnaFabbisogno($('#p-fabb', el), { voci, ricavo: calcola(testa, voci).netto, titolo: `Fabbisogno ${p.numero}` });
    }

    async function salva() {
      const testa = leggiTesta();
      await db.aggiorna('preventivi', id, testa);
      for (const t of tolte) { await App.eliminaRisorse(t); await db.elimina('preventivo_voci', t); }
      tolte.clear();
      for (const [i, v] of voci.entries()) {
        const d = { preventivo_id: id, ordine: i, codice: v.codice || '', descrizione: v.descrizione || '', um: v.um || '', quantita: v.quantita || 0, prezzo: v.prezzo || 0, costo: costoVoce(v) };
        if (v.id) await db.aggiorna('preventivo_voci', v.id, d); else { const x = await db.inserisci('preventivo_voci', d); v.id = x.id; v.risorseCambiate = true; }
        if (v.risorseCambiate) {
          await App.eliminaRisorse(v.id);
          if (v.risorse && v.risorse.length) v.risorse = await db.inserisci('voce_risorse', v.risorse.map(({ id: _, voce_id, ...r }) => ({ voce_id: v.id, categoria: r.categoria, descrizione: r.descrizione, um: r.um || '', resa: n(r.resa), costo: n(r.costo) })));
          v.risorseCambiate = false;
        }
      }
      Object.assign(p, testa);
      modificato = false;
    }
    let statoIniziale = p.stato;
    $('#p-salva', el).onclick = async () => { try { await salva(); avviso('Offerta salvata'); if (p.stato !== statoIniziale) ui.pagine.preventivo(el, id); } catch (e) { errore(e); } };

    $('#p-elimina', el).onclick = async () => {
      if (!await conferma(`Eliminare l'offerta ${p.numero}?`, { si: 'Elimina', pericolo: true })) return;
      try { for (const v of voci) if (v.id) await App.eliminaRisorse(v.id); await db.elimina('preventivi', id); avviso('Offerta eliminata'); ui.vai('preventivi'); } catch (e) { errore(e); }
    };
    $('#p-duplica', el).onclick = async () => {
      try {
        await salva();
        const { id: _, numero, creato_il, creato_da, cliente, cantiere_id, ...copia } = p;
        const nuovo = await db.inserisci('preventivi', { ...copia, numero: '', data: fmt.oggi(), stato: 'bozza' });
        for (const [i, { id: vid, risorse, risorseCambiate, ...v }] of voci.entries()) {
          const nv = await db.inserisci('preventivo_voci', { ...v, preventivo_id: nuovo.id, ordine: i });
          if (risorse && risorse.length) await db.inserisci('voce_risorse', risorse.map(({ id, voce_id, ...r }) => ({ ...r, voce_id: nv.id })));
        }
        avviso(`Creata l'offerta ${nuovo.numero}`); ui.vai('preventivo', nuovo.id);
      } catch (e) { errore(e); }
    };
    const bo = $('#p-ordine', el);
    if (bo) bo.onclick = async () => {
      try { await salva(); } catch (e) { return errore(e); }
      App.creaOrdineCantiere(p, voci, calcola(p, voci));
    };

    $('#p-stampa', el).onclick = () => {
      let testa; try { testa = leggiTesta(); } catch (e) { return errore(e); }
      const t = calcola(testa, voci), cli = p.cliente;
      $('#p-stampabile', el).innerHTML = App.intestazioneStampa(`Offerta n. ${esc(p.numero)}`, `del ${fmt.data(testa.data)}`) + `
        ${cli ? `<p style="margin-left:55%"><b>Spett.le ${esc(cli.ragione_sociale)}</b><br>${esc(cli.indirizzo)}<br>${esc([cli.comune, cli.provincia].filter(Boolean).join(' '))}${cli.piva ? '<br>P.IVA ' + esc(cli.piva) : ''}</p>` : ''}
        <p style="margin:18px 0 12px"><b>Oggetto:</b> ${esc(testa.oggetto)}${testa.luogo ? ` – ${esc(testa.luogo)}` : ''}</p>
        <table class="tabella"><thead><tr><th>Codice</th><th>Descrizione</th><th>U.m.</th><th class="num">Quantità</th><th class="num">Prezzo</th><th class="num">Importo</th></tr></thead>
        <tbody>${voci.map(v => `<tr><td>${esc(v.codice)}</td><td>${esc(v.descrizione).replace(/\n/g, '<br>')}</td><td>${esc(v.um)}</td><td class="num">${fmt.num(v.quantita)}</td><td class="num">${fmt.euro(v.prezzo)}</td><td class="num">${fmt.euro(n(v.quantita) * n(v.prezzo))}</td></tr>`).join('')}</tbody></table>
        <div class="totali-prev">${$('#p-totali', el).innerHTML}</div>
        ${testa.condizioni ? `<h3 style="margin-top:20px">Condizioni</h3><p>${esc(testa.condizioni).replace(/\n/g, '<br>')}</p>` : ''}
        <p style="margin-top:12px">Offerta valida ${testa.validita_giorni || 30} giorni dalla data.</p>
        <div style="display:flex;justify-content:space-between;margin-top:48px"><span>EUROWORK s.r.l.</span><span>Per accettazione ______________________</span></div>`;
      window.print();
    };

    window.addEventListener('beforeunload', function avvisa(e) { if (!document.body.contains(el) || !$('#p-voci', el)) return window.removeEventListener('beforeunload', avvisa); if (modificato) e.preventDefault(); });
    disegnaVoci();
    mostraScheda(scheda);
  });
})();
