// Cantieri: elenco, scheda del cantiere con economia (budget e consuntivo).
(function () {
  const { $, esc, fmt, avviso, errore, conferma } = ui;

  const campiCantiere = () => [
    { k: 'nome', label: 'Nome del cantiere', richiesto: true, largo: true },
    { k: 'codice', label: 'Codice interno', aiuto: 'Facoltativo, es. 2026-07' },
    { k: 'stato', label: 'Stato', tipo: 'select', opzioni: App.STATI_CANTIERE, richiesto: true },
    { k: 'committente_id', label: 'Committente', tipo: 'rif', rif: App.RIF.cliente },
    { k: 'responsabile_id', label: 'Responsabile di cantiere', tipo: 'rif', rif: App.RIF.utente },
    { k: 'comune', label: 'Comune' },
    { k: 'indirizzo', label: 'Località / tratta' },
    { k: 'cig', label: 'CIG' },
    { k: 'cup', label: 'CUP' },
    { k: 'importo_contratto', label: 'Importo del contratto', tipo: 'euro', aiuto: 'Al netto di IVA e del ribasso' },
    { k: 'data_inizio', label: 'Inizio lavori', tipo: 'data' },
    { k: 'data_fine_prevista', label: 'Fine prevista', tipo: 'data' },
    { k: 'note', label: 'Note', tipo: 'area' }
  ];
  App.campiCantiere = campiCantiere;

  ui.pagina('cantieri', async el => {
    el.innerHTML = App.testata('Cantieri') + '<div id="el-cantieri"></div>';
    ui.elenco($('#el-cantieri', el), {
      tabella: 'cantieri', esporta: 'Cantieri', nuovo: 'Nuovo cantiere',
      q: { sel: '*,committente:anagrafiche(ragione_sociale)' }, ordina: 'stato,nome',
      cerca: ['nome', 'codice', 'comune', 'cig'],
      filtri: [{ k: 'stato', label: 'Stato', predef: 'aperto', opzioni: [['', 'Tutti'], ...App.STATI_CANTIERE.map(s => [s, s])] }],
      campi: campiCantiere(), predefiniti: { stato: 'aperto' },
      colonne: [
        { k: 'codice', t: 'Codice' },
        { k: 'nome', t: 'Cantiere', f: r => `<b>${esc(r.nome)}</b>` },
        { k: 'committente', t: 'Committente', f: r => esc(r.committente ? r.committente.ragione_sociale : '') },
        { k: 'comune', t: 'Comune' },
        { k: 'stato', t: 'Stato', f: r => App.statoCantiere(r.stato), x: r => r.stato },
        { k: 'importo_contratto', t: 'Contratto', num: true, f: r => fmt.euro(r.importo_contratto), x: r => Number(r.importo_contratto) }
      ],
      apri: r => ui.vai('cantiere', r.id)
    });
  });

  // ---------- Scheda del singolo cantiere ----------
  ui.pagina('cantiere', async (el, id) => {
    const c = await db.uno('cantieri', id, '*,committente:anagrafiche(ragione_sociale),responsabile:profili(nome,email)');
    const info = [
      ['Committente', c.committente && c.committente.ragione_sociale], ['Comune', [c.comune, c.indirizzo].filter(Boolean).join(' – ')],
      ['CIG', c.cig], ['CUP', c.cup], ['Inizio', fmt.data(c.data_inizio)], ['Fine prevista', fmt.data(c.data_fine_prevista)],
      ['Responsabile', c.responsabile && (c.responsabile.nome || c.responsabile.email)]
    ].filter(x => x[1]);
    el.innerHTML = App.testata(c.nome, {
      sopra: `<a href="#cantieri">Cantieri</a> / ${c.codice ? esc(c.codice) + ' ' : ''}${App.statoCantiere(c.stato)}`,
      azioni: '<button class="btn vuoto" id="c-modifica">Modifica dati</button>'
    }) + `<p class="nota" style="margin:-8px 0 20px">${info.map(([k, v]) => `${esc(k)}: <b class="forte" style="font-weight:500">${esc(v)}</b>`).join(' &nbsp;·&nbsp; ') || 'Aggiungi committente, CIG e date con "Modifica dati".'}</p>
      <div id="c-schede"></div>`;
    $('#c-modifica', el).onclick = () => ui.modulo({
      titolo: 'Dati del cantiere', campi: campiCantiere(), valori: c,
      salva: async d => { await db.aggiorna('cantieri', id, d); ui.dimentica('cantieri'); avviso('Salvato'); ui.pagine.cantiere(el, id); },
      elimina: async () => { await db.elimina('cantieri', id); ui.dimentica('cantieri'); ui.vai('cantieri'); }
    });
    App.schede($('#c-schede', el), [['economia', 'Economia'], ['resoconto', 'Resoconto'], ['costi', 'Costi'], ['fatturato', 'Fatturato'], ['ore', 'Ore e presenze'], ['giornale', 'Giornale'], ['documenti', 'Documenti e foto']], null,
      (k, corpo) => ({ economia, resoconto, costi, fatturato, ore, giornale, documenti })[k](corpo, c));
  });

  // Dati economici del cantiere, voce per voce: speso (cons), previsto senza fattura (prev), budget (bud), stima a fine lavori.
  async function datiEconomici(c) {
    const [[e], budget, costi, fatt, previste] = await Promise.all([
      db.lista('v_economia_cantieri', { eq: { cantiere_id: c.id } }),
      db.lista('budget', { eq: { cantiere_id: c.id } }),
      db.lista('costi', { eq: { cantiere_id: c.id }, sel: 'categoria,importo' }),
      db.lista('fatture', { eq: { cantiere_id: c.id, tipo: 'ricevuta' }, sel: 'categoria,imponibile' }),
      db.lista('spese_previste', { eq: { cantiere_id: c.id }, nullo: { fattura_id: true }, sel: 'categoria,importo' })
    ]);
    const voce = k => App.CATEGORIE_BUDGET.includes(k) ? k : (k === 'Spese generali' ? 'Spese generali di cantiere' : 'Altro');
    const zero = () => Object.fromEntries(App.CATEGORIE_BUDGET.map(k => [k, 0]));
    const cons = zero(), prev = zero(), bud = zero();
    cons['Manodopera'] = Number(e.costo_manodopera); cons['Mezzi interni'] = Number(e.costo_mezzi);
    for (const x of costi) cons[voce(x.categoria)] += Number(x.importo);
    for (const x of fatt) cons[voce(x.categoria)] += Number(x.imponibile);
    for (const x of previste) prev[voce(x.categoria)] += Number(x.importo);
    for (const b of budget) bud[voce(b.categoria)] += Number(b.importo);
    // Stima a fine lavori, voce per voce: il budget, oppure speso + previsto se è di più.
    const stima = Object.fromEntries(App.CATEGORIE_BUDGET.map(k => [k, Math.max(bud[k], cons[k] + prev[k])]));
    return { e, budget, cons, prev, bud, stima };
  }

  async function economia(el, c) {
    const { e, budget, cons, prev, bud, stima } = await datiEconomici(c);
    const contratto = Number(c.importo_contratto), costiTot = Number(e.costi_totali), budTot = Number(e.budget), fatturato = Number(e.fatturato);
    const prevTot = Number(e.spese_previste), stimaTot = Object.values(stima).reduce((a, b) => a + b, 0);
    const margFin = contratto - stimaTot, margAtt = fatturato - costiTot;
    const avanz = contratto ? fatturato / contratto * 100 : null, spesa = budTot ? costiTot / budTot * 100 : null;
    const sforano = App.CATEGORIE_BUDGET.filter(k => cons[k] + prev[k] > bud[k] && cons[k] + prev[k] > 0);
    el.innerHTML = `<div class="cifre">
        <div class="cifra"><b>${fmt.euro(contratto)}</b><span>importo del contratto</span></div>
        <div class="cifra"><b>${fmt.euro(fatturato)}</b><span>fatturato (${fmt.pct(avanz)} del contratto)</span></div>
        <div class="cifra"><b>${fmt.euro(costiTot)}</b><span>costi finora (${fmt.pct(spesa)} del budget)</span></div>
        <div class="cifra"><b>${fmt.euro(prevTot)}</b><span>spese previste, fattura non ancora arrivata</span></div>
        <div class="cifra"><b>${fmt.euro(stimaTot)}</b><span>costo stimato a fine lavori</span></div>
        <div class="cifra ${margFin < 0 ? 'allarme' : ''}"><b>${fmt.euro(margFin)}</b><span>margine stimato a fine lavori (${fmt.pct(contratto ? margFin / contratto * 100 : null)})</span></div>
      </div>
      ${spesa != null && avanz != null && spesa > avanz + 10 ? `<p class="stato rosso" style="display:block;padding:10px 12px;margin-bottom:12px">Attenzione: hai speso il ${fmt.pct(spesa)} del budget ma fatturato solo il ${fmt.pct(avanz)} del contratto.</p>` : ''}
      ${sforano.length ? `<p class="stato rosso" style="display:block;padding:10px 12px;margin-bottom:20px">Contando anche le spese previste si supera il budget in: ${sforano.map(esc).join(', ')}.</p>` : ''}
      <div class="due-col">
        <div><div class="testata" style="margin-bottom:12px"><h2>Budget, speso e previsto per voce</h2><button class="btn vuoto piccolo non-stampare" id="e-budget">Modifica budget</button></div>
          <div class="confronto">${App.CATEGORIE_BUDGET.filter(k => bud[k] || cons[k] || prev[k]).map(k => {
            const b = bud[k], s = cons[k], pv = prev[k], max = Math.max(b, s + pv) || 1;
            return `<div class="voce-confronto"><div class="riga"><b>${esc(k)}</b><span class="num">${fmt.euro(s)}${pv ? ` + ${fmt.euro(pv)} previsti` : ''} su ${fmt.euro(b)}</span></div>
              <div class="binario" title="Speso ${fmt.euro(s)}, previsto ${fmt.euro(pv)}, budget ${fmt.euro(b)}"><i class="${s + pv > b ? 'oltre' : ''}" style="width:${s / max * 100}%"></i>${pv ? `<i class="previsto ${s + pv > b ? 'oltre' : ''}" style="left:${s / max * 100}%;width:${pv / max * 100}%"></i>` : ''}${b ? `<em style="left:${b / max * 100}%"></em>` : ''}</div></div>`;
          }).join('') || '<p class="nota">Nessun budget e nessun costo ancora. Inizia da "Modifica budget".</p>'}</div>
          <p class="nota" style="margin-top:10px">Barra piena: speso finora. Barra a righe: spese previste. Tacca rossa: budget. La barra diventa rossa quando speso più previsto supera il budget.</p>
        </div>
        <div><h2 style="margin-bottom:12px">Da dove vengono i costi</h2>
          <table class="tabella"><tbody>
            <tr><td>Manodopera interna <span class="nota">(${fmt.ore(e.ore_manodopera)} ore)</span></td><td class="num">${fmt.euro(e.costo_manodopera)}</td></tr>
            <tr><td>Mezzi interni <span class="nota">(${fmt.ore(e.ore_mezzi)} ore)</span></td><td class="num">${fmt.euro(e.costo_mezzi)}</td></tr>
            <tr><td>Fatture dei fornitori</td><td class="num">${fmt.euro(e.costo_fatture)}</td></tr>
            <tr><td>Altre spese registrate</td><td class="num">${fmt.euro(e.altri_costi)}</td></tr>
          </tbody><tfoot><tr><td>Speso finora</td><td class="num">${fmt.euro(costiTot)}</td></tr></tfoot></table>
          <p class="nota" style="margin-top:10px">Manodopera e mezzi sono calcolati dalle ore registrate per il costo orario indicato in Personale e in Mezzi. Il costo stimato a fine lavori prende, voce per voce, il budget oppure speso + previsto se è di più. Importi senza IVA. Incassato finora: ${fmt.euro(e.incassato)}.</p>
        </div>
      </div>`;
    $('#e-budget', el).onclick = () => ui.modulo({
      titolo: 'Budget dei costi', testoSalva: 'Salva budget',
      campi: App.CATEGORIE_BUDGET.map(k => ({ k, label: k, tipo: 'euro' })),
      valori: bud,
      salva: async d => {
        for (const k of App.CATEGORIE_BUDGET) {
          const esistenti = budget.filter(b => (b.categoria in bud ? b.categoria : 'Altro') === k);
          for (const b of esistenti.slice(1)) await db.elimina('budget', b.id);
          if (esistenti[0]) { if (d[k]) await db.aggiorna('budget', esistenti[0].id, { categoria: k, importo: d[k] }); else await db.elimina('budget', esistenti[0].id); }
          else if (d[k]) await db.inserisci('budget', { cantiere_id: c.id, categoria: k, importo: d[k] });
        }
        avviso('Budget salvato'); economia(el, c);
      }
    });
  }

  // ---------- Resoconto: conto economico del cantiere ----------
  async function resoconto(el, c) {
    const [{ e, cons, prev, stima }, [imp], prevs, ultime] = await Promise.all([
      datiEconomici(c),
      db.lista('impostazioni', { eq: { chiave: 'quota_costi_fissi_pct' } }),
      db.lista('preventivi', { eq: { cantiere_id: c.id }, sel: 'numero,sconto_pct,voci:preventivo_voci(quantita,prezzo,costo)' }),
      db.lista('v_timbrature', { eq: { cantiere_id: c.id, annullata: false }, ordina: 'ora.desc', limite: 1, sel: 'giorno' })
    ]);
    const quota = imp ? Number(imp.valore) : 0;
    const chiuso = c.stato === 'chiuso';
    const fissi = App.COSTI_FISSI_CANTIERE, variabili = App.CATEGORIE_BUDGET.filter(k => !fissi.includes(k));
    const contratto = Number(c.importo_contratto), fatturato = Number(e.fatturato);

    // Colonna "a oggi" e colonna "stima a fine lavori"
    const calcola = (ricavi, costiVoce) => {
      const cv = variabili.reduce((a, k) => a + costiVoce[k], 0), cf = fissi.reduce((a, k) => a + costiVoce[k], 0);
      const mdc = ricavi - cv, mc = mdc - cf, q = Math.round(ricavi * quota) / 100, utile = mc - q;
      return { ricavi, cv, cf, mdc, mc, q, utile };
    };
    const oggi = calcola(fatturato, cons);
    const fine = calcola(Math.max(contratto, fatturato), stima);
    const pct = (v, r) => r ? ` <span class="nota">${fmt.pct(v / r * 100)}</span>` : '';
    const col = (o, k, r) => `<td class="num"${o[k] < 0 && ['mdc', 'mc', 'utile'].includes(k) ? ' style="color:var(--rosso)"' : ''}>${fmt.euro(o[k])}${r ? pct(o[k], o.ricavi) : ''}</td>`;
    const due = !chiuso;
    const riga = (t, k, { forte, r, meno } = {}) => `<tr${forte ? ' class="forte-riga"' : ''}><td>${meno ? '− ' : ''}${t}</td>${col(oggi, k, r)}${due ? col(fine, k, r) : ''}</tr>`;
    const voce = k => (cons[k] || stima[k]) ? `<tr class="dettaglio"><td>&nbsp;&nbsp;${esc(k)}</td><td class="num">${fmt.euro(cons[k])}</td>${due ? `<td class="num">${fmt.euro(stima[k])}</td>` : ''}</tr>` : '';

    // Indicatori
    const ore = Number(e.ore_manodopera);
    const fine_giorno = chiuso && ultime[0] ? ultime[0].giorno : fmt.oggi();
    const giorni = c.data_inizio ? fmt.giorniTra(c.data_inizio, fine_giorno) + 1 : null;
    const p = prevs[0];
    let prevNetto = null, prevCosti = null;
    if (p) { const l = p.voci.reduce((a, v) => a + v.quantita * v.prezzo, 0); prevNetto = l - l * (p.sconto_pct || 0) / 100; prevCosti = p.voci.reduce((a, v) => a + v.quantita * (v.costo || 0), 0); }
    const prevAperte = Object.values(prev).reduce((a, b) => a + b, 0);

    el.innerHTML = `<div class="testata non-stampare" style="margin-bottom:12px"><div><h2>Resoconto economico</h2>
        <p class="nota">${chiuso ? 'Cantiere chiuso: questi sono i numeri finali.' : 'Cantiere in corso: a sinistra i numeri di oggi, a destra la stima a fine lavori.'}</p></div>
        <div class="azioni"><button class="btn vuoto" id="r-excel">Excel</button><button class="btn vuoto" id="r-stampa">Stampa o salva PDF</button>${chiuso ? '' : '<button class="btn" id="r-chiudi">Chiudi il cantiere</button>'}</div></div>
      ${chiuso && prevAperte ? `<p class="stato giallo" style="display:block;padding:10px 12px;margin-bottom:14px">Ci sono ancora ${fmt.euro(prevAperte)} di spese previste senza fattura: registrale o eliminale per avere il resoconto definitivo.</p>` : ''}
      ${!quota ? '<p class="stato giallo" style="display:block;padding:10px 12px;margin-bottom:14px">La quota dei costi fissi aziendali è a zero, quindi l\'utile è sovrastimato. Impostala in Amministrazione → Costi fissi aziendali.</p>' : ''}
      <div class="due-col largo-sx">
        <div class="scorri"><table class="tabella conto"><thead><tr><th></th><th class="num">${chiuso ? 'Finale' : 'A oggi'}</th>${due ? '<th class="num">Stima a fine lavori</th>' : ''}</tr></thead><tbody>
          ${riga('<b>Ricavi</b> <span class="nota">(fatturato, senza IVA)</span>', 'ricavi', { forte: true })}
          ${riga('Costi variabili', 'cv', { meno: true, r: true })}
          ${variabili.map(voce).join('')}
          ${riga('<b>Margine di contribuzione</b>', 'mdc', { forte: true, r: true })}
          ${riga('Costi fissi di cantiere', 'cf', { meno: true, r: true })}
          ${fissi.map(voce).join('')}
          ${riga('<b>Margine di cantiere</b>', 'mc', { forte: true, r: true })}
          ${riga(`Quota costi fissi aziendali (${fmt.pct(quota)} dei ricavi)`, 'q', { meno: true })}
          <tr class="utile"><td><b>Utile del cantiere</b></td>${col(oggi, 'utile', true)}${due ? col(fine, 'utile', true) : ''}</tr>
        </tbody></table></div>
        <div>
          <h3 style="margin-bottom:8px">Indicatori</h3>
          <table class="tabella"><tbody>
            <tr><td>Importo del contratto</td><td class="num">${fmt.euro(contratto)}</td></tr>
            <tr><td>Fatturato / ancora da fatturare</td><td class="num">${fmt.euro(fatturato)} / ${fmt.euro(Math.max(0, contratto - fatturato))}</td></tr>
            <tr><td>Incassato / da incassare</td><td class="num">${fmt.euro(e.incassato)} / ${fmt.euro(fatturato - Number(e.incassato))}</td></tr>
            <tr><td>Ore di manodopera</td><td class="num">${fmt.ore(ore)}</td></tr>
            <tr><td>Costo medio della manodopera all'ora</td><td class="num">${ore ? fmt.euro(cons['Manodopera'] / ore) : '–'}</td></tr>
            <tr><td>Ricavo per ora lavorata</td><td class="num">${ore ? fmt.euro(fatturato / ore) : '–'}</td></tr>
            <tr><td>Ore dei mezzi</td><td class="num">${fmt.ore(e.ore_mezzi)}</td></tr>
            <tr><td>Durata</td><td class="num">${giorni ? `${giorni} giorni` : 'manca la data di inizio'}</td></tr>
            ${p ? `<tr><td>Preventivo ${esc(p.numero)}: prezzo / costi stimati</td><td class="num">${fmt.euro(prevNetto)} / ${fmt.euro(prevCosti)}</td></tr>
              <tr><td>Margine stimato nel preventivo</td><td class="num">${fmt.euro(prevNetto - prevCosti)}</td></tr>` : ''}
          </tbody></table>
          <p class="nota" style="margin-top:10px"><b>Costi variabili</b>: crescono con il lavoro fatto (manodopera, mezzi, materiali, attrezzature, subappalti, noli, trasporti). <b>Costi fissi di cantiere</b>: le spese generali del cantiere (allestimento, sicurezza, baracche, guardiania). <b>Quota costi fissi aziendali</b>: la parte di ufficio, sede, assicurazioni e consulenze che questo cantiere deve coprire.</p>
        </div>
      </div>
      <div class="solo-stampa" id="r-stampabile"></div>`;

    const righeExcel = () => {
      const r = (t, k) => ({ Voce: t, [chiuso ? 'Finale' : 'A oggi']: Math.round(oggi[k] * 100) / 100, ...(due ? { 'Stima a fine lavori': Math.round(fine[k] * 100) / 100 } : {}) });
      const v = k => ({ Voce: '   ' + k, [chiuso ? 'Finale' : 'A oggi']: Math.round(cons[k] * 100) / 100, ...(due ? { 'Stima a fine lavori': Math.round(stima[k] * 100) / 100 } : {}) });
      return [r('Ricavi', 'ricavi'), r('Costi variabili', 'cv'), ...variabili.filter(k => cons[k] || stima[k]).map(v), r('Margine di contribuzione', 'mdc'),
        r('Costi fissi di cantiere', 'cf'), ...fissi.filter(k => cons[k] || stima[k]).map(v), r('Margine di cantiere', 'mc'), r(`Quota costi fissi aziendali (${quota}%)`, 'q'), r('Utile del cantiere', 'utile')];
    };
    $('#r-excel', el).onclick = () => ui.excel(`Resoconto ${c.nome}`, [{ nome: 'Conto economico', righe: righeExcel() }]);
    $('#r-stampa', el).onclick = () => {
      $('#r-stampabile', el).innerHTML = App.intestazioneStampa('Resoconto economico di cantiere', `${chiuso ? 'Consuntivo finale' : 'Situazione al ' + fmt.data(fmt.oggi())}`) +
        `<p style="margin-bottom:12px"><b>${esc(c.nome)}</b>${c.codice ? ' – ' + esc(c.codice) : ''}${c.committente ? ' – ' + esc(c.committente.ragione_sociale) : ''}${c.cig ? ' – CIG ' + esc(c.cig) : ''}</p>` +
        el.querySelector('.due-col').innerHTML;
      window.print();
    };
    const bc = $('#r-chiudi', el);
    if (bc) bc.onclick = async () => {
      if (!await conferma(`Chiudere il cantiere "${c.nome}"? Non comparirà più nelle presenze. Potrai riaprirlo da "Modifica dati".`, { si: 'Chiudi il cantiere' })) return;
      try { await db.aggiorna('cantieri', c.id, { stato: 'chiuso' }); ui.dimentica('cantieri'); avviso('Cantiere chiuso'); ui.pagine.cantiere($('#contenuto'), c.id); } catch (err) { errore(err); }
    };
  }

  function costi(el, c) {
    el.innerHTML = `<h2 style="margin-bottom:4px">Spese previste</h2><p class="nota" style="margin-bottom:12px">Acquisti decisi o ordinati per questo cantiere (attrezzi, materiali, noli) di cui non è ancora arrivata la fattura. Entrano subito nella stima a fine lavori. Quando arriva la fattura premi "Registra fattura": la spesa diventa effettiva e non viene contata due volte.</p><div id="k-prev"></div>
      <div class="sezione"><h2 style="margin-bottom:4px">Fatture dei fornitori</h2><p class="nota" style="margin-bottom:12px">Le fatture ricevute collegate a questo cantiere.</p><div id="k-fatt"></div></div>
      <div class="sezione"><h2 style="margin-bottom:4px">Altre spese</h2><p class="nota" style="margin-bottom:12px">Spese senza fattura o non ancora arrivata: piccoli acquisti, rimborsi, stime.</p><div id="k-spese"></div></div>`;
    const fattureCantiere = App.elencoFatture($('#k-fatt', el), 'ricevuta', { cantiere_id: c.id });
    const prev = ui.elenco($('#k-prev', el), {
      tabella: 'spese_previste', esporta: `Spese previste ${c.nome}`, nuovo: 'Aggiungi spesa prevista',
      q: { sel: '*,fornitore:anagrafiche(ragione_sociale),fattura:fatture(numero,data,imponibile)', eq: { cantiere_id: c.id } }, ordina: 'data_prevista,id', fissi: { cantiere_id: c.id },
      filtri: [{ k: 'vista', label: 'Mostra', predef: 'aperte', opzioni: [['aperte', 'In attesa di fattura'], ['arrivate', 'Fattura arrivata'], ['', 'Tutte']],
        applica: (q, v) => { if (v === 'aperte') q.nullo = { fattura_id: true }; if (v === 'arrivate') q.nullo = { fattura_id: false }; } }],
      campi: [
        { k: 'descrizione', label: 'Cosa', richiesto: true, largo: true, aiuto: 'es. Avvitatori a impulsi e chiavi dinamometriche' },
        { k: 'categoria', label: 'Voce', tipo: 'select', opzioni: App.CATEGORIE_COSTO, richiesto: true },
        { k: 'importo', label: 'Importo previsto senza IVA', tipo: 'euro', richiesto: true },
        { k: 'fornitore_id', label: 'Fornitore', tipo: 'rif', rif: App.RIF.fornitore },
        { k: 'data_prevista', label: 'Data prevista di acquisto', tipo: 'data' },
        { k: 'note', label: 'Note (n. ordine, preventivo del fornitore…)', tipo: 'area' }
      ],
      predefiniti: () => ({ categoria: 'Attrezzature', data_prevista: fmt.oggi() }),
      titoloModifica: r => r.descrizione,
      colonne: [
        { k: 'descrizione', t: 'Cosa', f: r => `<b>${esc(r.descrizione)}</b>` },
        { k: 'categoria', t: 'Voce' },
        { k: 'fornitore', t: 'Fornitore', f: r => esc(r.fornitore ? r.fornitore.ragione_sociale : '') },
        { k: 'data_prevista', t: 'Prevista per', f: r => fmt.data(r.data_prevista) },
        { k: 'importo', t: 'Previsto', num: true, f: r => fmt.euro(r.importo), x: r => Number(r.importo) },
        { k: 'fattura', t: 'Fattura', f: r => r.fattura ? `<span class="stato verde">n. ${esc(r.fattura.numero)} – ${fmt.euro(r.fattura.imponibile)}</span>` : `<span class="azioni"><button class="btn piccolo" data-registra="${r.id}">Registra fattura</button><button class="btn vuoto piccolo" data-collega="${r.id}">Collega esistente</button></span>`, x: r => r.fattura ? r.fattura.numero : '' }
      ],
      classeRiga: r => r.fattura ? 'spento' : '',
      piede: r => `<tr><td colspan="4">Ancora da fatturare</td><td class="num">${fmt.euro(r.filter(x => !x.fattura).reduce((a, x) => a + Number(x.importo), 0))}</td><td></td></tr>`
    });
    $('#k-prev', el).addEventListener('click', async e => {
      const br = e.target.closest('[data-registra]'), bc = e.target.closest('[data-collega]');
      if (!br && !bc) return;
      const sp = prev.righe.find(x => String(x.id) === (br || bc).dataset[br ? 'registra' : 'collega']);
      const dopo = () => { prev.ricarica(); fattureCantiere.ricarica(); };
      if (br) return App.nuovaFatturaRicevuta({ cantiere_id: c.id, anagrafica_id: sp.fornitore_id, categoria: sp.categoria, imponibile: sp.importo, descrizione: sp.descrizione }, async f => { await db.aggiorna('spese_previste', sp.id, { fattura_id: f.id }); avviso('Fattura registrata: la spesa ora è effettiva'); dopo(); });
      // collega una fattura già registrata, non ancora associata ad altre spese previste
      const [ff, gia] = await Promise.all([
        db.lista('fatture', { eq: { tipo: 'ricevuta' }, or: `cantiere_id.eq.${c.id},cantiere_id.is.null`, ordina: 'data.desc', limite: 200, sel: 'id,numero,data,imponibile,cantiere_id,anagrafica:anagrafiche(ragione_sociale)' }),
        db.lista('spese_previste', { nullo: { fattura_id: false }, sel: 'fattura_id' })
      ]);
      const libere = ff.filter(f => !gia.some(g => g.fattura_id === f.id));
      if (!libere.length) return avviso('Nessuna fattura ricevuta da collegare. Usa "Registra fattura".', { errore: true });
      ui.modulo({
        titolo: `Collega una fattura a: ${sp.descrizione}`, testoSalva: 'Collega',
        campi: [{ k: 'fattura', label: 'Fattura ricevuta', tipo: 'select', richiesto: true, opzioni: libere.map(f => [String(f.id), `n. ${f.numero} del ${fmt.data(f.data)} – ${f.anagrafica ? f.anagrafica.ragione_sociale : ''} – ${fmt.euro(f.imponibile)}${f.cantiere_id ? '' : ' (senza cantiere)'}`]) }],
        salva: async d => {
          const f = libere.find(x => String(x.id) === d.fattura);
          if (!f.cantiere_id) await db.aggiorna('fatture', f.id, { cantiere_id: c.id, categoria: sp.categoria });
          await db.aggiorna('spese_previste', sp.id, { fattura_id: f.id });
          avviso('Fattura collegata'); dopo();
        }
      });
    });
    ui.elenco($('#k-spese', el), {
      tabella: 'costi', esporta: `Spese ${c.nome}`, nuovo: 'Aggiungi spesa', q: { eq: { cantiere_id: c.id } }, ordina: 'data.desc', fissi: { cantiere_id: c.id },
      campi: [
        { k: 'data', label: 'Data', tipo: 'data', richiesto: true },
        { k: 'categoria', label: 'Voce', tipo: 'select', opzioni: App.CATEGORIE_COSTO, richiesto: true },
        { k: 'descrizione', label: 'Descrizione', largo: true },
        { k: 'fornitore_id', label: 'Fornitore', tipo: 'rif', rif: App.RIF.fornitore },
        { k: 'documento', label: 'Documento (scontrino, DDT…)' },
        { k: 'importo', label: 'Importo senza IVA', tipo: 'euro', richiesto: true }
      ],
      predefiniti: () => ({ data: fmt.oggi(), categoria: 'Materiali' }),
      colonne: [
        { k: 'data', t: 'Data', f: r => fmt.data(r.data) }, { k: 'categoria', t: 'Voce' }, { k: 'descrizione', t: 'Descrizione' },
        { k: 'documento', t: 'Documento' }, { k: 'importo', t: 'Importo', num: true, f: r => fmt.euro(r.importo), x: r => Number(r.importo) }
      ],
      piede: r => `<tr><td colspan="4">Totale</td><td class="num">${fmt.euro(r.reduce((s, x) => s + Number(x.importo), 0))}</td></tr>`
    });
  }

  function fatturato(el, c) {
    el.innerHTML = `<p class="nota" style="margin-bottom:12px">Le fatture emesse per questo cantiere (SAL, acconti, saldo).</p><div id="f-emesse"></div>`;
    App.elencoFatture($('#f-emesse', el), 'emessa', { cantiere_id: c.id });
  }

  async function ore(el, c) {
    const dal = fmt.piuGiorni(fmt.oggi(), -60);
    el.innerHTML = `<p class="nota" style="margin-bottom:16px">Ultimi 60 giorni. Per periodi diversi usa Presenze → Riepilogo.</p>
      <div class="due-col"><div><h2 style="margin-bottom:10px">Ore per lavoratore</h2><div class="scorri"><table class="tabella" id="o-lav"></table></div></div>
      <div><h2 style="margin-bottom:10px">Ore dei mezzi</h2><div class="scorri"><table class="tabella" id="o-mez"></table></div></div></div>`;
    const [timb, mez] = await Promise.all([
      db.lista('v_timbrature', { eq: { cantiere_id: c.id }, gte: { giorno: dal }, ordina: 'ora' }),
      db.lista('ore_mezzi', { eq: { cantiere_id: c.id }, gte: { giorno: dal }, sel: '*,mezzo:mezzi(nome)' })
    ]);
    const perLav = new Map();
    for (const t of App.calcolaTurni(timb)) { const x = perLav.get(t.lavoratore) || { g: new Set(), o: 0 }; x.g.add(t.giorno); x.o += t.ore || 0; perLav.set(t.lavoratore, x); }
    $('#o-lav', el).innerHTML = perLav.size ? `<thead><tr><th>Lavoratore</th><th class="num">Giorni</th><th class="num">Ore</th></tr></thead><tbody>${[...perLav].sort().map(([n, x]) => `<tr><td>${esc(n)}</td><td class="num">${x.g.size}</td><td class="num">${fmt.ore(x.o)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Totale</td><td></td><td class="num">${fmt.ore([...perLav.values()].reduce((s, x) => s + x.o, 0))}</td></tr></tfoot>` : '<tbody><tr><td class="vuota">Nessuna presenza registrata.</td></tr></tbody>';
    const perMez = new Map();
    for (const m of mez) perMez.set(m.mezzo.nome, (perMez.get(m.mezzo.nome) || 0) + Number(m.ore));
    $('#o-mez', el).innerHTML = perMez.size ? `<thead><tr><th>Mezzo</th><th class="num">Ore</th></tr></thead><tbody>${[...perMez].sort().map(([n, o]) => `<tr><td>${esc(n)}</td><td class="num">${fmt.ore(o)}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="vuota">Nessuna ora dei mezzi. Si registrano nel Giornale lavori.</td></tr></tbody>';
  }

  async function giornale(el, c) {
    const righe = await db.lista('giornale', { eq: { cantiere_id: c.id }, ordina: 'giorno.desc', limite: 120 });
    el.innerHTML = `<div class="azioni" style="margin-bottom:14px"><button class="btn rosso" id="g-oggi">Apri il giornale di oggi</button></div>
      <div class="scorri"><table class="tabella">${righe.length ? `<thead><tr><th>Giorno</th><th>Meteo</th><th>Lavorazioni</th></tr></thead><tbody>${righe.map(r => `<tr class="cliccabile" data-g="${r.giorno}" tabindex="0"><td>${fmt.data(r.giorno)}</td><td>${esc(r.meteo)}</td><td>${esc(r.lavorazioni.slice(0, 140))}${r.lavorazioni.length > 140 ? '…' : ''}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="vuota">Nessuna giornata compilata.</td></tr></tbody>'}</table></div>`;
    $('#g-oggi', el).onclick = () => App.apriGiornale(c.id, fmt.oggi());
    el.querySelector('table').addEventListener('click', e => { const tr = e.target.closest('[data-g]'); if (tr) App.apriGiornale(c.id, tr.dataset.g); });
  }

  function documenti(el, c) { App.archivio(el, { cantiere_id: c.id }); }
})();
