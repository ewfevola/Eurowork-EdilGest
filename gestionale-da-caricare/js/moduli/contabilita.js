// Contabilità gestionale: fatture emesse e ricevute, scadenziario, prima nota, conti.
(function () {
  const { $, esc, fmt, avviso, errore } = ui;

  const residuo = f => Math.max(0, Math.round((Number(f.da_pagare) - Number(f.importo_pagato || 0)) * 100) / 100);
  App.residuoFattura = residuo;
  function statoFattura(f) {
    if (f.pagata) return `<span class="stato verde">${f.tipo === 'emessa' ? 'incassata' : 'pagata'}</span>`;
    if (Number(f.importo_pagato) > 0) return `<span class="stato giallo">${f.tipo === 'emessa' ? 'incassata' : 'pagata'} in parte</span>`;
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
      ...(tipo === 'emessa' ? [
        { k: 'cig', label: 'CIG', aiuto: 'Se lo lasci vuoto si prende quello del cantiere' },
        { k: 'cup', label: 'CUP', aiuto: 'Se lo lasci vuoto si prende quello del cantiere' },
        { k: 'preventivo_id', label: 'Riferimento all\'offerta', tipo: 'rif', rif: App.RIF.preventivo, aiuto: 'Scegli l\'offerta dall\'elenco…' },
        { k: 'rif_preventivo', label: '…oppure scrivi il riferimento', aiuto: 'es. "Vs. ordine n. 45 del 10/10/2026" o un\'offerta non presente nel gestionale' }] : []),
      { k: 'descrizione', label: tipo === 'emessa' ? 'Descrizione (es. SAL n. 2)' : 'Descrizione', largo: true },
      ...(tipo === 'ricevuta' ? [{ k: 'categoria', label: 'Voce di costo', tipo: 'select', opzioni: App.CATEGORIE_COSTO, richiesto: true }] : []),
      { k: 'imponibile', label: 'Imponibile', tipo: 'euro', richiesto: true },
      { k: 'iva_pct', label: 'Aliquota IVA', tipo: 'pct' },
      { k: 'regime', label: 'Regime IVA', tipo: 'select', richiesto: true, opzioni: [['ordinario', 'Ordinario'], ['split payment', 'Split payment (enti pubblici)'], ['reverse charge', 'Reverse charge'], ['esente', 'Esente / non imponibile']] },
      { k: 'scadenza', label: 'Scadenza pagamento', tipo: 'data' },
      { k: 'metodo_pagamento', label: 'Metodo di pagamento', tipo: 'select', opzioni: App.METODI_PAGAMENTO },
      { k: 'iban', label: tipo === 'emessa' ? 'IBAN su cui ricevere il pagamento' : 'IBAN del fornitore', mostraSe: d => ['Bonifico', 'RiBa', 'Addebito SEPA (RID)', ''].includes(d.metodo_pagamento) },
      { k: 'pagata', label: tipo === 'emessa' ? 'Già incassata prima di usare il gestionale' : 'Già pagata prima di usare il gestionale', tipo: 'bool', aiuto: 'Per i pagamenti nuovi usa il pulsante nell\'elenco: così finiscono anche in prima nota.' },
      { k: 'data_pagamento', label: tipo === 'emessa' ? 'Data incasso' : 'Data pagamento', tipo: 'data', mostraSe: d => d.pagata },
      { k: 'cortesia', label: tipo === 'emessa' ? 'Fattura di cortesia: l\'elettronica non è ancora stata inviata con CGN' : 'Copia di cortesia: la fattura elettronica deve ancora arrivare', tipo: 'bool',
        aiuto: tipo === 'emessa' ? 'Toglila quando la fattura parte dallo SDI.' : 'Quando importi l\'XML, il gestionale la riconosce e la sostituisce da solo.' },
      { k: 'note', label: 'Note', tipo: 'area' }
    ];
  }
  App.RIF.preventivo = { tab: 'preventivi', q: { ordina: 'data.desc', sel: 'id,numero,oggetto,cliente_id,cantiere_id' }, etichetta: r => `${r.numero}${r.oggetto ? ' – ' + r.oggetto : ''}` };
  App.campiFattura = campiFattura;
  // CIG e CUP vuoti: si prendono dal cantiere; cantiere vuoto: si prende dall'offerta collegata
  App.completaFattura = async d => {
    const x = { ...d };
    if (x.preventivo_id && !x.cantiere_id) { const p = await db.uno('preventivi', x.preventivo_id).catch(() => null); if (p && p.cantiere_id) x.cantiere_id = p.cantiere_id; }
    if (x.cantiere_id && ('cig' in x || 'cup' in x) && (!x.cig || !x.cup)) { const c = await db.uno('cantieri', x.cantiere_id).catch(() => null); if (c) { if (!x.cig) x.cig = c.cig || ''; if (!x.cup) x.cup = c.cup || ''; } }
    return x;
  };

  // Elenco di fatture, usato in Contabilità e nella scheda del cantiere.
  App.elencoFatture = function (el, tipo, fissi = {}, opz = {}) {
    const oggi = fmt.oggi(), anno = Number(oggi.slice(0, 4));
    const conElenco = ui.elenco(el, {
      tabella: 'fatture', esporta: tipo === 'emessa' ? 'Fatture emesse' : 'Fatture ricevute',
      nuovo: tipo === 'emessa' ? 'Registra fattura emessa' : 'Registra fattura ricevuta',
      q: { sel: '*,anagrafica:anagrafiche(ragione_sociale),cantiere:cantieri(nome),preventivo:preventivi(id,numero)', eq: { tipo, ...fissi }, ...(opz.senzaCantiere ? { nullo: { cantiere_id: true } } : {}) }, ordina: 'data.desc,numero.desc',
      fissi: { tipo, ...fissi },
      cerca: ['numero', 'descrizione'],
      filtri: [
        { k: 'cortesia', label: 'Tipo', opzioni: [['', 'Tutte'], ['false', 'Elettroniche'], ['true', 'Di cortesia']] },
        { k: 'stato', label: 'Stato', opzioni: [['', 'Tutte'], ['aperte', tipo === 'emessa' ? 'Da incassare' : 'Da pagare'], ['scadute', 'Scadute'], ['pagate', tipo === 'emessa' ? 'Incassate' : 'Pagate']],
          applica: (q, v) => { if (v === 'aperte') q.eq.pagata = false; if (v === 'pagate') q.eq.pagata = true; if (v === 'scadute') { q.eq.pagata = false; q.lt = { scadenza: oggi }; } } },
        ...(fissi.cantiere_id ? [] : [{ k: 'anno', label: 'Anno', predef: String(anno), opzioni: [['', 'Tutti'], ...[0, 1, 2].map(i => [String(anno - i), String(anno - i)])],
          applica: (q, v) => { q.gte = { ...(q.gte || {}), data: `${v}-01-01` }; q.lte = { ...(q.lte || {}), data: `${v}-12-31` }; } }])
      ],
      campi: campiFattura(tipo).filter(c => !(c.k in fissi)),
      primaDiSalvare: d => App.completaFattura(d),
      predefiniti: () => ({ data: oggi, iva_pct: 22, regime: 'ordinario', categoria: 'Materiali', scadenza: fmt.piuGiorni(oggi, 30), metodo_pagamento: 'Bonifico' }),
      titoloModifica: r => `Fattura ${r.numero}`,
      colonne: [
        { k: 'numero', t: 'Numero', f: r => `<b>${esc(r.numero)}</b>${r.cortesia ? ' <span class="stato giallo" title="Copia di cortesia">cortesia</span>' : ''}`, x: r => r.numero + (r.cortesia ? ' cortesia' : '') },
        { k: 'data', t: 'Data', f: r => fmt.data(r.data) },
        { k: 'anagrafica', t: tipo === 'emessa' ? 'Cliente' : 'Fornitore', f: r => esc(r.anagrafica ? r.anagrafica.ragione_sociale : '') },
        ...(fissi.cantiere_id ? [] : [{ k: 'cantiere', t: 'Cantiere', f: r => esc(r.cantiere ? r.cantiere.nome : '') }]),
        { k: 'descrizione', t: 'Descrizione' },
        ...(tipo === 'emessa' ? [{ k: 'rif', t: 'Riferimenti', f: r => [r.preventivo ? `<a href="#preventivo-${r.preventivo.id}" title="Apri l'offerta">Offerta ${esc(r.preventivo.numero)}</a>` : r.rif_preventivo ? esc(r.rif_preventivo) : '', r.cig ? `CIG ${esc(r.cig)}` : '', r.cup ? `CUP ${esc(r.cup)}` : ''].filter(Boolean).join('<br>'),
          x: r => [r.preventivo ? 'Offerta ' + r.preventivo.numero : r.rif_preventivo, r.cig && 'CIG ' + r.cig, r.cup && 'CUP ' + r.cup].filter(Boolean).join(' ') }] : []),
        { k: 'imponibile', t: 'Imponibile', num: true, f: r => fmt.euro(r.imponibile), x: r => Number(r.imponibile) },
        { k: 'totale', t: 'Totale', num: true, f: r => fmt.euro(r.totale), x: r => Number(r.totale) },
        { k: 'scadenza', t: 'Scadenza', f: r => fmt.data(r.scadenza) },
        { k: 'metodo_pagamento', t: 'Metodo' },
        { k: 'residuo', t: tipo === 'emessa' ? 'Da incassare' : 'Da pagare', num: true, f: r => r.pagata ? '' : fmt.euro(residuo(r)), x: r => r.pagata ? 0 : residuo(r) },
        { k: 'stato', t: 'Stato', f: statoFattura, x: r => r.pagata ? 'pagata' : Number(r.importo_pagato) > 0 ? 'pagata in parte' : 'aperta' },
        { k: 'az', t: '', f: r => `<span class="az-fatt">${tipo === 'emessa' ? `<button class="btn vuoto piccolo" data-cortesia="${r.id}" title="Stampa o salva in PDF la copia di cortesia da mandare al cliente">Copia di cortesia</button>` : ''}${r.pagata ? '' : `<button class="btn vuoto piccolo" data-paga="${r.id}">${tipo === 'emessa' ? 'Incassa' : 'Paga'}</button>`}</span>`, x: () => '' }
      ],
      classeRiga: r => r.pagata ? 'spento' : '',
      piede: r => `<tr><td colspan="${fissi.cantiere_id ? 4 : 5}">Totale</td><td class="num">${fmt.euro(r.reduce((s, x) => s + Number(x.imponibile), 0))}</td><td class="num">${fmt.euro(r.reduce((s, x) => s + Number(x.totale), 0))}</td><td colspan="2"></td><td class="num">${fmt.euro(r.filter(x => !x.pagata).reduce((s, x) => s + residuo(x), 0))}</td><td colspan="2"></td></tr>`
    });
    el.addEventListener('click', async e => {
      const bc = e.target.closest('[data-cortesia]'); if (bc) return App.stampaFatturaCortesia(conElenco.righe.find(x => String(x.id) === bc.dataset.cortesia));
      const b = e.target.closest('[data-paga]'); if (!b) return;
      const f = conElenco.righe.find(x => String(x.id) === b.dataset.paga);
      App.registraPagamento(f, conElenco.ricarica);
    });
    return conElenco;
  };

  // ---------- Copia di cortesia di una fattura emessa (PDF da mandare al cliente) ----------
  const nomeFile = (...p) => p.filter(Boolean).map(x => String(x).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()).join('_');
  App.nomeFile = nomeFile;
  App.stampaConNome = (html, nome) => {
    const f = document.createElement('div'); f.className = 'solo-stampa foglio-isolato'; f.innerHTML = html;
    document.body.append(f); document.body.classList.add('stampa-isolata');
    const titolo = document.title; document.title = nome;   // il PDF prende il nome dal titolo della pagina
    const via = () => { f.remove(); document.body.classList.remove('stampa-isolata'); document.title = titolo; window.removeEventListener('afterprint', via); };
    window.addEventListener('afterprint', via); window.print(); setTimeout(via, 1500);
  };
  App.stampaFatturaCortesia = async function (f0) {
    try {
      const f = await db.uno('fatture', f0.id, '*,anagrafica:anagrafiche(*),cantiere:cantieri(nome,comune,cig,cup),preventivo:preventivi(numero,data,oggetto)');
      const a = f.anagrafica || {}, iva = Number(f.iva) || 0, split = f.regime === 'split payment', rc = f.regime === 'reverse charge', es = f.regime === 'esente';
      const nota = split ? 'Scissione dei pagamenti (split payment) ai sensi dell\'art. 17-ter del DPR 633/1972: l\'IVA è versata dal committente.'
        : rc ? 'Operazione soggetta a inversione contabile (reverse charge) ai sensi dell\'art. 17 del DPR 633/1972: l\'IVA è a carico del committente.' : es ? 'Operazione non imponibile / esente IVA.' : '';
      const riga = (k, v) => v ? `<tr><th>${k}</th><td>${v}</td></tr>` : '';
      const html = App.intestazioneStampa(`Fattura n. ${esc(f.numero)}`, `del ${fmt.data(f.data)} · COPIA DI CORTESIA`) + `
        <div class="fc-due"><div><h3>Cliente</h3><p><b>${esc(a.ragione_sociale || '')}</b><br>${esc(a.indirizzo || '')}<br>${esc([a.cap, a.comune, a.provincia && '(' + a.provincia + ')'].filter(Boolean).join(' '))}
          ${a.piva ? '<br>P.IVA ' + esc(a.piva) : ''}${a.codice_fiscale ? '<br>C.F. ' + esc(a.codice_fiscale) : ''}${a.codice_destinatario ? '<br>Codice destinatario ' + esc(a.codice_destinatario) : ''}${a.pec ? '<br>PEC ' + esc(a.pec) : ''}</p></div>
          <div><h3>Riferimenti</h3><table class="fc-rif">${riga('Cantiere', esc(f.cantiere ? f.cantiere.nome + (f.cantiere.comune ? ' – ' + f.cantiere.comune : '') : ''))}${riga('CIG', esc(f.cig || ''))}${riga('CUP', esc(f.cup || ''))}
            ${riga('Offerta', f.preventivo ? `n. ${esc(f.preventivo.numero)} del ${fmt.data(f.preventivo.data)}` : esc(f.rif_preventivo || ''))}</table></div></div>
        <table class="tabella" style="margin-top:16px"><thead><tr><th>Descrizione</th><th class="num">Imponibile</th><th class="num">IVA</th></tr></thead>
          <tbody><tr><td>${esc(f.descrizione || '').replace(/\n/g, '<br>')}${f.preventivo && f.preventivo.oggetto ? `<br><span class="nota">${esc(f.preventivo.oggetto)}</span>` : ''}</td><td class="num">${fmt.euro(f.imponibile)}</td><td class="num">${es ? 'esente' : fmt.pct(f.iva_pct)}</td></tr></tbody></table>
        <div class="totali-prev"><div><span>Imponibile</span><span class="num">${fmt.euro(f.imponibile)}</span></div><div><span>IVA ${es ? '' : fmt.pct(f.iva_pct)}</span><span class="num">${fmt.euro(iva)}</span></div>
          <div><span>Totale documento</span><span class="num">${fmt.euro(f.totale)}</span></div><div class="forte"><span>Netto a pagare</span><span class="num">${fmt.euro(f.da_pagare)}</span></div></div>
        ${nota ? `<p style="margin-top:12px">${esc(nota)}</p>` : ''}
        <h3 style="margin-top:16px">Pagamento</h3><p>${esc(f.metodo_pagamento || '')}${f.scadenza ? ` entro il ${fmt.data(f.scadenza)}` : ''}${f.iban ? `<br>IBAN ${esc(f.iban)}` : ''}</p>
        <p class="fc-avviso">Copia di cortesia priva di valore fiscale ai sensi dell'art. 21 del DPR 633/1972. La fattura elettronica originale è trasmessa tramite il Sistema di Interscambio ed è disponibile nell'area riservata del sito dell'Agenzia delle Entrate.</p>`;
      App.stampaConNome(html, nomeFile('Fattura', f.numero, a.ragione_sociale));
    } catch (e) { errore(e); }
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
    const resta = residuo(f), chi = f.anagrafica ? f.anagrafica.ragione_sociale : '';
    ui.modulo({
      titolo: `${f.tipo === 'emessa' ? 'Incasso' : 'Pagamento'} fattura ${f.numero}${chi ? ' – ' + chi : ''}`,
      testoSalva: f.tipo === 'emessa' ? 'Registra incasso' : 'Registra pagamento',
      campi: [
        { k: 'data', label: f.tipo === 'emessa' ? 'Data incasso' : 'Data pagamento', tipo: 'data', richiesto: true },
        { k: 'conto', label: 'Conto', tipo: 'rif', rif: App.RIF.conto, richiesto: true },
        { k: 'importo', label: `Importo (resta ${fmt.euro(resta)})`, tipo: 'euro', richiesto: true, aiuto: 'Per un acconto scrivi solo la parte pagata: la fattura resta aperta per il resto.' },
        { k: 'metodo', label: 'Metodo di pagamento', tipo: 'select', opzioni: App.METODI_PAGAMENTO, richiesto: true },
        { k: 'riferimento', label: 'Riferimento', aiuto: 'CRO/TRN del bonifico, numero dell\'assegno, numero della RiBa…' },
        { k: 'note', label: 'Note', tipo: 'area' }
      ],
      valori: { data: fmt.oggi(), conto: conti[0].id, importo: resta, metodo: f.metodo_pagamento || 'Bonifico' },
      salva: async d => {
        await db.rpc('registra_pagamento', { p_fattura: f.id, p_data: d.data, p_conto: d.conto, p_importo: d.importo, p_metodo: d.metodo, p_riferimento: d.riferimento, p_note: d.note });
        const parziale = d.importo < resta - 0.005;
        avviso(parziale ? `Registrato un pagamento parziale: restano ${fmt.euro(resta - d.importo)}` : f.regime === 'split payment' && f.tipo === 'emessa' ? 'Registrato. Con lo split payment l\'incasso è il solo imponibile.' : 'Registrato in prima nota');
        dopo && dopo();
      }
    });
  };

  ui.pagina('contabilita', async el => {
    el.innerHTML = App.testata('Contabilità') +
      '<p class="nota" style="margin:-10px 0 18px">Registro gestionale: le fatture elettroniche si emettono con il programma di fatturazione, i registri IVA li tiene il commercialista.</p><div id="schede-cont"></div>';
    App.schede($('#schede-cont', el), [['scad', 'Scadenziario'], ['emesse', 'Fatture emesse'], ['ricevute', 'Fatture ricevute'], ['nota', 'Prima nota'], ['conti', 'Conti']], null, (k, corpo) => {
      if (k === 'emesse' || k === 'ricevute') {
        const tipo = k === 'emesse' ? 'emessa' : 'ricevuta';
        corpo.innerHTML = `<div class="azioni non-stampare" style="justify-content:space-between;margin-bottom:14px"><p class="nota" style="max-width:70ch">Puoi registrarle a mano oppure importare i file XML delle fatture elettroniche, scaricati dal programma di fatturazione o dal cassetto fiscale.</p><button class="btn vuoto" data-importa>Importa fatture XML</button></div><div></div>`;
        const elenco = App.elencoFatture(corpo.lastElementChild, tipo);
        corpo.querySelector('[data-importa]').onclick = () => App.importaFattureXml(tipo, () => elenco.ricarica());
      }
      if (k === 'scad') scadenziario(corpo);
      if (k === 'nota') primaNota(corpo);
      if (k === 'conti') conti(corpo);
    });
  });

  async function scadenziario(el) {
    const aperte = await db.lista('fatture', { eq: { pagata: false }, sel: '*,anagrafica:anagrafiche(ragione_sociale),cantiere:cantieri(nome)', ordina: 'scadenza,data' });
    const oggi = fmt.oggi(), tra30 = fmt.piuGiorni(oggi, 30);
    const somma = (arr, t) => arr.filter(f => f.tipo === t).reduce((s, f) => s + residuo(f), 0);
    const scad = aperte.filter(f => f.scadenza && f.scadenza < oggi), pross = aperte.filter(f => !f.scadenza || (f.scadenza >= oggi && f.scadenza <= tra30)), poi = aperte.filter(f => f.scadenza && f.scadenza > tra30);
    const tab = arr => arr.length ? `<div class="scorri"><table class="tabella"><thead><tr><th>Scadenza</th><th></th><th>Numero</th><th>Cliente / fornitore</th><th>Cantiere</th><th>Metodo</th><th class="num">Da pagare</th><th></th></tr></thead><tbody>${arr.map(f => `<tr>
        <td>${f.scadenza ? fmt.data(f.scadenza) : '<span class="nota">senza data</span>'}</td><td><span class="stato ${f.tipo === 'emessa' ? 'verde' : 'nero'}">${f.tipo === 'emessa' ? 'da incassare' : 'da pagare'}</span></td>
        <td>${esc(f.numero)}</td><td>${esc(f.anagrafica ? f.anagrafica.ragione_sociale : '')}</td><td>${esc(f.cantiere ? f.cantiere.nome : '')}</td><td>${esc(f.metodo_pagamento)}</td>
        <td class="num">${fmt.euro(residuo(f))}${Number(f.importo_pagato) > 0 ? '<br><span class="nota">acconto già pagato</span>' : ''}</td><td><button class="btn vuoto piccolo" data-paga="${f.id}">${f.tipo === 'emessa' ? 'Incassa' : 'Paga'}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="nota">Niente.</p>';
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
    el.innerHTML = `<div class="cifre">${saldi.map(s => `<div class="cifra ${s.saldo < 0 ? 'allarme' : 'blu'}"><b>${fmt.euro(s.saldo)}</b><span>${esc(s.nome)}</span></div>`).join('') || '<p class="nota">Nessun conto. Crealo nella scheda Conti.</p>'}</div>
      <p class="nota" style="margin-bottom:12px">Gli incassi e i pagamenti delle fatture arrivano qui da soli quando premi "Incassa" o "Paga". Qui puoi aggiungere anche le altre entrate e uscite: stipendi, F24, carburante, spese di cassa.</p><div id="pn"></div>`;
    const oggi = fmt.oggi();
    const mesi = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => { const d = new Date(oggi.slice(0, 7) + '-15'); d.setMonth(d.getMonth() - i); const m = d.toISOString().slice(0, 7); return [m, new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(d)]; });
    ui.elenco($('#pn', el), {
      tabella: 'movimenti', esporta: 'Prima nota', nuovo: 'Nuovo movimento',
      q: { sel: '*,conto:conti(nome),cantiere:cantieri(nome),anagrafica:anagrafiche(ragione_sociale),fattura:fatture(numero)' }, ordina: 'data.desc,id.desc',
      cerca: ['descrizione', 'riferimento', 'note'],
      filtri: [
        { k: 'conto_id', label: 'Conto', opzioni: [['', 'Tutti'], ...saldi.map(s => [String(s.id), s.nome])] },
        { k: 'metodo', label: 'Metodo', opzioni: [['', 'Tutti'], ...App.METODI_PAGAMENTO] },
        { k: 'tipo', label: 'Tipo', opzioni: [['', 'Entrate e uscite'], ['entrata', 'Solo entrate'], ['uscita', 'Solo uscite']] },
        { k: 'mese', label: 'Periodo', predef: oggi.slice(0, 7), opzioni: [['', 'Tutto'], ...mesi],
          applica: (q, v) => { const [a, m] = v.split('-').map(Number); q.gte = { data: v + '-01' }; q.lt = { data: (m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`) + '-01' }; } }
      ],
      campi: [
        { k: 'data', label: 'Data del pagamento', tipo: 'data', richiesto: true },
        { k: 'tipo', label: 'Tipo', tipo: 'select', opzioni: [['uscita', 'Uscita (pago)'], ['entrata', 'Entrata (incasso)']], richiesto: true },
        { k: 'importo', label: 'Importo', tipo: 'euro', richiesto: true },
        { k: 'conto_id', label: 'Conto', tipo: 'rif', rif: App.RIF.conto, richiesto: true },
        { k: 'metodo', label: 'Metodo di pagamento', tipo: 'select', opzioni: App.METODI_PAGAMENTO, richiesto: true },
        { k: 'riferimento', label: 'Riferimento', aiuto: 'CRO/TRN, n. assegno, n. F24…' },
        { k: 'descrizione', label: 'Descrizione', largo: true, richiesto: true },
        { k: 'anagrafica_id', label: 'Cliente / fornitore', tipo: 'rif', rif: App.RIF.anagrafica },
        { k: 'cantiere_id', label: 'Cantiere', tipo: 'rif', rif: App.RIF.cantiere },
        { k: 'fattura_id', label: 'Fattura pagata con questo movimento', tipo: 'rif', rif: App.RIF.fattura, largo: true, aiuto: 'Se la colleghi, la fattura si aggiorna da sola (pagata o pagata in parte).' },
        { k: 'note', label: 'Note', tipo: 'area' }
      ],
      predefiniti: () => ({ data: oggi, tipo: 'uscita', conto_id: saldi[0] && saldi[0].id, metodo: 'Bonifico' }),
      dopoSalva: () => { ui.dimentica('fatture'); primaNota(el); },
      colonne: [
        { k: 'data', t: 'Data', f: r => fmt.data(r.data) },
        { k: 'descrizione', t: 'Descrizione', f: r => `<b style="font-weight:500">${esc(r.descrizione)}</b>${r.note ? `<br><span class="nota">${esc(r.note)}</span>` : ''}` },
        { k: 'anagrafica', t: 'Cliente / fornitore', f: r => esc(r.anagrafica ? r.anagrafica.ragione_sociale : ''), x: r => r.anagrafica ? r.anagrafica.ragione_sociale : '' },
        { k: 'cantiere', t: 'Cantiere', f: r => esc(r.cantiere ? r.cantiere.nome : ''), x: r => r.cantiere ? r.cantiere.nome : '' },
        { k: 'fattura', t: 'Fattura', f: r => esc(r.fattura ? r.fattura.numero : ''), x: r => r.fattura ? r.fattura.numero : '' },
        { k: 'metodo', t: 'Metodo' },
        { k: 'riferimento', t: 'Riferimento' },
        { k: 'conto', t: 'Conto', f: r => esc(r.conto.nome), x: r => r.conto.nome },
        { k: 'entrata', t: 'Entrate', num: true, f: r => r.tipo === 'entrata' ? `<span style="color:var(--verde)">${fmt.euro(r.importo)}</span>` : '', x: r => r.tipo === 'entrata' ? Number(r.importo) : '' },
        { k: 'uscita', t: 'Uscite', num: true, f: r => r.tipo === 'uscita' ? fmt.euro(r.importo) : '', x: r => r.tipo === 'uscita' ? Number(r.importo) : '' }
      ],
      piede: r => {
        const e = r.filter(x => x.tipo === 'entrata').reduce((s, x) => s + Number(x.importo), 0), u = r.filter(x => x.tipo === 'uscita').reduce((s, x) => s + Number(x.importo), 0);
        return `<tr><td colspan="8">Totale del periodo (differenza ${fmt.euro(e - u)})</td><td class="num">${fmt.euro(e)}</td><td class="num">${fmt.euro(u)}</td></tr>`;
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
