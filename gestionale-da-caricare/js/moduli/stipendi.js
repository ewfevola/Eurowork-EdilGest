// Elaborazione dati stipendio: dalle timbrature del mese a ore ordinarie, straordinari, festivi, assenze e voci variabili,
// pronte da mandare al consulente del lavoro (il cedolino lo fa lui).
(function () {
  const { $, $$, esc, fmt, avviso, errore } = ui;
  const n = x => Number(x) || 0;
  const r2 = x => Math.round(x * 100) / 100;
  const TIPI_ASSENZA = [['Ferie', 'F'], ['Permesso (ROL)', 'P'], ['Malattia', 'M'], ['Infortunio', 'I'], ['Cassa integrazione / maltempo', 'CIG'], ['Congedo', 'C'], ['Assenza ingiustificata', 'AI']];
  const SIGLA = Object.fromEntries(TIPI_ASSENZA);
  const TIPI_VOCE = ['Trasferta / indennità', 'Rimborso spese', 'Anticipo', 'Premio', 'Trattenuta', 'Altro'];

  // festività nazionali (con Pasquetta)
  function festivi(anno) {
    const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
    const pasqua = `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
    return new Set(['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].map(x => `${anno}-${x}`).concat([pasqua, fmt.piuGiorni(pasqua, 1)]));
  }
  const dow = s => new Date(s + 'T12:00:00Z').getUTCDay();

  ui.pagina('stipendi', async el => {
    let mese; try { mese = sessionStorage.getItem('paga-mese'); } catch {}
    if (!mese) { const o = fmt.oggi(); mese = Number(o.slice(8)) <= 15 ? fmt.piuGiorni(o.slice(0, 8) + '01', -1).slice(0, 7) : o.slice(0, 7); }
    let oreGiorno = 8, pausa = 30; try { oreGiorno = Number(localStorage.getItem('paga-ore')) || 8; const p = localStorage.getItem('paga-pausa'); if (p != null) pausa = Number(p) || 0; } catch {}
    const [A, M] = mese.split('-').map(Number), giorni = new Date(Date.UTC(A, M, 0)).getUTCDate();
    const dal = `${mese}-01`, al = `${mese}-${String(giorni).padStart(2, '0')}`, fest = festivi(A);
    const [lavoratori, timb, assenze, voci] = await Promise.all([
      db.lista('lavoratori', { ordina: 'cognome,nome' }),
      db.lista('v_timbrature', { gte: { giorno: dal }, lte: { giorno: al }, eq: { annullata: false }, ordina: 'ora' }),
      db.lista('assenze', { lte: { dal: al }, gte: { al: dal }, sel: '*,lavoratore:lavoratori(cognome,nome)' }),
      db.lista('voci_paga', { eq: { mese }, sel: '*,lavoratore:lavoratori(cognome,nome)' })
    ]);
    // la pausa pranzo non timbrata si toglie dai turni più lunghi di 6 ore
    const turni = App.calcolaTurni(timb).map(t => t.ore != null && t.ore > 6 && pausa ? { ...t, ore: r2(t.ore - pausa / 60), pausa: true } : t);
    const giorniMese = Array.from({ length: giorni }, (_, i) => `${mese}-${String(i + 1).padStart(2, '0')}`);
    const tipoGiorno = d => fest.has(d) || dow(d) === 0 ? 'festivo' : dow(d) === 6 ? 'sabato' : 'feriale';
    const nome = l => `${l.cognome} ${l.nome}`;
    // chi compare: in forza, oppure con ore, assenze o voci nel mese
    const coinvolti = lavoratori.filter(l => l.attivo || turni.some(t => t.lavoratore === nome(l)) || assenze.some(a => a.lavoratore_id === l.id) || voci.some(v => v.lavoratore_id === l.id));
    const righe = coinvolti.map(l => {
      const mie = turni.filter(t => t.lavoratore === nome(l));
      const perGiorno = {}; for (const t of mie) { const g = perGiorno[t.giorno] || (perGiorno[t.giorno] = { ore: 0, cantieri: {}, manca: false }); g.ore += n(t.ore); if (t.ore != null) g.cantieri[t.cantiere] = (g.cantieri[t.cantiere] || 0) + n(t.ore); if (t.ore == null && !t.inCorso) g.manca = true; }
      const ass = {}; // giorno -> {tipo, ore}
      for (const a of assenze.filter(a => a.lavoratore_id === l.id)) for (const d of giorniMese) if (d >= a.dal && d <= a.al && tipoGiorno(d) === 'feriale') ass[d] = { tipo: a.tipo, ore: n(a.ore_giorno) || oreGiorno };
      let ord = 0, str = 0, festive = 0, lavorati = 0; const perCant = {}, perAss = {};
      for (const [d, g] of Object.entries(perGiorno)) {
        if (g.ore > 0) lavorati++;
        const tg = tipoGiorno(d);
        if (tg === 'festivo') festive += g.ore; else if (tg === 'sabato') str += g.ore; else { ord += Math.min(oreGiorno, g.ore); str += Math.max(0, g.ore - oreGiorno); }
        for (const [c, h] of Object.entries(g.cantieri)) perCant[c] = (perCant[c] || 0) + h;
      }
      for (const x of Object.values(ass)) perAss[x.tipo] = (perAss[x.tipo] || 0) + x.ore;
      const mieVoci = voci.filter(v => v.lavoratore_id === l.id), somma = t => mieVoci.filter(v => v.tipo === t).reduce((s, v) => s + n(v.importo), 0);
      const feriali = giorniMese.filter(d => tipoGiorno(d) === 'feriale' && d <= fmt.oggi() && (!l.data_assunzione || d >= l.data_assunzione));
      const buchi = feriali.filter(d => !perGiorno[d] && !ass[d]).length;
      return { l, perGiorno, ass, ord: r2(ord), str: r2(str), festive: r2(festive), tot: r2(ord + str + festive), lavorati, perCant, perAss, mieVoci, buchi,
        manca: Object.values(perGiorno).filter(g => g.manca).length, trasferte: somma('Trasferta / indennità'), rimborsi: somma('Rimborso spese'), anticipi: somma('Anticipo'), premi: somma('Premio'), trattenute: somma('Trattenuta'),
        costo: r2((ord + str + festive) * n(l.costo_orario)) };
    });
    const T = k => righe.reduce((s, r) => s + r[k], 0);
    const giorniAss = righe.reduce((s, r) => s + Object.keys(r.ass).length, 0), daCompletare = T('manca'), buchi = T('buchi');
    const nomeMese = new Date(Date.UTC(A, M - 1, 15)).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    el.innerHTML = App.testata('Elaborazione dati stipendio', { azioni: '<button class="btn vuoto" id="pg-stampa">Stampa foglio presenze</button><button class="btn rosso" id="pg-excel">Excel per il consulente</button>' }) + `
      <p class="nota" style="margin:-10px 0 14px;max-width:85ch">Dalle timbrature del mese il gestionale calcola ore ordinarie, straordinari e festivi, e aggiunge assenze e voci variabili (trasferte, rimborsi, anticipi). Controlla, completa e manda l'Excel al consulente del lavoro: il cedolino lo prepara lui.</p>
      <form class="barra-elenco pannello" id="pg-barra" style="align-items:end">
        <div class="filtro"><label for="pg-mese">Mese</label><input id="pg-mese" type="month" value="${mese}"></div>
        <div class="filtro" style="flex-basis:190px"><label for="pg-ore">Ore ordinarie al giorno</label><input id="pg-ore" type="number" min="1" max="12" step="0.5" value="${oreGiorno}"></div>
        <div class="filtro" style="flex-basis:210px"><label for="pg-pausa">Pausa pranzo non timbrata (min)</label><input id="pg-pausa" type="number" min="0" max="120" step="5" value="${pausa}"></div>
        <p class="nota" style="flex:1 1 300px;margin:0">${pausa ? `Dai turni oltre 6 ore si tolgono ${pausa} minuti di pausa. ` : ''}Da lunedì a venerdì oltre ${fmt.num(oreGiorno)} ore è straordinario; il sabato è tutto straordinario; domeniche e festivi sono ore festive. Se il vostro contratto prevede regole diverse, il consulente le applica sul file.</p>
      </form>
      <div class="pv-kpis" style="margin-top:12px">
        <div class="pv-kpi ardesia"><span>Dipendenti nel mese</span><b>${righe.length}</b><small>${nomeMese}</small></div>
        <div class="pv-kpi blu"><span>Ore lavorate</span><b>${fmt.num(Math.round(T('tot')))} h</b><small>ordinarie ${fmt.num(Math.round(T('ord')))} h</small></div>
        <div class="pv-kpi ${T('str') ? 'bordeaux' : 'ardesia'}"><span>Straordinari e festivi</span><b>${fmt.num(Math.round(T('str') + T('festive')))} h</b><small>straord. ${fmt.num(r2(T('str')))} h · festive ${fmt.num(r2(T('festive')))} h</small></div>
        <div class="pv-kpi verde"><span>Assenze</span><b>${giorniAss} giorni</b><small>ferie, permessi, malattia, CIG</small></div>
        <div class="pv-kpi ${daCompletare || buchi ? 'rosso' : 'verde'}"><span>Da controllare</span><b>${daCompletare + buchi}</b><small>${daCompletare} turni senza uscita · ${buchi} giorni feriali vuoti</small></div>
      </div>
      <div id="pg-schede"></div>`;
    $('#pg-mese', el).onchange = e => { if (!e.target.value) return; try { sessionStorage.setItem('paga-mese', e.target.value); } catch {} ui.pagine.stipendi(el); };
    $('#pg-ore', el).onchange = e => { try { localStorage.setItem('paga-ore', e.target.value); } catch {} ui.pagine.stipendi(el); };
    $('#pg-pausa', el).onchange = e => { try { localStorage.setItem('paga-pausa', e.target.value); } catch {} ui.pagine.stipendi(el); };
    const ricarica = () => ui.pagine.stipendi(el);
    const hh = x => x ? fmt.num(r2(x)) : '';

    function foglio() {
      return `<div class="scorri pg-foglio-box"><table class="tabella pg-foglio"><thead><tr><th class="pg-nome">Dipendente</th>${giorniMese.map(d => `<th class="${tipoGiorno(d)}" title="${fmt.data(d)}">${Number(d.slice(8))}<small>${['D', 'L', 'M', 'M', 'G', 'V', 'S'][dow(d)]}</small></th>`).join('')}<th class="num">Tot.</th></tr></thead>
        <tbody>${righe.map(r => `<tr><td class="pg-nome"><b>${esc(nome(r.l))}</b></td>${giorniMese.map(d => { const g = r.perGiorno[d], a = r.ass[d], tg = tipoGiorno(d);
          return `<td class="${tg} ${g && g.manca ? 'manca' : ''} ${a ? 'ass' : ''}" title="${esc(g ? Object.entries(g.cantieri).map(([c, h]) => `${c}: ${fmt.num(h)} h`).join(', ') : a ? a.tipo : '')}">${a ? esc(SIGLA[a.tipo] || 'A') : g ? (g.manca && !g.ore ? '?' : hh(g.ore)) : (tg === 'feriale' && d <= fmt.oggi() && (!r.l.data_assunzione || d >= r.l.data_assunzione) ? '<span class="pg-vuoto">·</span>' : '')}</td>`; }).join('')}<td class="num"><b>${hh(r.tot)}</b></td></tr>`).join('')}</tbody></table></div>
        <p class="nota pg-legenda">Numero = ore lavorate. ${TIPI_ASSENZA.map(([t, s]) => `<b>${s}</b> ${esc(t.toLowerCase())}`).join(' · ')} · <b>?</b> timbratura di uscita mancante · <b>·</b> giorno feriale senza presenze né assenze. Colonne scure: sabati, domeniche e festivi.</p>`;
    }

    App.schede($('#pg-schede', el), [['riepilogo', 'Riepilogo per dipendente'], ['foglio', 'Foglio presenze del mese'], ['assenze', 'Assenze'], ['voci', 'Voci variabili']], null, (k, c) => {
      if (k === 'foglio') { c.innerHTML = foglio(); return; }
      if (k === 'assenze') {
        c.innerHTML = '<div id="pg-ass"></div>';
        return ui.elenco($('#pg-ass', c), { tabella: 'assenze', esporta: `Assenze ${mese}`, nuovo: 'Nuova assenza', ordina: 'dal',
          q: { lte: { dal: al }, gte: { al: dal }, sel: '*,lavoratore:lavoratori(cognome,nome)' },
          filtri: [{ k: 'tipo', label: 'Tipo', opzioni: [['', 'Tutte'], ...TIPI_ASSENZA.map(t => t[0])] }],
          campi: [{ k: 'lavoratore_id', label: 'Dipendente', tipo: 'rif', rif: App.RIF.lavoratore, richiesto: true }, { k: 'tipo', label: 'Tipo', tipo: 'select', opzioni: TIPI_ASSENZA.map(t => t[0]), richiesto: true },
            { k: 'dal', label: 'Dal', tipo: 'data', richiesto: true }, { k: 'al', label: 'Al (compreso)', tipo: 'data', richiesto: true }, { k: 'ore_giorno', label: 'Ore al giorno', tipo: 'numero', aiuto: 'Per un permesso di mezza giornata scrivi 4' },
            { k: 'protocollo', label: 'Protocollo certificato (malattia)', mostraSe: d => d.tipo === 'Malattia' }, { k: 'note', label: 'Note', tipo: 'area' }],
          predefiniti: () => ({ tipo: 'Ferie', dal: dal > fmt.oggi() ? dal : fmt.oggi(), al: dal > fmt.oggi() ? dal : fmt.oggi(), ore_giorno: oreGiorno }), dopoSalva: ricarica,
          colonne: [{ k: 'lav', t: 'Dipendente', f: r => `<b>${esc(r.lavoratore ? `${r.lavoratore.cognome} ${r.lavoratore.nome}` : '')}</b>`, x: r => r.lavoratore ? `${r.lavoratore.cognome} ${r.lavoratore.nome}` : '' },
            { k: 'tipo', t: 'Tipo', f: r => `<span class="stato ${r.tipo === 'Malattia' || r.tipo === 'Infortunio' ? 'rosso' : r.tipo === 'Ferie' ? 'verde' : 'blu'}">${esc(r.tipo)}</span>`, x: r => r.tipo },
            { k: 'dal', t: 'Dal', f: r => fmt.data(r.dal), x: r => r.dal }, { k: 'al', t: 'Al', f: r => fmt.data(r.al), x: r => r.al },
            { k: 'gg', t: 'Giorni lavorativi', num: true, f: r => giorniMese.filter(d => d >= r.dal && d <= r.al && tipoGiorno(d) === 'feriale').length, x: r => giorniMese.filter(d => d >= r.dal && d <= r.al && tipoGiorno(d) === 'feriale').length },
            { k: 'note', t: 'Note', f: r => esc([r.protocollo ? 'prot. ' + r.protocollo : '', r.note].filter(Boolean).join(' · ')) }] });
      }
      if (k === 'voci') {
        c.innerHTML = '<div id="pg-voci"></div>';
        return ui.elenco($('#pg-voci', c), { tabella: 'voci_paga', esporta: `Voci variabili ${mese}`, nuovo: 'Nuova voce', ordina: 'tipo', fissi: { mese },
          q: { eq: { mese }, sel: '*,lavoratore:lavoratori(cognome,nome)' },
          filtri: [{ k: 'tipo', label: 'Tipo', opzioni: [['', 'Tutte'], ...TIPI_VOCE] }],
          campi: [{ k: 'lavoratore_id', label: 'Dipendente', tipo: 'rif', rif: App.RIF.lavoratore, richiesto: true }, { k: 'tipo', label: 'Tipo', tipo: 'select', opzioni: TIPI_VOCE, richiesto: true },
            { k: 'importo', label: 'Importo', tipo: 'euro', richiesto: true }, { k: 'cantiere_id', label: 'Cantiere (per le trasferte)', tipo: 'rif', rif: App.RIF.cantiere }, { k: 'note', label: 'Descrizione', tipo: 'area' }],
          predefiniti: { tipo: 'Trasferta / indennità' }, dopoSalva: ricarica,
          colonne: [{ k: 'lav', t: 'Dipendente', f: r => `<b>${esc(r.lavoratore ? `${r.lavoratore.cognome} ${r.lavoratore.nome}` : '')}</b>`, x: r => r.lavoratore ? `${r.lavoratore.cognome} ${r.lavoratore.nome}` : '' },
            { k: 'tipo', t: 'Tipo' }, { k: 'note', t: 'Descrizione', f: r => esc(r.note || '') }, { k: 'importo', t: 'Importo', num: true, f: r => (r.tipo === 'Trattenuta' || r.tipo === 'Anticipo' ? '− ' : '') + fmt.euro(r.importo), x: r => n(r.importo) }],
          piede: r => `<tr><td colspan="3">Totale voci</td><td class="num">${fmt.euro(r.reduce((s, x) => s + n(x.importo), 0))}</td></tr>` });
      }
      c.innerHTML = `<div class="scorri"><table class="tabella pg-riep"><thead><tr><th>Dipendente</th><th class="num">Giorni</th><th class="num">Ordinarie</th><th class="num">Straord.</th><th class="num">Festive</th><th class="num">Totale ore</th><th class="num">Ferie / perm.</th><th class="num">Malattia</th><th class="num">Altre ass.</th><th class="num">Trasferte e rimborsi</th><th class="num">Anticipi e trattenute</th><th>Cantieri</th><th>Controlli</th></tr></thead>
        <tbody>${righe.map((r, i) => { const fp = n(r.perAss['Ferie']) + n(r.perAss['Permesso (ROL)']), ml = n(r.perAss['Malattia']) + n(r.perAss['Infortunio']), alt = Object.entries(r.perAss).filter(([t]) => !['Ferie', 'Permesso (ROL)', 'Malattia', 'Infortunio'].includes(t)).reduce((s, [, h]) => s + h, 0);
          return `<tr class="cliccabile" data-i="${i}" tabindex="0"><td><b>${esc(nome(r.l))}</b><br><span class="nota">${esc(r.l.qualifica || '')}</span></td><td class="num">${r.lavorati}</td><td class="num">${hh(r.ord)}</td><td class="num">${hh(r.str)}</td><td class="num">${hh(r.festive)}</td><td class="num"><b>${hh(r.tot)}</b></td>
          <td class="num">${hh(fp)}</td><td class="num">${hh(ml)}</td><td class="num">${hh(alt)}</td><td class="num">${r.trasferte + r.rimborsi + r.premi ? fmt.euro(r.trasferte + r.rimborsi + r.premi) : ''}</td><td class="num">${r.anticipi + r.trattenute ? '− ' + fmt.euro(r.anticipi + r.trattenute) : ''}</td>
          <td class="nota">${Object.entries(r.perCant).map(([c, h]) => `${esc(c)} ${fmt.num(r2(h))} h`).join('<br>')}</td>
          <td>${r.manca ? `<span class="stato rosso">${r.manca} uscite mancanti</span> ` : ''}${r.buchi ? `<span class="stato giallo">${r.buchi} giorni vuoti</span>` : ''}${!r.manca && !r.buchi ? '<span class="stato verde">ok</span>' : ''}${!n(r.l.costo_orario) ? ' <span class="stato grigio">senza costo orario</span>' : ''}</td></tr>`; }).join('') || '<tr><td colspan="13" class="vuota">Nessun dipendente in questo mese.</td></tr>'}</tbody>
        <tfoot><tr><td>Totale</td><td class="num">${T('lavorati')}</td><td class="num">${hh(T('ord'))}</td><td class="num">${hh(T('str'))}</td><td class="num">${hh(T('festive'))}</td><td class="num">${hh(T('tot'))}</td><td colspan="3"></td><td class="num">${fmt.euro(T('trasferte') + T('rimborsi') + T('premi'))}</td><td class="num">${fmt.euro(T('anticipi') + T('trattenute'))}</td><td colspan="2">costo aziendale stimato ${fmt.euro(T('costo'))}</td></tr></tfoot></table></div>
        <p class="nota" style="margin-top:8px">Clicca su un dipendente per vedere il dettaglio giorno per giorno. I giorni vuoti si sistemano in Presenze (timbratura dimenticata) oppure inserendo un'assenza.</p>`;
      c.querySelector('tbody').onclick = e => { const tr = e.target.closest('tr[data-i]'); if (tr) dettaglio(righe[tr.dataset.i]); };
      c.querySelector('tbody').onkeydown = e => { const tr = e.target.closest('tr[data-i]'); if (tr && e.key === 'Enter') dettaglio(righe[tr.dataset.i]); };
    });

    function dettaglio(r) {
      const w = ui.finestra(`<h2>${esc(nome(r.l))} – ${esc(nomeMese)}</h2>
        <div class="scorri" style="max-height:60vh"><table class="tabella"><thead><tr><th>Giorno</th><th>Cantiere</th><th>Entrata</th><th>Uscita</th><th class="num">Ore</th><th>Nota</th></tr></thead><tbody>
        ${giorniMese.map(d => { const ts = turni.filter(t => t.lavoratore === nome(r.l) && t.giorno === d), a = r.ass[d], tg = tipoGiorno(d);
          if (!ts.length && !a && tg !== 'feriale') return '';
          const etich = `${new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })}${tg === 'festivo' && dow(d) !== 0 ? ' (festivo)' : ''}`;
          if (a) return `<tr><td>${etich}</td><td colspan="4"><span class="stato blu">${esc(a.tipo)}</span> ${fmt.num(a.ore)} h</td><td></td></tr>`;
          if (!ts.length) return d <= fmt.oggi() ? `<tr><td>${etich}</td><td colspan="5"><span class="stato giallo">nessuna presenza</span></td></tr>` : '';
          return ts.map((t, j) => `<tr><td>${j ? '' : etich}</td><td>${esc(t.cantiere)}</td><td>${t.entrata || '<span class="stato rosso">manca</span>'}</td><td>${t.uscita || '<span class="stato rosso">manca</span>'}</td><td class="num">${hh(t.ore)}</td><td>${tg !== 'feriale' ? '<span class="nota">' + (tg === 'sabato' ? 'sabato' : 'festivo') + '</span>' : n(t.ore) > oreGiorno ? `<span class="nota">+${fmt.num(r2(n(t.ore) - oreGiorno))} straord.</span>` : ''}</td></tr>`).join(''); }).join('')}
        </tbody></table></div>
        <div class="azioni"><button class="btn vuoto" data-ass>Aggiungi assenza</button><button class="btn vuoto" data-voce>Aggiungi voce</button><button class="btn" data-no>Chiudi</button></div>`);
      w.el.querySelector('[data-no]').onclick = w.chiudi;
      w.el.querySelector('[data-ass]').onclick = () => { w.chiudi(); ui.modulo({ titolo: `Assenza – ${nome(r.l)}`, valori: { tipo: 'Ferie', dal, al: dal, ore_giorno: oreGiorno },
        campi: [{ k: 'tipo', label: 'Tipo', tipo: 'select', opzioni: TIPI_ASSENZA.map(t => t[0]), richiesto: true }, { k: 'dal', label: 'Dal', tipo: 'data', richiesto: true }, { k: 'al', label: 'Al (compreso)', tipo: 'data', richiesto: true }, { k: 'ore_giorno', label: 'Ore al giorno', tipo: 'numero' }, { k: 'note', label: 'Note', tipo: 'area' }],
        salva: async d => { if (d.al < d.dal) throw new Error('La data finale è prima di quella iniziale.'); await db.inserisci('assenze', { ...d, lavoratore_id: r.l.id, protocollo: '', note: d.note || '' }); avviso('Assenza registrata'); ricarica(); } }); };
      w.el.querySelector('[data-voce]').onclick = () => { w.chiudi(); ui.modulo({ titolo: `Voce variabile – ${nome(r.l)}`, valori: { tipo: 'Trasferta / indennità' },
        campi: [{ k: 'tipo', label: 'Tipo', tipo: 'select', opzioni: TIPI_VOCE, richiesto: true }, { k: 'importo', label: 'Importo', tipo: 'euro', richiesto: true }, { k: 'note', label: 'Descrizione', tipo: 'area' }],
        salva: async d => { await db.inserisci('voci_paga', { ...d, mese, lavoratore_id: r.l.id, cantiere_id: null, note: d.note || '' }); avviso('Voce aggiunta'); ricarica(); } }); };
    }

    $('#pg-excel', el).onclick = () => ui.excel(`Dati stipendio ${mese}`, [
      { nome: 'Riepilogo', righe: righe.map(r => ({ Dipendente: nome(r.l), 'Codice fiscale': r.l.codice_fiscale || '', Qualifica: r.l.qualifica || '', Contratto: r.l.tipo_contratto || '', 'Giorni lavorati': r.lavorati, 'Ore ordinarie': r.ord, 'Ore straordinarie': r.str, 'Ore festive': r.festive, 'Ore totali': r.tot,
        ...Object.fromEntries(TIPI_ASSENZA.map(([t]) => [`${t} (ore)`, n(r.perAss[t])])), 'Trasferte/indennità €': r.trasferte, 'Rimborsi spese €': r.rimborsi, 'Premi €': r.premi, 'Anticipi €': r.anticipi, 'Trattenute €': r.trattenute,
        'Turni senza uscita': r.manca, 'Giorni feriali vuoti': r.buchi })) },
      { nome: 'Foglio presenze', righe: righe.map(r => ({ Dipendente: nome(r.l), ...Object.fromEntries(giorniMese.map(d => [`${Number(d.slice(8))} ${['D', 'L', 'M', 'M', 'G', 'V', 'S'][dow(d)]}`, r.ass[d] ? (SIGLA[r.ass[d].tipo] || 'A') : r.perGiorno[d] ? r2(r.perGiorno[d].ore) : ''])), Totale: r.tot })) },
      { nome: 'Ore per cantiere', righe: righe.flatMap(r => Object.entries(r.perCant).map(([c, h]) => ({ Dipendente: nome(r.l), Cantiere: c, Ore: r2(h) }))) },
      { nome: 'Dettaglio turni', righe: turni.map(t => ({ Giorno: fmt.data(t.giorno), Dipendente: t.lavoratore, Cantiere: t.cantiere, Entrata: t.entrata || 'MANCA', Uscita: t.uscita || (t.inCorso ? 'in corso' : 'MANCA'), Ore: t.ore ?? '' })) },
      { nome: 'Assenze', righe: assenze.map(a => ({ Dipendente: a.lavoratore ? `${a.lavoratore.cognome} ${a.lavoratore.nome}` : '', Tipo: a.tipo, Dal: fmt.data(a.dal), Al: fmt.data(a.al), 'Ore al giorno': n(a.ore_giorno), Protocollo: a.protocollo || '', Note: a.note || '' })) },
      { nome: 'Voci variabili', righe: voci.map(v => ({ Dipendente: v.lavoratore ? `${v.lavoratore.cognome} ${v.lavoratore.nome}` : '', Tipo: v.tipo, Importo: n(v.importo), Descrizione: v.note || '' })) }
    ]);
    $('#pg-stampa', el).onclick = () => {
      const f = document.createElement('div'); f.className = 'solo-stampa foglio-isolato';
      f.innerHTML = App.intestazioneStampa('Foglio presenze', nomeMese) + foglio();
      document.body.append(f); document.body.classList.add('stampa-isolata');
      const via = () => { f.remove(); document.body.classList.remove('stampa-isolata'); window.removeEventListener('afterprint', via); };
      window.addEventListener('afterprint', via); window.print(); setTimeout(via, 1500);
    };
  });
})();
