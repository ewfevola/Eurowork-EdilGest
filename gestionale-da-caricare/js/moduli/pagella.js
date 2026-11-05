// Pagella dei dipendenti: valutazioni periodiche, indicatori automatici (presenza, puntualità, documenti),
// percorso di crescita (in crescita, pronto per avanzamento, stand-by) e avanzamenti di livello.
(function () {
  const { $, $$, esc, fmt, avviso, errore, conferma } = ui;
  const n = x => Number(x) || 0;
  const r1 = x => Math.round(x * 10) / 10;
  const LIVELLI = ['1° livello – operaio comune', '2° livello – operaio qualificato', '3° livello – operaio specializzato', '4° livello – operaio di 4° livello', 'Capo squadra'];
  const CRITERI = [['sicurezza', 'Sicurezza', 'Usa i DPI, rispetta le regole, segnala i rischi'], ['qualita', 'Qualità del lavoro', 'Lavoro fatto bene, senza dover rifare'],
    ['produttivita', 'Produttività', 'Rispetta i tempi previsti'], ['puntualita', 'Affidabilità', 'Puntuale, presente, mantiene gli impegni'],
    ['squadra', 'Lavoro di squadra', 'Collabora, aiuta, comunica'], ['autonomia', 'Autonomia e competenze', 'Sa fare da solo, impara cose nuove']];
  const STATI = { crescita: ['blu', 'In crescita'], pronto: ['verde', 'Pronto per avanzamento'], standby: ['giallo', 'In stand-by'] };
  const ORA_INIZIO = '07:30', TOLLERANZA = 10;
  App.LIVELLI = LIVELLI; App.STATI_PERCORSO = STATI;

  const media = v => { const x = CRITERI.map(([k]) => n(v[k])).filter(Boolean); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };
  const semaforo = voto => voto == null ? 'grigio' : voto >= 75 ? 'verde' : voto >= 60 ? 'giallo' : 'rosso';

  // Calcola la pagella di tutti (o di alcuni) dipendenti
  App.calcolaPagelle = async function (ids) {
    const oggi = fmt.oggi(), dal = fmt.piuGiorni(oggi, -60);
    const q = ids ? { in: { lavoratore_id: ids } } : {};
    const [lav, val, timb, docs, ass] = await Promise.all([
      db.lista('lavoratori', ids ? { in: { id: ids } } : { eq: { attivo: true } }),
      db.lista('valutazioni', { ...q, ordina: 'data' }).catch(() => []),
      db.lista('v_timbrature', { ...q, gte: { giorno: dal }, eq: { annullata: false } }).catch(() => []),
      db.lista('documenti_lavoratore', q).catch(() => []),
      db.lista('assenze', { ...q, gte: { al: dal } }).catch(() => [])
    ]);
    // si contano solo i giorni da quando ci sono timbrature (cioè da quando si usa il gestionale)
    const primo = timb.reduce((m, t) => t.giorno < m ? t.giorno : m, oggi);
    const feriali = []; for (let d = primo > dal ? primo : dal; d < oggi; d = fmt.piuGiorni(d, 1)) { const w = new Date(d + 'T12:00:00Z').getUTCDay(); if (w && w !== 6) feriali.push(d); }
    const ultimoDoc = (ds, t) => ds.filter(d => d.tipo === t).sort((a, b) => String(b.scadenza || '9999').localeCompare(String(a.scadenza || '9999')))[0];
    const out = {};
    for (const l of lav) {
      const vs = val.filter(v => v.lavoratore_id === l.id), ultima = vs[vs.length - 1], prima = vs[vs.length - 2];
      const mie = timb.filter(t => t.lavoratore_id === l.id), entrate = new Map();
      for (const t of mie) if (t.tipo === 'entrata' && (!entrate.has(t.giorno) || t.ora_locale < entrate.get(t.giorno))) entrate.set(t.giorno, t.ora_locale);
      const assenti = new Set(); for (const a of ass.filter(a => a.lavoratore_id === l.id)) for (const d of feriali) if (d >= a.dal && d <= a.al) assenti.add(d);
      const dovuti = feriali.filter(d => !assenti.has(d) && (!l.data_assunzione || d >= l.data_assunzione));
      const presenza = dovuti.length ? Math.min(100, dovuti.filter(d => entrate.has(d)).length / dovuti.length * 100) : null;
      const lim = (() => { const [h, m] = ORA_INIZIO.split(':').map(Number); const t = h * 60 + m + TOLLERANZA; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })();
      const puntuale = entrate.size ? [...entrate.values()].filter(o => o <= lim).length / entrate.size * 100 : null;
      const ds = docs.filter(d => d.lavoratore_id === l.id), scaduti = ds.filter(d => d === ultimoDoc(ds, d.tipo) && d.scadenza && d.scadenza < oggi);
      const docOk = !!ultimoDoc(ds, 'Carta d\'identità') && !!ultimoDoc(ds, 'Visita medica (idoneità)') && !scaduti.length;
      const formazione = ds.some(d => /corso|formazione|patentino/i.test(d.tipo) && (!d.scadenza || d.scadenza >= oggi));
      const mv = ultima ? media(ultima) : null, mp = prima ? media(prima) : null;
      const auto = [presenza, puntuale].filter(x => x != null), autoMedia = auto.length ? auto.reduce((a, b) => a + b, 0) / auto.length : null;
      const voto = mv == null && autoMedia == null ? null : Math.round(mv == null ? autoMedia : autoMedia == null ? mv * 20 : mv * 20 * 0.7 + autoMedia * 0.3);
      const livIdx = LIVELLI.indexOf(l.livello);
      const suggerito = mv != null && mv >= 4 && (!mp || mp >= 3.8) && docOk && livIdx < LIVELLI.length - 1 && (l.stato_percorso || 'crescita') === 'crescita';
      const daValutare = !ultima || ultima.data < fmt.piuGiorni(oggi, -90);
      out[l.id] = { l, vs, ultima, prima, mv, mp, trend: mv != null && mp != null ? (mv - mp > 0.15 ? 'su' : mp - mv > 0.15 ? 'giu' : 'pari') : null,
        presenza, puntuale, docOk, scaduti, formazione, voto, sem: semaforo(voto), stato: l.stato_percorso || 'crescita', suggerito, daValutare, livIdx };
    }
    return out;
  };
  const freccia = t => t === 'su' ? '<span class="pg-tr su" title="In miglioramento">▲</span>' : t === 'giu' ? '<span class="pg-tr giu" title="In calo">▼</span>' : t === 'pari' ? '<span class="pg-tr" title="Stabile">=</span>' : '';
  App.badgeVoto = p => `<span class="pg-voto ${p.sem}" title="Voto della pagella">${p.voto == null ? '–' : p.voto}</span>`;

  // ---------- Moduli ----------
  App.nuovaValutazione = function (l, dopo, cantiere_id) {
    const w = ui.finestra(`<h2>Valutazione di ${esc(l.cognome)} ${esc(l.nome)}</h2>
      <p class="nota" style="margin-bottom:12px">Da 1 (insufficiente) a 5 (eccellente). Bastano pochi secondi: conta la regolarità, per esempio una volta al mese o a fine cantiere.</p>
      <form id="v-f"><div class="v-criteri">${CRITERI.map(([k, t, s]) => `<fieldset class="v-crit"><legend><b>${esc(t)}</b><small>${esc(s)}</small></legend><div class="v-voti">${[1, 2, 3, 4, 5].map(x => `<label><input type="radio" name="${k}" value="${x}" ${x === 3 ? 'checked' : ''}><span>${x}</span></label>`).join('')}</div></fieldset>`).join('')}</div>
      <div class="campi" style="margin-top:12px"><div><label for="v-data">Data</label><input type="date" id="v-data" value="${fmt.oggi()}"></div><div id="v-cant"></div><div class="largo"><label for="v-note">Note (punti di forza, cosa migliorare)</label><textarea id="v-note"></textarea></div></div></form>
      <div class="azioni"><button class="btn vuoto" data-no>Annulla</button><button class="btn rosso" data-si>Salva valutazione</button></div>`, { chiudiFuori: false });
    ui.campoHtml({ k: 'cantiere_id', label: 'Su quale cantiere', tipo: 'rif', rif: App.RIF.cantiere }, cantiere_id || '').then(h => { w.el.querySelector('#v-cant').innerHTML = h; });
    w.el.querySelector('[data-no]').onclick = w.chiudi;
    w.el.querySelector('[data-si]').onclick = async () => {
      try {
        const f = w.el.querySelector('#v-f'), c = w.el.querySelector('[name=cantiere_id]');
        const d = { lavoratore_id: l.id, data: w.el.querySelector('#v-data').value || fmt.oggi(), valutatore: App.profilo.nome || App.profilo.email || '', note: w.el.querySelector('#v-note').value.trim(), cantiere_id: c && c.value ? Number(c.value) : null };
        for (const [k] of CRITERI) d[k] = Number(f.querySelector(`[name=${k}]:checked`).value);
        await db.inserisci('valutazioni', d); w.chiudi(); avviso('Valutazione salvata'); dopo();
      } catch (e) { errore(e); }
    };
  };
  const avanza = (l, dopo) => ui.modulo({ titolo: `Avanzamento di livello – ${l.cognome} ${l.nome}`, testoSalva: 'Registra avanzamento',
    valori: { a: LIVELLI[Math.min(LIVELLI.length - 1, LIVELLI.indexOf(l.livello) + 1)] || LIVELLI[0], data: fmt.oggi() },
    campi: [{ k: 'a', label: 'Nuovo livello', tipo: 'select', opzioni: LIVELLI, richiesto: true }, { k: 'data', label: 'Decorrenza', tipo: 'data', richiesto: true }, { k: 'note', label: 'Motivazione', tipo: 'area' }],
    salva: async d => { await db.inserisci('storico_livelli', { lavoratore_id: l.id, data: d.data, da: l.livello || '', a: d.a, note: d.note || '' }); await db.aggiorna('lavoratori', l.id, { livello: d.a, stato_percorso: 'crescita', motivo_standby: '', prossima_revisione: null }); ui.dimentica('lavoratori'); avviso('Avanzamento registrato: ricordati di comunicarlo al consulente del lavoro'); dopo(); } });
  const standby = (l, dopo) => ui.modulo({ titolo: `Stand-by – ${l.cognome} ${l.nome}`, testoSalva: 'Metti in stand-by', valori: { prossima_revisione: fmt.piuGiorni(fmt.oggi(), 90) },
    campi: [{ k: 'motivo_standby', label: 'Perché', tipo: 'area', richiesto: true, aiuto: 'es. deve completare il corso preposto, poca puntualità negli ultimi mesi' }, { k: 'prossima_revisione', label: 'Da rivedere il', tipo: 'data' }],
    salva: async d => { await db.aggiorna('lavoratori', l.id, { stato_percorso: 'standby', ...d }); ui.dimentica('lavoratori'); avviso('Percorso in stand-by'); dopo(); } });
  const metti = async (l, stato, dopo) => { try { await db.aggiorna('lavoratori', l.id, { stato_percorso: stato, ...(stato !== 'standby' ? { motivo_standby: '' } : {}) }); ui.dimentica('lavoratori'); dopo(); } catch (e) { errore(e); } };

  // ---------- Tabellone: in crescita / pronti / stand-by ----------
  App.tabellonePagelle = async function (el) {
    const P = Object.values(await App.calcolaPagelle());
    const col = k => P.filter(p => p.stato === k).sort((a, b) => (b.voto ?? -1) - (a.voto ?? -1));
    const daVal = P.filter(p => p.daValutare).length, sugg = P.filter(p => p.suggerito).length;
    const vm = P.filter(p => p.voto != null); const votoMedio = vm.length ? Math.round(vm.reduce((s, p) => s + p.voto, 0) / vm.length) : null;
    const carta = p => `<button class="pg-carta" data-l="${p.l.id}"><span class="pg-testa">${App.badgeVoto(p)}<span><b>${esc(p.l.cognome)} ${esc(p.l.nome)}</b><small>${esc(p.l.livello || 'livello non indicato')}</small></span>${freccia(p.trend)}</span>
      <span class="pg-righe">${p.mv != null ? `<span>Valutazione ${fmt.num(r1(p.mv))}/5</span>` : '<span>Mai valutato</span>'}${p.presenza != null ? `<span>Presenza ${Math.round(p.presenza)}%</span>` : ''}${p.puntuale != null ? `<span>Puntualità ${Math.round(p.puntuale)}%</span>` : ''}</span>
      <span class="pg-badge">${p.suggerito ? '<span class="stato verde">suggerito: pronto per il livello successivo</span>' : ''}${p.daValutare ? '<span class="stato giallo">da valutare</span>' : ''}${!p.docOk ? '<span class="stato rosso">documenti da sistemare</span>' : ''}${p.stato === 'standby' && p.l.motivo_standby ? `<span class="nota">${esc(p.l.motivo_standby)}${p.l.prossima_revisione ? ` · rivedere il ${fmt.data(p.l.prossima_revisione)}` : ''}</span>` : ''}</span></button>`;
    el.innerHTML = `<div class="pv-kpis">
        <div class="pv-kpi ${semaforo(votoMedio) === 'verde' ? 'verde' : semaforo(votoMedio) === 'giallo' ? 'bordeaux' : 'ardesia'}"><span>Voto medio</span><b>${votoMedio ?? '–'}</b><small>su 100, ${vm.length} dipendenti valutati</small></div>
        <div class="pv-kpi blu"><span>In crescita</span><b>${col('crescita').length}</b><small>${sugg ? `${sugg} pronti secondo i voti` : 'percorso regolare'}</small></div>
        <div class="pv-kpi verde"><span>Pronti per avanzamento</span><b>${col('pronto').length}</b><small>da proporre</small></div>
        <div class="pv-kpi ${col('standby').length ? 'bordeaux' : 'ardesia'}"><span>In stand-by</span><b>${col('standby').length}</b><small>percorso fermo</small></div>
        <div class="pv-kpi ${daVal ? 'rosso' : 'ardesia'}"><span>Da valutare</span><b>${daVal}</b><small>nessuna valutazione da 90 giorni</small></div></div>
      <p class="nota" style="margin:4px 0 12px;max-width:90ch">Il voto (0–100) unisce l'ultima valutazione del capocantiere o dell'ufficio (70%) con presenza e puntualità degli ultimi 60 giorni (30%). Verde da 75, giallo da 60. Clicca un dipendente per la sua pagella.</p>
      <div class="pg-tabellone">${Object.entries(STATI).map(([k, [c, t]]) => `<section class="pg-colonna ${c}"><h3>${esc(t)} <span>${col(k).length}</span></h3>${col(k).map(carta).join('') || '<p class="nota">Nessuno.</p>'}</section>`).join('')}</div>`;
    el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { try { sessionStorage.setItem('lav-pagella', '1'); } catch {} ui.vai('lavoratore', b.dataset.l); });
  };

  // ---------- Pagella nella scheda del dipendente ----------
  const paginaLav = ui.pagine.lavoratore;
  ui.pagina('lavoratore', async (el, id) => {
    await paginaLav(el, id);
    const [P, storico] = await Promise.all([App.calcolaPagelle([Number(id)]), db.lista('storico_livelli', { eq: { lavoratore_id: id }, ordina: 'data.desc' }).catch(() => [])]);
    const p = P[id]; if (!p) return;
    const l = p.l, ricarica = () => ui.pagine.lavoratore(el, id);
    const sez = document.createElement('section'); sez.className = 'pannello pg-pagella'; sez.id = 'pagella';
    const tessere = el.querySelector('.lv-tessere'); (tessere || el).insertAdjacentElement('afterend', sez);
    const storiaVoti = p.vs.map(v => ({ d: v.data, m: media(v) }));
    const spark = (() => { if (storiaVoti.length < 2) return ''; const W = 220, H = 48, x = i => 6 + i / (storiaVoti.length - 1) * (W - 12), y = m => H - 6 - (m - 1) / 4 * (H - 12);
      return `<svg class="pg-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento delle valutazioni: da ${fmt.num(r1(storiaVoti[0].m))} a ${fmt.num(r1(storiaVoti[storiaVoti.length - 1].m))} su 5"><path d="${storiaVoti.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(s.m)}`).join('')}"/>${storiaVoti.map((s, i) => `<circle cx="${x(i)}" cy="${y(s.m)}" r="3"><title>${fmt.data(s.d)}: ${fmt.num(r1(s.m))}</title></circle>`).join('')}</svg>`; })();
    const st = STATI[p.stato];
    sez.innerHTML = `<div class="testata" style="margin-bottom:10px"><h2>Pagella e crescita</h2><div class="azioni">
        <button class="btn vuoto piccolo" data-p="val">Nuova valutazione</button>
        ${p.stato !== 'standby' ? '<button class="btn vuoto piccolo" data-p="standby">Metti in stand-by</button>' : '<button class="btn vuoto piccolo" data-p="riprendi">Riprendi il percorso</button>'}
        ${p.stato === 'crescita' ? '<button class="btn vuoto piccolo" data-p="pronto">Segna pronto</button>' : ''}
        <button class="btn rosso piccolo" data-p="avanza">Avanza di livello</button></div></div>
      <div class="pg-grid">
        <div class="pg-riass"><div class="pg-grande ${p.sem}"><b>${p.voto ?? '–'}</b><span>voto su 100</span></div>
          <dl class="ck-dati"><div><dt>Livello</dt><dd><b>${esc(l.livello || 'non indicato')}</b></dd></div><div><dt>Percorso</dt><dd><span class="stato ${st[0]}">${esc(st[1])}</span></dd></div>
            ${p.stato === 'standby' ? `<div><dt>Motivo</dt><dd>${esc(l.motivo_standby || '')}${l.prossima_revisione ? `<br><span class="nota">da rivedere il ${fmt.data(l.prossima_revisione)}</span>` : ''}</dd></div>` : ''}
            <div><dt>Ultima valutazione</dt><dd>${p.ultima ? `${fmt.data(p.ultima.data)} ${freccia(p.trend)}<br><span class="nota">${esc(p.ultima.valutatore || '')}</span>` : '<span class="stato giallo">mai valutato</span>'}</dd></div></dl>
          ${p.suggerito ? '<p class="stato verde" style="display:block;padding:8px 10px;margin-top:8px">Voti alti e documenti in regola: il gestionale suggerisce di proporlo per il livello successivo.</p>' : ''}
          ${spark ? `<div class="pg-andamento"><span class="nota">Andamento delle valutazioni</span>${spark}</div>` : ''}</div>
        <div><h3 class="pg-tit">Valutazione per criterio</h3>${p.ultima ? CRITERI.map(([k, t]) => { const v = n(p.ultima[k]), pr = p.prima ? n(p.prima[k]) : null;
            return `<div class="pg-crit"><span>${esc(t)}</span><span class="pg-barra" role="img" aria-label="${esc(t)} ${v} su 5"><i class="${v >= 4 ? 'verde' : v >= 3 ? 'giallo' : 'rosso'}" style="width:${v / 5 * 100}%"></i>${pr ? `<em style="left:${pr / 5 * 100}%" title="Valutazione precedente: ${pr}"></em>` : ''}</span><b>${v}</b>${pr != null && pr !== v ? `<small class="${v > pr ? 'su' : 'giu'}">${v > pr ? '+' : ''}${v - pr}</small>` : '<small></small>'}</div>`; }).join('') : '<p class="nota">Nessuna valutazione: premi "Nuova valutazione".</p>'}
          ${p.ultima && p.ultima.note ? `<p class="pg-nota">"${esc(p.ultima.note)}"</p>` : ''}</div>
        <div><h3 class="pg-tit">Indicatori automatici</h3><ul class="pg-auto">
          <li class="${p.presenza == null ? '' : p.presenza >= 95 ? 'ok' : p.presenza >= 85 ? 'medio' : 'basso'}"><span>Presenza (60 giorni)</span><b>${p.presenza == null ? '–' : Math.round(p.presenza) + '%'}</b></li>
          <li class="${p.puntuale == null ? '' : p.puntuale >= 90 ? 'ok' : p.puntuale >= 75 ? 'medio' : 'basso'}"><span>Entrate entro le ${ORA_INIZIO} (+${TOLLERANZA} min)</span><b>${p.puntuale == null ? '–' : Math.round(p.puntuale) + '%'}</b></li>
          <li class="${p.docOk ? 'ok' : 'basso'}"><span>Documenti e idoneità</span><b>${p.docOk ? 'in regola' : p.scaduti.length ? p.scaduti.length + ' scaduti' : 'incompleti'}</b></li>
          <li class="${p.formazione ? 'ok' : 'medio'}"><span>Formazione valida</span><b>${p.formazione ? 'sì' : 'da fare'}</b></li></ul>
          <h3 class="pg-tit">Storico livelli</h3>${storico.length ? `<ol class="pg-storia">${storico.map(s => `<li><b>${fmt.data(s.data)}</b> ${esc(s.da || '—')} → <b>${esc(s.a)}</b>${s.note ? `<small>${esc(s.note)}</small>` : ''}</li>`).join('')}</ol>` : '<p class="nota">Nessun avanzamento registrato.</p>'}</div>
      </div>
      ${p.vs.length ? `<details class="pg-dett"><summary>Tutte le valutazioni (${p.vs.length})</summary><div class="scorri"><table class="tabella"><thead><tr><th>Data</th><th>Da</th>${CRITERI.map(([, t]) => `<th class="num">${esc(t.split(' ')[0])}</th>`).join('')}<th class="num">Media</th><th>Note</th></tr></thead><tbody>${[...p.vs].reverse().map(v => `<tr><td>${fmt.data(v.data)}</td><td>${esc(v.valutatore || '')}</td>${CRITERI.map(([k]) => `<td class="num">${n(v[k]) || ''}</td>`).join('')}<td class="num"><b>${fmt.num(r1(media(v)))}</b></td><td class="nota">${esc(v.note || '')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}`;
    sez.querySelectorAll('[data-p]').forEach(b => b.onclick = () => ({ val: () => App.nuovaValutazione(l, ricarica), avanza: () => avanza(l, ricarica), standby: () => standby(l, ricarica), riprendi: () => metti(l, 'crescita', ricarica), pronto: () => metti(l, 'pronto', ricarica) })[b.dataset.p]());
    let vai = false; try { vai = sessionStorage.getItem('lav-pagella') === '1'; sessionStorage.removeItem('lav-pagella'); } catch {}
    if (vai) window.scrollTo({ top: sez.getBoundingClientRect().top + scrollY - 80 });
  });

  // ---------- Andamento squadra di un cantiere (per la Panoramica) ----------
  App.andamentoSquadra = async function (v, c, d, k, turni, lav) {
    const idDi = nome => (lav.find(l => `${l.cognome} ${l.nome}` === nome) || {}).id;
    const ore = new Map(); for (const t of turni) { const i = idDi(t.lavoratore); if (t.ore && i) ore.set(i, (ore.get(i) || 0) + n(t.ore)); }
    const ids = [...ore.keys()];
    const P = ids.length ? await App.calcolaPagelle(ids) : {};
    const oreTot = [...ore.values()].reduce((a, b) => a + b, 0);
    const oreOfferta = App.aggregaFabbisogno(d.voci).filter(r => r.categoria === 'Manodopera' && /^(h|ore?)$/i.test(r.um)).reduce((s, r) => s + r.quantita, 0);
    const previsteOggi = oreOfferta && d.avanz != null ? oreOfferta * d.avanz / 100 : null;
    const efficienza = previsteOggi && oreTot ? previsteOggi / oreTot * 100 : null;
    const ricavoOra = oreTot && d.avanz != null ? k.contratto * d.avanz / 100 / oreTot : null, ricavoOraPrev = oreOfferta ? k.contratto / oreOfferta : null;
    const membri = ids.map(i => ({ p: P[i], ore: ore.get(i) })).filter(x => x.p).sort((a, b) => b.ore - a.ore);
    const pesati = membri.filter(x => x.p.voto != null), votoSq = pesati.length ? Math.round(pesati.reduce((s, x) => s + x.p.voto * x.ore, 0) / pesati.reduce((s, x) => s + x.ore, 0)) : null;
    const sem = x => x == null ? 'grigio' : x >= 95 ? 'verde' : x >= 85 ? 'giallo' : 'rosso';
    v.innerHTML = `<div class="testata" style="margin:14px 0 10px"><h2>Andamento squadra</h2><div class="azioni"><button class="btn vuoto piccolo" data-valuta ${membri.length ? '' : 'disabled'}>Valuta la squadra</button></div></div>
      <div class="pv-kpis">
        <div class="pv-kpi ${semaforo(votoSq) === 'verde' ? 'verde' : semaforo(votoSq) === 'giallo' ? 'bordeaux' : semaforo(votoSq) === 'rosso' ? 'rosso' : 'ardesia'}"><span>Voto della squadra</span><b>${votoSq ?? '–'}</b><small>media delle pagelle, pesata sulle ore</small></div>
        <div class="pv-kpi blu"><span>Ore lavorate</span><b>${fmt.num(Math.round(oreTot))} h</b><small>${membri.length} persone${oreOfferta ? ` · previste in tutto ${fmt.num(Math.round(oreOfferta))} h` : ''}</small></div>
        <div class="pv-kpi ${sem(efficienza) === 'verde' ? 'verde' : sem(efficienza) === 'giallo' ? 'bordeaux' : sem(efficienza) === 'rosso' ? 'rosso' : 'ardesia'}"><span>Resa della squadra</span><b>${efficienza == null ? '–' : fmt.pct(efficienza)}</b><small>${previsteOggi ? `ore previste a questo avanzamento ${fmt.num(Math.round(previsteOggi))} h contro ${fmt.num(Math.round(oreTot))} h fatte` : 'serve l\'offerta con l\'analisi e il cronoprogramma'}</small></div>
        <div class="pv-kpi ardesia"><span>Lavori prodotti per ora</span><b>${ricavoOra == null ? '–' : fmt.euro(ricavoOra)}</b><small>${ricavoOraPrev ? `previsti ${fmt.euro(ricavoOraPrev)} all'ora` : 'contratto × avanzamento ÷ ore'}</small></div></div>
      ${efficienza != null ? `<div class="pv-avviso ${efficienza >= 95 ? 'blu' : efficienza >= 85 ? 'giallo' : 'rosso'}"><span>${efficienza >= 100 ? `La squadra sta facendo meglio del previsto: a questo punto servivano ${fmt.num(Math.round(previsteOggi))} ore e ne ha usate ${fmt.num(Math.round(oreTot))}.` : efficienza >= 95 ? 'La squadra è in linea con le ore previste.' : `La squadra sta usando più ore del previsto: circa ${fmt.num(Math.round(oreTot - previsteOggi))} in più. Con questo ritmo la manodopera costerà il ${fmt.pct(100 / efficienza * 100 - 100)} in più.`}</span></div>` : ''}
      <div class="scorri"><table class="tabella fabb" style="margin-top:8px"><thead><tr><th>Dipendente</th><th>Livello</th><th class="num">Voto</th><th>Percorso</th><th class="num">Ore qui</th><th class="num">% della squadra</th><th class="num">Presenza</th><th class="num">Puntualità</th><th>Ultima valutazione</th></tr></thead>
        <tbody>${membri.map(({ p, ore: h }) => `<tr class="cliccabile" data-l="${p.l.id}" tabindex="0"><td><b>${esc(p.l.cognome)} ${esc(p.l.nome)}</b> ${freccia(p.trend)}</td><td>${esc(p.l.livello || '')}</td><td class="num">${App.badgeVoto(p)}</td><td><span class="stato ${STATI[p.stato][0]}">${esc(STATI[p.stato][1])}</span>${p.suggerito ? ' <span class="stato verde">pronto?</span>' : ''}</td>
          <td class="num">${fmt.num(Math.round(h))}</td><td class="num">${fmt.pct(oreTot ? h / oreTot * 100 : null)}</td><td class="num">${p.presenza == null ? '–' : Math.round(p.presenza) + '%'}</td><td class="num">${p.puntuale == null ? '–' : Math.round(p.puntuale) + '%'}</td><td>${p.ultima ? fmt.data(p.ultima.data) : '<span class="stato giallo">mai</span>'}</td></tr>`).join('') || '<tr><td colspan="9" class="vuota">Nessuno ha ancora lavorato su questo cantiere.</td></tr>'}</tbody></table></div>
      <p class="nota" style="margin-top:8px">Resa = ore di manodopera previste dall'offerta per l'avanzamento attuale ÷ ore realmente lavorate. Sopra 100% la squadra va più veloce del previsto.</p>`;
    v.querySelectorAll('tr[data-l]').forEach(tr => tr.onclick = () => { try { sessionStorage.setItem('lav-pagella', '1'); } catch {} ui.vai('lavoratore', tr.dataset.l); });
    const bv = v.querySelector('[data-valuta]');
    if (bv) bv.onclick = () => {
      const w = ui.finestra(`<h2>Valuta la squadra – ${esc(c.nome)}</h2><p class="nota" style="margin-bottom:10px">Da 1 a 5 per ogni criterio. Salva solo le righe che hai toccato.</p>
        <div class="scorri"><table class="tabella vs-tab"><thead><tr><th>Dipendente</th>${CRITERI.map(([, t]) => `<th class="num">${esc(t)}</th>`).join('')}</tr></thead><tbody>${membri.map(({ p }) => `<tr data-l="${p.l.id}"><td><b>${esc(p.l.cognome)} ${esc(p.l.nome)}</b></td>${CRITERI.map(([kk, t]) => `<td><select data-k="${kk}" aria-label="${esc(t)} di ${esc(p.l.cognome)}"><option value="">–</option>${[1, 2, 3, 4, 5].map(x => `<option>${x}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="azioni"><button class="btn vuoto" data-no>Annulla</button><button class="btn rosso" data-si>Salva valutazioni</button></div>`, { chiudiFuori: false });
      w.el.classList.add('larga');
      w.el.querySelector('[data-no]').onclick = w.chiudi;
      w.el.querySelector('[data-si]').onclick = async () => {
        try {
          const ins = [];
          for (const tr of w.el.querySelectorAll('tbody tr')) { const sel = [...tr.querySelectorAll('select')]; if (!sel.some(s => s.value)) continue;
            const r = { lavoratore_id: Number(tr.dataset.l), data: fmt.oggi(), valutatore: App.profilo.nome || '', cantiere_id: c.id, note: `Valutazione di squadra – ${c.nome}` };
            for (const s of sel) r[s.dataset.k] = Number(s.value) || 3; ins.push(r); }
          if (!ins.length) return avviso('Non hai inserito nessun voto.', { errore: true });
          await db.inserisci('valutazioni', ins); w.chiudi(); avviso(`${ins.length} valutazioni salvate`); App.andamentoSquadra(v, c, d, k, turni, lav);
        } catch (e) { errore(e); }
      };
    };
  };
})();
