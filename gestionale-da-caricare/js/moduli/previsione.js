// Previsione di cantiere: dall'offerta al consuntivo.
// Offerta con analisi prezzi → fabbisogno risorse → ordine di cantiere (budget, richieste d'acquisto, cronoprogramma)
// → SAL e fatture → confronto preventivo / impegnato / speso / stima a fine lavori, per blocco di costo.
(function () {
  const { $, $$, esc, fmt, avviso, errore, conferma } = ui;
  const n = x => Number(x) || 0;
  const r2 = x => Math.round(x * 100) / 100;
  const somma = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const SCHEDE = 'panoramica,economia,resoconto,costi,fabbisogno,sal,fatturato,ore,giornale,cronoprogramma,documenti';
  App.SCHEDE_CANTIERE = SCHEDE;
  const apriScheda = (id, s) => { try { sessionStorage.setItem('scheda-' + SCHEDE, s); } catch {} ui.vai('cantiere', id); };

  // Blocchi di costo (come i "blocchi" dell'analisi di cantiere)
  const BLOCCHI = [
    { cod: '10', nome: 'Materiali', voci: ['Materiali', 'Attrezzature'], colore: 'blu' },
    { cod: '20', nome: 'Manodopera', voci: ['Manodopera'], colore: 'verde' },
    { cod: '30', nome: 'Noli, mezzi e trasporti', voci: ['Mezzi interni', 'Noli esterni', 'Trasporti'], colore: 'arancio' },
    { cod: '50', nome: 'Subappalti', voci: ['Subappalti'], colore: 'rosso' },
    { cod: '90', nome: 'Spese generali', voci: ['Spese generali di cantiere', 'Altro'], colore: 'ardesia' }
  ];
  App.BLOCCHI = BLOCCHI;
  App.bloccoDi = cat => BLOCCHI.find(b => b.voci.includes(cat)) || BLOCCHI[4];
  const INTERNE = ['Manodopera', 'Mezzi interni'];            // non si comprano: servono ore, non ordini
  const voceBudget = k => App.CATEGORIE_BUDGET.includes(k) ? k : (k === 'Spese generali' ? 'Spese generali di cantiere' : 'Altro');

  App.eliminaRisorse = async voceId => { for (const r of await db.lista('voce_risorse', { eq: { voce_id: voceId } })) await db.elimina('voce_risorse', r.id); };

  // ---------- Fabbisogno: somma le risorse di tutte le voci ----------
  App.aggregaFabbisogno = function (voci, sconti = {}) {
    const m = new Map();
    for (const v of voci) {
      const q = n(v.quantita);
      const righe = v.risorse && v.risorse.length ? v.risorse : (n(v.costo) ? [{ categoria: 'Altro', descrizione: `Costo stimato senza analisi – ${v.codice || (v.descrizione || '').slice(0, 40)}`, um: v.um, resa: 1, costo: v.costo, senzaAnalisi: true }] : []);
      for (const r of righe) {
        const key = `${r.categoria}|${(r.descrizione || '').trim().toLowerCase()}|${(r.um || '').trim().toLowerCase()}`;
        const x = m.get(key) || { key, categoria: r.categoria, descrizione: (r.descrizione || '').trim(), um: r.um || '', quantita: 0, totale: 0, voci: new Set(), vociId: new Set(), senzaAnalisi: !!r.senzaAnalisi };
        x.quantita += q * n(r.resa); x.totale += q * n(r.resa) * n(r.costo); x.voci.add(v.codice || 'voce ' + (voci.indexOf(v) + 1)); x.vociId.add(v.id);
        m.set(key, x);
      }
    }
    return [...m.values()].map(x => ({ ...x, quantita: r2(x.quantita), totale: r2(x.totale), costo: x.quantita ? x.totale / x.quantita : 0, voci: [...x.voci], vociId: [...x.vociId], blocco: x.senzaAnalisi ? { cod: '99', nome: 'Senza analisi', colore: 'ardesia' } : App.bloccoDi(x.categoria) }));
  };

  // Griglia del fabbisogno raggruppata per blocco. Con "acquisti" mostra lo stato delle richieste d'acquisto e permette di crearle.
  App.disegnaFabbisogno = function (el, { voci, ricavo, titolo, acquisti = null, quandoCrea }) {
    const righe = App.aggregaFabbisogno(voci);
    const costo = somma(righe, r => r.totale);
    const ore = somma(righe.filter(r => r.categoria === 'Manodopera' && /^(h|ore?)$/i.test(r.um)), r => r.quantita);
    const oreMezzi = somma(righe.filter(r => r.categoria === 'Mezzi interni' && /^(h|ore?)$/i.test(r.um)), r => r.quantita);
    const blocchi = [...BLOCCHI, { cod: '99', nome: 'Senza analisi', colore: 'ardesia' }].map(b => ({ ...b, righe: righe.filter(r => r.blocco.cod === b.cod) })).filter(b => b.righe.length);
    const statoAcq = r => {
      if (!acquisti) return '';
      if (INTERNE.includes(r.categoria)) return '<span class="nota">risorsa interna</span>';
      const s = acquisti.filter(a => a.rif_fabbisogno === r.key);
      if (!s.length) return '<span class="stato giallo">da richiedere</span>';
      const imp = somma(s, a => n(a.importo)), fatt = s.filter(a => a.fattura_id).length;
      return `<span class="stato ${fatt === s.length ? 'verde' : 'blu'}">${fatt === s.length ? 'fatturata' : 'richiesta'}</span> <span class="nota">${fmt.euro(imp)}</span>`;
    };
    const sceglibile = r => acquisti && !INTERNE.includes(r.categoria) && !acquisti.some(a => a.rif_fabbisogno === r.key);
    const col = acquisti ? 9 : 7;
    el.innerHTML = `
      <div class="pv-tessere">${blocchi.map(b => { const t = somma(b.righe, r => r.totale); return `<div class="pv-tes ${b.colore}"><span>${esc(b.cod)} · ${esc(b.nome)}</span><b>${fmt.euro(t)}</b><small>${fmt.pct(costo ? t / costo * 100 : null)} del costo</small></div>`; }).join('')}
        <div class="pv-tes chiaro"><span>Ore di manodopera</span><b>${fmt.num(Math.round(ore))} h</b><small>${fmt.num(Math.round(ore / 8))} giornate-uomo${oreMezzi ? ` · mezzi ${fmt.num(Math.round(oreMezzi))} h` : ''}</small></div></div>
      ${!righe.length ? '<p class="nota" style="margin-top:14px">Nessuna risorsa: apri l\'analisi delle voci e indica materiali, manodopera, noli e subappalti per unità di misura.</p>' : `
      <div class="testata" style="margin:18px 0 8px"><h2>Fabbisogno risorse</h2><div class="azioni">
        ${acquisti ? '<button class="btn piccolo" data-crea disabled>Crea richieste d\'acquisto</button>' : ''}<button class="btn vuoto piccolo" data-excel>Esporta Excel</button></div></div>
      <div class="scorri"><table class="tabella fabb">
        <thead><tr>${acquisti ? '<th style="width:34px"><input type="checkbox" data-tutte aria-label="Scegli tutte le righe da richiedere"></th>' : ''}<th>Risorsa</th><th>Usata nelle voci</th><th>U.m.</th><th class="num">Quantità</th><th class="num">Costo medio</th><th class="num">Totale</th><th class="num">%</th>${acquisti ? '<th>Richiesta d\'acquisto</th>' : ''}</tr></thead>
        ${blocchi.map(b => { const t = somma(b.righe, r => r.totale); return `<tbody class="pv-gruppo"><tr class="pv-capo"><td colspan="${acquisti ? 6 : 5}"><button class="pv-apri" aria-expanded="true">${esc(b.cod)} – ${esc(b.nome)}</button></td><td class="num">Σ ${fmt.euro(t)}</td><td class="num">${fmt.pct(costo ? t / costo * 100 : null)}</td>${acquisti ? '<td></td>' : ''}</tr>
          ${b.righe.sort((x, y) => y.totale - x.totale).map(r => `<tr>${acquisti ? `<td>${sceglibile(r) ? `<input type="checkbox" data-rk="${esc(r.key)}" aria-label="Scegli ${esc(r.descrizione)}">` : ''}</td>` : ''}
            <td><b>${esc(r.descrizione)}</b>${b.cod !== '99' ? ` <span class="nota">${esc(r.categoria)}</span>` : ''}</td><td class="nota">${esc(r.voci.join(', '))}</td><td>${esc(r.um)}</td>
            <td class="num">${fmt.num(r.quantita)}</td><td class="num">${fmt.euro(r.costo)}</td><td class="num">${fmt.euro(r.totale)}</td><td class="num">${fmt.pct(costo ? r.totale / costo * 100 : null)}</td>${acquisti ? `<td>${statoAcq(r)}</td>` : ''}</tr>`).join('')}</tbody>`; }).join('')}
        <tfoot><tr><td colspan="${acquisti ? 6 : 5}">Costo previsto${ricavo ? ` · ricavo ${fmt.euro(ricavo)} · margine ${fmt.euro(ricavo - costo)} (${fmt.pct(ricavo ? (ricavo - costo) / ricavo * 100 : null)})` : ''}</td><td class="num">${fmt.euro(costo)}</td><td class="num">100%</td>${acquisti ? '<td></td>' : ''}</tr></tfoot>
      </table></div>
      <p class="nota" style="margin-top:8px">Quantità = quantità della voce × quantità per unità indicata nell'analisi. ${acquisti ? 'Scegli le righe e premi "Crea richieste d\'acquisto": diventano spese previste del cantiere e compaiono nella previsione finché non arriva la fattura.' : 'Quando l\'offerta diventa un ordine, questo fabbisogno diventa il budget del cantiere e le richieste d\'acquisto.'}</p>`}`;
    el.querySelectorAll('.pv-apri').forEach(b => b.onclick = () => { const ap = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', ap); b.closest('tbody').classList.toggle('chiuso', !ap); });
    const ex = el.querySelector('[data-excel]');
    if (ex) ex.onclick = () => ui.excel(titolo || 'Fabbisogno risorse', [{ nome: 'Fabbisogno', righe: righe.map(r => ({ Blocco: `${r.blocco.cod} ${r.blocco.nome}`, 'Voce di costo': r.categoria, Risorsa: r.descrizione, Voci: r.voci.join(', '), 'U.m.': r.um, Quantità: r.quantita, 'Costo medio': r2(r.costo), Totale: r.totale })) }]);
    if (acquisti) {
      const crea = el.querySelector('[data-crea]'), scelte = () => [...el.querySelectorAll('[data-rk]:checked')].map(c => righe.find(r => r.key === c.dataset.rk));
      const agg = () => { const s = scelte(); if (crea) { crea.disabled = !s.length; crea.textContent = s.length ? `Crea ${s.length === 1 ? 'una richiesta' : s.length + ' richieste'} d'acquisto (${fmt.euro(somma(s, r => r.totale))})` : 'Crea richieste d\'acquisto'; } };
      el.addEventListener('change', e => { if (e.target.matches('[data-tutte]')) el.querySelectorAll('[data-rk]').forEach(c => { c.checked = e.target.checked; }); agg(); });
      if (crea) crea.onclick = () => quandoCrea(scelte());
    }
    return righe;
  };

  // ---------- Dall'offerta all'ordine di cantiere ----------
  App.creaOrdineCantiere = async function (p, voci, tot) {
    const cantieri = await db.lista('cantieri', { ordina: 'nome' });
    const righe = App.aggregaFabbisogno(voci);
    const costo = somma(righe, r => r.totale), acq = righe.filter(r => !INTERNE.includes(r.categoria) && !r.senzaAnalisi);
    const inizio = fmt.piuGiorni(fmt.oggi(), 7);
    const w = ui.finestra(`<h2>Crea ordine di cantiere</h2>
      <p class="nota" style="margin-bottom:16px">Dall'offerta <b class="forte">${esc(p.numero)}</b> (${fmt.euro(tot.netto)}) il gestionale prepara in un colpo solo tutta la previsione del cantiere. Potrai cambiare tutto dopo.</p>
      <fieldset class="pv-dove"><legend>Cantiere</legend>
        <label class="spunta"><input type="radio" name="dove" value="nuovo" checked> Nuovo cantiere</label>
        <div class="campi" data-nuovo><div class="largo"><label for="o-nome">Nome del cantiere</label><input id="o-nome" value="${esc(p.oggetto || 'Lavori offerta ' + p.numero)}"></div>
          <div><label for="o-inizio">Inizio lavori</label><input id="o-inizio" type="date" value="${inizio}"></div></div>
        <label class="spunta"><input type="radio" name="dove" value="esistente"> Cantiere già aperto</label>
        <div data-esistente hidden><label for="o-cant" class="ck-nascosto">Cantiere</label><select id="o-cant">${cantieri.filter(c => c.stato !== 'chiuso').map(c => `<option value="${c.id}">${esc((c.codice ? c.codice + ' – ' : '') + c.nome)}</option>`).join('')}</select></div>
      </fieldset>
      <fieldset class="pv-cosa"><legend>Cosa preparare</legend>
        <label class="spunta"><input type="checkbox" id="o-contratto" checked> Importo del contratto: ${fmt.euro(tot.netto)}</label>
        <label class="spunta"><input type="checkbox" id="o-budget" checked> Budget dei costi dal fabbisogno: ${fmt.euro(costo)}, diviso per voce di costo</label>
        <label class="spunta"><input type="checkbox" id="o-rda" ${acq.length ? 'checked' : 'disabled'}> Richieste d'acquisto (spese previste) per materiali, noli e subappalti: ${acq.length} righe, ${fmt.euro(somma(acq, r => r.totale))}</label>
        <label class="spunta"><input type="checkbox" id="o-crono" checked> Cronoprogramma: un'attività per voce, durata dalle ore di manodopera</label>
        <div class="pv-squadra"><label for="o-squadra">Persone in squadra</label><input id="o-squadra" type="number" min="1" max="30" value="3" inputmode="numeric"></div>
      </fieldset>
      <div class="azioni"><button class="btn vuoto" data-no>Annulla</button><button class="btn rosso" data-si>Crea l'ordine</button></div>`, { chiudiFuori: false });
    const q = s => w.el.querySelector(s);
    w.el.querySelectorAll('[name=dove]').forEach(r => r.onchange = () => { const nuovo = q('[name=dove]:checked').value === 'nuovo'; q('[data-nuovo]').hidden = !nuovo; q('[data-esistente]').hidden = nuovo; });
    q('#o-crono').onchange = () => { q('.pv-squadra').hidden = !q('#o-crono').checked; };
    q('[data-no]').onclick = w.chiudi;
    q('[data-si]').onclick = async () => {
      const bt = q('[data-si]'); bt.disabled = true; bt.textContent = 'Preparo…';
      try {
        const nuovo = q('[name=dove]:checked').value === 'nuovo';
        let c;
        if (nuovo) {
          const nome = q('#o-nome').value.trim(); if (!nome) throw new Error('Scrivi il nome del cantiere.');
          c = await db.inserisci('cantieri', { nome, comune: p.luogo || '', committente_id: p.cliente_id, importo_contratto: q('#o-contratto').checked ? tot.netto : 0, stato: 'in preparazione', data_inizio: q('#o-inizio').value || inizio, note: `Da offerta ${p.numero}` });
        } else {
          c = cantieri.find(x => String(x.id) === q('#o-cant').value); if (!c) throw new Error('Scegli il cantiere.');
          const agg = {}; if (q('#o-contratto').checked) agg.importo_contratto = tot.netto; if (!c.committente_id && p.cliente_id) agg.committente_id = p.cliente_id;
          if (Object.keys(agg).length) c = await db.aggiorna('cantieri', c.id, agg);
        }
        const start = c.data_inizio || inizio;
        await db.aggiorna('preventivi', p.id, { cantiere_id: c.id, stato: 'accettato' });
        if (q('#o-budget').checked) {
          for (const b of await db.lista('budget', { eq: { cantiere_id: c.id } })) await db.elimina('budget', b.id);
          const per = {}; for (const r of righe) per[voceBudget(r.categoria)] = (per[voceBudget(r.categoria)] || 0) + r.totale;
          const ins = Object.entries(per).filter(x => x[1] > 0).map(([categoria, importo]) => ({ cantiere_id: c.id, categoria, importo: r2(importo), note: `Dal fabbisogno dell'offerta ${p.numero}` }));
          if (ins.length) await db.inserisci('budget', ins);
        }
        const inizioVoce = {};
        if (q('#o-crono').checked) {
          const sq = Math.max(1, Number(q('#o-squadra').value) || 3), colori = ['blu', 'verde', 'arancio', 'rosso', 'teal', 'viola', 'giallo'];
          const esist = await db.lista('attivita', { eq: { cantiere_id: c.id } }).catch(() => []);
          let giorno = start, prima = null, ordine = esist.length;
          for (const [i, v] of voci.entries()) {
            const oreV = n(v.quantita) * somma((v.risorse || []).filter(r => r.categoria === 'Manodopera'), r => n(r.resa));
            const lavorativi = Math.max(1, Math.ceil(oreV / (8 * sq)));
            const durata = Math.max(1, Math.round(lavorativi * 7 / 5));
            const a = await db.inserisci('attivita', { cantiere_id: c.id, padre_id: null, nome: (v.descrizione || v.codice || `Voce ${i + 1}`).split('\n')[0].slice(0, 80), inizio: giorno, durata, predecessore_id: prima, colore: colori[i % colori.length], avanzamento: 0, ordine: ordine++, note: v.codice ? `Voce ${v.codice}` : '', voce_id: v.id });
            inizioVoce[v.id] = giorno; prima = a.id; giorno = fmt.piuGiorni(giorno, durata);
          }
          if (nuovo || !c.data_fine_prevista) await db.aggiorna('cantieri', c.id, { data_fine_prevista: fmt.piuGiorni(giorno, -1) });
        }
        if (q('#o-rda').checked && acq.length) {
          await db.inserisci('spese_previste', acq.map(r => ({ cantiere_id: c.id, data_prevista: r.vociId.map(id => inizioVoce[id]).filter(Boolean).sort()[0] || start, categoria: App.CATEGORIE_COSTO.includes(r.categoria) ? r.categoria : 'Altro',
            descrizione: `${r.descrizione} – ${fmt.num(r.quantita)} ${r.um}`.trim(), fornitore_id: null, importo: r.totale, fattura_id: null, note: `Dal fabbisogno dell'offerta ${p.numero}`, rif_fabbisogno: r.key })));
        }
        ui.dimentica('cantieri'); w.chiudi(); avviso('Ordine creato: ecco la previsione del cantiere');
        try { sessionStorage.setItem('cockpit-cantiere', c.id); } catch {}
        apriScheda(c.id, 'economia');
      } catch (e) { bt.disabled = false; bt.textContent = 'Crea l\'ordine'; errore(e); }
    };
  };

  // ---------- Dati comuni del cantiere ----------
  async function datiCantiere(c) {
    const id = c.id;
    const [budget, costi, fatture, spese, ev, att, sal, prevs, timb, om, mezzi] = await Promise.all([
      db.lista('budget', { eq: { cantiere_id: id } }),
      db.lista('costi', { eq: { cantiere_id: id } }),
      db.lista('fatture', { eq: { cantiere_id: id } }),
      db.lista('spese_previste', { eq: { cantiere_id: id }, ordina: 'data_prevista' }),
      db.lista('v_economia_cantieri', { eq: { cantiere_id: id } }),
      db.lista('attivita', { eq: { cantiere_id: id }, ordina: 'inizio' }).catch(() => []),
      db.lista('sal', { eq: { cantiere_id: id }, ordina: 'numero' }).catch(() => []),
      db.lista('preventivi', { eq: { cantiere_id: id }, ordina: 'data' }),
      db.lista('v_timbrature', { eq: { cantiere_id: id } }).catch(() => []),
      db.lista('ore_mezzi', { eq: { cantiere_id: id } }).catch(() => []),
      db.lista('mezzi', { sel: 'id,costo_orario' }).catch(() => [])
    ]);
    const e = ev[0] || {};
    const voci = await App.vociConRisorse(prevs.map(p => p.id));
    for (const v of voci) { const p = prevs.find(x => x.id === v.preventivo_id); v.prezzoNetto = n(v.prezzo) * (1 - n(p && p.sconto_pct) / 100); }
    const righeSal = sal.length ? await db.lista('sal_righe', { in: { sal_id: sal.map(s => s.id) } }) : [];
    const lavoriSal = s => r2(somma(righeSal.filter(r => r.sal_id === s.id), r => { const v = voci.find(x => x.id === r.voce_id); return v ? n(r.quantita) * v.prezzoNetto : 0; }) + n(s.importo_corpo));
    for (const s of sal) s.lavori = lavoriSal(s);
    // avanzamento dei lavori dal cronoprogramma (attività finali, pesate sulla durata)
    const padri = new Set(att.map(a => a.padre_id).filter(Boolean)), foglie = att.filter(a => !padri.has(a.id));
    const avanz = foglie.length ? somma(foglie, a => n(a.durata) * n(a.avanzamento)) / somma(foglie, a => n(a.durata)) : null;
    return { e, budget, costi, fatture, spese, att, foglie, avanz, sal, righeSal, prevs, voci, timb, om, mezzi };
  }

  function conti(c, d) {
    const zero = () => Object.fromEntries(App.CATEGORIE_BUDGET.map(k => [k, 0]));
    const bud = zero(), cons = zero(), imp = zero();
    cons['Manodopera'] = n(d.e.costo_manodopera); cons['Mezzi interni'] = n(d.e.costo_mezzi);
    for (const x of d.costi) cons[voceBudget(x.categoria)] += n(x.importo);
    for (const x of d.fatture.filter(f => f.tipo === 'ricevuta')) cons[voceBudget(x.categoria)] += n(x.imponibile);
    for (const x of d.spese.filter(s => s.fattura_id == null)) imp[voceBudget(x.categoria)] += n(x.importo);
    for (const b of d.budget) bud[voceBudget(b.categoria)] += n(b.importo);
    const stima = Object.fromEntries(App.CATEGORIE_BUDGET.map(k => [k, Math.max(bud[k], cons[k] + imp[k])]));
    const T = o => somma(Object.values(o), x => x);
    const emesse = d.fatture.filter(f => f.tipo === 'emessa');
    return { bud, cons, imp, stima, budT: T(bud), consT: T(cons), impT: T(imp), stimaT: T(stima),
      contratto: n(c.importo_contratto), salT: somma(d.sal, s => s.lavori), fatturato: somma(emesse, f => n(f.imponibile)), incassato: n(d.e.incassato) };
  }

  // ---------- Scheda "Previsione" ----------
  App.previsioneCantiere = async function (el, c) {
    el.innerHTML = '<p class="nota">Calcolo la previsione…</p>';
    const d = await datiCantiere(c), k = conti(c, d);
    const av = d.avanz, salPct = k.contratto ? k.salT / k.contratto * 100 : null, costiPct = k.stimaT ? k.consT / k.stimaT * 100 : null;
    const margPrev = k.contratto - k.budT, margStima = k.contratto - k.stimaT;
    const eac = av != null && av >= 5 ? k.consT / (av / 100) : null;
    const eseguito = av != null ? k.contratto * av / 100 : null, nonSal = eseguito != null ? Math.max(0, eseguito - k.salT) : 0;
    const avvisi = [];
    if (av != null && costiPct != null && costiPct > av + 5) avvisi.push(['rosso', `Stai spendendo più in fretta di quanto avanzano i lavori: lavori al ${fmt.pct(av)}, costi al ${fmt.pct(costiPct)} del previsto. Con questo andamento il cantiere costerebbe ${fmt.euro(eac)}.`]);
    if (nonSal > Math.max(1000, k.contratto * 0.05)) avvisi.push(['giallo', `Ci sono circa ${fmt.euro(nonSal)} di lavori eseguiti non ancora contabilizzati a SAL.`, 'Prepara il SAL', 'sal']);
    const sforo = App.CATEGORIE_BUDGET.filter(x => k.cons[x] + k.imp[x] > k.bud[x] + 0.5 && k.cons[x] + k.imp[x] > 0);
    if (sforo.length) avvisi.push(['rosso', `Speso più impegnato supera il preventivato in: ${sforo.map(x => `${x} (+${fmt.euro(k.cons[x] + k.imp[x] - k.bud[x])})`).join(', ')}.`]);
    if (!d.budget.length) avvisi.push(['giallo', d.prevs.length ? 'Il cantiere non ha ancora un budget.' : 'Il cantiere non ha un budget né un\'offerta collegata: la previsione resta vuota.', d.prevs.length ? 'Budget dal fabbisogno' : 'Modifica budget', d.prevs.length ? 'ricalcola' : 'budget']);
    const daFatt = somma(d.sal.filter(x => !x.fattura_id), x => x.lavori);
    if (daFatt > 1) avvisi.push(['blu', `SAL non ancora fatturati: ${fmt.euro(daFatt)} di lavori.`, 'Vai ai SAL', 'sal']);

    const kpi = (col, etich, val, sotto, barra) => `<div class="pv-kpi ${col}"><span>${etich}</span><b>${val}</b><small>${sotto}</small>${barra != null ? `<i style="--v:${Math.max(0, Math.min(100, barra))}%"></i>` : ''}</div>`;
    el.innerHTML = `
      <div class="pv-kpis">
        ${kpi('blu', 'Lavori eseguiti', fmt.pct(av), av == null ? 'aggiorna il cronoprogramma' : `circa ${fmt.euro(eseguito)} di lavori`, av)}
        ${kpi('rosso', 'Costi sostenuti', fmt.euro(k.consT), `${fmt.pct(costiPct)} del costo stimato`, costiPct)}
        ${kpi('verde', 'SAL maturati', fmt.euro(k.salT), `${fmt.pct(salPct)} del contratto · fatturato ${fmt.euro(k.fatturato)}`, salPct)}
        ${kpi('ardesia', 'Margine a preventivo', fmt.euro(margPrev), `${fmt.pct(k.contratto ? margPrev / k.contratto * 100 : null)} su ${fmt.euro(k.contratto)}`)}
        ${kpi(margStima < 0 ? 'rosso' : 'bordeaux', 'Margine stimato a fine lavori', fmt.euro(margStima), eac != null ? `con l'andamento attuale: ${fmt.euro(k.contratto - eac)}` : `${fmt.pct(k.contratto ? margStima / k.contratto * 100 : null)} del contratto`)}
      </div>
      ${avvisi.map(([col, t, bt, az]) => `<div class="pv-avviso ${col}" role="status"><span>${esc(t)}</span>${bt ? `<button class="btn vuoto piccolo" data-az="${az}">${esc(bt)}</button>` : ''}</div>`).join('')}
      <div class="pv-due">
        <section class="pannello pv-blocco">
          <div class="testata" style="margin-bottom:10px"><h2>Preventivo e consuntivo per blocco di costo</h2><div class="azioni non-stampare">
            ${d.prevs.length ? '<button class="btn vuoto piccolo" data-az="ricalcola">Budget dal fabbisogno</button>' : ''}<button class="btn vuoto piccolo" data-az="budget">Modifica budget</button><button class="btn vuoto piccolo" data-az="excel">Excel</button></div></div>
          <div class="scorri"><table class="tabella pv-tab">
            <thead><tr><th>Blocco / voce</th><th class="num">Preventivato</th><th class="num">Impegnato</th><th class="num">Speso</th><th class="num">Residuo</th><th class="num">Stima a fine</th><th class="num">Scostamento</th><th style="width:120px">Speso sul previsto</th></tr></thead>
            ${BLOCCHI.map(b => {
              const vs = b.voci.filter(x => k.bud[x] || k.cons[x] || k.imp[x]); if (!vs.length) return '';
              const S = o => somma(vs, x => o[x]);
              const riga = (nome, B, I, C, St, capo) => { const res = B - C - I, sc = St - B, pc = B ? C / B * 100 : (C ? 100 : 0);
                return `<tr class="${capo ? 'pv-capo' : ''}"><td>${capo ? `<button class="pv-apri" aria-expanded="${vs.length > 1 ? 'false' : 'true'}"${vs.length > 1 ? '' : ' disabled'}><span class="pv-punto ${b.colore}"></span>${esc(nome)}</button>` : `<span class="pv-sotto">${esc(nome)}</span>`}</td>
                <td class="num">${fmt.euro(B)}</td><td class="num">${I ? fmt.euro(I) : '–'}</td><td class="num">${fmt.euro(C)}</td><td class="num ${res < -0.5 ? 'negativo' : ''}">${fmt.euro(res)}</td><td class="num">${fmt.euro(St)}</td>
                <td class="num ${sc > 0.5 ? 'negativo' : ''}">${sc > 0.5 ? '+' + fmt.euro(sc) : '–'}</td>
                <td><span class="pv-barra ${C + I > B + 0.5 ? 'oltre' : ''}" title="Speso ${fmt.pct(pc)} del preventivato"><i style="width:${Math.min(100, pc)}%"></i><em style="left:${Math.min(100, B ? (C + I) / B * 100 : 0)}%"></em></span><small class="num">${fmt.pct(pc)}</small></td></tr>`; };
              return `<tbody class="${vs.length > 1 ? 'chiuso' : ''}">${riga(`${b.cod} · ${b.nome}`, S(k.bud), S(k.imp), S(k.cons), S(k.stima), true)}${vs.length > 1 ? vs.map(x => riga(x, k.bud[x], k.imp[x], k.cons[x], k.stima[x])).join('') : ''}</tbody>`;
            }).join('')}
            <tfoot><tr><td>Totale costi</td><td class="num">${fmt.euro(k.budT)}</td><td class="num">${fmt.euro(k.impT)}</td><td class="num">${fmt.euro(k.consT)}</td><td class="num">${fmt.euro(k.budT - k.consT - k.impT)}</td><td class="num">${fmt.euro(k.stimaT)}</td><td class="num">${k.stimaT - k.budT > 0.5 ? '+' + fmt.euro(k.stimaT - k.budT) : '–'}</td><td class="num">${fmt.pct(k.budT ? k.consT / k.budT * 100 : null)}</td></tr></tfoot>
          </table></div>
          <div class="scorri" style="margin-top:14px"><table class="tabella pv-ricavi"><thead><tr><th>98 · Ricavi</th><th class="num">Contratto</th><th class="num">Lavori eseguiti</th><th class="num">SAL maturati</th><th class="num">Fatturato</th><th class="num">Incassato</th><th class="num">Da fatturare</th></tr></thead>
            <tbody><tr><td>Ricavi di cantiere</td><td class="num">${fmt.euro(k.contratto)}</td><td class="num">${eseguito != null ? fmt.euro(eseguito) : '–'}</td><td class="num">${fmt.euro(k.salT)}</td><td class="num">${fmt.euro(k.fatturato)}</td><td class="num">${fmt.euro(k.incassato)}</td><td class="num">${fmt.euro(Math.max(0, k.contratto - k.fatturato))}</td></tr></tbody></table></div>
          <p class="nota" style="margin-top:10px">Impegnato: spese previste e richieste d'acquisto senza fattura. Stima a fine: per ogni voce il preventivato, oppure speso + impegnato se è di più. Lavori eseguiti: contratto × avanzamento del cronoprogramma. Importi senza IVA.</p>
        </section>
        <section class="pannello pv-graf"><div class="testata" style="margin-bottom:6px"><h2>Andamento nel tempo</h2></div><div id="pv-grafico"></div></section>
      </div>`;
    grafico($('#pv-grafico', el), c, d, k);
    el.querySelectorAll('[data-az]').forEach(b => b.onclick = () => azione(b.dataset.az));
    el.querySelectorAll('.pv-tab .pv-apri:not([disabled])').forEach(b => b.onclick = () => { const ap = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', ap); b.closest('tbody').classList.toggle('chiuso', !ap); });
    const ricarica = () => App.previsioneCantiere(el, c);

    async function azione(a) {
      if (a === 'sal') return apriScheda(c.id, 'sal');
      if (a === 'excel') return ui.excel(`Previsione ${c.nome}`, [{ nome: 'Per voce', righe: App.CATEGORIE_BUDGET.filter(x => k.bud[x] || k.cons[x] || k.imp[x]).map(x => ({ Blocco: `${App.bloccoDi(x).cod} ${App.bloccoDi(x).nome}`, Voce: x, Preventivato: r2(k.bud[x]), Impegnato: r2(k.imp[x]), Speso: r2(k.cons[x]), Residuo: r2(k.bud[x] - k.cons[x] - k.imp[x]), 'Stima a fine': r2(k.stima[x]) })) }]);
      if (a === 'budget') return ui.modulo({
        titolo: 'Budget dei costi', testoSalva: 'Salva budget', campi: App.CATEGORIE_BUDGET.map(x => ({ k: x, label: x, tipo: 'euro' })), valori: k.bud,
        salva: async v => { for (const b of d.budget) await db.elimina('budget', b.id); const ins = App.CATEGORIE_BUDGET.filter(x => v[x]).map(x => ({ cantiere_id: c.id, categoria: x, importo: v[x], note: '' })); if (ins.length) await db.inserisci('budget', ins); avviso('Budget salvato'); ricarica(); }
      });
      if (a === 'ricalcola') {
        const righe = App.aggregaFabbisogno(d.voci), per = {};
        for (const r of righe) per[voceBudget(r.categoria)] = (per[voceBudget(r.categoria)] || 0) + r.totale;
        if (!await conferma(`Sostituire il budget con il fabbisogno ${d.prevs.length > 1 ? 'delle offerte collegate' : `dell'offerta ${d.prevs[0].numero}`} (${fmt.euro(somma(righe, r => r.totale))})?`, { si: 'Sostituisci budget' })) return;
        try { for (const b of d.budget) await db.elimina('budget', b.id); await db.inserisci('budget', Object.entries(per).filter(x => x[1] > 0).map(([categoria, importo]) => ({ cantiere_id: c.id, categoria, importo: r2(importo), note: 'Dal fabbisogno' }))); avviso('Budget aggiornato'); ricarica(); } catch (e) { errore(e); }
      }
    }
  };

  // Grafico: costo previsto nel tempo (dal cronoprogramma), speso finora con proiezione a fine lavori, SAL maturati.
  function grafico(el, c, d, k) {
    const g = s => Math.round(new Date(s + 'T12:00:00Z') / 864e5), iso = x => new Date(x * 864e5).toISOString().slice(0, 10), oggi = g(fmt.oggi());
    const date = [c.data_inizio, c.data_fine_prevista, ...d.att.map(a => a.inizio), ...d.att.map(a => fmt.piuGiorni(a.inizio, n(a.durata) - 1)), ...d.fatture.map(f => f.data), ...d.sal.map(s => s.data)].filter(Boolean);
    if (!date.length || !(k.budT || k.consT)) { el.innerHTML = '<p class="nota">Il grafico compare quando il cantiere ha date, budget o costi.</p>'; return; }
    const x0 = Math.min(...date.map(g)), x1 = Math.max(...date.map(g), oggi + 7);
    const giorni = x1 - x0 + 1;
    // previsto: budget distribuito sulle attività (giorni di lavoro); senza attività, in linea retta tra inizio e fine prevista
    const prev = new Array(giorni).fill(0);
    if (d.foglie.length) { const tot = somma(d.foglie, a => Math.max(1, n(a.durata))); for (const a of d.foglie) for (let i = 0; i < Math.max(1, n(a.durata)); i++) { const x = g(a.inizio) + i - x0; if (x >= 0 && x < giorni) prev[x] += k.budT / tot; } }
    else { const a = g(c.data_inizio || iso(x0)) - x0, b = g(c.data_fine_prevista || iso(x1)) - x0; for (let i = Math.max(0, a); i <= Math.min(giorni - 1, b); i++) prev[i] += k.budT / Math.max(1, b - a + 1); }
    for (let i = 1; i < giorni; i++) prev[i] += prev[i - 1];
    // speso giorno per giorno
    const spesi = new Array(giorni).fill(0), metti = (s, v) => { const x = Math.max(0, Math.min(giorni - 1, g(s) - x0)); spesi[x] += v; };
    for (const f of d.fatture.filter(f => f.tipo === 'ricevuta')) metti(f.data, n(f.imponibile));
    for (const x of d.costi) metti(x.data, n(x.importo));
    const turni = App.calcolaTurni ? App.calcolaTurni(d.timb) : [], oreTot = somma(turni, t => n(t.ore));
    for (const t of turni) if (t.ore) metti(t.giorno, n(d.e.costo_manodopera) * t.ore / (oreTot || 1));
    for (const o of d.om) { const m = d.mezzi.find(x => x.id === o.mezzo_id); metti(o.giorno, n(o.ore) * n(m && m.costo_orario)); }
    for (let i = 1; i < giorni; i++) spesi[i] += spesi[i - 1];
    const salCum = new Array(giorni).fill(0); for (const s of d.sal) { const x = Math.max(0, g(s.data) - x0); if (x < giorni) salCum[x] += s.lavori; }
    for (let i = 1; i < giorni; i++) salCum[i] += salCum[i - 1];
    const io = Math.max(0, Math.min(giorni - 1, oggi - x0));

    const W = Math.max(320, el.clientWidth || 600), H = W < 600 ? 240 : 300, ml = 52, mr = 104, mt = 14, mb = 28, w = W - ml - mr, h = H - mt - mb;
    const ymax = Math.max(k.budT, k.stimaT, spesi[io], salCum[giorni - 1], k.contratto) * 1.06 || 1;
    const X = i => ml + i / Math.max(1, giorni - 1) * w, Y = v => mt + h - v / ymax * h;
    const linea = (arr, a, b) => arr.slice(a, b + 1).map((v, j) => `${j ? 'L' : 'M'}${X(a + j).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const passi = (arr, b) => { let s = `M${X(0)},${Y(arr[0])}`; for (let i = 1; i <= b; i++) if (arr[i] !== arr[i - 1]) s += `H${X(i).toFixed(1)}V${Y(arr[i]).toFixed(1)}`; return s + `H${X(b).toFixed(1)}`; };
    const tick = v => v >= 1e6 ? fmt.num(r2(v / 1e6)) + ' mln' : fmt.num(Math.round(v / 1000)) + 'k';
    let griglia = ''; for (let i = 0; i <= 4; i++) { const v = ymax / 4 * i; griglia += `<line x1="${ml}" x2="${ml + w}" y1="${Y(v)}" y2="${Y(v)}" class="pv-g-griglia"/><text x="${ml - 8}" y="${Y(v) + 4}" text-anchor="end" class="pv-g-asse">${v ? tick(v) + ' €' : '0'}</text>`; }
    const mesi = []; for (let i = 0; i < giorni; i++) { const s = iso(x0 + i); if (s.endsWith('-01') || i === 0) mesi.push([i, s]); }
    const passo = Math.ceil(mesi.length / Math.max(2, Math.floor(w / 90)));
    const etMesi = mesi.filter((_, j) => j % passo === 0).map(([i, s]) => `<text x="${X(i)}" y="${H - 8}" class="pv-g-asse" text-anchor="${i === 0 ? 'start' : 'middle'}">${new Date(s + 'T12:00:00Z').toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}</text>`).join('');
    // etichette alla fine delle linee, distanziate per non sovrapporsi
    const fine = [['Previsto', k.budT, 'pv-c-prev'], ['Stima', k.stimaT, 'pv-c-speso'], ['SAL', salCum[giorni - 1], 'pv-c-sal']].map(([t, v, cl]) => ({ t, v, cl, y: Y(v) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < fine.length; i++) if (fine[i].y - fine[i - 1].y < 14) fine[i].y = fine[i - 1].y + 14;
    el.innerHTML = `<div class="pv-leg"><span><i class="pv-l prev"></i>Costo previsto (budget sul cronoprogramma)</span><span><i class="pv-l speso"></i>Speso, poi stima a fine lavori</span><span><i class="pv-l sal"></i>SAL maturati</span></div>
      <div class="pv-g-box"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Costo previsto ${fmt.euro(k.budT)}, speso ${fmt.euro(spesi[io])}, SAL ${fmt.euro(k.salT)}">
        ${griglia}${k.contratto ? `<line x1="${ml}" x2="${ml + w}" y1="${Y(k.contratto)}" y2="${Y(k.contratto)}" class="pv-g-contratto"/><text x="${ml + 4}" y="${Y(k.contratto) - 5}" class="pv-g-asse">contratto ${fmt.euro(k.contratto)}</text>` : ''}
        <line x1="${X(io)}" x2="${X(io)}" y1="${mt}" y2="${mt + h}" class="pv-g-oggi"/><text x="${X(io)}" y="${mt + 10}" text-anchor="middle" class="pv-g-asse pv-g-oggi-t">oggi</text>
        <path d="${linea(prev, 0, giorni - 1)}" class="pv-c-prev"/>
        <path d="${passi(salCum, giorni - 1)}" class="pv-c-sal"/>
        <path d="${linea(spesi, 0, io)}" class="pv-c-speso"/>
        <path d="M${X(io)},${Y(spesi[io])}L${X(giorni - 1)},${Y(k.stimaT)}" class="pv-c-speso pv-c-proiezione"/>
        <circle cx="${X(io)}" cy="${Y(spesi[io])}" r="4.5" class="pv-c-punto"/>
        ${fine.map(f => `<text x="${ml + w + 8}" y="${f.y + 4}" class="pv-g-fine">${f.t} ${tick(f.v)}</text>`).join('')}
        ${etMesi}
        <line class="pv-g-croce" y1="${mt}" y2="${mt + h}" x1="-10" x2="-10"/>
        <rect x="${ml}" y="${mt}" width="${w}" height="${h}" fill="transparent" class="pv-g-sopra"/>
      </svg><div class="pv-g-tip" hidden></div></div>`;
    const svg = el.querySelector('svg'), tip = el.querySelector('.pv-g-tip'), croce = el.querySelector('.pv-g-croce');
    const mostra = ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
      const i = Math.max(0, Math.min(giorni - 1, Math.round((px - ml) / w * (giorni - 1))));
      croce.setAttribute('x1', X(i)); croce.setAttribute('x2', X(i));
      tip.hidden = false;
      tip.innerHTML = `<b>${fmt.data(iso(x0 + i))}</b><span><i class="pv-l prev"></i>Previsto ${fmt.euro(prev[i])}</span>${i <= io ? `<span><i class="pv-l speso"></i>Speso ${fmt.euro(spesi[i])}</span>` : ''}<span><i class="pv-l sal"></i>SAL ${fmt.euro(salCum[i])}</span>`;
      const left = X(i) / W * r.width; tip.style.left = Math.min(r.width - 190, Math.max(0, left + 12)) + 'px';
    };
    const sopra = el.querySelector('.pv-g-sopra');
    sopra.addEventListener('pointermove', mostra); sopra.addEventListener('pointerdown', mostra);
    sopra.addEventListener('pointerleave', () => { tip.hidden = true; croce.setAttribute('x1', -10); croce.setAttribute('x2', -10); });
  }


  // ---------- Scheda "Panoramica": le analisi del cantiere ----------
  const ANALISI = [
    ['dettaglio', 'Analisi cantiere dettagliato', 'verde', 'Ogni costo, riga per riga'],
    ['capo', 'Analisi per capo progetto', 'verde-2', 'I cantieri dello stesso responsabile'],
    ['controllo', 'Lista controllo economie', 'arancio', 'Cosa manca o non torna'],
    ['blocchi', 'Analisi per blocchi di costo', 'blu', 'Materiali, manodopera, noli…'],
    ['confronto', 'Confronto budget – consuntivi', 'blu-2', 'Mese per mese'],
    ['tempi', 'Elenco tempi manodopera', 'teal', 'Ore e costi per dipendente'],
    ['squadra', 'Andamento squadra', 'bordeaux', 'Pagelle e resa delle ore']
  ];
  const nomeMese = m => new Date(m + '-15T12:00:00Z').toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });

  // tutte le righe di costo del cantiere, con data, blocco e soggetto
  function righeCosto(c, d, ext) {
    const nomeAn = id => (ext.anag.find(a => a.id === id) || {}).ragione_sociale || '';
    const out = [];
    for (const f of d.fatture.filter(f => f.tipo === 'ricevuta')) out.push({ data: f.data, categoria: voceBudget(f.categoria), origine: `Fattura ${f.numero}`, soggetto: nomeAn(f.anagrafica_id), descrizione: f.descrizione || '', importo: n(f.imponibile), stato: 'speso' });
    for (const x of d.costi) out.push({ data: x.data, categoria: voceBudget(x.categoria), origine: x.documento ? `Spesa (${x.documento})` : 'Spesa', soggetto: nomeAn(x.fornitore_id), descrizione: x.descrizione || '', importo: n(x.importo), stato: 'speso' });
    for (const x of d.spese.filter(s => s.fattura_id == null)) out.push({ data: x.data_prevista, categoria: voceBudget(x.categoria), origine: 'Spesa prevista', soggetto: nomeAn(x.fornitore_id), descrizione: x.descrizione || '', importo: n(x.importo), stato: 'impegnato' });
    // manodopera e mezzi interni: per persona (o mezzo) e per mese
    const lavDi = nome => ext.lav.find(l => `${l.cognome} ${l.nome}` === nome) || {};
    const man = new Map();
    for (const t of ext.turni) if (t.ore) { const k = t.lavoratore + '|' + t.giorno.slice(0, 7); const x = man.get(k) || { lav: t.lavoratore, mese: t.giorno.slice(0, 7), ore: 0, ultimo: t.giorno }; x.ore += n(t.ore); if (t.giorno > x.ultimo) x.ultimo = t.giorno; man.set(k, x); }
    for (const x of man.values()) { const l = lavDi(x.lav); out.push({ data: x.ultimo, categoria: 'Manodopera', origine: `Ore ${nomeMese(x.mese)}`, soggetto: x.lav, descrizione: `${fmt.num(r2(x.ore))} h × ${fmt.euro(l.costo_orario)}${l.qualifica ? ' · ' + l.qualifica : ''}`, importo: r2(x.ore * n(l.costo_orario)), stato: 'speso', ore: x.ore }); }
    const mz = new Map();
    for (const o of d.om) { const k = o.mezzo_id + '|' + o.giorno.slice(0, 7); const x = mz.get(k) || { id: o.mezzo_id, mese: o.giorno.slice(0, 7), ore: 0, ultimo: o.giorno }; x.ore += n(o.ore); if (o.giorno > x.ultimo) x.ultimo = o.giorno; mz.set(k, x); }
    for (const x of mz.values()) { const m = ext.mezzi.find(y => y.id === x.id) || {}; out.push({ data: x.ultimo, categoria: 'Mezzi interni', origine: `Ore ${nomeMese(x.mese)}`, soggetto: m.nome || 'Mezzo', descrizione: `${fmt.num(r2(x.ore))} h × ${fmt.euro(m.costo_orario)}`, importo: r2(x.ore * n(m.costo_orario)), stato: 'speso' }); }
    return out.map(r => ({ ...r, blocco: App.bloccoDi(r.categoria) })).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  }

  App.panoramicaCantiere = async function (el, c) {
    el.innerHTML = '<p class="nota">Preparo le analisi…</p>';
    const d = await datiCantiere(c), k = conti(c, d);
    const [anag, lav, mezzi, giornale, tutti, econ, profili] = await Promise.all([
      db.lista('anagrafiche', { sel: 'id,ragione_sociale' }), db.lista('lavoratori', { sel: 'id,cognome,nome,qualifica,costo_orario' }), db.lista('mezzi', { sel: 'id,nome,costo_orario' }),
      db.lista('giornale', { eq: { cantiere_id: c.id }, sel: 'giorno' }).catch(() => []), db.lista('cantieri', { sel: '*,committente:anagrafiche(ragione_sociale)' }),
      db.lista('v_economia_cantieri', {}).catch(() => []), db.lista('profili', { sel: 'id,nome,email' }).catch(() => [])
    ]);
    const turni = App.calcolaTurni ? App.calcolaTurni(d.timb) : [];
    const ext = { anag, lav, mezzi, turni };
    const righe = righeCosto(c, d, ext);
    let vista = 'dettaglio'; try { vista = sessionStorage.getItem('pano-vista') || 'dettaglio'; } catch {}
    const marg = k.fatturato - k.consT;
    el.innerHTML = `<div class="pano">
      <nav class="pano-tessere" aria-label="Analisi del cantiere">${ANALISI.map(([id, t, col, s], i) => `<button class="tessera ${i < 1 || i === 3 || i === 6 ? 'medio' : 'piccolo'} ${col}" data-a="${id}" aria-pressed="${vista === id}"><span class="etichetta">${esc(t)}<small>${esc(s)}</small></span></button>`).join('')}</nav>
      <section class="pannello pano-corpo"><div class="pano-numeri">
        <span>Contratto <b>${fmt.euro(k.contratto)}</b></span><span>Costi <b>${fmt.euro(k.consT)}</b></span><span>Impegnato <b>${fmt.euro(k.impT)}</b></span><span>Fatturato <b>${fmt.euro(k.fatturato)}</b></span>
        <span>Margine attuale <b class="${marg < 0 ? 'negativo' : ''}">${fmt.euro(marg)}</b></span><span>Lavori eseguiti <b>${fmt.pct(d.avanz)}</b></span></div>
        <div id="pano-v"></div></section></div>`;
    const vai = v => { vista = v; try { sessionStorage.setItem('pano-vista', v); } catch {} el.querySelectorAll('[data-a]').forEach(b => b.setAttribute('aria-pressed', b.dataset.a === v)); VISTE[v]($('#pano-v', el)); };
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => vai(b.dataset.a));
    const testa = (t, extra = '') => `<div class="testata" style="margin:14px 0 10px"><h2>${esc(t)}</h2><div class="azioni">${extra}</div></div>`;

    const VISTE = {
      dettaglio(v) {
        let stato = '', testo = '';
        v.innerHTML = testa('Analisi cantiere dettagliato', '<button class="btn vuoto piccolo" data-x>Excel</button>') + `
          <div class="barra-elenco" style="margin-bottom:10px"><div class="filtro"><label for="pd-s">Mostra</label><select id="pd-s"><option value="">Speso e impegnato</option><option value="speso">Solo speso</option><option value="impegnato">Solo impegnato</option></select></div>
          <div class="cerca"><label for="pd-q">Cerca</label><input id="pd-q" type="search" placeholder="fornitore, fattura, descrizione…"></div></div><div id="pd-t"></div>`;
        const disegna = () => {
          const rs = righe.filter(r => (!stato || r.stato === stato) && (!testo || `${r.origine} ${r.soggetto} ${r.descrizione} ${r.categoria}`.toLowerCase().includes(testo)));
          const tot = somma(rs, r => r.importo);
          $('#pd-t', v).innerHTML = `<div class="scorri"><table class="tabella fabb"><thead><tr><th>Data</th><th>Voce di costo</th><th>Documento</th><th>Fornitore / persona</th><th>Descrizione</th><th class="num">Importo</th><th class="num">%</th></tr></thead>
            ${BLOCCHI.map(b => { const x = rs.filter(r => r.blocco.cod === b.cod); if (!x.length) return ''; const t = somma(x, r => r.importo);
              return `<tbody><tr class="pv-capo"><td colspan="5"><button class="pv-apri" aria-expanded="true"><span class="pv-punto ${b.colore}"></span>${esc(b.cod)} · ${esc(b.nome)} <span class="nota">(${x.length} righe)</span></button></td><td class="num">Σ ${fmt.euro(t)}</td><td class="num">${fmt.pct(tot ? t / tot * 100 : null)}</td></tr>
              ${x.map(r => `<tr class="${r.stato === 'impegnato' ? 'pano-imp' : ''}"><td>${fmt.data(r.data)}</td><td>${esc(r.categoria)}</td><td>${esc(r.origine)}${r.stato === 'impegnato' ? ' <span class="stato giallo">impegnato</span>' : ''}</td><td>${esc(r.soggetto)}</td><td class="nota">${esc(r.descrizione)}</td><td class="num">${fmt.euro(r.importo)}</td><td class="num">${fmt.pct(tot ? r.importo / tot * 100 : null)}</td></tr>`).join('')}</tbody>`; }).join('')
              || '<tbody><tr><td colspan="7" class="vuota">Nessun costo.</td></tr></tbody>'}
            <tfoot><tr><td colspan="5">Totale (${rs.length} righe)</td><td class="num">${fmt.euro(tot)}</td><td class="num">100%</td></tr></tfoot></table></div>`;
          v.querySelectorAll('.pv-apri').forEach(b => b.onclick = () => { const ap = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', ap); b.closest('tbody').classList.toggle('chiuso', !ap); });
        };
        $('#pd-s', v).onchange = e => { stato = e.target.value; disegna(); };
        let att; $('#pd-q', v).oninput = e => { clearTimeout(att); att = setTimeout(() => { testo = e.target.value.trim().toLowerCase(); disegna(); }, 200); };
        $('[data-x]', v).onclick = () => ui.excel(`Analisi dettagliata ${c.nome}`, [{ nome: 'Costi', righe: righe.map(r => ({ Data: fmt.data(r.data), Blocco: `${r.blocco.cod} ${r.blocco.nome}`, 'Voce di costo': r.categoria, Documento: r.origine, 'Fornitore / persona': r.soggetto, Descrizione: r.descrizione, Stato: r.stato, Importo: r.importo })) }]);
        disegna();
      },

      capo(v) {
        const capoDi = x => x.responsabile_id || '';
        const gruppi = [...new Set(tutti.map(capoDi))].sort((a, b) => (a === capoDi(c) ? -1 : b === capoDi(c) ? 1 : 0));
        const nomeCapo = id => { const p = profili.find(x => x.id === id); return id ? (p ? p.nome || p.email : 'Responsabile') : 'Senza capo progetto'; };
        const num = x => { const e = econ.find(y => y.cantiere_id === x.id) || {}; const ct = n(x.importo_contratto), f = n(e.fatturato), co = n(e.costi_totali); return { ct, f, co, m: f - co, h: n(e.ore_manodopera) }; };
        v.innerHTML = testa('Analisi per capo progetto') + `<p class="nota" style="margin-bottom:10px">I cantieri raggruppati per responsabile. Il capo progetto si sceglie in "Modifica dati" del cantiere. In evidenza il cantiere che stai guardando.</p>
          <div class="scorri"><table class="tabella fabb"><thead><tr><th>Cantiere</th><th>Committente</th><th>Stato</th><th class="num">Contratto</th><th class="num">Fatturato</th><th class="num">Costi</th><th class="num">Margine attuale</th><th class="num">Margine %</th><th class="num">Ore</th></tr></thead>
          ${gruppi.map(g => { const cs = tutti.filter(x => capoDi(x) === g), S = f => somma(cs, x => num(x)[f]); const m = S('m'), fa = S('f');
            return `<tbody><tr class="pv-capo"><td colspan="3"><b>${esc(nomeCapo(g))}</b> <span class="nota">${cs.length} cantieri, ${cs.filter(x => x.stato === 'aperto').length} aperti</span></td><td class="num">${fmt.euro(S('ct'))}</td><td class="num">${fmt.euro(fa)}</td><td class="num">${fmt.euro(S('co'))}</td><td class="num ${m < 0 ? 'negativo' : ''}">${fmt.euro(m)}</td><td class="num">${fmt.pct(fa ? m / fa * 100 : null)}</td><td class="num">${fmt.num(Math.round(S('h')))}</td></tr>
            ${cs.map(x => { const q = num(x); return `<tr class="cliccabile ${x.id === c.id ? 'scelto' : ''}" data-c="${x.id}" tabindex="0"><td>${x.id === c.id ? '▸ ' : ''}<b>${esc((x.codice ? x.codice + ' – ' : '') + x.nome)}</b></td><td>${esc(x.committente ? x.committente.ragione_sociale : '')}</td><td>${App.statoCantiere(x.stato)}</td>
              <td class="num">${fmt.euro(q.ct)}</td><td class="num">${fmt.euro(q.f)}</td><td class="num">${fmt.euro(q.co)}</td><td class="num ${q.m < 0 ? 'negativo' : ''}">${fmt.euro(q.m)}</td><td class="num">${fmt.pct(q.f ? q.m / q.f * 100 : null)}</td><td class="num">${fmt.num(Math.round(q.h))}</td></tr>`; }).join('')}</tbody>`; }).join('')}</table></div>`;
        v.querySelectorAll('[data-c]').forEach(tr => { const go = () => { if (Number(tr.dataset.c) !== c.id) apriScheda(tr.dataset.c, 'panoramica'); }; tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
      },

      controllo(v) {
        const oggi = fmt.oggi(), C = [];
        const add = (esito, titolo, testo, az) => C.push({ esito, titolo, testo, az });
        add(k.budT ? 'ok' : 'no', 'Budget dei costi', k.budT ? `${fmt.euro(k.budT)} divisi per voce` : 'Manca: senza budget la previsione non funziona', k.budT ? null : ['economia', 'Imposta budget']);
        add(d.prevs.length ? 'ok' : 'avviso', 'Offerta collegata', d.prevs.length ? d.prevs.map(p => p.numero).join(', ') : 'Senza offerta niente fabbisogno e SAL a misura', d.prevs.length ? null : ['fabbisogno', 'Collega offerta']);
        add(k.contratto ? 'ok' : 'no', 'Importo del contratto', k.contratto ? fmt.euro(k.contratto) : 'Manca', null);
        add(c.committente_id ? 'ok' : 'no', 'Committente', c.committente ? c.committente.ragione_sociale : 'Manca: serve per fatturare i SAL', null);
        const sforo = App.CATEGORIE_BUDGET.filter(x => k.cons[x] + k.imp[x] > k.bud[x] + 0.5 && k.cons[x] + k.imp[x] > 0);
        add(sforo.length ? 'no' : 'ok', 'Voci di costo entro il preventivato', sforo.length ? 'Superate: ' + sforo.map(x => `${x} (+${fmt.euro(k.cons[x] + k.imp[x] - k.bud[x])})`).join(', ') : 'Tutte nei limiti', sforo.length ? ['economia', 'Vedi previsione'] : null);
        const prevVecchie = d.spese.filter(s => !s.fattura_id && s.data_prevista && s.data_prevista < fmt.piuGiorni(oggi, -30));
        add(prevVecchie.length ? 'avviso' : 'ok', 'Spese previste senza fattura da più di 30 giorni', prevVecchie.length ? `${prevVecchie.length} spese, ${fmt.euro(somma(prevVecchie, s => n(s.importo)))}: è arrivata la fattura?` : 'Nessuna', prevVecchie.length ? ['costi', 'Collega le fatture'] : null);
        const senzaCat = d.fatture.filter(f => f.tipo === 'ricevuta' && !f.categoria);
        add(senzaCat.length ? 'no' : 'ok', 'Fatture fornitori con voce di costo', senzaCat.length ? `${senzaCat.length} fatture senza voce di costo: finiscono in "Altro"` : 'Tutte classificate', senzaCat.length ? ['costi', 'Sistema'] : null);
        const fornScad = d.fatture.filter(f => f.tipo === 'ricevuta' && !f.pagata && f.scadenza && f.scadenza < oggi);
        add(fornScad.length ? 'avviso' : 'ok', 'Fornitori da pagare scaduti', fornScad.length ? `${fornScad.length} fatture, ${fmt.euro(somma(fornScad, f => n(f.da_pagare) - n(f.importo_pagato)))}` : 'Nessuna', null);
        const cliScad = d.fatture.filter(f => f.tipo === 'emessa' && !f.pagata && f.scadenza && f.scadenza < oggi);
        add(cliScad.length ? 'no' : 'ok', 'Incassi dal committente scaduti', cliScad.length ? `${cliScad.length} fatture, ${fmt.euro(somma(cliScad, f => n(f.da_pagare) - n(f.importo_pagato)))} da sollecitare` : 'Nessuno', cliScad.length ? ['fatturato', 'Vedi fatture'] : null);
        const salNon = d.sal.filter(s => !s.fattura_id && s.lavori > 0);
        add(salNon.length ? 'avviso' : 'ok', 'SAL fatturati', salNon.length ? `${salNon.length} SAL da fatturare, ${fmt.euro(somma(salNon, s => s.lavori))}` : 'Tutti fatturati', salNon.length ? ['sal', 'Vai ai SAL'] : null);
        const eseguito = d.avanz != null ? k.contratto * d.avanz / 100 : null, nonSal = eseguito != null ? eseguito - k.salT : 0;
        add(eseguito == null ? 'avviso' : nonSal > k.contratto * 0.05 ? 'avviso' : 'ok', 'Lavori eseguiti contabilizzati', eseguito == null ? 'Aggiorna l\'avanzamento nel cronoprogramma' : nonSal > k.contratto * 0.05 ? `Circa ${fmt.euro(nonSal)} di lavori non ancora a SAL` : 'In linea con l\'avanzamento', eseguito == null ? ['cronoprogramma', 'Cronoprogramma'] : nonSal > k.contratto * 0.05 ? ['sal', 'Prepara il SAL'] : null);
        const ritardo = d.foglie.filter(a => n(a.avanzamento) < 100 && fmt.piuGiorni(a.inizio, n(a.durata) - 1) < oggi);
        add(ritardo.length ? 'avviso' : d.foglie.length ? 'ok' : 'avviso', 'Attività nei tempi', !d.foglie.length ? 'Nessun cronoprogramma' : ritardo.length ? `${ritardo.length} in ritardo: ${ritardo.slice(0, 3).map(a => a.nome).join(', ')}${ritardo.length > 3 ? '…' : ''}` : 'Nessuna attività in ritardo', ritardo.length || !d.foglie.length ? ['cronoprogramma', 'Cronoprogramma'] : null);
        const mancanti = turni.filter(t => t.ore == null && !t.inCorso);
        add(mancanti.length ? 'no' : 'ok', 'Timbrature complete', mancanti.length ? `${mancanti.length} turni senza uscita: le ore non sono contate` : 'Tutte complete', mancanti.length ? ['ore', 'Ore e presenze'] : null);
        const senzaCosto = [...new Set(turni.map(t => t.lavoratore))].filter(nm => !n((lav.find(l => `${l.cognome} ${l.nome}` === nm) || {}).costo_orario));
        add(senzaCosto.length ? 'no' : 'ok', 'Costo orario dei dipendenti', senzaCosto.length ? `Manca per: ${senzaCosto.join(', ')}` : 'Presente per tutti quelli che hanno lavorato qui', null);
        const mezziSenza = [...new Set(d.om.map(o => o.mezzo_id))].filter(id => !n((mezzi.find(m => m.id === id) || {}).costo_orario));
        add(mezziSenza.length ? 'no' : 'ok', 'Costo orario dei mezzi', mezziSenza.length ? `Manca per ${mezziSenza.length} mezzi` : 'Presente', null);
        const giorniLav = [...new Set(turni.map(t => t.giorno))].filter(g => g >= fmt.piuGiorni(oggi, -30) && g < oggi), giorniG = new Set(giornale.map(g => g.giorno)), senzaG = giorniLav.filter(g => !giorniG.has(g));
        add(senzaG.length ? 'avviso' : 'ok', 'Giornale dei lavori (ultimi 30 giorni)', senzaG.length ? `${senzaG.length} giorni con presenze ma senza giornale: ${senzaG.slice(-3).map(fmt.data).join(', ')}` : 'Compilato tutti i giorni lavorati', senzaG.length ? ['giornale', 'Giornale'] : null);
        const no = C.filter(x => x.esito === 'no').length, av = C.filter(x => x.esito === 'avviso').length;
        v.innerHTML = testa('Lista controllo economie') + `<p class="nota" style="margin-bottom:10px">${no ? `<b class="negativo">${no} da sistemare</b>, ` : ''}${av ? `<b>${av} da controllare</b>, ` : ''}${C.length - no - av} a posto. I controlli si rifanno da soli ogni volta che apri questa pagina.</p>
          <ul class="pano-check">${C.map(x => `<li class="esito-${x.esito}"><span class="pano-esito" aria-label="${x.esito === 'ok' ? 'a posto' : x.esito === 'no' ? 'da sistemare' : 'da controllare'}">${x.esito === 'ok' ? '✓' : x.esito === 'no' ? '✕' : '!'}</span><div><b>${esc(x.titolo)}</b><small>${esc(x.testo)}</small></div>${x.az ? `<button class="btn vuoto piccolo" data-vai="${x.az[0]}">${esc(x.az[1])}</button>` : ''}</li>`).join('')}</ul>`;
        v.querySelectorAll('[data-vai]').forEach(b => b.onclick = () => apriScheda(c.id, b.dataset.vai));
      },

      blocchi(v) {
        const max = Math.max(1, ...BLOCCHI.map(b => { const vs = b.voci; return Math.max(somma(vs, x => k.bud[x]), somma(vs, x => k.cons[x] + k.imp[x])); }));
        v.innerHTML = testa('Analisi per blocchi di costo') + `<div class="pano-blocchi">${BLOCCHI.map(b => {
          const B = somma(b.voci, x => k.bud[x]), S = somma(b.voci, x => k.cons[x]), I = somma(b.voci, x => k.imp[x]); if (!B && !S && !I) return '';
          const chi = new Map(); for (const r of righe.filter(r => r.blocco.cod === b.cod)) chi.set(r.soggetto || r.categoria, (chi.get(r.soggetto || r.categoria) || 0) + r.importo);
          const top = [...chi.entries()].sort((a, z) => z[1] - a[1]).slice(0, 6);
          return `<article class="pano-blocco"><header><span class="pv-punto ${b.colore}"></span><h3>${esc(b.cod)} · ${esc(b.nome)}</h3><b class="${S + I > B + 0.5 ? 'negativo' : ''}">${fmt.pct(B ? (S + I) / B * 100 : null)}</b></header>
            <div class="pano-barre" role="img" aria-label="Preventivato ${fmt.euro(B)}, speso ${fmt.euro(S)}, impegnato ${fmt.euro(I)}">
              <div><span>Preventivato</span><span class="pano-traccia"><i class="prev" style="width:${B / max * 100}%"></i></span><em>${fmt.euro(B)}</em></div>
              <div><span>Speso + impegnato</span><span class="pano-traccia"><i class="speso ${S + I > B + 0.5 ? 'oltre' : ''}" style="width:${S / max * 100}%"></i><i class="imp" style="width:${I / max * 100}%"></i></span><em>${fmt.euro(S)}${I ? ` + ${fmt.euro(I)} impegnati` : ''}</em></div></div>
            <table class="tabella"><thead><tr><th>Dove sono andati i soldi</th><th class="num">Importo</th><th class="num">%</th></tr></thead><tbody>${top.map(([nm, x]) => `<tr><td>${esc(nm)}</td><td class="num">${fmt.euro(x)}</td><td class="num">${fmt.pct(S + I ? x / (S + I) * 100 : null)}</td></tr>`).join('') || '<tr><td colspan="3" class="vuota">Ancora nessun costo.</td></tr>'}</tbody></table>
            <p class="nota">${b.voci.filter(x => k.bud[x] || k.cons[x] || k.imp[x]).map(x => `${esc(x)}: ${fmt.euro(k.cons[x] + k.imp[x])} su ${fmt.euro(k.bud[x])}`).join(' · ')}</p></article>`; }).join('')}</div>`;
      },

      confronto(v) {
        const mesi = [], inizio = (c.data_inizio || righe[0]?.data || fmt.oggi()).slice(0, 7), fine = fmt.oggi().slice(0, 7);
        for (let m = inizio; m <= fine && mesi.length < 36;) { mesi.push(m); const [a, mm] = m.split('-').map(Number); m = new Date(Date.UTC(a, mm, 1)).toISOString().slice(0, 7); }
        const speso = righe.filter(r => r.stato === 'speso'), cella = (cat, m) => somma(speso.filter(r => r.categoria === cat && String(r.data).slice(0, 7) === m), r => r.importo);
        const voci = App.CATEGORIE_BUDGET.filter(x => k.bud[x] || k.cons[x] || k.imp[x]);
        const tot = m => somma(voci, x => cella(x, m));
        let cum = 0;
        v.innerHTML = testa('Confronto budget – consuntivi', '<button class="btn vuoto piccolo" data-x>Excel</button>') + `<p class="nota" style="margin-bottom:10px">Per ogni voce di costo: il budget, il consuntivo mese per mese, il totale e lo scostamento. In fondo il costo cumulato confrontato con il budget.</p>
          <div class="scorri"><table class="tabella pano-conf"><thead><tr><th>Voce di costo</th><th class="num">Budget</th>${mesi.map(m => `<th class="num">${nomeMese(m)}</th>`).join('')}<th class="num">Consuntivo</th><th class="num">Impegnato</th><th class="num">Scostamento</th><th class="num">% usato</th></tr></thead>
          <tbody>${voci.map(x => { const cons = k.cons[x], sc = cons + k.imp[x] - k.bud[x]; return `<tr><td><span class="pv-punto ${App.bloccoDi(x).colore}"></span> ${esc(x)}</td><td class="num">${fmt.euro(k.bud[x])}</td>${mesi.map(m => { const y = cella(x, m); return `<td class="num">${y ? fmt.euro(y) : '<span class="nota">–</span>'}</td>`; }).join('')}
            <td class="num"><b>${fmt.euro(cons)}</b></td><td class="num">${k.imp[x] ? fmt.euro(k.imp[x]) : '–'}</td><td class="num ${sc > 0.5 ? 'negativo' : ''}">${sc > 0.5 ? '+' : ''}${fmt.euro(sc)}</td><td class="num ${cons > k.bud[x] ? 'negativo' : ''}">${fmt.pct(k.bud[x] ? cons / k.bud[x] * 100 : null)}</td></tr>`; }).join('')}</tbody>
          <tfoot><tr><td>Totale del mese</td><td class="num">${fmt.euro(k.budT)}</td>${mesi.map(m => `<td class="num">${fmt.euro(tot(m))}</td>`).join('')}<td class="num">${fmt.euro(k.consT)}</td><td class="num">${fmt.euro(k.impT)}</td><td class="num">${fmt.euro(k.consT + k.impT - k.budT)}</td><td class="num">${fmt.pct(k.budT ? k.consT / k.budT * 100 : null)}</td></tr>
            <tr><td>Cumulato</td><td></td>${mesi.map(m => { cum += tot(m); return `<td class="num">${fmt.euro(cum)}<small>${fmt.pct(k.budT ? cum / k.budT * 100 : null)}</small></td>`; }).join('')}<td colspan="4"></td></tr></tfoot></table></div>
          <p class="nota" style="margin-top:8px">La manodopera e i mezzi sono attribuiti al mese in cui sono state fatte le ore; fatture e spese alla loro data.</p>`;
        $('[data-x]', v).onclick = () => ui.excel(`Budget e consuntivi ${c.nome}`, [{ nome: 'Confronto', righe: voci.map(x => ({ Voce: x, Budget: r2(k.bud[x]), ...Object.fromEntries(mesi.map(m => [nomeMese(m), r2(cella(x, m))])), Consuntivo: r2(k.cons[x]), Impegnato: r2(k.imp[x]), Scostamento: r2(k.cons[x] + k.imp[x] - k.bud[x]) })) }]);
      },

      squadra(v) { App.andamentoSquadra(v, c, d, k, turni, lav); },

      tempi(v) {
        let dal = c.data_inizio || '', al = fmt.oggi(), dett = false;
        const oreOfferta = somma(App.aggregaFabbisogno(d.voci).filter(r => r.categoria === 'Manodopera' && /^(h|ore?)$/i.test(r.um)), r => r.quantita);
        v.innerHTML = testa('Elenco tempi manodopera', '<button class="btn vuoto piccolo" data-x>Excel</button>') + `
          <div class="barra-elenco" style="margin-bottom:10px;align-items:end"><div class="filtro"><label for="pt-dal">Dal</label><input id="pt-dal" type="date" value="${dal}"></div><div class="filtro"><label for="pt-al">Al</label><input id="pt-al" type="date" value="${al}"></div>
            <label class="spunta"><input type="checkbox" id="pt-det"> Mostra giorno per giorno</label></div><div id="pt-t"></div>`;
        const disegna = () => {
          const ts = turni.filter(t => (!dal || t.giorno >= dal) && (!al || t.giorno <= al));
          const per = new Map(); for (const t of ts) { const x = per.get(t.lavoratore) || { nome: t.lavoratore, qualifica: t.qualifica, giorni: new Set(), ore: 0, str: 0, manca: 0, turni: [] }; x.giorni.add(t.giorno); x.ore += n(t.ore); x.str += Math.max(0, n(t.ore) - 8); if (t.ore == null && !t.inCorso) x.manca++; x.turni.push(t); per.set(t.lavoratore, x); }
          const rs = [...per.values()].sort((a, b) => b.ore - a.ore).map(x => ({ ...x, costoOra: n((lav.find(l => `${l.cognome} ${l.nome}` === x.nome) || {}).costo_orario) }));
          const ore = somma(rs, x => x.ore), costo = somma(rs, x => x.ore * x.costoOra);
          const perQual = {}; for (const x of rs) perQual[x.qualifica || '—'] = (perQual[x.qualifica || '—'] || 0) + x.ore;
          $('#pt-t', v).innerHTML = `<div class="pano-numeri pano-numeri-chiari"><span>Ore lavorate <b>${fmt.num(r2(ore))} h</b></span><span>Giornate-uomo <b>${fmt.num(r2(ore / 8))}</b></span><span>Costo manodopera <b>${fmt.euro(costo)}</b></span>
              ${oreOfferta ? `<span>Ore previste dall'offerta <b>${fmt.num(Math.round(oreOfferta))} h</b></span><span>Usate <b class="${d.avanz != null && ore / oreOfferta * 100 > d.avanz + 5 ? 'negativo' : ''}">${fmt.pct(ore / oreOfferta * 100)}</b>${d.avanz != null ? ` <small>con lavori al ${fmt.pct(d.avanz)}</small>` : ''}</span>` : ''}</div>
            <p class="nota" style="margin:6px 0 10px">Per qualifica: ${Object.entries(perQual).map(([q, h]) => `${esc(q)} ${fmt.num(r2(h))} h`).join(' · ') || '—'}</p>
            <div class="scorri"><table class="tabella fabb"><thead><tr><th>Dipendente</th><th>Qualifica</th><th class="num">Giorni</th><th class="num">Ore</th><th class="num">di cui oltre 8 h/giorno</th><th class="num">Media al giorno</th><th class="num">Costo orario</th><th class="num">Costo</th><th class="num">%</th><th>Controlli</th></tr></thead>
            ${rs.map(x => `<tbody><tr class="${dett ? 'pv-capo' : ''}"><td><b>${esc(x.nome)}</b></td><td>${esc(x.qualifica || '')}</td><td class="num">${x.giorni.size}</td><td class="num">${fmt.num(r2(x.ore))}</td><td class="num">${x.str ? fmt.num(r2(x.str)) : '–'}</td><td class="num">${fmt.num(r2(x.ore / (x.giorni.size || 1)))}</td>
              <td class="num">${x.costoOra ? fmt.euro(x.costoOra) : '<span class="stato giallo">manca</span>'}</td><td class="num">${fmt.euro(x.ore * x.costoOra)}</td><td class="num">${fmt.pct(ore ? x.ore / ore * 100 : null)}</td><td>${x.manca ? `<span class="stato rosso">${x.manca} senza uscita</span>` : '<span class="stato verde">ok</span>'}</td></tr>
              ${dett ? x.turni.map(t => `<tr><td class="pv-sotto">${fmt.data(t.giorno)}</td><td class="nota">${t.entrata || '–'} → ${t.uscita || (t.inCorso ? 'in corso' : 'manca')}</td><td></td><td class="num">${t.ore != null ? fmt.num(t.ore) : '–'}</td><td class="num">${n(t.ore) > 8 ? fmt.num(r2(n(t.ore) - 8)) : ''}</td><td colspan="5"></td></tr>`).join('') : ''}</tbody>`).join('') || '<tbody><tr><td colspan="10" class="vuota">Nessuna presenza nel periodo.</td></tr></tbody>'}
            <tfoot><tr><td colspan="3">Totale</td><td class="num">${fmt.num(r2(ore))}</td><td class="num">${fmt.num(r2(somma(rs, x => x.str)))}</td><td colspan="2"></td><td class="num">${fmt.euro(costo)}</td><td class="num">100%</td><td></td></tr></tfoot></table></div>`;
          $('[data-x]', v).onclick = () => ui.excel(`Tempi manodopera ${c.nome}`, [{ nome: 'Per dipendente', righe: rs.map(x => ({ Dipendente: x.nome, Qualifica: x.qualifica || '', Giorni: x.giorni.size, Ore: r2(x.ore), 'Oltre 8 h': r2(x.str), 'Costo orario': x.costoOra, Costo: r2(x.ore * x.costoOra) })) },
            { nome: 'Giorno per giorno', righe: ts.map(t => ({ Giorno: fmt.data(t.giorno), Dipendente: t.lavoratore, Entrata: t.entrata || 'MANCA', Uscita: t.uscita || 'MANCA', Ore: t.ore ?? '' })) }]);
        };
        $('#pt-dal', v).onchange = e => { dal = e.target.value; disegna(); };
        $('#pt-al', v).onchange = e => { al = e.target.value; disegna(); };
        $('#pt-det', v).onchange = e => { dett = e.target.checked; disegna(); };
        disegna();
      }
    };
    vai(VISTE[vista] ? vista : 'dettaglio');
  };

  // ---------- Scheda "Fabbisogno e acquisti" ----------
  App.fabbisognoCantiere = async function (el, c) {
    const [prevs, spese] = await Promise.all([db.lista('preventivi', { eq: { cantiere_id: c.id }, ordina: 'data' }), db.lista('spese_previste', { eq: { cantiere_id: c.id } })]);
    if (!prevs.length) {
      const liberi = await db.lista('preventivi', { nullo: { cantiere_id: true }, ordina: 'data.desc' });
      el.innerHTML = `<div class="pv-vuoto"><h2>Nessuna offerta collegata</h2><p class="nota">Il fabbisogno nasce dalle voci dell'offerta e dalla loro analisi prezzi. Collega l'offerta da cui è nato questo cantiere, oppure apri un'offerta e usa "Crea ordine di cantiere".</p>
        ${liberi.length ? `<div class="pv-collega"><label for="f-prev">Offerta</label><select id="f-prev">${liberi.map(p => `<option value="${p.id}">${esc(p.numero)} – ${esc(p.oggetto || '')}</option>`).join('')}</select><button class="btn" id="f-collega">Collega</button></div>` : '<p class="nota">Non ci sono offerte libere da collegare.</p>'}</div>`;
      const b = $('#f-collega', el);
      if (b) b.onclick = async () => { try { await db.aggiorna('preventivi', Number($('#f-prev', el).value), { cantiere_id: c.id }); avviso('Offerta collegata'); App.fabbisognoCantiere(el, c); } catch (e) { errore(e); } };
      return;
    }
    const voci = await App.vociConRisorse(prevs.map(p => p.id));
    el.innerHTML = `<p class="nota" style="margin-bottom:12px">${prevs.length > 1 ? 'Dalle offerte' : 'Dall\'offerta'} ${prevs.map(p => `<a href="#preventivo-${p.id}">${esc(p.numero)}</a>`).join(', ')}. Le righe interne (manodopera e mezzi propri) servono a pianificare le ore; le altre si trasformano in richieste d'acquisto.</p><div id="f-corpo"></div>`;
    const ricavo = somma(prevs, p => App.calcolaPreventivo(p, voci.filter(v => v.preventivo_id === p.id)).netto);
    App.disegnaFabbisogno($('#f-corpo', el), { voci, ricavo, titolo: `Fabbisogno ${c.nome}`, acquisti: spese, quandoCrea: righe => {
      const w = ui.finestra(`<h2>Richieste d'acquisto</h2><p class="nota" style="margin-bottom:12px">${righe.length} righe per ${fmt.euro(somma(righe, r => r.totale))}. Diventano spese previste del cantiere: quando arriva la fattura la colleghi dalla scheda Costi.</p>
        <div class="campi"><div><label for="r-data">Data prevista di consegna</label><input type="date" id="r-data" value="${fmt.piuGiorni(fmt.oggi(), 7)}"></div><div id="r-forn"></div><div class="largo"><label for="r-note">Note (es. numero d'ordine)</label><input id="r-note"></div></div>
        <div class="azioni"><button class="btn vuoto" data-no>Annulla</button><button class="btn rosso" data-si>Crea richieste</button></div>`);
      ui.campoHtml({ k: 'fornitore_id', label: 'Fornitore (facoltativo)', tipo: 'rif', rif: App.RIF.fornitore }, '').then(h => { w.el.querySelector('#r-forn').innerHTML = h; });
      w.el.querySelector('[data-no]').onclick = w.chiudi;
      w.el.querySelector('[data-si]').onclick = async () => {
        try {
          const f = w.el.querySelector('[name=fornitore_id]'), note = w.el.querySelector('#r-note').value.trim();
          await db.inserisci('spese_previste', righe.map(r => ({ cantiere_id: c.id, data_prevista: w.el.querySelector('#r-data').value || fmt.oggi(), categoria: App.CATEGORIE_COSTO.includes(r.categoria) ? r.categoria : 'Altro',
            descrizione: `${r.descrizione} – ${fmt.num(r.quantita)} ${r.um}`.trim(), fornitore_id: f && f.value ? Number(f.value) : null, importo: r.totale, fattura_id: null, note: note || 'Dal fabbisogno', rif_fabbisogno: r.key })));
          w.chiudi(); avviso(righe.length === 1 ? 'Richiesta d\'acquisto creata' : `${righe.length} richieste d'acquisto create`); App.fabbisognoCantiere(el, c);
        } catch (e) { errore(e); }
      };
    } });
  };

  // ---------- Scheda "SAL": stato avanzamento lavori ----------
  App.salCantiere = async function (el, c) {
    const d = await datiCantiere(c);
    const comm = c.committente_id ? await db.uno('anagrafiche', c.committente_id).catch(() => null) : null;
    const chiave = 'sal-' + c.id;
    let scelto = null; try { scelto = Number(sessionStorage.getItem(chiave)) || null; } catch {}
    if (!d.sal.some(s => s.id === scelto)) scelto = d.sal.length ? d.sal[d.sal.length - 1].id : null;
    const fattura = s => d.fatture.find(f => f.id === s.fattura_id);
    el.innerHTML = `<div class="sal">
      <aside class="sal-elenco"><div class="testata" style="margin-bottom:8px"><h2>SAL</h2><button class="btn piccolo" id="s-nuovo">Nuovo SAL</button></div>
        <table class="tabella"><thead><tr><th>N.</th><th>Descrizione</th><th>Data</th><th class="num">Lavori</th></tr></thead>
        <tbody>${d.sal.map(s => `<tr class="cliccabile ${s.id === scelto ? 'scelto' : ''}" data-id="${s.id}" tabindex="0"><td class="num">${s.numero}</td><td>${esc(s.descrizione)}${s.fattura_id ? ' <span class="stato verde">fatturato</span>' : ''}${s.finale ? ' <span class="stato blu">finale</span>' : ''}</td><td>${fmt.data(s.data)}</td><td class="num">${fmt.euro(s.lavori)}</td></tr>`).join('') || '<tr><td colspan="4" class="vuota">Nessun SAL. Premi "Nuovo SAL".</td></tr>'}</tbody>
        <tfoot><tr><td colspan="3">Totale lavori contabilizzati</td><td class="num">${fmt.euro(somma(d.sal, s => s.lavori))}</td></tr></tfoot></table>
        <p class="nota" style="margin-top:10px">Contratto ${fmt.euro(c.importo_contratto)}${d.avanz != null ? ` · lavori eseguiti dal cronoprogramma ${fmt.pct(d.avanz)}` : ''}.</p></aside>
      <section class="sal-dettaglio pannello" id="s-det"></section></div>`;
    el.querySelectorAll('.sal-elenco tr[data-id]').forEach(tr => { const vai = () => { try { sessionStorage.setItem(chiave, tr.dataset.id); } catch {} App.salCantiere(el, c); }; tr.onclick = vai; tr.onkeydown = e => { if (e.key === 'Enter') vai(); }; });
    $('#s-nuovo', el).onclick = async () => {
      try {
        const num = Math.max(0, ...d.sal.map(s => s.numero)) + 1;
        const s = await db.inserisci('sal', { cantiere_id: c.id, numero: num, descrizione: `SAL n. ${num}`, data: fmt.oggi(), finale: false, svincola: false, ritenuta_pct: comm && comm.tipo === 'ente' ? 0.5 : 0, anticipo_pct: 0, importo_corpo: 0, note: '', fattura_id: null });
        try { sessionStorage.setItem(chiave, s.id); } catch {}
        App.salCantiere(el, c);
      } catch (e) { errore(e); }
    };
    const s = d.sal.find(x => x.id === scelto), det = $('#s-det', el);
    if (!s) { det.innerHTML = `<div class="pv-vuoto"><h2>Stato avanzamento lavori</h2><p class="nota">Crea il primo SAL: il gestionale propone le quantità dall'avanzamento del cronoprogramma, calcola ritenute e netto, e prepara la fattura al committente.${d.voci.length ? '' : ' Questo cantiere non ha un\'offerta collegata: i SAL saranno a corpo.'}</p></div>`; return; }
    const bloccato = !!s.fattura_id;
    const prec = d.sal.filter(x => x.numero < s.numero);
    const qPrec = vid => somma(d.righeSal.filter(r => r.voce_id === vid && prec.some(p => p.id === r.sal_id)), r => n(r.quantita));
    const q = {}; for (const v of d.voci) { const r = d.righeSal.find(x => x.sal_id === s.id && x.voce_id === v.id); q[v.id] = r ? n(r.quantita) : 0; }
    const ritPrec = somma(prec, p => p.lavori * n(p.ritenuta_pct) / 100);
    const f = fattura(s);
    det.innerHTML = `
      <div class="testata" style="margin-bottom:12px"><h2>${esc(s.descrizione)}</h2><div class="azioni">
        ${!bloccato ? `${d.voci.length ? '<button class="btn vuoto piccolo" id="s-crono">Compila dal cronoprogramma</button>' : ''}<button class="btn testo piccolo" id="s-elimina">Elimina</button>` : ''}
        <button class="btn vuoto piccolo" id="s-stampa">Stampa SAL</button>
        ${bloccato ? `<span class="stato verde">Fattura ${esc(f ? f.numero : '')} del ${f ? fmt.data(f.data) : ''}</span>` : '<button class="btn vuoto" id="s-salva">Salva</button><button class="btn rosso" id="s-fattura">Genera fattura</button>'}</div></div>
      ${bloccato ? '<p class="nota" style="margin:-4px 0 12px">Questo SAL è già fatturato e non si può più cambiare. Per correggerlo elimina prima la fattura in Contabilità.</p>' : ''}
      <form class="campi quattro" id="s-testa">
        <div class="doppio"><label for="s-desc">Descrizione</label><input id="s-desc" name="descrizione" value="${esc(s.descrizione)}" ${bloccato ? 'disabled' : ''}></div>
        <div><label for="s-data">Lavori a tutto il</label><input id="s-data" type="date" name="data" value="${s.data}" ${bloccato ? 'disabled' : ''}></div>
        <div><label class="spunta"><input type="checkbox" name="finale" ${s.finale ? 'checked' : ''} ${bloccato ? 'disabled' : ''}> Stato finale dei lavori</label></div>
        <div><label for="s-rit">Ritenuta di garanzia (%)</label><input id="s-rit" name="ritenuta_pct" value="${String(s.ritenuta_pct).replace('.', ',')}" inputmode="decimal" ${bloccato ? 'disabled' : ''}></div>
        <div><label for="s-ant">Recupero anticipazione (%)</label><input id="s-ant" name="anticipo_pct" value="${String(s.anticipo_pct).replace('.', ',')}" inputmode="decimal" ${bloccato ? 'disabled' : ''}></div>
        ${d.voci.length ? '' : `<div><label for="s-corpo">Importo lavori a corpo</label><input id="s-corpo" name="importo_corpo" value="${String(s.importo_corpo || 0).replace('.', ',')}" inputmode="decimal" ${bloccato ? 'disabled' : ''}></div>`}
        <div class="doppio"><label for="s-note">Note</label><input id="s-note" name="note" value="${esc(s.note)}" ${bloccato ? 'disabled' : ''}></div>
      </form>
      ${d.voci.length ? `<h3 style="margin:18px 0 8px">Misure da considerare nel SAL</h3>
      <div class="scorri"><table class="tabella voci sal-misure"><thead><tr><th>Codice</th><th>Descrizione</th><th>U.m.</th><th class="num">Contratto</th><th class="num">SAL precedenti</th><th class="num" style="width:120px">Questo SAL</th><th class="num">Progressivo</th><th class="num">Prezzo</th><th class="num">Importo</th></tr></thead>
        <tbody>${d.voci.map(v => `<tr data-v="${v.id}"><td class="num" style="text-align:left">${esc(v.codice)}</td><td class="sal-desc">${esc((v.descrizione || '').split('\n')[0])}</td><td>${esc(v.um)}</td><td class="num">${fmt.num(v.quantita)}</td><td class="num">${fmt.num(qPrec(v.id))}</td>
          <td><input data-q value="${q[v.id] ? String(q[v.id]).replace('.', ',') : ''}" inputmode="decimal" style="text-align:right" aria-label="Quantità di questo SAL" ${bloccato ? 'disabled' : ''}></td>
          <td class="num" data-prog></td><td class="num">${fmt.euro(v.prezzoNetto)}</td><td class="num" data-imp></td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="sal-piede"><div class="nota" id="s-nota"></div><div class="totali-prev" id="s-tot"></div></div>`;
    const form = $('#s-testa', det);
    const leggi = () => {
      const v = { descrizione: form.descrizione.value.trim() || s.descrizione, data: form.data.value || s.data, finale: form.finale.checked, ritenuta_pct: ui.leggiNumero(form.ritenuta_pct.value) || 0, anticipo_pct: ui.leggiNumero(form.anticipo_pct.value) || 0, note: form.note.value.trim() };
      if (form.importo_corpo) v.importo_corpo = ui.leggiNumero(form.importo_corpo.value) || 0;
      return v;
    };
    const riep = () => {
      const t = leggi();
      let lav = n(t.importo_corpo ?? s.importo_corpo), oltre = [];
      for (const v of d.voci) {
        const tr = det.querySelector(`tr[data-v="${v.id}"]`), x = q[v.id], prog = qPrec(v.id) + x, pct = n(v.quantita) ? prog / n(v.quantita) * 100 : 0;
        tr.querySelector('[data-prog]').innerHTML = `${fmt.num(r2(prog))} <span class="nota">${fmt.pct(pct)}</span>`;
        tr.querySelector('[data-prog]').classList.toggle('negativo', pct > 100.05);
        tr.querySelector('[data-imp]').textContent = x ? fmt.euro(x * v.prezzoNetto) : '';
        lav += x * v.prezzoNetto; if (pct > 100.05) oltre.push(v.codice || v.descrizione);
      }
      lav = r2(lav);
      const precT = somma(prec, p => p.lavori), rit = r2(lav * t.ritenuta_pct / 100), ant = r2(lav * t.anticipo_pct / 100);
      const svinc = t.finale ? r2(ritPrec + rit) : 0, netto = r2(lav - rit - ant + svinc);
      $('#s-tot', det).innerHTML = `<div><span>Lavori a tutto il ${fmt.data(t.data)}</span><span class="num">${fmt.euro(precT + lav)}</span></div>
        <div><span>Meno SAL precedenti</span><span class="num">− ${fmt.euro(precT)}</span></div>
        <div class="forte-riga"><span>Importo lavori di questo SAL</span><span class="num">${fmt.euro(lav)}</span></div>
        ${rit ? `<div><span>Ritenuta di garanzia ${fmt.pct(t.ritenuta_pct)}</span><span class="num">− ${fmt.euro(rit)}</span></div>` : ''}
        ${ant ? `<div><span>Recupero anticipazione ${fmt.pct(t.anticipo_pct)}</span><span class="num">− ${fmt.euro(ant)}</span></div>` : ''}
        ${svinc ? `<div><span>Svincolo ritenute (stato finale)</span><span class="num">+ ${fmt.euro(svinc)}</span></div>` : ''}
        <div class="forte"><span>Netto da fatturare</span><span class="num">${fmt.euro(netto)}</span></div>`;
      $('#s-nota', det).innerHTML = `${oltre.length ? `<p class="stato rosso" style="display:block;padding:8px 10px;margin-bottom:8px">Si supera la quantità del contratto in: ${oltre.map(esc).join(', ')}. Se è giusto, sono lavori in più da concordare.</p>` : ''}
        Avanzamento economico dopo questo SAL: <b class="forte">${fmt.pct(n(c.importo_contratto) ? (precT + lav) / n(c.importo_contratto) * 100 : null)}</b> del contratto${d.avanz != null ? `, lavori eseguiti dal cronoprogramma ${fmt.pct(d.avanz)}` : ''}.`;
      return { t, lav, netto, rit, ant, svinc, precT };
    };
    det.addEventListener('input', e => {
      if (e.target.matches('[data-q]')) { const v = ui.leggiNumero(e.target.value); q[Number(e.target.closest('tr').dataset.v)] = Number.isNaN(v) || v == null ? 0 : v; }
      riep();
    });
    riep();
    const salva = async () => {
      const t = leggi();
      await db.aggiorna('sal', s.id, t);
      for (const r of d.righeSal.filter(x => x.sal_id === s.id)) await db.elimina('sal_righe', r.id);
      const ins = d.voci.filter(v => q[v.id]).map(v => ({ sal_id: s.id, voce_id: v.id, quantita: q[v.id] }));
      if (ins.length) await db.inserisci('sal_righe', ins);
    };
    if (!bloccato) {
      $('#s-salva', det).onclick = async () => { try { await salva(); avviso('SAL salvato'); App.salCantiere(el, c); } catch (e) { errore(e); } };
      $('#s-elimina', det).onclick = async () => {
        if (!await conferma(`Eliminare ${s.descrizione}?`, { si: 'Elimina', pericolo: true })) return;
        try { for (const r of d.righeSal.filter(x => x.sal_id === s.id)) await db.elimina('sal_righe', r.id); await db.elimina('sal', s.id); try { sessionStorage.removeItem(chiave); } catch {} avviso('SAL eliminato'); App.salCantiere(el, c); } catch (e) { errore(e); }
      };
      const bc = $('#s-crono', det);
      if (bc) bc.onclick = () => {
        const media = d.avanz ?? 0;
        for (const v of d.voci) {
          const mie = d.foglie.filter(a => a.voce_id === v.id);
          const pct = mie.length ? somma(mie, a => n(a.durata) * n(a.avanzamento)) / somma(mie, a => n(a.durata)) : media;
          q[v.id] = Math.max(0, r2(n(v.quantita) * pct / 100 - qPrec(v.id)));
          const inp = det.querySelector(`tr[data-v="${v.id}"] [data-q]`); inp.value = q[v.id] ? String(q[v.id]).replace('.', ',') : '';
        }
        riep(); avviso('Quantità proposte dall\'avanzamento del cronoprogramma: controllale e salva');
      };
      $('#s-fattura', det).onclick = async () => {
        const x = riep();
        if (!(x.netto > 0)) return errore(new Error('Il SAL non ha importi: inserisci le quantità.'));
        if (!c.committente_id) return errore(new Error('Il cantiere non ha un committente: aggiungilo con "Modifica dati".'));
        const anno = x.t.data.slice(0, 4), emesse = await db.lista('fatture', { eq: { tipo: 'emessa' }, sel: 'numero,data' });
        const prossimo = Math.max(0, ...emesse.filter(f => (f.data || '').startsWith(anno)).map(f => parseInt(f.numero, 10) || 0)) + 1;
        ui.modulo({ titolo: `Fattura per ${x.t.descrizione}`, testoSalva: 'Crea la fattura', valori: { numero: `${String(prossimo).padStart(2, '0')}/${anno}`, data: fmt.oggi(), iva_pct: 22, regime: comm && comm.tipo === 'ente' ? 'split payment' : 'ordinario', scadenza: fmt.piuGiorni(fmt.oggi(), 60), metodo_pagamento: 'Bonifico' },
          campi: [{ k: 'numero', label: 'Numero', richiesto: true, aiuto: 'Lo stesso numero che userai in Fatturazione CGN' }, { k: 'data', label: 'Data', tipo: 'data', richiesto: true },
            { k: 'regime', label: 'Regime IVA', tipo: 'select', richiesto: true, opzioni: [['ordinario', 'Ordinario'], ['split payment', 'Split payment (enti pubblici)'], ['reverse charge', 'Reverse charge'], ['esente', 'Esente / non imponibile']] },
            { k: 'iva_pct', label: 'Aliquota IVA', tipo: 'pct' }, { k: 'scadenza', label: 'Scadenza pagamento', tipo: 'data' }, { k: 'metodo_pagamento', label: 'Metodo di pagamento', tipo: 'select', opzioni: App.METODI_PAGAMENTO }],
          salva: async v => {
            await salva();
            const fr = await db.inserisci('fatture', { tipo: 'emessa', ...v, anagrafica_id: c.committente_id, cantiere_id: c.id, descrizione: `${x.t.descrizione} – lavori a tutto il ${fmt.data(x.t.data)}`, categoria: '', imponibile: x.netto, pagata: false, note: `Imponibile lavori ${fmt.euro(x.lav)}${x.rit ? `, ritenuta ${fmt.euro(x.rit)}` : ''}${x.ant ? `, recupero anticipazione ${fmt.euro(x.ant)}` : ''}`, iban: '', origine: 'sal' });
            await db.aggiorna('sal', s.id, { fattura_id: fr.id });
            avviso(`Fattura ${fr.numero} creata: inviala con Fatturazione CGN`); App.salCantiere(el, c);
          } });
      };
    }
    $('#s-stampa', det).onclick = () => {
      const x = riep();
      const foglio = document.createElement('div'); foglio.className = 'solo-stampa foglio-isolato';
      foglio.innerHTML = App.intestazioneStampa(`Stato avanzamento lavori n. ${s.numero}`, `lavori a tutto il ${fmt.data(x.t.data)}`) + `
        <p><b>Cantiere:</b> ${esc(c.nome)}${c.comune ? ' – ' + esc(c.comune) : ''}${c.cig ? ` · CIG ${esc(c.cig)}` : ''}${c.cup ? ` · CUP ${esc(c.cup)}` : ''}<br><b>Committente:</b> ${esc(comm ? comm.ragione_sociale : '')}</p>
        ${d.voci.length ? `<table class="tabella" style="margin-top:12px"><thead><tr><th>Codice</th><th>Descrizione</th><th>U.m.</th><th class="num">Precedenti</th><th class="num">Questo SAL</th><th class="num">Progressivo</th><th class="num">Prezzo</th><th class="num">Importo</th></tr></thead>
          <tbody>${d.voci.filter(v => q[v.id] || qPrec(v.id)).map(v => `<tr><td>${esc(v.codice)}</td><td>${esc((v.descrizione || '').split('\n')[0])}</td><td>${esc(v.um)}</td><td class="num">${fmt.num(qPrec(v.id))}</td><td class="num">${fmt.num(q[v.id])}</td><td class="num">${fmt.num(r2(qPrec(v.id) + q[v.id]))}</td><td class="num">${fmt.euro(v.prezzoNetto)}</td><td class="num">${fmt.euro(q[v.id] * v.prezzoNetto)}</td></tr>`).join('')}</tbody></table>` : ''}
        <div class="totali-prev" style="margin-top:12px">${$('#s-tot', det).innerHTML}</div>
        ${x.t.note ? `<p style="margin-top:12px">${esc(x.t.note)}</p>` : ''}
        <div style="display:flex;justify-content:space-between;margin-top:56px"><span>Il direttore dei lavori ______________________</span><span>L'impresa EUROWORK s.r.l. ______________________</span></div>`;
      document.body.append(foglio); document.body.classList.add('stampa-isolata');
      const via = () => { foglio.remove(); document.body.classList.remove('stampa-isolata'); window.removeEventListener('afterprint', via); };
      window.addEventListener('afterprint', via); window.print(); setTimeout(via, 1500);
    };
  };
})();
