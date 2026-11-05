// Presenze: timbrature dal cantiere e riepilogo ore per l'ufficio.
(function () {
  const { $, esc, fmt, avviso, errore, conferma } = ui;

  ui.pagina('presenze', async el => {
    if (!App.admin) { el.innerHTML = App.testata('Presenze') + '<div id="timbra" class="pannello"></div>'; return timbra($('#timbra', el)); }
    el.innerHTML = App.testata('Presenze') + '<div id="schede-pres"></div>';
    App.schede($('#schede-pres', el), [['timbra', 'Timbra'], ['riepilogo', 'Riepilogo ed Excel']], null, (k, corpo) => k === 'timbra' ? timbra(corpo) : riepilogo(corpo));
  });

  // ---------- Timbra (capocantiere e ufficio) ----------
  async function timbra(el) {
    const [cantieri, lavoratori] = await Promise.all([
      db.lista('cantieri', { eq: { stato: 'aperto' }, ordina: 'nome' }),
      db.lista('lavoratori_base', { eq: { attivo: true }, ordina: 'cognome,nome' })
    ]);
    const oggi = fmt.oggi();
    if (!cantieri.length) { el.innerHTML = `<p class="nota">Non ci sono cantieri aperti. ${App.admin ? 'Aprine uno dalla sezione Cantieri.' : 'Chiedi all\'ufficio di aprirli.'}</p>`; return; }
    el.innerHTML = `<div class="timbra-testa">
        <div class="data-oggi">${esc(fmt.dataLunga(oggi).replace(/^./, c => c.toUpperCase()))}</div>
        <div><label for="t-cantiere">Cantiere</label><select id="t-cantiere">${cantieri.map(c => `<option value="${c.id}">${esc(c.nome)}${c.comune ? ' – ' + esc(c.comune) : ''}</option>`).join('')}</select></div>
        <div><label for="t-cerca">Cerca lavoratore</label><input id="t-cerca" type="search" placeholder="Cognome o nome" autocomplete="off"></div>
        <div class="conteggio" id="t-conteggio"></div>
      </div><ul class="lista-timbra" id="t-lista"></ul>`;
    const sel = $('#t-cantiere', el);
    let salvato = null; try { salvato = localStorage.getItem('cantiere'); } catch {}
    if (salvato && cantieri.some(c => String(c.id) === salvato)) sel.value = salvato;
    let oggiT = [];

    async function aggiorna() {
      try { oggiT = await db.lista('v_timbrature', { eq: { giorno: fmt.oggi(), annullata: false }, ordina: 'ora' }); disegna(); }
      catch (e) { errore(e); }
    }
    const ultima = id => { const s = oggiT.filter(t => t.lavoratore_id === id); return s[s.length - 1] || null; };
    function disegna() {
      const idC = Number(sel.value), q = $('#t-cerca', el).value.trim().toLowerCase();
      const vis = lavoratori.filter(l => !q || `${l.cognome} ${l.nome} ${l.nome} ${l.cognome}`.toLowerCase().includes(q));
      const dentro = lavoratori.filter(l => { const u = ultima(l.id); return u && u.tipo === 'entrata' && u.cantiere_id === idC; }).length;
      $('#t-conteggio', el).innerHTML = `<span>In questo cantiere ora: <b>${dentro}</b></span><span>Lavoratori: <b>${lavoratori.length}</b></span>`;
      const lista = $('#t-lista', el);
      if (!lavoratori.length) { lista.innerHTML = `<li class="nota" style="padding:20px 0">Nessun lavoratore. ${App.admin ? 'Aggiungili in Personale.' : 'Chiedi all\'ufficio di aggiungerli.'}</li>`; return; }
      if (!vis.length) { lista.innerHTML = `<li class="nota" style="padding:20px 0">Nessun lavoratore corrisponde a "${esc(q)}".</li>`; return; }
      lista.innerHTML = vis.map(l => {
        const u = ultima(l.id), dentro = u && u.tipo === 'entrata', altrove = dentro && u.cantiere_id !== idC;
        let st = '<span class="presenza">Non ancora entrato oggi</span>';
        if (dentro) st = `<span class="presenza dentro">Entrato alle ${u.ora_locale}${altrove ? ' – ' + esc(u.cantiere) : ''}</span>`;
        else if (u) st = `<span class="presenza">Uscito alle ${u.ora_locale}</span>`;
        const tipo = dentro && !altrove ? 'uscita' : 'entrata';
        return `<li class="riga-timbra"><div><b>${esc(l.cognome)} ${esc(l.nome)}</b>${st}</div>
          <button class="btn ${tipo === 'uscita' ? 'vuoto' : ''}" data-lav="${l.id}" data-tipo="${tipo}">${tipo === 'entrata' ? 'Entrata' : 'Uscita'}</button></li>`;
      }).join('');
    }
    sel.addEventListener('change', () => { try { localStorage.setItem('cantiere', sel.value); } catch {} disegna(); });
    $('#t-cerca', el).addEventListener('input', disegna);
    $('#t-lista', el).addEventListener('click', async e => {
      const b = e.target.closest('button[data-lav]'); if (!b) return;
      const idL = Number(b.dataset.lav), tipo = b.dataset.tipo, idC = Number(sel.value);
      const l = lavoratori.find(x => x.id === idL), u = ultima(idL);
      if (tipo === 'entrata' && u && u.tipo === 'entrata' && u.cantiere_id !== idC &&
          !await conferma(`${l.cognome} ${l.nome} risulta entrato in ${u.cantiere}. Registrare l'entrata qui?`, { si: 'Registra entrata' })) return;
      b.disabled = true;
      try {
        const r = await db.inserisci('timbrature', { lavoratore_id: idL, cantiere_id: idC, tipo });
        await aggiorna();
        avviso(`${tipo === 'entrata' ? 'Entrata' : 'Uscita'} di ${l.cognome} ${l.nome} alle ${fmt.ora(r.ora)}`, {
          annulla: async () => { try { await db.rpc('annulla_timbratura', { p_id: r.id }); await aggiorna(); avviso('Timbratura annullata'); } catch (e) { errore(e); } }
        });
      } catch (e) { b.disabled = false; errore(e); }
    });
    document.addEventListener('visibilitychange', function f() {
      if (!document.body.contains(el)) return document.removeEventListener('visibilitychange', f);
      if (!document.hidden) { if (fmt.oggi() !== oggi) timbra(el); else aggiorna(); }
    });
    aggiorna();
  }

  // ---------- Riepilogo (ufficio) ----------
  async function riepilogo(el) {
    const oggi = fmt.oggi();
    const cantieri = await db.lista('cantieri', { ordina: 'nome' });
    el.innerHTML = `<form class="barra-elenco" id="r-filtri">
        <div class="filtro"><label for="r-dal">Dal</label><input id="r-dal" type="date" value="${oggi.slice(0, 8)}01" required></div>
        <div class="filtro"><label for="r-al">Al</label><input id="r-al" type="date" value="${oggi}" required></div>
        <div class="filtro" style="flex-basis:260px"><label for="r-cant">Cantiere</label><select id="r-cant"><option value="">Tutti i cantieri</option>${cantieri.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
        <div class="azioni" style="margin-left:auto"><button class="btn" type="submit">Mostra</button><button class="btn rosso" type="button" id="r-excel">Scarica Excel</button></div>
      </form>
      <div class="cifre" id="r-cifre"></div>
      <details class="non-stampare" style="margin-bottom:20px"><summary>Aggiungi una timbratura dimenticata</summary>
        <div style="margin-top:12px"><button class="btn vuoto" id="r-aggiungi">Inserisci timbratura</button></div></details>
      <div class="scorri"><table class="tabella" id="r-ore"></table></div>
      <div class="sezione"><h2>Tutte le timbrature del periodo</h2><p class="nota" style="margin-bottom:10px">Una timbratura sbagliata non si cancella: si annulla e resta visibile barrata.</p>
      <div class="scorri"><table class="tabella" id="r-timb"></table></div></div>`;
    let righe = [];

    async function carica() {
      const dal = $('#r-dal', el).value, al = $('#r-al', el).value;
      if (dal > al) return avviso('La data "Dal" è dopo la data "Al".', { errore: true });
      try {
        righe = await db.lista('v_timbrature', { gte: { giorno: dal }, lte: { giorno: al }, eq: { cantiere_id: $('#r-cant', el).value }, ordina: 'ora' });
        disegna();
      } catch (e) { errore(e); }
    }
    function disegna() {
      const turni = calcolaTurni(righe);
      const tot = turni.reduce((s, t) => s + (t.ore || 0), 0);
      const manca = turni.filter(t => t.ore == null && !t.inCorso).length;
      $('#r-cifre', el).innerHTML = `<div class="cifra"><b>${fmt.ore(tot)}</b><span>ore registrate</span></div>
        <div class="cifra"><b>${new Set(turni.map(t => t.lavoratore)).size}</b><span>lavoratori</span></div>
        <div class="cifra"><b>${turni.filter(t => t.inCorso).length}</b><span>in cantiere adesso</span></div>
        <div class="cifra ${manca ? 'allarme' : ''}"><b>${manca}</b><span>turni con una timbratura mancante</span></div>`;
      $('#r-ore', el).innerHTML = turni.length ? `<thead><tr><th>Giorno</th><th>Lavoratore</th><th>Cantiere</th><th>Entrata</th><th>Uscita</th><th class="num">Ore</th></tr></thead><tbody>${
        turni.map(t => `<tr><td>${fmt.data(t.giorno)}</td><td>${esc(t.lavoratore)}</td><td>${esc(t.cantiere)}</td>
          <td>${t.entrata || '<span class="stato rosso">manca</span>'}</td><td>${t.uscita || (t.inCorso ? 'in corso' : '<span class="stato rosso">manca</span>')}</td><td class="num">${fmt.ore(t.ore)}</td></tr>`).join('')}</tbody>`
        : '<tbody><tr><td class="vuota">Nessuna presenza in questo periodo.</td></tr></tbody>';
      $('#r-timb', el).innerHTML = righe.length ? `<thead><tr><th>Giorno</th><th>Ora</th><th>Lavoratore</th><th>Tipo</th><th>Cantiere</th><th>Registrata da</th><th></th></tr></thead><tbody>${
        [...righe].reverse().map(t => `<tr class="${t.annullata ? 'spento barrata' : ''}"><td>${fmt.data(t.giorno)}</td><td class="b">${t.ora_locale}</td><td class="b">${esc(t.cognome)} ${esc(t.nome)}</td>
          <td class="b">${t.tipo}${t.nota ? ` <span class="nota">(${esc(t.nota)})</span>` : ''}</td><td>${esc(t.cantiere)}</td><td>${esc(t.registrata_da || '')}</td>
          <td>${t.annullata ? 'annullata' : `<button class="btn vuoto piccolo" data-annulla="${t.id}">Annulla</button>`}</td></tr>`).join('')}</tbody>` : '';
    }
    $('#r-filtri', el).addEventListener('submit', e => { e.preventDefault(); carica(); });
    $('#r-timb', el).addEventListener('click', async e => {
      const b = e.target.closest('[data-annulla]'); if (!b) return;
      if (!await conferma('Annullare questa timbratura?', { si: 'Annulla timbratura', pericolo: true })) return;
      try { await db.rpc('annulla_timbratura', { p_id: Number(b.dataset.annulla) }); avviso('Timbratura annullata'); carica(); } catch (e) { errore(e); }
    });
    $('#r-aggiungi', el).addEventListener('click', () => ui.modulo({
      titolo: 'Timbratura dimenticata',
      campi: [
        { k: 'lavoratore_id', label: 'Lavoratore', tipo: 'rif', rif: App.RIF.lavoratore, richiesto: true },
        { k: 'cantiere_id', label: 'Cantiere', tipo: 'rif', rif: App.RIF.cantiereAperto, richiesto: true },
        { k: 'tipo', label: 'Tipo', tipo: 'select', opzioni: [['entrata', 'Entrata'], ['uscita', 'Uscita']], richiesto: true },
        { k: 'giorno', label: 'Giorno', tipo: 'data', richiesto: true },
        { k: 'orario', label: 'Ora (es. 07:30)', richiesto: true }
      ],
      valori: { giorno: fmt.oggi(), tipo: 'entrata' },
      salva: async d => {
        if (!/^\d{1,2}[:.]\d{2}$/.test(d.orario)) throw new Error('Scrivi l\'ora come 07:30.');
        const [h, m] = d.orario.split(/[:.]/).map(Number);
        const ora = new Date(`${d.giorno}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
        await db.inserisci('timbrature', { lavoratore_id: d.lavoratore_id, cantiere_id: d.cantiere_id, tipo: d.tipo, ora: ora.toISOString(), nota: 'aggiunta dall\'ufficio' });
        avviso('Timbratura aggiunta'); carica();
      }
    }));
    $('#r-excel', el).addEventListener('click', () => {
      const turni = calcolaTurni(righe);
      const tot = new Map();
      for (const t of turni) {
        const x = tot.get(t.lavoratore) || { Lavoratore: t.lavoratore, Qualifica: t.qualifica, giorni: new Set(), 'Ore totali': 0, 'Turni da completare': 0 };
        x.giorni.add(t.giorno); x['Ore totali'] += t.ore || 0; if (t.ore == null && !t.inCorso) x['Turni da completare']++;
        tot.set(t.lavoratore, x);
      }
      const c = cantieri.find(x => String(x.id) === $('#r-cant', el).value);
      ui.excel(`Presenze ${$('#r-dal', el).value} - ${$('#r-al', el).value}${c ? ' - ' + c.nome : ''}`, [
        { nome: 'Totali', righe: [...tot.values()].sort((a, b) => a.Lavoratore.localeCompare(b.Lavoratore)).map(({ giorni, ...x }) => ({ Lavoratore: x.Lavoratore, Qualifica: x.Qualifica, 'Giorni lavorati': giorni.size, 'Ore totali': Math.round(x['Ore totali'] * 100) / 100, 'Turni da completare': x['Turni da completare'] })) },
        { nome: 'Ore per giorno', righe: turni.map(t => ({ Giorno: fmt.data(t.giorno), Lavoratore: t.lavoratore, Qualifica: t.qualifica, Cantiere: t.cantiere, Entrata: t.entrata || 'MANCA', Uscita: t.uscita || (t.inCorso ? 'in corso' : 'MANCA'), Ore: t.ore ?? '' })) },
        { nome: 'Timbrature', righe: righe.map(t => ({ Giorno: fmt.data(t.giorno), Ora: t.ora_locale, Lavoratore: `${t.cognome} ${t.nome}`, Tipo: t.tipo, Cantiere: t.cantiere, 'Registrata da': t.registrata_da || '', Nota: t.nota, Stato: t.annullata ? 'annullata' : 'valida' })) }
      ]);
    });
    carica();
  }

  // Accoppia entrata e uscita per lavoratore e giorno.
  function calcolaTurni(righe) {
    const gruppi = new Map(), oggi = fmt.oggi(), out = [];
    for (const t of righe.filter(r => !r.annullata)) {
      const k = t.lavoratore_id + '|' + t.giorno;
      if (!gruppi.has(k)) gruppi.set(k, []);
      gruppi.get(k).push(t);
    }
    const turno = (e, u) => {
      const r = e || u;
      return { giorno: r.giorno, lavoratore: `${r.cognome} ${r.nome}`, qualifica: r.qualifica, cantiere: r.cantiere,
        entrata: e ? e.ora_locale : null, uscita: u ? u.ora_locale : null,
        ore: e && u ? Math.round((new Date(u.ora) - new Date(e.ora)) / 36e5 * 100) / 100 : null,
        inCorso: !!e && !u && r.giorno === oggi };
    };
    for (const lista of gruppi.values()) {
      let aperto = null;
      for (const t of lista) {
        if (t.tipo === 'entrata') { if (aperto) out.push(turno(aperto, null)); aperto = t; }
        else { out.push(turno(aperto, t)); aperto = null; }
      }
      if (aperto) out.push(turno(aperto, null));
    }
    return out.sort((a, b) => a.giorno.localeCompare(b.giorno) || a.lavoratore.localeCompare(b.lavoratore));
  }
  App.calcolaTurni = calcolaTurni;
})();
