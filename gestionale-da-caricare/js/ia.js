// Assistente: propone, precompila e segnala. L'ultima parola resta sempre a una persona.
// 1) Pianifica squadre: combinazione migliore di persone per cantiere (competenze, distanza, disponibilità).
//    È un algoritmo di ottimizzazione che gira nel gestionale: i dati non escono, non costa nulla.
// 2) Da approvare: piccole cose che oggi fanno perdere tempo (uscite non timbrate, fatture senza cantiere,
//    doppioni, giornale da scrivere) già precompilate, da confermare con un clic.
// 3) Leggi un documento: foto di DDT, fattura o scontrino → campi precompilati da controllare.
(function () {
  const { $, $$, esc, fmt, avviso, errore, conferma } = ui;
  const n = x => Number(x) || 0;

  // ---------- Competenze ----------
  const COMPETENZE = ['Barriere e guardrail', 'Battipalo', 'Saldatura', 'Segnaletica orizzontale', 'Segnaletica verticale', 'Escavatore',
    'Autocarro (patente C)', 'Fotovoltaico', 'Elettricista', 'Lavori in quota (PLE)', 'Preposto sicurezza', 'Carpenteria'];
  App.COMPETENZE = COMPETENZE;
  const listaComp = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  // dalle attività del cronoprogramma alle competenze che servono
  const REGOLE = [[/barrier|guardrail|nastr|terminal|bordo ponte/i, 'Barriere e guardrail'], [/infission|palett|battitura|\bpali\b/i, 'Battipalo'], [/saldat/i, 'Saldatura'],
    [/segnaletica orizzontale|strisce|tracciament/i, 'Segnaletica orizzontale'], [/segnaletica vertical|cartell|segnaletica provvisoria/i, 'Segnaletica verticale'],
    [/scav|sbancament|movimento terra|cavidott|plint/i, 'Escavatore'], [/rimozione|trasport|carico/i, 'Autocarro (patente C)'],
    [/modul|fotovolt|tracker|strutture/i, 'Fotovoltaico'], [/cavi|cabin|elettric|inverter|allacciament|quadr/i, 'Elettricista'], [/recinzion|carpent/i, 'Carpenteria']];
  const compDaAttivita = nome => REGOLE.filter(([r]) => r.test(nome)).map(([, k]) => k);

  // ---------- Distanze (centro del comune, linea d'aria × 1,3 per la strada) ----------
  const COORD = {
    'partinico': [38.045, 13.117], 'borgetto': [38.047, 13.142], 'balestrate': [38.051, 13.006], 'terrasini': [38.152, 13.081], 'montelepre': [38.091, 13.174],
    'giardinello': [38.088, 13.156], 'alcamo': [37.978, 12.964], 'monreale': [38.081, 13.289], 'camporeale': [37.897, 13.096], 'palermo': [38.116, 13.361],
    'carini': [38.133, 13.183], 'cinisi': [38.157, 13.108], 'trappeto': [38.069, 13.038], 'san giuseppe jato': [37.973, 13.186], 'san cipirello': [37.958, 13.176],
    'castellammare del golfo': [38.026, 12.881], 'trapani': [38.018, 12.514], 'erice': [38.037, 12.587], 'valderice': [38.040, 12.616], 'custonaci': [38.077, 12.675],
    'san vito lo capo': [38.174, 12.735], 'marsala': [37.799, 12.437], 'mazara del vallo': [37.654, 12.590], 'castelvetrano': [37.678, 12.791], 'partanna': [37.726, 12.888],
    'salemi': [37.818, 12.807], 'gibellina': [37.810, 12.869], 'calatafimi': [37.914, 12.864], 'calatafimi segesta': [37.914, 12.864], 'roccamena': [37.838, 13.155],
    'corleone': [37.813, 13.301], 'piana degli albanesi': [37.994, 13.284], 'altofonte': [38.044, 13.297], 'belmonte mezzagno': [38.046, 13.388], 'misilmeri': [38.033, 13.450],
    'villabate': [38.078, 13.442], 'bagheria': [38.080, 13.511], 'termini imerese': [37.984, 13.696], 'caccamo': [37.932, 13.668], 'lercara friddi': [37.748, 13.602],
    'cefalu': [38.039, 14.022], 'castelbuono': [37.931, 14.088], 'isola delle femmine': [38.198, 13.248], 'capaci': [38.172, 13.239], 'torretta': [38.131, 13.236],
    'sciacca': [37.509, 13.089], 'agrigento': [37.311, 13.576], 'caltanissetta': [37.490, 14.062], 'enna': [37.567, 14.279], 'catania': [37.502, 15.087],
    'messina': [38.193, 15.554], 'siracusa': [37.075, 15.287], 'ragusa': [36.926, 14.725]
  };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const coord = comune => COORD[norm(comune)] || null;
  const kmTra = (a, b) => {
    if (!a || !b) return null;
    const R = 6371, r = x => x * Math.PI / 180, dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.3);
  };
  App.kmTraComuni = (a, b) => kmTra(coord(a), coord(b));

  // ---------- Date ----------
  const lunediDi = d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return fmt.piuGiorni(d, w === 0 ? -6 : 1 - w); };
  const GG = ['lun', 'mar', 'mer', 'gio', 'ven'];
  const giorniSett = lun => GG.map((_, i) => fmt.piuGiorni(lun, i));
  const etSett = lun => { const v = fmt.piuGiorni(lun, 4), m = d => new Intl.DateTimeFormat('it-IT', { month: 'long', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
    return m(lun) === m(v) ? `${Number(lun.slice(8))}–${Number(v.slice(8))} ${m(v)}` : `${Number(lun.slice(8))} ${m(lun)} – ${Number(v.slice(8))} ${m(v)}`; };
  const giorniTesto = idx => { if (!idx.length) return ''; const s = []; let a = idx[0], p = idx[0];
    for (const i of [...idx.slice(1), 99]) { if (i === p + 1) { p = i; continue; } s.push(a === p ? GG[a] : `${GG[a]}–${GG[p]}`); a = p = i; } return s.join(', '); };
  // ora "hh:mm" di un giorno, come istante preciso nel fuso di Roma
  const isoRoma = (d, hm) => {
    const base = new Date(`${d}T${hm}:00Z`);
    const off = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'shortOffset' }).formatToParts(base).find(p => p.type === 'timeZoneName').value;
    const m = off.match(/GMT([+-]\d+)?(?::(\d+))?/), ore = m && m[1] ? Number(m[1]) : 0, min = m && m[2] ? Number(m[2]) * Math.sign(ore || 1) : 0;
    return new Date(base.getTime() - (ore * 60 + min) * 6e4).toISOString();
  };

  // ---------- Registro di quello che l'assistente propone e chi lo approva ----------
  App.registraIA = async (tipo, oggetto, esito, dettaglio = '') => {
    try { await db.inserisci('registro_ia', { tipo, oggetto, esito, dettaglio, utente: App.profilo.nome || App.profilo.email || '' }); } catch (e) { console.warn(e); }
  };

  // =====================================================================
  // 1) PIANIFICA SQUADRE
  // =====================================================================
  const PESI_DEF = { vicinanza: 1, competenze: 1, continuita: 1, equita: 1 };
  const LIV_PESO = [[0.4, 'poco'], [1, 'normale'], [2, 'molto']];

  async function caricaDati(lun) {
    const ven = fmt.piuGiorni(lun, 4), oggi = fmt.oggi(), vuoto = () => [];
    const [cantieri, lav, docs, ass, att, timb, rich, piano] = await Promise.all([
      db.lista('cantieri', { in: { stato: ['aperto', 'in preparazione'] }, ordina: 'codice' }),
      db.lista('lavoratori', { eq: { attivo: true }, ordina: 'cognome,nome' }),
      db.lista('documenti_lavoratore', { sel: 'lavoratore_id,tipo,scadenza' }).catch(vuoto),
      db.lista('assenze', { lte: { dal: ven }, gte: { al: lun } }).catch(vuoto),
      db.lista('attivita').catch(vuoto),
      db.lista('v_timbrature', { gte: { giorno: fmt.piuGiorni(oggi, -28) }, eq: { annullata: false }, ordina: 'ora' }).catch(vuoto),
      db.lista('squadre_richieste', { eq: { settimana: lun } }).catch(vuoto),
      db.lista('piano_squadre', { eq: { settimana: lun } }).catch(vuoto)
    ]);
    const pagelle = App.calcolaPagelle ? await App.calcolaPagelle().catch(() => ({})) : {};
    const giorni = giorniSett(lun);

    // fabbisogno di ogni cantiere: dal cronoprogramma oppure come l'hai impostato tu
    const fab = cantieri.filter(c => c.stato === 'aperto' || (c.data_inizio && c.data_inizio <= ven)).map(c => {
      const sue = att.filter(a => a.cantiere_id === c.id);
      const foglie = sue.filter(a => !sue.some(x => x.padre_id === a.id));
      const attive = foglie.filter(a => n(a.avanzamento) < 100 && a.inizio <= ven && (fmt.piuGiorni(a.inizio, Math.max(1, n(a.durata)) - 1) >= lun || n(a.avanzamento) > 0 || a.inizio < lun));
      const comp = [...new Set(attive.flatMap(a => compDaAttivita(a.nome)))];
      const parte = c.data_inizio && c.data_inizio > lun ? giorni.filter(d => d >= c.data_inizio).length : 5;
      const persone = Math.max(3, Math.min(6, 2 + attive.length));
      const r = rich.find(x => x.cantiere_id === c.id);
      const casa = coord(c.comune);
      return r
        ? { c, casa, persone: n(r.persone), comp: listaComp(r.competenze), capo: !!r.serve_capo, note: r.note || '', fonte: 'tu', rid: r.id, attive, parte }
        : { c, casa, persone: attive.length || c.stato === 'aperto' ? persone : 0, comp, capo: true, note: '', fonte: 'crono', attive, parte };
    }).filter(f => f.persone > 0);

    // le persone: competenze, casa, disponibilità, documenti, voto, quanto hanno viaggiato
    const W = new Map();
    for (const l of lav) {
      const comp = new Set(listaComp(l.competenze));
      if (/\b(C|CE|CQC)\b/.test(l.patente || '')) comp.add('Autocarro (patente C)');
      const capo = /capo/i.test(l.qualifica || '') || l.livello === 'Capo squadra';
      const ds = docs.filter(d => d.lavoratore_id === l.id);
      const ultimo = t => ds.filter(d => d.tipo === t).sort((a, b) => String(b.scadenza || '9999').localeCompare(String(a.scadenza || '9999')))[0];
      const vm = ultimo('Visita medica (idoneità)'), cs = ultimo('Attestato corso sicurezza');
      const mieAss = ass.filter(a => a.lavoratore_id === l.id);
      const via = [], motivoVia = {};
      giorni.forEach((d, i) => { const a = mieAss.find(a => d >= a.dal && d <= a.al); if (a) { via.push(i); motivoVia[a.tipo] = (motivoVia[a.tipo] || []).concat(i); } });
      let blocco = null; const avvisi = [];
      if (!vm) avvisi.push('visita medica non registrata nel gestionale');
      else if (vm.scadenza && vm.scadenza < lun) blocco = `visita medica scaduta il ${fmt.data(vm.scadenza)}`;
      else if (vm.scadenza && vm.scadenza <= ven) avvisi.push(`visita medica in scadenza il ${fmt.data(vm.scadenza)}`);
      if (cs && cs.scadenza && cs.scadenza < ven) avvisi.push(`corso sicurezza scaduto il ${fmt.data(cs.scadenza)}`);
      if (!blocco && via.length === 5) blocco = `${Object.keys(motivoVia).join(' e ').toLowerCase()} tutta la settimana`;
      const mie = timb.filter(t => t.lavoratore_id === l.id);
      const ultimoCant = mie.length ? mie[mie.length - 1].cantiere_id : null;
      const casa = coord(l.comune);
      const giorniLontano = new Set(mie.filter(t => { const c = cantieri.find(x => x.id === t.cantiere_id); const k = c ? kmTra(casa, coord(c.comune)) : null; return k != null && k > 30; }).map(t => t.giorno)).size;
      W.set(l.id, { l, comp, capo, guida: !!l.automunito, casa, via, motivoVia, giorniDisp: 5 - via.length, blocco, avvisi, ultimoCant, giorniLontano,
        voto: pagelle[l.id] && (pagelle[l.id].ultima || pagelle[l.id].puntuale != null) ? pagelle[l.id].voto : null, ore: n(l.ore_settimanali) || 40 });
    }
    return { lun, fab, W, piano, cantieri };
  }

  // punteggio di una persona su un cantiere (più alto = meglio); i requisiti di squadra si valutano a parte
  function punteggio(w, f, P) {
    const d = kmTra(w.casa, f.casa), dd = d == null ? 25 : d;
    let s = 50 - dd * 0.8 * P.vicinanza;
    s += f.comp.filter(k => w.comp.has(k)).length * 8 * P.competenze;
    if (w.ultimoCant === f.c.id) s += 14 * P.continuita;
    if (dd > 30) s -= w.giorniLontano * 1.5 * P.equita;
    if (w.voto != null) s += (w.voto - 65) / 4;
    s -= (5 - w.giorniDisp) * 6 + (40 - Math.min(40, w.ore)) / 4;
    return s;
  }
  // quanto è buona una squadra: requisiti mancanti pesano molto
  function analisiSquadra(f, membri) {
    const comp = new Set(membri.flatMap(w => [...w.comp]));
    const mancano = f.comp.filter(k => !comp.has(k));
    const capo = membri.some(w => w.capo);
    const autisti = membri.filter(w => w.guida).length, servonoAuto = Math.ceil(membri.length / 5);
    return { mancano, capo, autisti, servonoAuto, pochi: Math.max(0, f.persone - membri.length) };
  }
  function valore(stato, D, P) {
    let tot = 0;
    for (const f of D.fab) {
      const membri = (stato.get(f.c.id) || []).map(id => D.W.get(id));
      for (const w of membri) tot += punteggio(w, f, P);
      const a = analisiSquadra(f, membri);
      // una competenza o il capo che mancano pesano più di qualche km; le persone mancanti si distribuiscono tra i cantieri
      tot -= a.mancano.length * 70 * P.competenze + (f.capo && membri.length && !a.capo ? 60 : 0) + Math.max(0, a.servonoAuto - a.autisti) * 30 + 15 * a.pochi * (a.pochi + 1);
    }
    return tot;
  }

  // costruzione + miglioramento con scambi: rispetta sempre le scelte bloccate
  function ottimizza(D, P, blocchi) {
    const stato = new Map(D.fab.map(f => [f.c.id, []]));
    const preso = new Map();
    for (const [wid, cid] of blocchi) { preso.set(wid, cid); if (cid != null && stato.has(cid)) stato.get(cid).push(wid); }
    const liberi = () => [...D.W.values()].filter(w => !w.blocco && !preso.has(w.l.id));
    const posto = f => stato.get(f.c.id).length < f.persone;
    // 1. si aggiunge ogni volta la coppia persona-cantiere che migliora di più il piano
    for (;;) {
      let meglio = null, base = valore(stato, D, P);
      for (const f of D.fab) {
        if (!posto(f)) continue;
        for (const w of liberi()) {
          stato.get(f.c.id).push(w.l.id);
          const g = valore(stato, D, P) - base;
          stato.get(f.c.id).pop();
          if (g > 0 && (!meglio || g > meglio.g + 1e-9)) meglio = { g, w, f };
        }
      }
      if (!meglio) break;
      stato.get(meglio.f.c.id).push(meglio.w.l.id); preso.set(meglio.w.l.id, meglio.f.c.id);
    }
    // 2. scambi e spostamenti finché il piano migliora
    const libero = id => !blocchi.has(id);
    for (let giro = 0; giro < 40; giro++) {
      let migliorato = false;
      const base = valore(stato, D, P);
      const tutti = [...D.W.values()].filter(w => !w.blocco && libero(w.l.id));
      outer:
      for (const a of tutti) {
        const ca = preso.get(a.l.id) ?? null;
        for (const b of tutti) {
          if (a === b) continue;
          const cb = preso.get(b.l.id) ?? null;
          if (ca === cb || (ca == null && cb == null)) continue;
          const sa = ca == null ? null : stato.get(ca), sb = cb == null ? null : stato.get(cb);
          if (sa) sa[sa.indexOf(a.l.id)] = b.l.id; if (sb) sb[sb.indexOf(b.l.id)] = a.l.id;
          if (valore(stato, D, P) > base + 0.01) { if (ca != null) preso.set(b.l.id, ca); else preso.delete(b.l.id); if (cb != null) preso.set(a.l.id, cb); else preso.delete(a.l.id); migliorato = true; break outer; }
          if (sa) sa[sa.indexOf(b.l.id)] = a.l.id; if (sb) sb[sb.indexOf(a.l.id)] = b.l.id;
        }
        // spostare la persona in un altro cantiere con posto libero
        for (const f of D.fab) {
          if (f.c.id === ca || !posto(f)) continue;
          if (ca != null) stato.get(ca).splice(stato.get(ca).indexOf(a.l.id), 1);
          stato.get(f.c.id).push(a.l.id);
          if (valore(stato, D, P) > base + 0.01) { preso.set(a.l.id, f.c.id); migliorato = true; break outer; }
          stato.get(f.c.id).pop(); if (ca != null) stato.get(ca).push(a.l.id);
        }
      }
      if (!migliorato) break;
    }
    const ass = new Map(); for (const w of D.W.values()) ass.set(w.l.id, preso.has(w.l.id) ? preso.get(w.l.id) : null);
    return ass;
  }

  // perché l'assistente ha messo questa persona qui
  function motivi(w, f, membri, D) {
    const m = [], d = kmTra(w.casa, f.casa);
    m.push(d == null ? 'distanza non stimata' : d <= 3 ? 'abita sul posto' : `${d} km da casa`);
    if (f.capo && w.capo) m.push(membri.filter(x => x.capo).length === 1 ? 'capo squadra' : 'capo squadra (secondo)');
    const usa = f.comp.filter(k => w.comp.has(k));
    for (const k of usa) m.push(membri.filter(x => x.comp.has(k)).length === 1 ? `unico con ${k.toLowerCase()}` : k);
    if (w.guida) m.push('ha l\'auto: porta la squadra');
    if (w.ultimoCant === f.c.id) m.push('è già su questo cantiere');
    if (w.voto != null) m.push(`pagella ${w.voto}`);
    if (w.via.length) m.push(`assente ${giorniTesto(w.via)}`);
    if (w.ore < 40) m.push(`${w.ore} ore a settimana`);
    return m;
  }
  function avvisiCantiere(f, membri) {
    const a = analisiSquadra(f, membri), out = [];
    if (a.pochi) out.push(['rosso', `Mancano ${a.pochi} ${a.pochi === 1 ? 'persona' : 'persone'} rispetto alle ${f.persone} richieste`]);
    if (f.capo && membri.length && !a.capo) out.push(['rosso', 'Nessun capo squadra']);
    if (a.mancano.length) out.push(['rosso', `Nessuno sa fare: ${a.mancano.join(', ').toLowerCase()}`]);
    if (membri.length && a.autisti < a.servonoAuto) out.push(['giallo', a.autisti ? `Auto insufficienti: ${a.autisti} per ${membri.length} persone` : 'Nessuno ha l\'auto per portare la squadra']);
    const buchi = [0, 1, 2, 3, 4].map(i => membri.filter(w => !w.via.includes(i)).length);
    const min = Math.min(...buchi); if (membri.length && min < membri.length) out.push(['giallo', `In alcuni giorni la squadra è ridotta: ${GG.map((g, i) => buchi[i] < membri.length ? `${g} ${buchi[i]}` : '').filter(Boolean).join(', ')}`]);
    if (f.parte < 5) out.push(['blu', `Il cantiere parte in settimana: servono ${f.parte} giorni su 5`]);
    for (const w of membri) for (const x of w.avvisi) out.push(['giallo', `${w.l.cognome} ${w.l.nome}: ${x}`]);
    return out;
  }

  const chiaveBozza = lun => 'piano-bozza-' + lun;
  const leggiBozza = lun => { try { return JSON.parse(sessionStorage.getItem(chiaveBozza(lun)) || 'null'); } catch { return null; } };
  const salvaBozza = (lun, s) => { try { sessionStorage.setItem(chiaveBozza(lun), JSON.stringify(s)); } catch {} };
  const leggiPesi = () => { try { return { ...PESI_DEF, ...JSON.parse(localStorage.getItem('piano-pesi') || '{}') }; } catch { return { ...PESI_DEF }; } };

  ui.pagina('squadre', async el => {
    let lun; try { lun = sessionStorage.getItem('piano-settimana'); } catch {}
    if (!lun) lun = fmt.piuGiorni(lunediDi(fmt.oggi()), 7);
    el.innerHTML = App.testata('Pianifica squadre', {
      sopra: '<a href="#assistente">Assistente</a> / squadre della settimana',
      azioni: `<div class="sq-sett" role="group" aria-label="Settimana"><button class="btn vuoto" id="sq-prima" aria-label="Settimana prima">‹</button><b id="sq-et"></b><button class="btn vuoto" id="sq-dopo" aria-label="Settimana dopo">›</button></div>`
    }) + '<div id="sq-corpo"><p class="nota">L\'assistente sta preparando la proposta…</p></div>';
    const vaiA = d => { lun = d; try { sessionStorage.setItem('piano-settimana', d); } catch {} disegna(true); };
    $('#sq-prima', el).onclick = () => vaiA(fmt.piuGiorni(lun, -7));
    $('#sq-dopo', el).onclick = () => vaiA(fmt.piuGiorni(lun, 7));

    let D, P = leggiPesi(), ass, blocchi, approvato, manuali;
    async function disegna(ricarica) {
      $('#sq-et', el).textContent = 'Settimana ' + etSett(lun);
      if (ricarica) {
        D = await caricaDati(lun);
        const bozza = leggiBozza(lun);
        approvato = D.piano.length ? { da: D.piano[0].approvato_da_nome, il: D.piano[0].approvato_il } : null;
        if (bozza) { blocchi = new Map(bozza.blocchi); manuali = bozza.manuali || 0; ass = new Map(bozza.ass); approvato = bozza.approvato || null; }
        else if (D.piano.length) {
          blocchi = new Map(D.piano.filter(r => r.bloccato).map(r => [r.lavoratore_id, r.cantiere_id]));
          ass = new Map([...D.W.keys()].map(id => [id, (D.piano.find(r => r.lavoratore_id === id) || {}).cantiere_id ?? null]));
          manuali = 0;
        } else { blocchi = new Map(); manuali = 0; ass = ottimizza(D, P, blocchi); }
        // chi non esiste più o non può lavorare esce dal piano
        for (const [id] of ass) if (!D.W.has(id) || D.W.get(id).blocco) ass.set(id, null);
        for (const w of D.W.values()) if (!ass.has(w.l.id)) ass.set(w.l.id, null);
      }
      salvaBozza(lun, { ass: [...ass], blocchi: [...blocchi], manuali, approvato });
      const team = f => [...ass].filter(([, c]) => c === f.c.id).map(([id]) => D.W.get(id)).sort((a, b) => b.capo - a.capo || a.l.cognome.localeCompare(b.l.cognome));
      const tutteComp = D.fab.reduce((s, f) => s + f.comp.length, 0), coperte = D.fab.reduce((s, f) => s + f.comp.length - analisiSquadra(f, team(f)).mancano.length, 0);
      const assegnati = [...ass.values()].filter(c => c != null).length, richiesti = D.fab.reduce((s, f) => s + f.persone, 0);
      const km = D.fab.reduce((s, f) => s + team(f).reduce((t, w) => t + (kmTra(w.casa, f.casa) || 0) * 2 * w.giorniDisp, 0), 0);
      const tuttiAvvisi = D.fab.flatMap(f => avvisiCantiere(f, team(f)));
      const rossi = tuttiAvvisi.filter(a => a[0] === 'rosso').length;
      const statoTxt = approvato ? (approvato.modificato ? '<span class="stato giallo">modificato dopo l\'approvazione: da riapprovare</span>' : `<span class="stato verde">approvato${approvato.da ? ' da ' + esc(approvato.da) : ''}${approvato.il ? ' il ' + fmt.data(approvato.il) : ''}</span>`) : '<span class="stato giallo">proposta dell\'assistente: da approvare</span>';
      const sposta = w => `<select class="sq-sposta" data-w="${w.l.id}" aria-label="Sposta ${esc(w.l.cognome)}"><option value="">${ass.get(w.l.id) == null ? 'Assegna a…' : 'Sposta…'}</option>${ass.get(w.l.id) != null ? '<option value="fuori">Togli dal cantiere</option>' : ''}${D.fab.filter(f => f.c.id !== ass.get(w.l.id)).map(f => `<option value="${f.c.id}">→ ${esc(f.c.codice || '')} ${esc(f.c.nome)}</option>`).join('')}</select>`;
      const persona = (w, f, membri) => `<li class="sq-p ${blocchi.has(w.l.id) ? 'fisso' : ''}">
          <div class="sq-p-testa"><b>${esc(w.l.cognome)} ${esc(w.l.nome)}</b>${w.capo ? '<span class="sq-tag capo">capo</span>' : ''}${w.guida ? '<span class="sq-tag auto" title="Automunito">auto</span>' : ''}${w.avvisi.length ? '<span class="sq-tag att" title="' + esc(w.avvisi.join('; ')) + '">!</span>' : ''}</div>
          <div class="sq-perche">${motivi(w, f, membri, D).map(esc).join(' · ')}</div>
          <div class="sq-az"><button class="sq-fissa" data-w="${w.l.id}" aria-pressed="${blocchi.has(w.l.id)}" title="${blocchi.has(w.l.id) ? 'Scelta tua: l\'assistente non la cambia' : 'Blocca qui: l\'assistente non lo sposterà'}">${blocchi.has(w.l.id) ? 'Bloccato' : 'Blocca'}</button>${sposta(w)}</div></li>`;
      const liberi = [...D.W.values()].filter(w => !w.blocco && ass.get(w.l.id) == null), fermi = [...D.W.values()].filter(w => w.blocco);
      $('#sq-corpo', el).innerHTML = `
        <div class="ia-banda"><span class="ia-ico" aria-hidden="true">✦</span><div><b>L'assistente propone, tu decidi.</b> Ha scelto le squadre guardando competenze richieste dalle attività del cronoprogramma, distanza da casa, ferie e malattie, visite mediche, pagelle e chi è già sul cantiere. Sposta o blocca chi vuoi: con "Ricalcola" sistema il resto intorno alle tue scelte. Nulla viene salvato finché non approvi.</div>${statoTxt}</div>
        <div class="pv-kpis sq-kpis">
          <div class="pv-kpi ${assegnati >= richiesti ? 'verde' : 'bordeaux'}"><span>Persone assegnate</span><b>${assegnati} / ${richiesti}</b><small>${assegnati < richiesti && liberi.length === 0 ? `mancano ${richiesti - assegnati} persone: la carenza è divisa tra i cantieri` : `${D.W.size} dipendenti in forza, ${fermi.length} non disponibili`}</small></div>
          <div class="pv-kpi ${coperte === tutteComp ? 'verde' : 'rosso'}"><span>Competenze coperte</span><b>${tutteComp ? Math.round(coperte / tutteComp * 100) : 100}%</b><small>${coperte} su ${tutteComp} richieste dai lavori</small></div>
          <div class="pv-kpi blu"><span>Km casa–cantiere</span><b>${fmt.num(km)}</b><small>andata e ritorno nella settimana${assegnati ? ` · in media ${fmt.num(Math.round(km / assegnati / 5))} km al giorno a persona` : ''}</small></div>
          <div class="pv-kpi ${rossi ? 'rosso' : tuttiAvvisi.length ? 'bordeaux' : 'verde'}"><span>Da controllare</span><b>${tuttiAvvisi.filter(a => a[0] !== 'blu').length}</b><small>${rossi ? `${rossi} problemi seri` : 'nessun problema serio'}</small></div></div>
        <details class="pannello sq-pesi"><summary><b>Cosa conta di più per te</b> <span class="nota">cambia le priorità e ricalcola</span></summary>
          <div class="sq-pesi-griglia">${[['vicinanza', 'Vicinanza a casa', 'meno strada, meno costi e stanchezza'], ['competenze', 'Competenze giuste', 'chi sa fare le lavorazioni in corso'], ['continuita', 'Stessa squadra', 'chi è già sul cantiere ci resta'], ['equita', 'Trasferte a turno', 'chi ha già viaggiato tanto resta più vicino']].map(([k, t, s]) =>
            `<div><b>${t}</b><small>${s}</small><div class="sq-seg" role="group" aria-label="${t}">${LIV_PESO.map(([v, et]) => `<button data-peso="${k}" data-v="${v}" aria-pressed="${P[k] === v}">${et}</button>`).join('')}</div></div>`).join('')}</div></details>
        <div class="sq-griglia">
          ${D.fab.map(f => { const m = team(f), av = avvisiCantiere(f, m), an = analisiSquadra(f, m); return `<section class="sq-cant">
            <header><div><a href="#cantiere-${f.c.id}"><b>${esc(f.c.codice ? f.c.codice + ' – ' : '')}${esc(f.c.nome)}</b></a><small>${esc(f.c.comune || 'comune non indicato')}${f.casa ? '' : ' · posizione non riconosciuta'}</small></div><button class="btn vuoto piccolo" data-fab="${f.c.id}">Cosa serve</button></header>
            <div class="sq-serve"><span>Servono <b>${f.persone}</b> persone${f.capo ? ' con capo squadra' : ''}</span>${f.comp.map(k => `<span class="sq-comp ${an.mancano.includes(k) ? 'no' : 'si'}">${an.mancano.includes(k) ? '✕' : '✓'} ${esc(k)}</span>`).join('')}
              <small class="nota">${f.fonte === 'tu' ? 'Impostato da te' : f.attive.length ? 'Stimato dal cronoprogramma: ' + esc(f.attive.map(a => a.nome).join(', ')) : 'Nessuna attività nel cronoprogramma: stima di base'}</small></div>
            <ul class="sq-team" role="list">${m.map(w => persona(w, f, m)).join('') || '<li class="nota">Nessuno assegnato.</li>'}</ul>
            ${av.length ? `<ul class="sq-avvisi" role="list">${av.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('')}</ul>` : '<p class="sq-ok">Squadra completa: nessun problema.</p>'}
          </section>`; }).join('')}
          <section class="sq-cant sq-fuori">
            <header><div><b>Senza cantiere</b><small>${liberi.length} disponibili · ${fermi.length} non disponibili</small></div></header>
            <ul class="sq-team" role="list">${liberi.map(w => { const migl = D.fab.map(f => ({ f, d: kmTra(w.casa, f.casa) })).sort((a, b) => (a.d ?? 999) - (b.d ?? 999))[0];
              return `<li class="sq-p ${blocchi.has(w.l.id) ? 'fisso' : ''}"><div class="sq-p-testa"><b>${esc(w.l.cognome)} ${esc(w.l.nome)}</b>${w.capo ? '<span class="sq-tag capo">capo</span>' : ''}${w.guida ? '<span class="sq-tag auto">auto</span>' : ''}</div>
                <div class="sq-perche">${esc([w.comp.size ? [...w.comp].join(', ') : 'competenze non indicate', blocchi.has(w.l.id) ? 'lasciato fuori da te' : 'le squadre sono già complete', migl && migl.d != null ? (migl.d <= 3 ? `abita accanto a ${migl.f.c.nome}` : `${migl.d} km da ${migl.f.c.nome}`) : '', w.via.length ? `assente ${giorniTesto(w.via)}` : ''].filter(Boolean).join(' · '))}</div>
                <div class="sq-az">${sposta(w)}</div></li>`; }).join('') || '<li class="nota">Tutti i disponibili sono in un cantiere.</li>'}
              ${fermi.map(w => `<li class="sq-p fermo"><div class="sq-p-testa"><b>${esc(w.l.cognome)} ${esc(w.l.nome)}</b><span class="sq-tag no">non disponibile</span></div><div class="sq-perche">${esc(w.blocco)}</div></li>`).join('')}</ul>
          </section>
        </div>
        <div class="sq-fondo">
          <p class="nota">Distanze stimate dal centro del comune di residenza al comune del cantiere. ${manuali ? `Hai fatto ${manuali} ${manuali === 1 ? 'modifica' : 'modifiche'} alla proposta.` : ''}</p>
          <div class="azioni"><button class="btn vuoto" id="sq-ricalcola">Ricalcola intorno alle mie scelte</button><button class="btn vuoto" id="sq-msg">Copia messaggio per le squadre</button><button class="btn vuoto" id="sq-stampa">Stampa</button><button class="btn rosso" id="sq-approva">${approvato && !approvato.modificato ? 'Approvato ✓' : 'Approva e salva il piano'}</button></div>
        </div>`;

      const cambia = () => { if (approvato) approvato = { ...approvato, modificato: true }; manuali++; disegna(false); };
      $$('.sq-fissa', el).forEach(b => b.onclick = () => { const id = Number(b.dataset.w); if (blocchi.has(id)) blocchi.delete(id); else blocchi.set(id, ass.get(id)); disegna(false); });
      $$('.sq-sposta', el).forEach(s => s.onchange = () => { if (!s.value) return; const id = Number(s.dataset.w), c = s.value === 'fuori' ? null : Number(s.value); ass.set(id, c); blocchi.set(id, c); cambia(); });
      $$('[data-peso]', el).forEach(b => b.onclick = () => { P[b.dataset.peso] = Number(b.dataset.v); try { localStorage.setItem('piano-pesi', JSON.stringify(P)); } catch {} ass = ottimizza(D, P, blocchi); if (approvato) approvato = { ...approvato, modificato: true }; disegna(false); setTimeout(() => { const d = $('.sq-pesi', el); if (d) d.open = true; }); });
      $('#sq-ricalcola', el).onclick = () => { ass = ottimizza(D, P, blocchi); if (approvato) approvato = { ...approvato, modificato: true }; disegna(false); avviso(blocchi.size ? `Ricalcolato tenendo ferme le tue ${blocchi.size} scelte` : 'Proposta ricalcolata'); };
      $$('[data-fab]', el).forEach(b => b.onclick = () => modificaFabbisogno(D.fab.find(f => String(f.c.id) === b.dataset.fab)));
      $('#sq-msg', el).onclick = () => copiaMessaggio();
      $('#sq-stampa', el).onclick = () => window.print();
      $('#sq-approva', el).onclick = () => approva(tuttiAvvisi);
      function testo() {
        return `Squadre della settimana ${etSett(lun)}\n` + D.fab.map(f => `\n${f.c.codice ? f.c.codice + ' – ' : ''}${f.c.nome} (${f.c.comune})\n` + team(f).map(w => `• ${w.l.cognome} ${w.l.nome}${w.capo ? ' (capo squadra)' : ''}${w.via.length ? ` – assente ${giorniTesto(w.via)}` : ''}`).join('\n')).join('\n');
      }
      async function copiaMessaggio() {
        const t = testo();
        try { await navigator.clipboard.writeText(t); avviso('Messaggio copiato: incollalo su WhatsApp o in una mail'); }
        catch { const w = ui.finestra(`<h2>Messaggio per le squadre</h2><textarea style="width:100%;min-height:260px">${esc(t)}</textarea><div class="azioni"><button class="btn" data-ok>Chiudi</button></div>`); w.el.querySelector('[data-ok]').onclick = w.chiudi; w.el.querySelector('textarea').select(); }
      }
      async function approva(av) {
        if (approvato && !approvato.modificato) return avviso('Il piano è già approvato');
        if (!assegnati) return avviso('Nessuna persona assegnata: non c\'è niente da approvare', { errore: true });
        const rossi = av.filter(a => a[0] === 'rosso');
        if (!await conferma(`Approvi le squadre della settimana ${etSett(lun)}? ${assegnati} persone su ${D.fab.length} cantieri${rossi.length ? `, con ${rossi.length} problemi ancora aperti` : ''}.`, { si: 'Approva e salva' })) return;
        try {
          for (const r of D.piano) await db.elimina('piano_squadre', r.id);
          const ora = new Date().toISOString(), chi = App.profilo.nome || App.profilo.email || '';
          const righe = [...ass].filter(([, c]) => c != null).map(([id, c]) => { const w = D.W.get(id), f = D.fab.find(f => f.c.id === c);
            return { settimana: lun, cantiere_id: c, lavoratore_id: id, bloccato: blocchi.has(id), km: kmTra(w.casa, f.casa), motivazione: motivi(w, f, team(f), D).join(' · '), approvato_da_nome: chi, approvato_il: ora }; });
          if (righe.length) await db.inserisci('piano_squadre', righe);
          await App.registraIA('Squadre', `Settimana ${etSett(lun)}`, manuali ? 'approvato con modifiche' : 'approvato', `${righe.length} persone su ${D.fab.length} cantieri${manuali ? `, ${manuali} modifiche fatte a mano` : ''}${rossi.length ? `, ${rossi.length} problemi aperti` : ''}`);
          try { sessionStorage.removeItem(chiaveBozza(lun)); } catch {}
          avviso('Piano approvato e salvato'); disegna(true);
        } catch (e) { errore(e); }
      }
    }
    function modificaFabbisogno(f) {
      const w = ui.finestra(`<h2>Cosa serve su ${esc(f.c.nome)}</h2>
        <p class="nota" style="margin-bottom:10px">Settimana ${etSett(lun)}. ${f.fonte === 'crono' ? 'L\'assistente l\'ha stimato dal cronoprogramma: correggilo se serve.' : ''}</p>
        <form id="fb-f"><div class="campi"><div><label for="fb-n">Persone</label><input id="fb-n" type="number" min="0" max="30" value="${f.persone}"></div>
        <div><label class="spunta"><input type="checkbox" id="fb-capo" ${f.capo ? 'checked' : ''}> Serve un capo squadra</label></div>
        <fieldset class="largo fb-comp"><legend>Competenze che servono</legend>${COMPETENZE.map(k => `<label class="spunta"><input type="checkbox" value="${esc(k)}" ${f.comp.includes(k) ? 'checked' : ''}> ${esc(k)}</label>`).join('')}</fieldset>
        <div class="largo"><label for="fb-note">Note</label><input id="fb-note" value="${esc(f.note)}"></div></div></form>
        <div class="azioni">${f.rid ? '<button class="btn vuoto" data-reset>Torna alla stima</button>' : ''}<button class="btn vuoto" data-no>Annulla</button><button class="btn rosso" data-si>Salva e ricalcola</button></div>`);
      w.el.querySelector('[data-no]').onclick = w.chiudi;
      const fine = () => { w.chiudi(); try { sessionStorage.removeItem(chiaveBozza(lun)); } catch {} disegna(true); };
      const r = w.el.querySelector('[data-reset]'); if (r) r.onclick = async () => { try { await db.elimina('squadre_richieste', f.rid); fine(); } catch (e) { errore(e); } };
      w.el.querySelector('[data-si]').onclick = async () => {
        const d = { settimana: lun, cantiere_id: f.c.id, persone: Math.max(0, Number(w.el.querySelector('#fb-n').value) || 0), serve_capo: w.el.querySelector('#fb-capo').checked,
          competenze: [...w.el.querySelectorAll('.fb-comp input:checked')].map(i => i.value).join(', '), note: w.el.querySelector('#fb-note').value.trim() };
        try { if (f.rid) await db.aggiorna('squadre_richieste', f.rid, d); else await db.inserisci('squadre_richieste', d); fine(); } catch (e) { errore(e); }
      };
    }
    await disegna(true);
  });

  // =====================================================================
  // 2) DA APPROVARE: proposte già pronte, si conferma con un clic
  // =====================================================================
  const leggiIgnorati = () => (App.profilo.preferenze && App.profilo.preferenze.ia_ignorati) || [];
  async function ignora(chiave) {
    const lista = [...new Set([...leggiIgnorati(), chiave])].slice(-300);
    const p = { ...(App.profilo.preferenze || {}), ia_ignorati: lista };
    App.profilo.preferenze = p;
    try { await db.rpc('salva_preferenze', { p }); } catch (e) { console.warn(e); }
  }

  App.propostaIA = async function () {
    const oggi = fmt.oggi(), vuoto = () => [], out = [];
    const prossimo = fmt.piuGiorni(lunediDi(oggi), 7);
    const [timb, fatt, cantieri, giorn, att, piano] = await Promise.all([
      db.lista('v_timbrature', { gte: { giorno: fmt.piuGiorni(oggi, -30) }, lt: { giorno: oggi }, eq: { annullata: false }, ordina: 'ora' }).catch(vuoto),
      db.lista('fatture', { eq: { tipo: 'ricevuta' }, gte: { data: fmt.piuGiorni(oggi, -365) }, sel: 'id,numero,data,anagrafica_id,cantiere_id,descrizione,imponibile,cortesia,anagrafica:anagrafiche(ragione_sociale)' }).catch(vuoto),
      db.lista('cantieri', { eq: { stato: 'aperto' }, ordina: 'codice' }).catch(vuoto),
      db.lista('giornale', { gte: { giorno: fmt.piuGiorni(oggi, -7) }, sel: 'cantiere_id,giorno' }).catch(vuoto),
      db.lista('attivita').catch(vuoto),
      db.lista('piano_squadre', { eq: { settimana: prossimo }, sel: 'id' }).catch(vuoto)
    ]);
    const ign = new Set(leggiIgnorati());
    const nomeC = c => (c.codice ? c.codice + ' – ' : '') + c.nome;

    // squadre della prossima settimana
    if (!piano.length && cantieri.length) out.push({ k: 'squadre-' + prossimo, tipo: 'Squadre', ico: '👷', titolo: `Squadre della settimana ${etSett(prossimo)} da approvare`,
      perche: 'L\'assistente ha già preparato la combinazione di persone per ogni cantiere aperto.', apri: 'squadre', apriTesto: 'Guarda la proposta' });

    // uscite non timbrate: si propone l'orario abituale di quella persona
    const gruppi = new Map(); for (const t of timb) { const k = t.lavoratore_id + '|' + t.giorno; if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(t); }
    for (const [k, ts] of gruppi) {
      const ultima = ts[ts.length - 1]; if (ultima.tipo !== 'entrata') continue;
      const chiave = 'uscita-' + k; if (ign.has(chiave)) continue;
      const uscite = timb.filter(t => t.lavoratore_id === ultima.lavoratore_id && t.tipo === 'uscita' && new Date(t.giorno + 'T12:00:00Z').getUTCDay() === new Date(ultima.giorno + 'T12:00:00Z').getUTCDay() % 7).map(t => t.ora_locale).sort();
      const tutte = uscite.length ? uscite : timb.filter(t => t.lavoratore_id === ultima.lavoratore_id && t.tipo === 'uscita').map(t => t.ora_locale).sort();
      const solita = tutte.length ? tutte[Math.floor(tutte.length / 2)] : '16:00';
      out.push({ k: chiave, tipo: 'Presenze', ico: '⏱', titolo: `${ultima.cognome} ${ultima.nome}: manca l'uscita di ${fmt.dataLunga(ultima.giorno)}`,
        perche: `Entrato alle ${ultima.ora_locale} su ${ultima.cantiere}. ${tutte.length ? `Di solito esce alle ${solita} (mediana di ${tutte.length} uscite).` : 'Nessuno storico: proposto l\'orario standard.'}`,
        campi: `<label>Uscita alle <input type="time" name="ora" value="${solita}" required></label>`, si: 'Registra l\'uscita',
        fai: async f => { const ora = f.ora.value; if (!ora || ora <= ultima.ora_locale) throw new Error('L\'uscita deve essere dopo l\'entrata'); await db.inserisci('timbrature', { lavoratore_id: ultima.lavoratore_id, cantiere_id: ultima.cantiere_id, tipo: 'uscita', ora: isoRoma(ultima.giorno, ora), nota: `Uscita proposta dall'assistente e approvata da ${App.profilo.nome || ''}` }); return `${ultima.cognome} ${ultima.nome}, ${fmt.data(ultima.giorno)}: uscita alle ${ora}`; } });
    }

    // fatture ricevute senza cantiere: si propone il cantiere degli ultimi acquisti dallo stesso fornitore
    for (const f of fatt.filter(f => !f.cantiere_id && !f.cortesia && f.data >= fmt.piuGiorni(oggi, -90))) {
      const chiave = 'cantiere-fattura-' + f.id; if (ign.has(chiave)) continue;
      const storia = fatt.filter(x => x.anagrafica_id === f.anagrafica_id && x.cantiere_id && cantieri.some(c => c.id === x.cantiere_id)).sort((a, b) => b.data.localeCompare(a.data));
      const conta = {}; for (const x of storia.slice(0, 6)) conta[x.cantiere_id] = (conta[x.cantiere_id] || 0) + 1;
      const best = Object.entries(conta).sort((a, b) => b[1] - a[1])[0];
      const c = best ? cantieri.find(c => c.id === Number(best[0])) : null;
      out.push({ k: chiave, tipo: 'Contabilità', ico: '🧾', titolo: `Fattura ${f.numero} di ${f.anagrafica ? f.anagrafica.ragione_sociale : 'fornitore'} senza cantiere`,
        perche: `${fmt.euro(f.imponibile)} – ${f.descrizione || ''}. ${c ? (() => { const m = Math.min(6, storia.length); return m === 1 ? `L'ultimo acquisto da questo fornitore era per ${nomeC(c)}.` : best[1] === m ? `Gli ultimi ${m} acquisti da questo fornitore erano per ${nomeC(c)}.` : `${best[1]} degli ultimi ${m} acquisti da questo fornitore erano per ${nomeC(c)}.`; })() : 'Nessuno storico con cantieri aperti: scegli tu.'} Senza cantiere il costo non entra nei conti di nessun lavoro.`,
        campi: `<label>Cantiere <select name="c" required><option value="">Scegli…</option>${cantieri.map(x => `<option value="${x.id}" ${c && c.id === x.id ? 'selected' : ''}>${esc(nomeC(x))}</option>`).join('')}</select></label>`, si: 'Assegna al cantiere',
        fai: async fm => { if (!fm.c.value) throw new Error('Scegli il cantiere'); await db.aggiorna('fatture', f.id, { cantiere_id: Number(fm.c.value) }); const x = cantieri.find(x => x.id === Number(fm.c.value)); return `Fattura ${f.numero} → ${nomeC(x)}${c && c.id !== x.id ? ' (diverso dalla proposta)' : ''}`; } });
    }

    // possibili doppioni: stesso fornitore, stesso importo, numero quasi uguale o date vicine
    const pulito = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const visti = new Set();
    for (const a of fatt) for (const b of fatt) {
      if (a.id >= b.id || a.anagrafica_id !== b.anagrafica_id || Math.abs(n(a.imponibile) - n(b.imponibile)) > 0.01 || n(a.imponibile) === 0) continue;
      const vicine = Math.abs(fmt.giorniTra(a.data, b.data)) <= 45, simili = pulito(a.numero) === pulito(b.numero);
      if (!vicine && !simili) continue;
      const chiave = `doppione-${a.id}-${b.id}`; if (ign.has(chiave) || visti.has(chiave)) continue; visti.add(chiave);
      const recente = a.data >= b.data ? a : b, vecchia = recente === a ? b : a;
      out.push({ k: chiave, tipo: 'Contabilità', ico: '⚠', titolo: `Possibile fattura registrata due volte: ${a.anagrafica ? a.anagrafica.ragione_sociale : ''}`,
        perche: `Stesso fornitore e stesso importo (${fmt.euro(a.imponibile)})${simili ? ', numero praticamente uguale' : ''}${vicine ? (g => g === 0 ? ', con la stessa data' : `, a ${g} ${g === 1 ? 'giorno' : 'giorni'} di distanza`)(Math.abs(fmt.giorniTra(a.data, b.data))) : ''}.`,
        tabella: [vecchia, recente].map(x => `<tr><td><b>n. ${esc(x.numero)}</b></td><td>${fmt.data(x.data)}</td><td>${esc(x.descrizione || '')}</td><td class="num">${fmt.euro(x.imponibile)}</td></tr>`).join(''),
        si: `Elimina la n. ${recente.numero}`, pericolo: true, no: 'Non è un doppione',
        fai: async () => { if (!await conferma(`Eliminare la fattura n. ${recente.numero}? Resta la n. ${vecchia.numero}.`, { si: 'Elimina', pericolo: true })) return null; await db.elimina('fatture', recente.id); return `Eliminata la n. ${recente.numero} (doppione della n. ${vecchia.numero})`; } });
    }

    // giornale dei lavori non scritto: si precompila con presenze e attività del giorno
    const ieri = (() => { let d = fmt.piuGiorni(oggi, -1); while ([0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay())) d = fmt.piuGiorni(d, -1); return d; })();
    for (const c of cantieri) {
      const presenti = [...new Map(timb.filter(t => t.giorno === ieri && t.cantiere_id === c.id).map(t => [t.lavoratore_id, t])).values()];
      if (!presenti.length || giorn.some(g => g.cantiere_id === c.id && g.giorno === ieri)) continue;
      const chiave = `giornale-${c.id}-${ieri}`; if (ign.has(chiave)) continue;
      const sue = att.filter(a => a.cantiere_id === c.id), foglie = sue.filter(a => !sue.some(x => x.padre_id === a.id));
      const inCorso = foglie.filter(a => a.inizio <= ieri && n(a.avanzamento) < 100 && (fmt.piuGiorni(a.inizio, Math.max(1, n(a.durata)) - 1) >= ieri || n(a.avanzamento) > 0));
      const lavorazioni = inCorso.length ? inCorso.map(a => `${a.nome} (avanzamento ${n(a.avanzamento)}%).`).join('\n') : '';
      const note = `Presenti ${presenti.length}: ${presenti.map(t => `${t.cognome} ${t.nome}`).join(', ')}.`;
      out.push({ k: chiave, tipo: 'Giornale', ico: '📝', titolo: `Giornale di ${fmt.dataLunga(ieri)} da scrivere: ${nomeC(c)}`,
        perche: `Ci sono ${presenti.length} presenze ma il giornale è vuoto. Bozza preparata dalle timbrature${inCorso.length ? ' e dal cronoprogramma' : ''}: correggila e salva.`,
        campi: `<label class="largo">Lavorazioni eseguite <textarea name="lav" rows="3">${esc(lavorazioni)}</textarea></label><label class="largo">Note <textarea name="note" rows="2">${esc(note)}</textarea></label><label>Meteo <input name="meteo" placeholder="es. sereno"></label>`,
        si: 'Salva nel giornale',
        fai: async f => { if (!f.lav.value.trim()) throw new Error('Scrivi almeno le lavorazioni eseguite'); await db.inserisci('giornale', { cantiere_id: c.id, giorno: ieri, meteo: f.meteo.value.trim(), lavorazioni: f.lav.value.trim(), materiali: '', note: f.note.value.trim() }); return `Giornale ${nomeC(c)} del ${fmt.data(ieri)}${f.lav.value.trim() !== lavorazioni.trim() ? ' (testo corretto a mano)' : ''}`; } });
    }
    return out;
  };

  // =====================================================================
  // 3) LEGGI UN DOCUMENTO: foto o PDF → campi precompilati da controllare
  // =====================================================================
  // Nel gestionale vero il file va a una funzione di Supabase che lo fa leggere all'IA (la chiave resta sul server).
  App.leggiDocumentoIA = async function (file) {
    if (db.funzione) {
      const f = await ui.comprimi(file, 2000);
      if (f.size > 8e6) throw new Error('File troppo grande: massimo 8 MB');
      const dati = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => ko(new Error('File non leggibile')); r.readAsDataURL(f); });
      const r = await db.funzione('leggi-documento', { file: dati, tipo: f.type || 'application/pdf' });
      r.righe = (r.righe || []).map(x => ({ descrizione: x.descrizione || '', quantita: n(x.quantita), um: x.um || '', prezzo: n(x.prezzo) }));
      return r;
    }
    await new Promise(r => setTimeout(r, 1400));
    const oggi = fmt.oggi();
    return { esempio: true, tipo: 'DDT', fornitore: 'Acciaierie del Sud s.p.a.', piva: '01234560826', numero: '2026/4471', data: fmt.piuGiorni(oggi, -1),
      destinazione: 'Cantiere SS 113 km 12 – Partinico (PA)', righe: [
        { descrizione: 'Nastro barriera H2 bordo ponte zincato', quantita: 48, um: 'm', prezzo: 38.5 },
        { descrizione: 'Terminale semplice H2', quantita: 4, um: 'pz', prezzo: 212 },
        { descrizione: 'Bulloneria M16 (kit)', quantita: 2, um: 'conf', prezzo: 64 }],
      incerti: ['numero', 'riga-2'] };
  };

  function schedaDocumento(el) {
    el.innerHTML = `<section class="pannello ia-doc">
      <div class="ia-doc-su"><div><h2>Leggi un DDT, una fattura cartacea o uno scontrino</h2>
        <p class="nota">Fai una foto o scegli un PDF: l'assistente legge fornitore, numero, data, righe e importi e capisce a quale cantiere va. Tu controlli i campi (quelli incerti sono in giallo) e confermi. Senza conferma non viene registrato nulla.</p></div>
        <label class="btn rosso ia-carica"><input type="file" id="ia-file" accept="image/*,application/pdf" capture="environment" hidden>Scegli foto o PDF</label></div>
      <div id="ia-esito"></div></section>`;
    $('#ia-file', el).onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      const out = $('#ia-esito', el);
      const anteprima = file.type.startsWith('image/') ? `<img src="${URL.createObjectURL(file)}" alt="Documento caricato">` : `<div class="ia-pdf">PDF<br><small>${esc(file.name)}</small></div>`;
      out.innerHTML = `<div class="ia-doc-due"><div class="ia-foto">${anteprima}</div><div class="ia-leggo"><span class="ia-spin" aria-hidden="true"></span> L'assistente sta leggendo il documento…</div></div>`;
      try {
        const [r, fornitori, cantieri] = await Promise.all([App.leggiDocumentoIA(file), db.lista('anagrafiche', { in: { tipo: ['fornitore', 'subappaltatore'] }, ordina: 'ragione_sociale' }), db.lista('cantieri', { eq: { stato: 'aperto' }, ordina: 'codice' })]);
        const forn = fornitori.find(f => r.piva && f.piva === r.piva) || fornitori.find(f => norm(f.ragione_sociale) === norm(r.fornitore));
        const dest = norm(r.destinazione);
        const cant = cantieri.find(c => dest && (dest.includes(norm(c.nome)) || (c.codice && dest.includes(norm(c.codice))))) || cantieri.find(c => dest && c.comune && dest.includes(norm(c.comune)));
        const inc = k => (r.incerti || []).includes(k) ? 'incerto' : '';
        const tot = () => r.righe.reduce((s, x) => s + n(x.quantita) * n(x.prezzo), 0);
        out.innerHTML = `${r.esempio ? '<p class="stato giallo ia-esempio">Anteprima: qui l\'IA non è collegata, vedi un risultato d\'esempio. Nel gestionale vero il documento viene letto davvero.</p>' : ''}
          <div class="ia-doc-due"><div class="ia-foto">${anteprima}</div>
          <form id="ia-f" class="ia-campi">
            <div class="campi">
              <div><label>Tipo di documento</label><select name="tipo">${['DDT', 'Fattura', 'Scontrino carburante'].map(t => `<option ${t === r.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
              <div class="${inc('fornitore')}"><label>Fornitore</label><select name="forn"><option value="">${forn ? '' : 'Non trovato in anagrafica: scegli…'}</option>${fornitori.map(f => `<option value="${f.id}" ${forn && forn.id === f.id ? 'selected' : ''}>${esc(f.ragione_sociale)}</option>`).join('')}</select><span class="nota">Letto: ${esc(r.fornitore || '–')}${r.piva ? ' · P.IVA ' + esc(r.piva) : ''}</span></div>
              <div class="${inc('numero')}"><label>Numero</label><input name="numero" value="${esc(r.numero || '')}">${inc('numero') ? '<span class="nota">Lettura incerta: controlla sulla foto</span>' : ''}</div>
              <div class="${inc('data')}"><label>Data</label><input type="date" name="data" value="${esc(r.data || '')}"></div>
              <div class="largo ${cant ? '' : 'incerto'}"><label>Cantiere</label><select name="cant"><option value="">Scegli…</option>${cantieri.map(c => `<option value="${c.id}" ${cant && cant.id === c.id ? 'selected' : ''}>${esc((c.codice ? c.codice + ' – ' : '') + c.nome)}</option>`).join('')}</select><span class="nota">Destinazione letta: ${esc(r.destinazione || '–')}</span></div>
            </div>
            <div class="scorri"><table class="ia-righe"><thead><tr><th>Descrizione</th><th class="num">Q.tà</th><th>U.m.</th><th class="num">Prezzo</th><th class="num">Importo</th></tr></thead>
              <tbody>${r.righe.map((x, i) => `<tr class="${inc('riga-' + i)}"><td><input name="d${i}" value="${esc(x.descrizione)}"></td><td class="num"><input name="q${i}" value="${fmt.num(x.quantita)}" inputmode="decimal"></td><td><input name="u${i}" value="${esc(x.um || '')}" size="4"></td><td class="num"><input name="p${i}" value="${fmt.num(x.prezzo)}" inputmode="decimal"></td><td class="num" data-imp="${i}">${fmt.euro(n(x.quantita) * n(x.prezzo))}</td></tr>`).join('')}</tbody>
              <tfoot><tr><td colspan="4">Totale imponibile</td><td class="num" id="ia-tot">${fmt.euro(tot())}</td></tr></tfoot></table></div>
            <div class="azioni"><button type="button" class="btn vuoto" data-no>Scarta</button><button type="submit" class="btn rosso">Conferma e registra come costo del cantiere</button></div>
          </form></div>`;
        const f = $('#ia-f', out);
        f.oninput = () => { r.righe.forEach((x, i) => { x.descrizione = f['d' + i].value; x.quantita = ui.leggiNumero(f['q' + i].value) || 0; x.um = f['u' + i].value; x.prezzo = ui.leggiNumero(f['p' + i].value) || 0; $(`[data-imp="${i}"]`, f).textContent = fmt.euro(x.quantita * x.prezzo); }); $('#ia-tot', f).textContent = fmt.euro(tot()); };
        f.querySelector('[data-no]').onclick = async () => { await App.registraIA('Lettura documento', `${r.tipo} ${r.numero || ''} ${r.fornitore || ''}`, 'scartato'); out.innerHTML = '<p class="nota">Lettura scartata: non è stato registrato nulla.</p>'; e.target.value = ''; };
        f.onsubmit = async ev => {
          ev.preventDefault();
          if (!f.cant.value) return avviso('Scegli il cantiere', { errore: true });
          const tipo = f.tipo.value, numero = f.numero.value.trim(), cambiati = [numero !== (r.numero || '') && 'numero', String(f.cant.value) !== String(cant ? cant.id : '') && 'cantiere', String(f.forn.value) !== String(forn ? forn.id : '') && 'fornitore'].filter(Boolean);
          try {
            await db.inserisci('costi', { cantiere_id: Number(f.cant.value), data: f.data.value || fmt.oggi(), categoria: tipo === 'Scontrino carburante' ? 'Trasporti' : 'Materiali', fornitore_id: f.forn.value ? Number(f.forn.value) : null,
              descrizione: r.righe.map(x => `${x.descrizione} ${fmt.num(x.quantita)} ${x.um}`.trim()).join('; '), documento: `${tipo} n. ${numero}${f.data.value ? ' del ' + fmt.data(f.data.value) : ''}`, importo: Math.round(tot() * 100) / 100 });
            await App.registraIA('Lettura documento', `${tipo} n. ${numero} – ${fmt.euro(tot())}`, cambiati.length ? 'approvato con modifiche' : 'approvato', cambiati.length ? 'Corretti a mano: ' + cambiati.join(', ') : '');
            out.innerHTML = `<p class="stato verde ia-fatto">Registrato: ${esc(tipo)} n. ${esc(numero)} per ${fmt.euro(tot())} sul cantiere. Lo trovi tra i costi del cantiere.</p>`; e.target.value = '';
          } catch (err) { errore(err); }
        };
      } catch (err) { out.innerHTML = ''; errore(err); }
    };
  }

  // =====================================================================
  // Pagina "Assistente"
  // =====================================================================
  ui.pagina('assistente', async el => {
    el.innerHTML = App.testata('Assistente', { sopra: 'Propone, precompila e segnala: decidi sempre tu' }) + '<div id="ia-schede"></div>';
    App.schede($('#ia-schede', el), [['proposte', 'Da approvare'], ['documento', 'Leggi un documento'], ['registro', 'Registro delle decisioni']], null, async (k, corpo) => {
      if (k === 'documento') return schedaDocumento(corpo);
      if (k === 'registro') {
        corpo.innerHTML = '<p class="nota" style="margin-bottom:10px">Ogni proposta dell\'assistente approvata, corretta o scartata resta qui, con chi l\'ha decisa e quando.</p><div id="ia-reg"></div>';
        return ui.elenco($('#ia-reg', corpo), { tabella: 'registro_ia', esporta: 'Registro assistente', ordina: 'creato_il.desc', cerca: ['tipo', 'oggetto', 'esito', 'utente', 'dettaglio'],
          filtri: [{ k: 'esito', label: 'Esito', opzioni: [['', 'Tutti'], 'approvato', 'approvato con modifiche', 'scartato'] }],
          colonne: [{ k: 'creato_il', t: 'Quando', f: r => `${fmt.data(r.creato_il)} ${fmt.ora(r.creato_il)}`, x: r => `${fmt.data(r.creato_il)} ${fmt.ora(r.creato_il)}` }, { k: 'utente', t: 'Chi' }, { k: 'tipo', t: 'Cosa' }, { k: 'oggetto', t: 'Dettaglio', f: r => `${esc(r.oggetto)}${r.dettaglio ? `<br><small class="nota">${esc(r.dettaglio)}</small>` : ''}` },
            { k: 'esito', t: 'Esito', f: r => `<span class="stato ${r.esito === 'scartato' ? 'grigio' : r.esito === 'approvato' ? 'verde' : 'giallo'}">${esc(r.esito)}</span>` }] });
      }
      corpo.innerHTML = '<p class="nota">L\'assistente sta controllando…</p>';
      const P = await App.propostaIA();
      const gruppi = [...new Set(P.map(p => p.tipo))];
      corpo.innerHTML = `<div class="ia-banda"><span class="ia-ico" aria-hidden="true">✦</span><div><b>${P.length ? `${P.length} ${P.length === 1 ? 'cosa' : 'cose'} da decidere.` : 'Niente da decidere: tutto in ordine.'}</b> L'assistente ha già preparato tutto: controlla, correggi se serve e conferma. "Ignora" la toglie dall'elenco.</div></div>
        ${gruppi.map(g => `<h2 class="ia-gruppo">${esc(g)} <span>${P.filter(p => p.tipo === g).length}</span></h2><div class="ia-lista">${P.filter(p => p.tipo === g).map((p, i) => `
          <form class="ia-carta" data-k="${esc(p.k)}"><div class="ia-carta-testa"><span class="ia-tipo" aria-hidden="true">${p.ico}</span><div><b>${esc(p.titolo)}</b><p>${esc(p.perche)}</p></div></div>
            ${p.tabella ? `<div class="scorri"><table class="ia-mini"><tbody>${p.tabella}</tbody></table></div>` : ''}${p.campi ? `<div class="ia-campi-riga">${p.campi}</div>` : ''}
            <div class="azioni"><button type="button" class="btn vuoto" data-ign>${esc(p.no || 'Ignora')}</button>${p.apri ? `<a class="btn rosso" href="#${p.apri}">${esc(p.apriTesto)}</a>` : `<button type="submit" class="btn ${p.pericolo ? 'vuoto rosso-testo' : 'rosso'}">${esc(p.si)}</button>`}</div></form>`).join('')}</div>`).join('')}`;
      $$('.ia-carta', corpo).forEach(f => {
        const p = P.find(x => x.k === f.dataset.k);
        const via = (testo, cl) => { f.classList.add('fatto', cl); f.innerHTML = `<p class="ia-esito">${esc(testo)}</p>`; };
        f.querySelector('[data-ign]').onclick = async () => { await ignora(p.k); await App.registraIA(p.tipo, p.titolo, 'scartato', p.no ? p.no : ''); via(p.no ? 'Segnato come non doppione' : 'Ignorata: non la vedrai più', 'grigio'); };
        f.onsubmit = async e => {
          e.preventDefault(); const b = f.querySelector('[type=submit]'); if (b) b.disabled = true;
          try { const fatto = await p.fai(f); if (fatto == null) { if (b) b.disabled = false; return; } await App.registraIA(p.tipo, fatto, / a mano|diverso dalla proposta/.test(fatto) ? 'approvato con modifiche' : 'approvato'); via('Fatto: ' + fatto, 'verde'); badgeAssistente(); }
          catch (err) { if (b) b.disabled = false; errore(err); }
        };
      });
    });
  });
  // =====================================================================
  // Matrice delle competenze (in Anagrafica dipendenti): si spunta in pochi secondi
  // =====================================================================
  App.matriceCompetenze = async function (el) {
    const lav = await db.lista('lavoratori', { eq: { attivo: true }, ordina: 'cognome,nome' });
    const abbr = { 'Barriere e guardrail': 'Barriere', 'Segnaletica orizzontale': 'Segn. orizz.', 'Segnaletica verticale': 'Segn. vert.', 'Autocarro (patente C)': 'Autocarro (C)', 'Lavori in quota (PLE)': 'Quota (PLE)', 'Preposto sicurezza': 'Preposto' };
    el.innerHTML = `<p class="nota" style="margin-bottom:10px;max-width:90ch">Spunta cosa sa fare ogni persona: l'assistente lo usa per comporre le squadre. Si salva da solo. La patente C viene già letta dall'anagrafica.</p>
      <div class="scorri"><table class="mc-tab"><thead><tr><th>Dipendente</th>${COMPETENZE.map(k => `<th class="mc-k" title="${esc(k)}"><span>${esc(abbr[k] || k)}</span></th>`).join('')}<th class="num">Ore/sett.</th></tr></thead>
      <tbody>${lav.map(l => { const c = new Set(listaComp(l.competenze)), daPat = /\b(C|CE|CQC)\b/.test(l.patente || '');
        return `<tr data-l="${l.id}"><th scope="row"><a href="#lavoratore-${l.id}">${esc(l.cognome)} ${esc(l.nome)}</a><small>${esc(l.qualifica || '')}${l.comune ? ' · ' + esc(l.comune) : ''}</small></th>${COMPETENZE.map(k => { const auto = k === 'Autocarro (patente C)' && daPat && !c.has(k);
          return `<td class="mc-c"><input type="checkbox" value="${esc(k)}" aria-label="${esc(l.cognome)}: ${esc(k)}" ${c.has(k) || auto ? 'checked' : ''} ${auto ? 'disabled title="Dalla patente"' : ''}></td>`; }).join('')}
          <td class="num"><input class="mc-ore" type="number" min="0" max="60" value="${n(l.ore_settimanali) || 40}" aria-label="Ore settimanali di ${esc(l.cognome)}"></td></tr>`; }).join('')}</tbody></table></div>`;
    el.querySelectorAll('tr[data-l]').forEach(tr => {
      const id = Number(tr.dataset.l), l = lav.find(x => x.id === id);
      tr.querySelectorAll('.mc-c input').forEach(i => i.onchange = async () => {
        const v = [...tr.querySelectorAll('.mc-c input:checked:not(:disabled)')].map(x => x.value).join(', ');
        try { await db.aggiorna('lavoratori', id, { competenze: v }); l.competenze = v; ui.dimentica('lavoratori'); avviso(`${l.cognome}: competenze salvate`); } catch (e) { i.checked = !i.checked; errore(e); }
      });
      tr.querySelector('.mc-ore').onchange = async e => { const v = Math.max(0, Number(e.target.value) || 0); try { await db.aggiorna('lavoratori', id, { ore_settimanali: v }); avviso(`${l.cognome}: ${v} ore a settimana`); } catch (err) { errore(err); } };
    });
  };

  // numero di cose da decidere accanto a "Assistente" nel menu
  async function badgeAssistente() {
    if (!App.profilo || !App.admin) return;
    const a = document.querySelector('#menu-voci a[data-voce="assistente"]'); if (!a) return;
    let k = 0; try { k = (await App.propostaIA()).length; } catch { return; }
    let b = a.querySelector('.vv-badge'); if (!k) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); a.append(b); } b.className = 'vv-badge blu'; b.textContent = k; b.title = `${k} proposte dell'assistente da decidere`;
  }
  App.badgeAssistente = badgeAssistente;
  const att = setInterval(() => { if (App.profilo && document.querySelector('#menu-voci a')) { clearInterval(att); badgeAssistente(); setInterval(() => { if (!document.hidden) badgeAssistente(); }, 300000); } }, 400);
  window.addEventListener('hashchange', () => setTimeout(badgeAssistente, 800));
})();
