// Home dell'ufficio: cosa succede oggi e cosa richiede attenzione.
(function () {
  const { esc, fmt } = ui;

  ui.pagina('home', async el => {
    const oggi = fmt.oggi();
    const [timb, econ, scad, fatt, prev, giorn] = await Promise.all([
      db.lista('v_timbrature', { eq: { giorno: oggi, annullata: false }, ordina: 'ora' }),
      db.lista('v_economia_cantieri', { in: { stato: ['aperto', 'sospeso'] }, ordina: 'nome' }),
      db.lista('scadenze', { eq: { completata: false }, lte: { data_scadenza: fmt.piuGiorni(oggi, 90) }, ordina: 'data_scadenza', sel: '*,lavoratore:lavoratori(cognome,nome),mezzo:mezzi(nome),cantiere:cantieri(nome),anagrafica:anagrafiche(ragione_sociale)' }),
      db.lista('fatture', { eq: { pagata: false }, sel: 'id,tipo,numero,scadenza,da_pagare,anagrafica:anagrafiche(ragione_sociale)', ordina: 'scadenza' }),
      db.lista('preventivi', { eq: { stato: 'inviato' }, sel: 'id,numero,oggetto,data,sconto_pct,voci:preventivo_voci(quantita,prezzo)', ordina: 'data' }),
      db.lista('giornale', { eq: { giorno: oggi }, sel: 'cantiere_id' })
    ]);

    // presenti adesso
    const ultima = new Map();
    for (const t of timb) ultima.set(t.lavoratore_id, t);
    const dentro = [...ultima.values()].filter(t => t.tipo === 'entrata');
    const perCant = new Map();
    for (const t of dentro) perCant.set(t.cantiere, (perCant.get(t.cantiere) || 0) + 1);

    const urgenti = scad.filter(s => fmt.giorniTra(oggi, s.data_scadenza) <= s.preavviso_giorni);
    const scaduti = fatt.filter(f => f.scadenza && f.scadenza < oggi);
    const crediti = scaduti.filter(f => f.tipo === 'emessa'), debiti15 = fatt.filter(f => f.tipo === 'ricevuta' && f.scadenza && f.scadenza <= fmt.piuGiorni(oggi, 15));
    const somma = a => a.reduce((s, f) => s + Number(f.da_pagare), 0);
    const aperti = econ.filter(c => c.stato === 'aperto');
    const senzaGiornale = aperti.filter(c => !giorn.some(g => g.cantiere_id === c.cantiere_id));
    const valPrev = p => { const l = p.voci.reduce((s, v) => s + v.quantita * v.prezzo, 0); return l - l * (p.sconto_pct || 0) / 100; };
    const rif = s => s.lavoratore ? `${s.lavoratore.cognome} ${s.lavoratore.nome}` : s.mezzo ? s.mezzo.nome : s.cantiere ? s.cantiere.nome : s.anagrafica ? s.anagrafica.ragione_sociale : 'Azienda';
    const nome = (App.profilo.nome || '').split(' ')[0];
    const ora = Number(new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: 'numeric', hour12: false }).format(new Date()));
    const saluto = ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
    // Una frase che riassume la giornata
    const cose = [];
    if (urgenti.length) cose.push(`${urgenti.length} ${urgenti.length === 1 ? 'scadenza' : 'scadenze'} da sistemare`);
    if (crediti.length) cose.push(`${crediti.length} ${crediti.length === 1 ? 'fattura scaduta' : 'fatture scadute'} da sollecitare`);
    if (debiti15.length) cose.push(`${debiti15.length} ${debiti15.length === 1 ? 'pagamento' : 'pagamenti'} in arrivo`);
    if (senzaGiornale.length) cose.push(`${senzaGiornale.length} ${senzaGiornale.length === 1 ? 'giornale' : 'giornali'} di cantiere ancora da compilare`);
    const frase = cose.length ? `Oggi ci sono ${cose.length > 1 ? cose.slice(0, -1).join(', ') + ' e ' + cose[cose.length - 1] : cose[0]}.` : 'Nessuna urgenza per oggi: tutto in ordine.';

    el.innerHTML = `<div class="benvenuto"><div><div class="nota">${esc(fmt.dataLunga(oggi).replace(/^./, c => c.toUpperCase()))}</div>
        <h1>${saluto}${nome ? ', ' + esc(nome) : ''}</h1><p class="oggi">${esc(frase)}</p></div></div>
      <div class="cifre">
        <div class="cifra verde"><b>${dentro.length}</b><span>persone in cantiere ora</span></div>
        <div class="cifra blu"><b>${aperti.length}</b><span>cantieri aperti</span></div>
        <div class="cifra ${urgenti.some(s => s.data_scadenza < oggi) ? 'allarme' : 'ambra'}"><b>${urgenti.length}</b><span>scadenze da sistemare</span></div>
        <div class="cifra ${crediti.length ? 'allarme' : 'verde'}"><b>${fmt.euro(somma(crediti))}</b><span>crediti scaduti</span></div>
        <div class="cifra ambra"><b>${fmt.euro(somma(debiti15))}</b><span>da pagare entro 15 giorni</span></div>
      </div>
      <div class="griglia">
        <section class="riquadro"><h2>In cantiere adesso <a href="#presenze">Presenze</a></h2><ul class="elenco-breve">${
          perCant.size ? [...perCant].map(([c, n]) => `<li><span>${esc(c)}</span><b>${n}</b></li>`).join('') : '<li class="vuota">Nessuno ha timbrato l\'entrata oggi.</li>'}</ul>
          ${senzaGiornale.length ? `<p class="nota" style="margin-top:10px">Giornale di oggi non ancora compilato: ${senzaGiornale.map(c => esc(c.nome)).join(', ')}.</p>` : ''}</section>
        <section class="riquadro"><h2>Scadenze <a href="#scadenze">Tutte</a></h2><ul class="elenco-breve">${
          urgenti.slice(0, 8).map(s => { const st = App.statoScadenza(s.data_scadenza, s.preavviso_giorni); return `<li><span><b style="font-weight:600">${esc(s.tipo)}</b> – ${esc(rif(s))}</span><span class="stato ${st.classe}">${esc(st.testo)}</span></li>`; }).join('') || '<li class="vuota">Nessuna scadenza nei prossimi giorni.</li>'}
          ${urgenti.length > 8 ? `<li class="vuota">e altre ${urgenti.length - 8}</li>` : ''}</ul></section>
        <section class="riquadro"><h2>Soldi da incassare e pagare <a href="#contabilita">Scadenziario</a></h2><ul class="elenco-breve">${
          [...crediti.slice(0, 4).map(f => `<li><span>Da incassare: ${esc(f.numero)} – ${esc(f.anagrafica ? f.anagrafica.ragione_sociale : '')}</span><span class="stato rosso">${fmt.euro(f.da_pagare)}</span></li>`),
           ...debiti15.slice(0, 4).map(f => `<li><span>Da pagare entro il ${fmt.data(f.scadenza)}: ${esc(f.anagrafica ? f.anagrafica.ragione_sociale : '')}</span><b>${fmt.euro(f.da_pagare)}</b></li>`)].join('') || '<li class="vuota">Niente di scaduto o in scadenza.</li>'}</ul></section>
        <section class="riquadro"><h2>Preventivi in attesa <a href="#preventivi">Tutti</a></h2><ul class="elenco-breve">${
          prev.slice(0, 6).map(p => `<li><a href="#preventivo-${p.id}">${esc(p.numero)} – ${esc(p.oggetto || 'senza oggetto')}</a><span>${fmt.euro(valPrev(p))}<br><span class="nota">inviato ${fmt.giorniTra(p.data, oggi)} gg fa</span></span></li>`).join('') || '<li class="vuota">Nessun preventivo in attesa di risposta.</li>'}</ul></section>
      </div>
      <div class="sezione"><h2>Andamento dei cantieri</h2>
        <div class="scorri pannello"><table class="tabella"><thead><tr><th>Cantiere</th><th>Stato</th><th class="num">Contratto</th><th class="num">Fatturato</th><th class="num">Costi</th><th class="num">Margine attuale</th><th class="num">Avanzamento</th></tr></thead><tbody>${
          econ.map(c => { const m = c.fatturato - c.costi_totali, av = c.importo_contratto ? c.fatturato / c.importo_contratto * 100 : null;
            return `<tr class="cliccabile" data-c="${c.cantiere_id}" tabindex="0"><td><b>${esc(c.nome)}</b></td><td>${App.statoCantiere(c.stato)}</td><td class="num">${fmt.euro(c.importo_contratto)}</td>
              <td class="num">${fmt.euro(c.fatturato)}</td><td class="num">${fmt.euro(c.costi_totali)}</td><td class="num" style="${m < 0 ? 'color:var(--rosso);font-weight:600' : ''}">${fmt.euro(m)}</td><td class="num">${fmt.pct(av)}</td></tr>`; }).join('')
          || '<tr><td class="vuota" colspan="7">Nessun cantiere aperto. <a href="#cantieri">Crea il primo cantiere</a>.</td></tr>'}</tbody></table></div></div>`;
    el.querySelector('.sezione table').addEventListener('click', e => { const tr = e.target.closest('[data-c]'); if (tr) ui.vai('cantiere', tr.dataset.c); });
  });
})();
