// Contabilità gestionale: fatture emesse e ricevute, scadenziario, prima nota, conti.
(function () {
  const { $, esc, fmt, avviso, errore } = ui;

  function statoFattura(f) {
    if (f.pagata) return `<span class="stato verde">${f.tipo === 'emessa' ? 'incassata' : 'pagata'}</span>`;
    const s = App.statoScadenza(f.scadenza, 15);
    if (!f.scadenza) return '<span class="stato grigio">aperta</span>';
    return `<span class="stato ${s.classe === 'verde' ? 'grigio' : s.classe}">${s.classe === 'verde' ? 'aperta' : esc(s.testo)}</span>`;
  }

  function campiFattura(tipo) {
    return [
      { k: 'numero', label: 'Numero', richiesto: true },
      { k: 'data', label: 'Data', tipo: 'data', richiesto: true },
      { k: 'anagrafica_id', label: tipo === 'emessa' ? 'Cliente' : 'Fornitore', tipo: 'rif', rif: tipo === 'emessa' ? App.RIF.cliente : App.RIF.fornitore, richiesto: true },
      { k: 'cantiere_id', label: 'Cantiere', tipo: 'rif', rif: App.RIF.cantiere },
      { k: 'descrizione', label: tipo === 'emessa' ? 'Descrizione (es. SAL n. 2)' : 'Descrizione', largo: true },
      ...(tipo === 'ricevuta' ? [{ k: 'categoria', label: 'Voce di costo', tipo: 'select', opzioni: App.CATEGORIE_COSTO, richiesto: true }] : []),
      { k: 'imponibile', label: 'Imponibile', tipo: 'euro', richiesto: true },
      { k: 'iva_pct', label: 'Aliquota IVA', tipo: 'pct' },
      { k: 'regime', label: 'Regime IVA', tipo: 'select', richiesto: true, opzioni: [['ordinario', 'Ordinario'], ['split payment', 'Split payment (enti pubblici)'], ['reverse charge', 'Reverse charge'], ['esente', 'Esente / non imponibile']] },
      { k: 'scadenza', label: 'Scadenza pagamento', tipo: 'data' },
      { k: 'pagata', label: tipo === 'emessa' ? 'Già incassata' : 'Già pagata', tipo: 'bool', aiuto: 'Per scriverlo anche in prima nota usa il pulsante nell\'elenco.' },
      { k: 'data_pagamento', label: tipo === 'emessa' ? 'Data incasso' : 'Data pagamento', tipo: 'data', mostraSe: d => d.pagata },
      { k: 'note', label: 'Note', tipo: 'area' }
    ];
  }

  // Elenco di fatture, usato in Contabilità e nella scheda del cantiere.
  App.elencoFatture = function (el, tipo, fissi = {}, opz = {}) {
    const oggi = fmt.oggi(), anno = Number(oggi.slice(0, 4));
    const conElenco = ui.elenco(el, {
      tabella: 'fatture', esporta: tipo === 'emessa' ? 'Fatture emesse' : 'Fatture ricevute',
      nuovo: tipo === 'emessa' ? 'Registra fattura emessa' : 'Registra fattura ricevuta',
      q: { sel: '*,anagrafica:anagrafiche(ragione_sociale),cantiere:cantieri(nome)', eq: { tipo, ...fissi }, ...(opz.senzaCantiere ? { nullo: { cantiere_id: true } } : {}) }, ordina: 'data.desc,numero.desc',
      fissi: { tipo, ...fissi },
      cerca: ['numero', 'descrizione'],
      filtri: [
        { k: 'stato', label: 'Stato', opzioni: [['', 'Tutte'], ['aperte', tipo === 'emessa' ? 'Da incassare' : 'Da pagare'], ['scadute', 'Scadute'], ['pagate', tipo === 'emessa' ? 'Incassate' : 'Pagate']],
          applica: (q, v) => { if (v === 'aperte') q.eq.pagata = false; if (v === 'pagate') q.eq.pagata = true; if (v === 'scadute') { q.eq.pagata = false; q.lt = { scadenza: oggi }; } } },
        ...(fissi.cantiere_id ? [] : [{ k: 'anno', label: 'Anno', predef: String(anno), opzioni: [['', 'Tutti'], ...[0, 1, 2].map(i => [String(anno - i), String(anno - i)])],
          applica: (q, v) => { q.gte = { ...(q.gte || {}), data: `${v}-01-01` }; q.lte = { ...(q.lte || {}), data: `${v}-12-31` }; } }])
      ],
      campi: campiFattura(tipo).filter(c => !(c.k in fissi)),
      predefiniti: () => ({ data: oggi, iva_pct: 22, regime: 'ordinario', categoria: 'Materiali', scadenza: fmt.piuGiorni(oggi, 30) }),
      titoloModifica: r => `Fattura ${r.numero}`,
      colonne: [
        { k: 'numero', t: 'Numero', f: r => `<b>${esc(r.numero)}</b>` },
        { k: 'data', t: 'Data', f: r => fmt.data(r.data) },
        { k: 'anagrafica', t: tipo === 'emessa' ? 'Cliente' : 'Fornitore', f: r => esc(r.anagrafica ? r.anagrafica.ragione_sociale : '') },
        ...(fissi.cantiere_id ? [] : [{ k: 'cantiere', t: 'Cantiere', f: r => esc(r.cantiere ? r.cantiere.nome : '') }]),
        { k: 'descrizione', t: 'Descrizione' },
        { k: 'imponibile', t: 'Imponibile', num: true, f: r => fmt.euro(r.imponibile), x: r => Number(r.imponibile) },
        { k: 'totale', t: 'Totale', num: true, f: r => fmt.euro(r.totale), x: r => Number(r.totale) },
        { k: 'scadenza', t: 'Scadenza', f: r => fmt.data(r.scadenza) },
        { k: 'stato', t: 'Stato', f: statoFattura, x: r => r.pagata ? 'pagata' : 'aperta' },
        { k: 'az', t: '', f: r => r.pagata ? '' : `<button class="btn vuoto piccolo" data-paga="${r.id}">${tipo === 'emessa' ? 'Incassa' : 'Paga'}</button>`, x: () => '' }
      ],
      classeRiga: r => r.pagata ? 'spento' : '',
      piede: r => `<tr><td colspan="${fissi.cantiere_id ? 4 : 5}">Totale</td><td class="num">${fmt.euro(r.reduce((s, x) => s + Number(x.imponibile), 0))}</td><td class="num">${fmt.euro(r.reduce((s, x) => s + Number(x.totale), 0))}</td><td colspan="3"></td></tr>`
    });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-paga]'); if (!b) return;
      const f = conElenco.righe.find(x => String(x.id) === b.dataset.paga);
      App.registraPagamento(f, conElenco.ricarica);
    });
    return conElenco;
  };

  // Nuova fattura ricevuta già compilata (es. da una spesa prevista); dopo(fattura) quando è salvata.
  App.nuovaFatturaRicevuta = function (valori, dopo) {
    const oggi = fmt.oggi();
    ui.modulo({
      titolo: 'Registra fattura ricevuta', campi: campiFattura('ricevuta'),
      valori: { data: oggi, iva_pct: 22, regime: 'ordinario', scadenza: fmt.piuGiorni(oggi, 30), ...valori },
      salva: async d => { const f = await db.inserisci('fatture', { ...d, tipo: 'ricevuta' }); await dopo(f); }
    });
  };

  App.registraPagamento = async function (f, dopo) {
    const conti = await ui.opzioniRif(App.RIF.conto);
    if (!conti.length) return avviso('Crea prima un conto (cassa o banca) in Contabilità → Conti.', { errore: true });
    ui.modulo({
      titolo: `${f.tipo === 'emessa' ? 'Incasso' : 'Pagamento'} fattura ${f.numero} – ${fmt.euro(f.da_pagare)}`,
      testoSalva: f.tipo === 'emessa' ? 'Registra incasso' : 'Registra pagamento',
      campi: [
        { k: 'data', label: 'Data', tipo: 'data', richiesto: true },
        { k: 'conto', label: 'Conto', tipo: 'rif', rif: App.RIF.conto, richiesto: true }
      ],
      valori: { data: fmt.oggi(), conto: conti[0].id },
      salva: async d => {
        await db.rpc('registra_pagamento', { p_fattura: f.id, p_data: d.data, p_conto: d.conto });
        avviso(f.regime === 'split payment' ? 'Registrato. Con lo split payment l\'incasso è il solo imponibile.' : 'Registrato in prima nota');
        dopo && dopo();
      }
    });
  };

  ui.pagina('contabilita', async el => {
    el.innerHTML = App.testata('Contabilità') +
      '<p class="nota" style="margin:-10px 0 18px">Registro gestionale: le fatture elettroniche si emettono con il programma di fatturazione, i registri IVA li tiene il commercialista.</p><div id="schede-cont"></div>';
    App.schede($('#schede-cont', el), [['scad', 'Scadenziario'], ['emesse', 'Fatture emesse'], ['ricevute', 'Fatture ricevute'], ['nota', 'Prima nota'], ['conti', 'Conti']], null, (k, corpo) => {
      if (k === 'emesse') App.elencoFatture(corpo, 'emessa');
      if (k === 'ricevute') App.elencoFatture(corpo, 'ricevuta');
      if (k === 'scad') scadenziario(corpo);
      if (k === 'nota') primaNota(corpo);
      if (k === 'conti') conti(corpo);
    });
  });

  async function scadenziario(el) {
    const aperte = await db.lista('fatture', { eq: { pagata: false }, sel: '*,anagrafica:anagrafiche(ragione_sociale),cantiere:cantieri(nome)', ordina: 'scadenza,data' });
    const oggi = fmt.oggi(), tra30 = fmt.piuGiorni(oggi, 30);
    const somma = (arr, t) => arr.filter(f => f.tipo === t).reduce((s, f) => s + Number(f.da_pagare), 0);
    const scad = aperte.filter(f => f.scadenza && f.scadenza < oggi), pross = aperte.filter(f => !f.scadenza || (f.scadenza >= oggi && f.scadenza <= tra30)), poi = aperte.filter(f => f.scadenza && f.scadenza > tra30);
    const tab = arr => arr.length ? `<div class="scorri"><table class="tabella"><thead><tr><th>Scadenza</th><th></th><th>Numero</th><th>Cliente / fornitore</th><th>Cantiere</th><th class="num">Importo</th><th></th></tr></thead><tbody>${arr.map(f => `<tr>
        <td>${f.scadenza ? fmt.data(f.scadenza) : '<span class="nota">senza data</span>'}</td><td><span class="stato ${f.tipo === 'emessa' ? 'verde' : 'nero'}">${f.tipo === 'emessa' ? 'da incassare' : 'da pagare'}</span></td>
        <td>${esc(f.numero)}</td><td>${esc(f.anagrafica ? f.anagrafica.ragione_sociale : '')}</td><td>${esc(f.cantiere ? f.cantiere.nome : '')}</td>
        <td class="num">${fmt.euro(f.da_pagare)}</td><td><button class="btn vuoto piccolo" data-paga="${f.id}">${f.tipo === 'emessa' ? 'Incassa' : 'Paga'}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="nota">Niente.</p>';
    el.innerHTML = `<div class="cifre">
        <div class="cifra"><b>${fmt.euro(somma(aperte, 'emessa'))}</b><span>da incassare in totale</span></div>
        <div class="cifra"><b>${fmt.euro(somma(aperte, 'ricevuta'))}</b><span>da pagare in totale</span></div>
        <div class="cifra ${scad.some(f => f.tipo === 'emessa') ? 'allarme' : ''}"><b>${fmt.euro(somma(scad, 'emessa'))}</b><span>crediti scaduti</span></div>
        <div class="cifra ${scad.some(f => f.tipo === 'ricevuta') ? 'allarme' : ''}"><b>${fmt.euro(somma(scad, 'ricevuta'))}</b><span>debiti scaduti</span></div>
      </div>
      <div class="sezione" style="margin-top:8px"><h2>Scadute</h2>${tab(scad)}</div>
      <div class="sezione"><h2>Prossimi 30 giorni</h2>${tab(pross)}</div>
      <div class="sezione"><h2>Più avanti</h2>${tab(poi)}</div>`;
    el.onclick = e => { const b = e.target.closest('[data-paga]'); if (b) App.registraPagamento(aperte.find(f => String(f.id) === b.dataset.paga), () => scadenziario(el)); };
  }

  async function primaNota(el) {
    const saldi = await db.lista('v_saldi_conti', { eq: { attivo: true }, ordina: 'nome' });
    el.innerHTML = `<div class="cifre">${saldi.map(s => `<div class="cifra ${s.saldo < 0 ? 'allarme' : ''}"><b>${fmt.euro(s.saldo)}</b><span>${esc(s.nome)}</span></div>`).join('') || '<p class="nota">Nessun conto. Crealo nella scheda Conti.</p>'}</div><div id="pn"></div>`;
    const oggi = fmt.oggi();
    ui.elenco($('#pn', el), {
      tabella: 'movimenti', esporta: 'Prima nota', nuovo: 'Nuovo movimento',
      q: { sel: '*,conto:conti(nome),cantiere:cantieri(nome),anagrafica:anagrafiche(ragione_sociale)' }, ordina: 'data.desc,id.desc',
      cerca: ['descrizione'],
      filtri: [
        { k: 'conto_id', label: 'Conto', opzioni: [['', 'Tutti'], ...saldi.map(s => [String(s.id), s.nome])] },
        { k: 'mese', label: 'Periodo', predef: oggi.slice(0, 7), opzioni: [['', 'Tutto'], ...[0, 1, 2, 3, 4, 5].map(i => { const d = new Date(oggi.slice(0, 7) + '-15'); d.setMonth(d.getMonth() - i); const m = d.toISOString().slice(0, 7); return [m, new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(d)]; })],
          applica: (q, v) => { const [a, m] = v.split('-').map(Number); q.gte = { data: v + '-01' }; q.lt = { data: (m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`) + '-01' }; } }
      ],
      campi: [
        { k: 'data', label: 'Data', tipo: 'data', richiesto: true },
        { k: 'conto_id', label: 'Conto', tipo: 'rif', rif: App.RIF.conto, richiesto: true },
        { k: 'tipo', label: 'Tipo', tipo: 'select', opzioni: [['entrata', 'Entrata'], ['uscita', 'Uscita']], richiesto: true },
        { k: 'importo', label: 'Importo', tipo: 'euro', richiesto: true },
        { k: 'descrizione', label: 'Descrizione', largo: true, richiesto: true },
        { k: 'cantiere_id', label: 'Cantiere', tipo: 'rif', rif: App.RIF.cantiere },
        { k: 'anagrafica_id', label: 'Cliente / fornitore', tipo: 'rif', rif: App.RIF.anagrafica }
      ],
      predefiniti: () => ({ data: oggi, tipo: 'uscita', conto_id: saldi[0] && saldi[0].id }),
      dopoSalva: () => primaNota(el),
      colonne: [
        { k: 'data', t: 'Data', f: r => fmt.data(r.data) },
        { k: 'conto', t: 'Conto', f: r => esc(r.conto.nome) },
        { k: 'descrizione', t: 'Descrizione', f: r => esc(r.descrizione) + (r.anagrafica ? ` <span class="nota">– ${esc(r.anagrafica.ragione_sociale)}</span>` : '') },
        { k: 'cantiere', t: 'Cantiere', f: r => esc(r.cantiere ? r.cantiere.nome : '') },
        { k: 'entrata', t: 'Entrate', num: true, f: r => r.tipo === 'entrata' ? fmt.euro(r.importo) : '', x: r => r.tipo === 'entrata' ? Number(r.importo) : '' },
        { k: 'uscita', t: 'Uscite', num: true, f: r => r.tipo === 'uscita' ? fmt.euro(r.importo) : '', x: r => r.tipo === 'uscita' ? Number(r.importo) : '' }
      ],
      piede: r => {
        const e = r.filter(x => x.tipo === 'entrata').reduce((s, x) => s + Number(x.importo), 0), u = r.filter(x => x.tipo === 'uscita').reduce((s, x) => s + Number(x.importo), 0);
        return `<tr><td colspan="4">Totale del periodo (differenza ${fmt.euro(e - u)})</td><td class="num">${fmt.euro(e)}</td><td class="num">${fmt.euro(u)}</td></tr>`;
      }
    });
  }

  function conti(el) {
    el.innerHTML = '<p class="nota" style="margin-bottom:12px">Cassa e conti bancari. Il saldo parte dal saldo iniziale alla data indicata e somma i movimenti successivi.</p><div id="el-conti"></div>';
    ui.elenco($('#el-conti', el), {
      tabella: 'conti', vista: 'v_saldi_conti', nuovo: 'Nuovo conto', ordina: 'nome',
      campi: [
        { k: 'nome', label: 'Nome', richiesto: true, aiuto: 'es. Cassa, Banca Intesa' },
        { k: 'saldo_iniziale', label: 'Saldo iniziale', tipo: 'euro' },
        { k: 'data_saldo', label: 'Alla data', tipo: 'data', richiesto: true },
        { k: 'attivo', label: 'In uso', tipo: 'bool' }
      ],
      predefiniti: () => ({ data_saldo: fmt.oggi(), attivo: true }),
      dopoSalva: () => ui.dimentica('conti'),
      colonne: [
        { k: 'nome', t: 'Conto', f: r => `<b>${esc(r.nome)}</b>` },
        { k: 'data_saldo', t: 'Saldo iniziale al', f: r => `${fmt.euro(r.saldo_iniziale)} al ${fmt.data(r.data_saldo)}` },
        { k: 'saldo', t: 'Saldo attuale', num: true, f: r => fmt.euro(r.saldo), x: r => Number(r.saldo) },
        { k: 'attivo', t: 'Stato', f: r => r.attivo ? 'in uso' : 'chiuso' }
      ]
    });
  }
})();
