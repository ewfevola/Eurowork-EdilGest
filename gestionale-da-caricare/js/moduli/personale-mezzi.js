// Personale (scheda lavoratore con documenti), scadenziario, mezzi (stato, cantieri, assicurazione, bollo, manutenzione),
// ripartizione dei costi fissi aziendali sui cantieri.
(function () {
  const { $, $$, esc, fmt, avviso, errore, conferma } = ui;
  const n = x => Number(x) || 0;
  const oggi = () => fmt.oggi();

  // ---------- stato di un documento o di una scadenza ----------
  const stato = (data, preavviso = 30) => {
    if (!data) return { k: 'senza', classe: 'grigio', testo: 'senza scadenza' };
    const g = fmt.giorniTra(oggi(), data);
    if (g < 0) return { k: 'scaduto', classe: 'rosso', testo: `scaduto da ${-g} gg` };
    if (g <= preavviso) return { k: 'in scadenza', classe: 'giallo', testo: g === 0 ? 'scade oggi' : `scade tra ${g} gg` };
    return { k: 'valido', classe: 'verde', testo: 'valido' };
  };
  const pill = (data, pre) => { const s = stato(data, pre); return `<span class="stato ${s.classe}">${esc(s.testo)}</span>`; };
  const TIPI_DOC = ['Carta d\'identità', 'Permesso di soggiorno', 'Patente di guida', 'Tessera sanitaria / codice fiscale', 'Visita medica (idoneità)', 'Attestato corso sicurezza', 'Formazione specifica', 'Patentino (PLE, gru, muletto)', 'Contratto di lavoro', 'UNILAV', 'Altro'];
  const CI = 'Carta d\'identità', PS = 'Permesso di soggiorno', VM = 'Visita medica (idoneità)';
  // l'ultimo documento di un tipo (quello con la scadenza più lontana)
  const ultimo = (docs, tipo) => docs.filter(d => d.tipo === tipo).sort((a, b) => String(b.scadenza || '9999').localeCompare(String(a.scadenza || '9999')))[0];
  const cellaDoc = (docs, tipo) => { const d = ultimo(docs, tipo); return d ? `${pill(d.scadenza)}${d.scadenza ? ` <span class="nota">${fmt.data(d.scadenza)}</span>` : ''}` : '<span class="nota">manca</span>'; };
  const filtroDoc = (tipo, label, conNonServe) => ({ k: 'doc-' + tipo, label, opzioni: [['', 'Tutti'], ['valido', 'Valido'], ['in scadenza', 'In scadenza (30 gg)'], ['scaduto', 'Scaduto'], ['manca', conNonServe ? 'Non presente' : 'Mancante']],
    locale: (r, v) => { const d = ultimo(r.docs || [], tipo); return v === 'manca' ? !d : !!d && stato(d.scadenza).k === v; } });
  const xDoc = (docs, tipo) => { const d = ultimo(docs, tipo); return d ? `${stato(d.scadenza).k}${d.scadenza ? ' ' + fmt.data(d.scadenza) : ''}` : 'manca'; };

  // ---------- caricamento documento (lavoratore o mezzo) ----------
  App.nuovoDocumento = function ({ tabella, chiave, id, cartella, tipi, valori = {}, dopo }) {
    const w = ui.finestra(`<h2>${valori.id ? 'Modifica documento' : 'Aggiungi documento'}</h2>
      <form class="campi" id="d-form">
        <div><label for="d-tipo">Documento</label><select id="d-tipo" name="tipo" required>${tipi.map(t => `<option ${t === valori.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div><label for="d-num">Numero</label><input id="d-num" name="numero" value="${esc(valori.numero || '')}" autocomplete="off"></div>
        <div><label for="d-ril">Rilasciato il</label><input id="d-ril" name="rilasciato_il" type="date" value="${esc(valori.rilasciato_il || '')}"></div>
        <div><label for="d-scad">Scade il</label><input id="d-scad" name="scadenza" type="date" value="${esc(valori.scadenza || '')}"><span class="nota">Lascia vuoto se non scade. Con la scadenza compare nello scadenziario.</span></div>
        <div class="largo"><label for="d-file">File (foto o PDF)</label><input id="d-file" name="file" type="file" accept="image/*,application/pdf">${valori.nome_file ? `<span class="nota">Già caricato: ${esc(valori.nome_file)}. Scegli un file solo per sostituirlo.</span>` : ''}</div>
        <div class="largo"><label for="d-note">Note</label><input id="d-note" name="note" value="${esc(valori.note || '')}"></div>
      </form>
      <div class="azioni">${valori.id ? '<button class="btn testo" data-via>Elimina</button>' : ''}<button class="btn vuoto" data-no>Annulla</button><button class="btn rosso" data-si>Salva</button></div>`, { chiudiFuori: false });
    const f = w.el.querySelector('#d-form');
    w.el.querySelector('[data-no]').onclick = w.chiudi;
    const via = w.el.querySelector('[data-via]');
    if (via) via.onclick = async () => { if (!await conferma('Eliminare questo documento?', { si: 'Elimina', pericolo: true })) return; try { if (valori.percorso) await db.eliminaFile(valori.percorso).catch(() => {}); await db.elimina(tabella, valori.id); w.chiudi(); avviso('Documento eliminato'); dopo(); } catch (e) { errore(e); } };
    w.el.querySelector('[data-si]').onclick = async () => {
      const b = w.el.querySelector('[data-si]'); b.disabled = true;
      try {
        const d = { [chiave]: id, tipo: f.tipo.value, numero: f.numero.value.trim(), rilasciato_il: f.rilasciato_il.value || null, scadenza: f.scadenza.value || null, note: f.note.value.trim() };
        let file = f.file.files[0];
        if (file) {
          if (file.size > 15e6) throw new Error('Il file è troppo grande (massimo 15 MB).');
          if (file.type.startsWith('image/') && ui.comprimi) file = await ui.comprimi(file).catch(() => file);
          const percorso = `${cartella}/${id}/${Date.now()}-${(file.name || 'documento').replace(/[^\w.-]+/g, '_')}`;
          await db.caricaFile(percorso, file);
          if (valori.percorso) await db.eliminaFile(valori.percorso).catch(() => {});
          Object.assign(d, { percorso, nome_file: file.name || 'documento', tipo_mime: file.type || '' });
        }
        if (valori.id) await db.aggiorna(tabella, valori.id, d); else await db.inserisci(tabella, d);
        w.chiudi(); avviso('Documento salvato'); dopo();
      } catch (e) { b.disabled = false; errore(e); }
    };
  };
  const apriFile = async percorso => { const w = window.open('', '_blank'); try { const u = await db.linkFile(percorso); if (w) w.location = u; else location.href = u; } catch (e) { w && w.close(); errore(e); } };

  // ---------- Personale ----------
  const campiLavoratore = () => [
    { k: 'cognome', label: 'Cognome', richiesto: true }, { k: 'nome', label: 'Nome', richiesto: true },
    { k: 'qualifica', label: 'Qualifica', aiuto: 'es. operaio specializzato, autista' },
    { k: 'livello', label: 'Livello contrattuale', tipo: 'select', opzioni: App.LIVELLI || [] },
    { k: 'codice_fiscale', label: 'Codice fiscale' },
    { k: 'data_nascita', label: 'Data di nascita', tipo: 'data' }, { k: 'luogo_nascita', label: 'Luogo di nascita' },
    { k: 'telefono', label: 'Telefono', tipo: 'tel' }, { k: 'email', label: 'Email', tipo: 'email' },
    { k: 'indirizzo', label: 'Indirizzo di residenza', largo: true }, { k: 'comune', label: 'Comune' },
    { k: 'contatto_emergenza', label: 'Chi avvisare in caso di emergenza', aiuto: 'Nome e telefono' },
    { k: 'automunito', label: 'Automunito (ha un\'auto propria)', tipo: 'bool' },
    { k: 'patente', label: 'Patenti', aiuto: 'es. B, C, CQC' },
    { k: 'competenze', label: 'Competenze', largo: true, aiuto: 'Separate da virgola, es. Barriere e guardrail, Saldatura. Più comodo dalla scheda "Competenze". Servono all\'assistente per comporre le squadre.' },
    { k: 'ore_settimanali', label: 'Ore settimanali', tipo: 'numero', aiuto: '40 a tempo pieno' },
    { k: 'data_assunzione', label: 'Data di assunzione', tipo: 'data' },
    { k: 'tipo_contratto', label: 'Contratto', tipo: 'select', opzioni: ['Tempo indeterminato', 'Tempo determinato', 'Apprendistato', 'Stagionale', 'Somministrato', 'Altro'] },
    { k: 'costo_orario', label: 'Costo orario aziendale', tipo: 'euro', aiuto: 'Serve per calcolare il costo della manodopera sui cantieri' },
    { k: 'attivo', label: 'In forza (compare nelle presenze)', tipo: 'bool' },
    { k: 'note', label: 'Note', tipo: 'area' }
  ];

  ui.pagina('personale', async el => {
    el.innerHTML = App.testata('Anagrafica dipendenti') + '<div id="schede-pers"></div>';
    App.schede($('#schede-pers', el), [['lavoratori', 'Dipendenti'], ['competenze', 'Competenze'], ['pagelle', 'Pagelle e crescita'], ['scadenziario', 'Scadenziario dei dipendenti']], null, (k, corpo) => {
      if (k === 'competenze') return App.matriceCompetenze(corpo);
      if (k === 'scadenziario') return App.scadenziario(corpo, { ambito: 'personale' });
      if (k === 'pagelle') return App.tabellonePagelle(corpo);
      corpo.innerHTML = '<div id="el-lav"></div>';
      ui.elenco($('#el-lav', corpo), {
        tabella: 'lavoratori', esporta: 'Anagrafica dipendenti', nuovo: 'Nuovo dipendente', ordina: 'cognome,nome',
        cerca: ['cognome', 'nome', 'qualifica', 'codice_fiscale', 'telefono', 'comune'],
        dopoCarica: async righe => { const docs = righe.length ? await db.lista('documenti_lavoratore', { in: { lavoratore_id: righe.map(r => r.id) } }) : []; for (const r of righe) r.docs = docs.filter(d => d.lavoratore_id === r.id); return righe; },
        filtri: [
          { k: 'attivo', label: 'Stato', predef: 'true', opzioni: [['true', 'In forza'], ['false', 'Non più in forza'], ['', 'Tutti']] },
          { k: 'automunito', label: 'Automunito', opzioni: [['', 'Tutti'], ['true', 'Sì'], ['false', 'No']] },
          filtroDoc(CI, 'Carta d\'identità'), filtroDoc(VM, 'Visita medica'), filtroDoc(PS, 'Permesso di soggiorno', true),
          { k: 'tipo_contratto', label: 'Contratto', opzioni: [['', 'Tutti'], 'Tempo indeterminato', 'Tempo determinato', 'Apprendistato', 'Stagionale', 'Somministrato', 'Altro'] }
        ],
        campi: campiLavoratore(), predefiniti: { attivo: true, automunito: false, ore_settimanali: 40 },
        apri: r => ui.vai('lavoratore', r.id),
        colonne: [
          { k: 'cognome', t: 'Cognome e nome', f: r => `<b>${esc(r.cognome)} ${esc(r.nome)}</b>`, x: r => `${r.cognome} ${r.nome}` },
          { k: 'qualifica', t: 'Qualifica' }, { k: 'telefono', t: 'Telefono' },
          { k: 'automunito', t: 'Auto', f: r => r.automunito ? '<span class="stato blu">automunito</span>' : '<span class="nota">no</span>', x: r => r.automunito ? 'sì' : 'no' },
          { k: 'ci', t: 'Carta d\'identità', f: r => cellaDoc(r.docs, CI), x: r => xDoc(r.docs, CI) },
          { k: 'vm', t: 'Visita medica', f: r => cellaDoc(r.docs, VM), x: r => xDoc(r.docs, VM) },
          { k: 'ps', t: 'Permesso di sogg.', f: r => ultimo(r.docs, PS) ? cellaDoc(r.docs, PS) : '<span class="nota">–</span>', x: r => ultimo(r.docs, PS) ? xDoc(r.docs, PS) : '' },
          { k: 'nd', t: 'Documenti', num: true, f: r => r.docs.length, x: r => r.docs.length },
          { k: 'costo_orario', t: 'Costo orario', num: true, f: r => n(r.costo_orario) ? fmt.euro(r.costo_orario) : '<span class="stato giallo">da inserire</span>', x: r => n(r.costo_orario) }
        ],
        classeRiga: r => r.attivo ? '' : 'spento'
      });
    });
  });

  ui.pagina('lavoratore', async (el, id) => {
    const [l, docs] = await Promise.all([db.uno('lavoratori', id), db.lista('documenti_lavoratore', { eq: { lavoratore_id: id }, ordina: 'tipo,scadenza.desc' })]);
    let cartella = null; try { cartella = sessionStorage.getItem('lav-cartella'); } catch {}
    const cartelle = [...new Set([...TIPI_DOC.filter(t => [CI, VM, 'Patente di guida', 'Attestato corso sicurezza'].includes(t)), ...docs.map(d => d.tipo)])];
    if (cartella && !cartelle.includes(cartella)) cartella = null;
    const riga = (k, v) => v ? `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>` : '';
    const ci = ultimo(docs, CI), vm = ultimo(docs, VM), ps = ultimo(docs, PS);
    el.innerHTML = App.testata(`${l.cognome} ${l.nome}`, {
      sopra: `<a href="#personale">Anagrafica dipendenti</a> / ${l.attivo ? '<span class="stato verde">in forza</span>' : '<span class="stato grigio">non più in forza</span>'}`,
      azioni: '<button class="btn vuoto" id="l-mod">Modifica dati</button><button class="btn rosso" id="l-doc">Aggiungi documento</button>'
    }) + `
      <div class="lv-tessere">
        <div class="lv-tes ${ci ? stato(ci.scadenza).classe : 'manca'}"><span>Carta d'identità</span><b>${ci ? (ci.scadenza ? fmt.data(ci.scadenza) : 'presente') : 'manca'}</b><small>${ci ? esc(stato(ci.scadenza).testo) : 'da caricare'}</small></div>
        <div class="lv-tes ${vm ? stato(vm.scadenza).classe : 'manca'}"><span>Visita medica</span><b>${vm ? (vm.scadenza ? fmt.data(vm.scadenza) : 'presente') : 'manca'}</b><small>${vm ? esc(stato(vm.scadenza).testo) : 'da caricare'}</small></div>
        ${ps ? `<div class="lv-tes ${stato(ps.scadenza).classe}"><span>Permesso di soggiorno</span><b>${ps.scadenza ? fmt.data(ps.scadenza) : 'presente'}</b><small>${esc(stato(ps.scadenza).testo)}</small></div>` : ''}
        <div class="lv-tes ${l.automunito ? 'blu' : 'manca'}"><span>Spostamenti</span><b>${l.automunito ? 'Automunito' : 'Senza auto'}</b><small>${l.patente ? 'patente ' + esc(l.patente) : 'patente non indicata'}</small></div>
      </div>
      <div class="lv-due">
        <section class="pannello"><h2>Dati e recapiti</h2>
          <dl class="ck-dati lv-dati">${riga('Qualifica', esc(l.qualifica))}${riga('Codice fiscale', esc(l.codice_fiscale))}${riga('Nato il', [fmt.data(l.data_nascita), esc(l.luogo_nascita || '')].filter(Boolean).join(' a '))}
            ${riga('Telefono', l.telefono ? `<a href="tel:${esc(l.telefono)}">${esc(l.telefono)}</a>` : '')}${riga('Email', l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : '')}
            ${riga('Residenza', esc([l.indirizzo, l.comune].filter(Boolean).join(', ')))}${riga('Emergenze', esc(l.contatto_emergenza))}
            ${riga('Competenze', esc(l.competenze || ''))}${riga('Contratto', esc(l.tipo_contratto))}${n(l.ore_settimanali) && n(l.ore_settimanali) !== 40 ? riga('Ore settimanali', n(l.ore_settimanali)) : ''}${riga('Assunto il', fmt.data(l.data_assunzione))}${riga('Costo orario', n(l.costo_orario) ? fmt.euro(l.costo_orario) : '')}${riga('Note', esc(l.note))}</dl></section>
        <section class="pannello lv-archivio"><h2>Archivio documenti</h2>
          <div class="lv-arch"><ul class="lv-cartelle" role="list">
            <li><button data-c="" aria-current="${!cartella}">Tutti <span>${docs.length}</span></button></li>
            ${cartelle.map(t => { const k = docs.filter(d => d.tipo === t); const peggio = k.some(d => stato(d.scadenza).k === 'scaduto') ? 'rosso' : k.some(d => stato(d.scadenza).k === 'in scadenza') ? 'giallo' : ''; return `<li><button data-c="${esc(t)}" aria-current="${cartella === t}"><i class="lv-punto ${peggio}"></i>${esc(t)} <span>${k.length}</span></button></li>`; }).join('')}</ul>
          <div class="lv-file" id="l-file"></div></div></section>
      </div>
      <section class="pannello" style="margin-top:12px"><div class="testata" style="margin-bottom:8px"><h2>Scadenze</h2></div><div id="l-scad"></div></section>`;
    const ricarica = () => ui.pagine.lavoratore(el, id);
    $('#l-mod', el).onclick = () => ui.modulo({ titolo: 'Dati del lavoratore', campi: campiLavoratore(), valori: l,
      salva: async d => { await db.aggiorna('lavoratori', id, d); ui.dimentica('lavoratori'); avviso('Salvato'); ricarica(); },
      elimina: async () => { await db.elimina('lavoratori', id); ui.dimentica('lavoratori'); ui.vai('personale'); } });
    const nuovo = tipo => App.nuovoDocumento({ tabella: 'documenti_lavoratore', chiave: 'lavoratore_id', id, cartella: 'lavoratori', tipi: TIPI_DOC, valori: { tipo: tipo || cartella || CI }, dopo: ricarica });
    $('#l-doc', el).onclick = () => nuovo();
    const disegnaFile = () => {
      const k = docs.filter(d => !cartella || d.tipo === cartella);
      $('#l-file', el).innerHTML = (k.length ? `<ul class="lv-elenco">${k.map(d => `<li><button class="lv-doc" data-id="${d.id}">
          <span class="lv-ico">${esc((d.nome_file || '').split('.').pop().toUpperCase().slice(0, 4) || 'DOC')}</span>
          <span class="lv-tit"><b>${esc(d.tipo)}</b>${d.numero ? ` n. ${esc(d.numero)}` : ''}<small>${d.rilasciato_il ? 'rilasciato il ' + fmt.data(d.rilasciato_il) : ''}${d.nome_file ? (d.rilasciato_il ? ' · ' : '') + esc(d.nome_file) : ' · nessun file'}</small></span>
          <span class="lv-stato">${pill(d.scadenza)}${d.scadenza ? `<small>${fmt.data(d.scadenza)}</small>` : ''}</span></button>
          ${d.percorso ? `<button class="btn vuoto piccolo" data-apri="${d.id}">Apri</button>` : ''}</li>`).join('')}</ul>`
        : `<p class="nota">Nessun documento${cartella ? ' in questa cartella' : ''}.</p>`) + `<button class="btn vuoto piccolo" data-nuovo-doc style="margin-top:10px">Aggiungi ${cartella ? esc(cartella.toLowerCase()) : 'documento'}</button>`;
    };
    $('.lv-cartelle', el).onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; cartella = b.dataset.c || null; try { sessionStorage.setItem('lav-cartella', cartella || ''); } catch {} $$('.lv-cartelle [data-c]', el).forEach(x => x.setAttribute('aria-current', x === b)); disegnaFile(); };
    $('#l-file', el).onclick = e => {
      const a = e.target.closest('[data-apri]'); if (a) return apriFile(docs.find(d => String(d.id) === a.dataset.apri).percorso);
      const d = e.target.closest('.lv-doc'); if (d) return App.nuovoDocumento({ tabella: 'documenti_lavoratore', chiave: 'lavoratore_id', id, cartella: 'lavoratori', tipi: TIPI_DOC, valori: docs.find(x => String(x.id) === d.dataset.id), dopo: ricarica });
      if (e.target.closest('[data-nuovo-doc]')) nuovo();
    };
    disegnaFile();
    App.scadenziario($('#l-scad', el), { ambito: 'personale', lavoratore_id: id, compatto: true });
  });

  // ---------- Scadenziario (personale o mezzi): elenco per mese o calendario ----------
  const SUGG = {
    personale: ['Visita medica', 'Corso sicurezza generale', 'Formazione specifica', 'Corso preposto', 'Primo soccorso', 'Antincendio', 'Patentino PLE', 'Patentino gru', 'Segnaletica stradale (DI 22/01/2019)', 'UNILAV – fine contratto'],
    mezzi: ['Assicurazione', 'Bollo', 'Revisione', 'Tagliando', 'Verifica periodica INAIL', 'Cronotachigrafo', 'Cambio gomme']
  };
  App.scadenziario = async function (el, { ambito, lavoratore_id, mezzo_id, compatto } = {}) {
    const chiaveV = 'scad-vista-' + ambito;
    let vista = 'elenco', periodo = compatto ? 'tutte' : '90', mese = oggi().slice(0, 7), chi = '';
    try { vista = sessionStorage.getItem(chiaveV) || 'elenco'; } catch {}
    const q = { eq: { ambito, completata: false }, sel: '*,lavoratore:lavoratori(cognome,nome),mezzo:mezzi(nome,targa)' };
    if (lavoratore_id) q.eq.lavoratore_id = lavoratore_id; if (mezzo_id) q.eq.mezzo_id = mezzo_id;
    const [scad, docs, persone] = await Promise.all([
      db.lista('scadenze', q),
      ambito === 'personale' ? db.lista('documenti_lavoratore', { ...(lavoratore_id ? { eq: { lavoratore_id } } : {}), nullo: { scadenza: false }, sel: '*,lavoratore:lavoratori(cognome,nome,attivo)' }) : Promise.resolve([]),
      ambito === 'personale' ? db.lista('lavoratori', { eq: { attivo: true }, ordina: 'cognome,nome', sel: 'id,cognome,nome' }) : db.lista('mezzi', { ordina: 'nome', sel: 'id,nome,targa' })
    ]);
    // per i documenti conta solo l'ultimo di ogni tipo: quelli vecchi sono stati sostituiti
    const docUltimi = docs.filter(d => d === ultimo(docs.filter(x => x.lavoratore_id === d.lavoratore_id), d.tipo) && (!d.lavoratore || d.lavoratore.attivo !== false));
    const voci = [
      ...scad.map(s => ({ id: 's' + s.id, s, data: s.data_scadenza, cosa: s.tipo, pre: s.preavviso_giorni ?? 30, chi: s.lavoratore ? `${s.lavoratore.cognome} ${s.lavoratore.nome}` : s.mezzo ? s.mezzo.nome + (s.mezzo.targa ? ` (${s.mezzo.targa})` : '') : '', chiId: s.lavoratore_id || s.mezzo_id, note: [s.numero ? 'n. ' + s.numero : '', s.ente, s.importo ? fmt.euro(s.importo) : '', s.note].filter(Boolean).join(' · ') })),
      ...docUltimi.map(d => ({ id: 'd' + d.id, d, data: d.scadenza, cosa: d.tipo, pre: 30, chi: d.lavoratore ? `${d.lavoratore.cognome} ${d.lavoratore.nome}` : '', chiId: d.lavoratore_id, note: [d.numero ? 'n. ' + d.numero : '', d.note].filter(Boolean).join(' · '), doc: true }))
    ].sort((a, b) => a.data.localeCompare(b.data));
    const nomeChi = ambito === 'personale' ? 'Lavoratore' : 'Mezzo';
    el.innerHTML = `<div class="sz-barra non-stampare">
        ${compatto ? '' : `<div class="filtro"><label for="sz-per">Mostra</label><select id="sz-per"><option value="scadute">Solo scadute</option><option value="30">Scadute e prossimi 30 giorni</option><option value="90" selected>Scadute e prossimi 90 giorni</option><option value="tutte">Tutte</option></select></div>
        <div class="filtro"><label for="sz-chi">${nomeChi}</label><select id="sz-chi"><option value="">Tutti</option>${persone.map(p => `<option value="${p.id}">${esc(p.cognome ? `${p.cognome} ${p.nome}` : p.nome)}</option>`).join('')}</select></div>`}
        <div class="filtro"><label for="sz-cosa">Cosa</label><input id="sz-cosa" type="search" placeholder="es. visita, carta, bollo" autocomplete="off"></div>
        <div class="sz-vista" role="group" aria-label="Vista"><button data-v="elenco" aria-pressed="${vista === 'elenco'}">Elenco</button><button data-v="calendario" aria-pressed="${vista === 'calendario'}">Calendario</button></div>
        <div class="azioni" style="margin-left:auto"><button class="btn rosso" id="sz-nuova">Nuova scadenza</button></div></div>
      <div id="sz-corpo"></div>`;
    const filtrate = () => {
      const t = ($('#sz-cosa', el).value || '').toLowerCase(), lim = periodo === 'tutte' ? '9999' : periodo === 'scadute' ? fmt.piuGiorni(oggi(), -1) : fmt.piuGiorni(oggi(), Number(periodo));
      return voci.filter(v => v.data <= lim && (!chi || String(v.chiId) === chi) && (!t || `${v.cosa} ${v.chi} ${v.note}`.toLowerCase().includes(t)));
    };
    const colore = v => stato(v.data, v.pre).classe;
    function disegna() {
      const c = $('#sz-corpo', el);
      if (vista === 'calendario') return calendario(c);
      const vs = filtrate();
      if (!vs.length) { c.innerHTML = `<p class="nota" style="padding:14px 0">Nessuna scadenza${periodo !== 'tutte' ? ' in questo periodo' : ''}. ${compatto ? '' : 'Prova "Tutte".'}</p>`; return; }
      const mesi = [...new Set(vs.map(v => v.data.slice(0, 7)))];
      c.innerHTML = `<div class="sz-elenco">${mesi.map(m => `<h3 class="sz-mese">${new Date(m + '-15T12:00:00Z').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</h3>
        ${vs.filter(v => v.data.startsWith(m)).map(v => { const dt = new Date(v.data + 'T12:00:00Z'); return `<div class="sz-riga">
          <div class="sz-giorno ${colore(v)}"><small>${dt.toLocaleDateString('it-IT', { weekday: 'short' })}</small><b>${dt.getUTCDate()}</b></div>
          <div class="sz-chi"><small>${v.doc ? 'Documento' : esc(nomeChi)}</small><b>${esc(v.chi || 'Azienda')}</b></div>
          <div class="sz-cosa"><b>${esc(v.cosa)}</b>${v.note ? `<small>${esc(v.note)}</small>` : ''}</div>
          <div class="sz-stato"><span class="stato ${colore(v)}">${esc(stato(v.data, v.pre).testo.replace('valido', 'in regola'))}</span></div>
          <div class="sz-az">${v.doc ? `<button class="btn vuoto piccolo" data-nuovo-doc="${v.id}">Carica il nuovo</button>` : `<button class="btn vuoto piccolo" data-rinnova="${v.id}">Rinnova</button>`}</div></div>`; }).join('')}`).join('')}</div>`;
    }
    function calendario(c) {
      const [a, m] = mese.split('-').map(Number), primo = new Date(Date.UTC(a, m - 1, 1)), dow = (primo.getUTCDay() + 6) % 7, giorni = new Date(Date.UTC(a, m, 0)).getUTCDate();
      const t = ($('#sz-cosa', el).value || '').toLowerCase(), vs = voci.filter(v => v.data.startsWith(mese) && (!chi || String(v.chiId) === chi) && (!t || `${v.cosa} ${v.chi} ${v.note}`.toLowerCase().includes(t)));
      const celle = [];
      for (let i = 0; i < dow; i++) celle.push('<div class="sz-cella fuori"></div>');
      for (let g = 1; g <= giorni; g++) { const d = `${mese}-${String(g).padStart(2, '0')}`, qui = vs.filter(v => v.data === d);
        celle.push(`<div class="sz-cella ${d === oggi() ? 'oggi' : ''}"><span class="sz-num">${g}</span>${qui.map(v => `<button class="sz-chip ${colore(v)}" data-${v.doc ? 'nuovo-doc' : 'rinnova'}="${v.id}" title="${esc(v.cosa + ' – ' + v.chi)}">${esc(v.cosa)}<small>${esc(v.chi)}</small></button>`).join('')}</div>`); }
      const nomeMese = primo.toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      c.innerHTML = `<div class="sz-cal-testa"><button class="btn vuoto piccolo" data-m="-1" aria-label="Mese precedente">‹</button><h3>${nomeMese}</h3><button class="btn vuoto piccolo" data-m="1" aria-label="Mese successivo">›</button><button class="btn testo piccolo" data-m="0">Oggi</button></div>
        <div class="sz-cal">${['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(x => `<div class="sz-dow">${x}</div>`).join('')}${celle.join('')}</div>`;
      c.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const k = Number(b.dataset.m); if (!k) mese = oggi().slice(0, 7); else { const d = new Date(Date.UTC(a, m - 1 + k, 1)); mese = d.toISOString().slice(0, 7); } disegna(); });
    }
    const rinnova = v => {
      const s = v.s;
      ui.modulo({ titolo: `Rinnovo: ${s.tipo}${v.chi ? ' – ' + v.chi : ''}`, testoSalva: 'Rinnova',
        campi: [{ k: 'nuova', label: 'Nuova data di scadenza', tipo: 'data', richiesto: true }, ...(ambito === 'mezzi' ? [{ k: 'numero', label: 'Numero polizza / pratica' }, { k: 'ente', label: 'Compagnia, ente o officina' }, { k: 'importo', label: 'Importo pagato', tipo: 'euro' }] : []), { k: 'note', label: 'Note', tipo: 'area' }],
        valori: { nuova: fmt.piuGiorni(s.data_scadenza, 365), numero: s.numero, ente: s.ente, importo: s.importo, note: s.note },
        salva: async d => {
          await db.aggiorna('scadenze', s.id, { completata: true });
          const { id, creato_il, lavoratore, mezzo, cantiere, anagrafica, ...copia } = s;
          await db.inserisci('scadenze', { ...copia, data_scadenza: d.nuova, note: d.note || '', ...(ambito === 'mezzi' ? { numero: d.numero || '', ente: d.ente || '', importo: d.importo || 0 } : {}), completata: false });
          avviso('Scadenza rinnovata'); App.scadenziario(el, { ambito, lavoratore_id, mezzo_id, compatto });
        } });
    };
    el.addEventListener('click', e => {
      const r = e.target.closest('[data-rinnova]'); if (r) return rinnova(voci.find(v => v.id === r.dataset.rinnova));
      const d = e.target.closest('[data-nuovo-doc]');
      if (d) { const v = voci.find(x => x.id === d.dataset.nuovoDoc); return App.nuovoDocumento({ tabella: 'documenti_lavoratore', chiave: 'lavoratore_id', id: v.d.lavoratore_id, cartella: 'lavoratori', tipi: TIPI_DOC, valori: { tipo: v.d.tipo }, dopo: () => App.scadenziario(el, { ambito, lavoratore_id, mezzo_id, compatto }) }); }
      const b = e.target.closest('[data-v]'); if (b) { vista = b.dataset.v; try { sessionStorage.setItem(chiaveV, vista); } catch {} el.querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-pressed', x === b)); disegna(); }
    });
    const per = $('#sz-per', el); if (per) per.onchange = () => { periodo = per.value; disegna(); };
    const ch = $('#sz-chi', el); if (ch) ch.onchange = () => { chi = ch.value; disegna(); };
    let att; $('#sz-cosa', el).oninput = () => { clearTimeout(att); att = setTimeout(disegna, 200); };
    $('#sz-nuova', el).onclick = () => ui.modulo({ titolo: 'Nuova scadenza', valori: { preavviso_giorni: 30, lavoratore_id, mezzo_id },
      campi: [{ k: 'tipo', label: 'Cosa scade', richiesto: true, suggerimenti: SUGG[ambito] },
        ...(lavoratore_id || mezzo_id ? [] : [ambito === 'personale' ? { k: 'lavoratore_id', label: 'Lavoratore', tipo: 'rif', rif: App.RIF.lavoratore, richiesto: true } : { k: 'mezzo_id', label: 'Mezzo', tipo: 'rif', rif: App.RIF.mezzo, richiesto: true }]),
        { k: 'data_scadenza', label: 'Data di scadenza', tipo: 'data', richiesto: true }, { k: 'preavviso_giorni', label: 'Avvisami con quanti giorni di anticipo', tipo: 'numero' },
        ...(ambito === 'mezzi' ? [{ k: 'numero', label: 'Numero polizza / pratica' }, { k: 'ente', label: 'Compagnia, ente o officina' }, { k: 'importo', label: 'Importo', tipo: 'euro' }] : []),
        { k: 'note', label: 'Note', tipo: 'area' }],
      salva: async d => { await db.inserisci('scadenze', { ambito, completata: false, lavoratore_id: lavoratore_id || null, mezzo_id: mezzo_id || null, cantiere_id: null, anagrafica_id: null, numero: '', ente: '', importo: 0, ...d, note: d.note || '' }); avviso('Scadenza aggiunta'); App.scadenziario(el, { ambito, lavoratore_id, mezzo_id, compatto }); } });
    disegna();
  };

  // ---------- Mezzi ----------
  const STATI_MEZZO = { attivo: ['verde', 'Attivo'], guasto: ['rosso', 'Guasto'], manutenzione: ['giallo', 'In manutenzione'], dismesso: ['grigio', 'Dismesso'] };
  const pillMezzo = s => { const x = STATI_MEZZO[s] || STATI_MEZZO.attivo; return `<span class="stato ${x[0]}">${x[1]}</span>`; };
  const inCorso = a => a.dal <= oggi() && (!a.al || a.al >= oggi());
  const campiMezzo = () => [
    { k: 'nome', label: 'Nome', richiesto: true, aiuto: 'es. Battipalo Orteco, Autocarro Iveco' },
    { k: 'tipo', label: 'Tipo', tipo: 'select', opzioni: [['mezzo', 'Mezzo'], ['attrezzatura', 'Attrezzatura']], richiesto: true },
    { k: 'targa', label: 'Targa o matricola' }, { k: 'marca_modello', label: 'Marca e modello' }, { k: 'anno', label: 'Anno', tipo: 'numero' },
    { k: 'stato', label: 'Stato', tipo: 'select', richiesto: true, opzioni: Object.entries(STATI_MEZZO).map(([k, v]) => [k, v[1]]) },
    { k: 'contatore', label: 'Km o ore motore attuali', tipo: 'numero' },
    { k: 'costo_orario', label: 'Costo orario', tipo: 'euro', aiuto: 'Carburante, ammortamento, manutenzione: serve per il costo sui cantieri' },
    { k: 'note', label: 'Note', tipo: 'area' }
  ];
  const salvaMezzo = d => ({ ...d, attivo: d.stato !== 'dismesso' });
  async function datiMezzi() {
    const [ass, scad] = await Promise.all([db.lista('assegnazioni_mezzi', { sel: '*,cantiere:cantieri(nome,codice)' }), db.lista('scadenze', { eq: { ambito: 'mezzi', completata: false } })]);
    return { ass, scad };
  }
  const scadDi = (scad, mid, tipo) => scad.filter(s => s.mezzo_id === mid && s.tipo === tipo).sort((a, b) => a.data_scadenza.localeCompare(b.data_scadenza))[0];
  const cellaScad = (scad, mid, tipo) => { const s = scadDi(scad, mid, tipo); return s ? `${pill(s.data_scadenza, s.preavviso_giorni).replace('>valido<', '>in regola<')} <span class="nota">${fmt.data(s.data_scadenza)}</span>` : '<span class="nota">–</span>'; };
  const filtroScad = (tipo, label) => ({ k: 'sc-' + tipo, label, opzioni: [['', 'Tutte'], ['valido', 'In regola'], ['in scadenza', 'In scadenza'], ['scaduto', 'Scaduta'], ['manca', 'Non inserita']],
    locale: (r, v) => { const s = scadDi(r.scad, r.id, tipo); return v === 'manca' ? !s : !!s && stato(s.data_scadenza, s.preavviso_giorni).k === v; } });

  ui.pagina('mezzi', async el => {
    el.innerHTML = App.testata('Mezzi e attrezzature') + '<div id="schede-mezzi"></div>';
    App.schede($('#schede-mezzi', el), [['elenco', 'Elenco'], ['scadenziario', 'Assicurazioni, bolli e revisioni']], null, async (k, corpo) => {
      if (k === 'scadenziario') return App.scadenziario(corpo, { ambito: 'mezzi' });
      const cantieri = await db.lista('cantieri', { neq: { stato: 'chiuso' }, ordina: 'nome' });
      corpo.innerHTML = '<div id="el-mezzi"></div>';
      ui.elenco($('#el-mezzi', corpo), {
        tabella: 'mezzi', esporta: 'Mezzi', nuovo: 'Nuovo mezzo', ordina: 'tipo,nome', cerca: ['nome', 'targa', 'marca_modello'],
        dopoCarica: async righe => { const { ass, scad } = await datiMezzi(); for (const r of righe) { r.ora = ass.find(a => a.mezzo_id === r.id && inCorso(a)); r.scad = scad; } return righe; },
        filtri: [
          { k: 'tipo', label: 'Tipo', opzioni: [['', 'Tutti'], ['mezzo', 'Mezzi'], ['attrezzatura', 'Attrezzature']] },
          { k: 'stato', label: 'Stato', predef: 'in uso', opzioni: [['in uso', 'In uso'], ...Object.entries(STATI_MEZZO).map(([k, v]) => [k, v[1]]), ['', 'Tutti']], applica: (q, v) => { if (v === 'in uso') q.neq = { stato: 'dismesso' }; else q.eq.stato = v; } },
          { k: 'dove', label: 'Disponibilità', opzioni: [['', 'Tutti'], ['libero', 'Liberi'], ['impegnato', 'Impegnati in cantiere'], ...cantieri.map(c => ['c' + c.id, 'In ' + c.nome])],
            locale: (r, v) => v === 'libero' ? !r.ora && r.stato === 'attivo' : v === 'impegnato' ? !!r.ora : r.ora && 'c' + r.ora.cantiere_id === v },
          filtroScad('Assicurazione', 'Assicurazione'), filtroScad('Revisione', 'Revisione')
        ],
        campi: campiMezzo(), predefiniti: { tipo: 'mezzo', stato: 'attivo' },
        apri: r => ui.vai('mezzo', r.id),
        nuovoAzione: () => ui.modulo({ titolo: 'Nuovo mezzo', campi: campiMezzo(), valori: { tipo: 'mezzo', stato: 'attivo' }, salva: async d => { const m = await db.inserisci('mezzi', salvaMezzo(d)); ui.dimentica('mezzi'); ui.vai('mezzo', m.id); } }),
        colonne: [
          { k: 'nome', t: 'Nome', f: r => `<b>${esc(r.nome)}</b>${r.marca_modello ? `<br><span class="nota">${esc(r.marca_modello)}</span>` : ''}`, x: r => r.nome },
          { k: 'targa', t: 'Targa' },
          { k: 'stato', t: 'Stato', f: r => pillMezzo(r.stato), x: r => (STATI_MEZZO[r.stato] || STATI_MEZZO.attivo)[1] },
          { k: 'dove', t: 'Dove si trova', f: r => r.ora ? `<span class="stato blu">impegnato</span> ${esc(r.ora.cantiere ? r.ora.cantiere.nome : '')}` : r.stato === 'attivo' ? '<span class="stato verde">libero</span>' : '<span class="nota">fermo</span>', x: r => r.ora ? 'impegnato ' + (r.ora.cantiere ? r.ora.cantiere.nome : '') : r.stato === 'attivo' ? 'libero' : 'fermo' },
          { k: 'ass', t: 'Assicurazione', f: r => cellaScad(r.scad, r.id, 'Assicurazione'), x: r => { const s = scadDi(r.scad, r.id, 'Assicurazione'); return s ? fmt.data(s.data_scadenza) : ''; } },
          { k: 'bollo', t: 'Bollo', f: r => cellaScad(r.scad, r.id, 'Bollo'), x: r => { const s = scadDi(r.scad, r.id, 'Bollo'); return s ? fmt.data(s.data_scadenza) : ''; } },
          { k: 'rev', t: 'Revisione', f: r => cellaScad(r.scad, r.id, 'Revisione'), x: r => { const s = scadDi(r.scad, r.id, 'Revisione'); return s ? fmt.data(s.data_scadenza) : ''; } },
          { k: 'costo_orario', t: 'Costo orario', num: true, f: r => n(r.costo_orario) ? fmt.euro(r.costo_orario) : '<span class="stato giallo">da inserire</span>', x: r => n(r.costo_orario) }
        ],
        classeRiga: r => r.stato === 'dismesso' ? 'spento' : ''
      });
    });
  });

  ui.pagina('mezzo', async (el, id) => {
    const [m, ass, scad, man, ore] = await Promise.all([
      db.uno('mezzi', id),
      db.lista('assegnazioni_mezzi', { eq: { mezzo_id: id }, ordina: 'dal.desc', sel: '*,cantiere:cantieri(nome,codice)' }),
      db.lista('scadenze', { eq: { ambito: 'mezzi', mezzo_id: id }, ordina: 'data_scadenza' }),
      db.lista('manutenzioni', { eq: { mezzo_id: id }, ordina: 'data.desc', sel: '*,cantiere:cantieri(nome)' }),
      db.lista('ore_mezzi', { eq: { mezzo_id: id }, sel: 'ore,giorno,cantiere_id' })
    ]);
    const ora = ass.find(inCorso), aperte = scad.filter(s => !s.completata);
    const sc = tipo => aperte.filter(s => s.tipo === tipo).sort((a, b) => a.data_scadenza.localeCompare(b.data_scadenza))[0];
    const tes = (tipo, etich) => { const s = sc(tipo); return `<div class="lv-tes ${s ? stato(s.data_scadenza, s.preavviso_giorni).classe : 'manca'}"><span>${etich}</span><b>${s ? fmt.data(s.data_scadenza) : 'non inserita'}</b><small>${s ? esc(stato(s.data_scadenza, s.preavviso_giorni).testo.replace('valido', 'in regola')) + (s.ente ? ' · ' + esc(s.ente) : '') : 'aggiungila qui sotto'}</small></div>`; };
    const anno = oggi().slice(0, 4), costoAnno = man.filter(x => (x.data || '').startsWith(anno)).reduce((s, x) => s + n(x.costo), 0);
    el.innerHTML = App.testata(m.nome, {
      sopra: `<a href="#mezzi">Mezzi e attrezzature</a> / ${pillMezzo(m.stato)}${m.targa ? ` / ${esc(m.targa)}` : ''}`,
      azioni: `<button class="btn vuoto" id="m-mod">Modifica dati</button>${m.stato === 'attivo' ? '<button class="btn vuoto" id="m-guasto">Segnala guasto</button>' : m.stato !== 'dismesso' ? '<button class="btn vuoto" id="m-riattiva">Di nuovo attivo</button>' : ''}
        ${ora ? '<button class="btn rosso" id="m-rientro">Rientro dal cantiere</button>' : m.stato === 'attivo' ? '<button class="btn rosso" id="m-assegna">Assegna a un cantiere</button>' : ''}`
    }) + `
      <div class="lv-tessere">
        <div class="lv-tes ${ora ? 'blu' : m.stato === 'attivo' ? 'verde' : 'rosso'}"><span>Dove si trova</span><b>${ora ? esc(ora.cantiere ? ora.cantiere.nome : 'In cantiere') : m.stato === 'attivo' ? 'Libero' : 'Fermo'}</b><small>${ora ? `dal ${fmt.data(ora.dal)}${ora.al ? ` al ${fmt.data(ora.al)}` : ''}` : m.stato === 'attivo' ? 'disponibile per un cantiere' : esc((STATI_MEZZO[m.stato] || [])[1] || '')}</small></div>
        ${tes('Assicurazione', 'Assicurazione')}${tes('Bollo', 'Bollo')}${tes('Revisione', 'Revisione')}
        <div class="lv-tes chiaro"><span>Manutenzione ${anno}</span><b>${fmt.euro(costoAnno)}</b><small>${man.length} interventi registrati${m.contatore ? ` · ${fmt.num(m.contatore)} km/ore` : ''}</small></div>
      </div>
      <div id="m-schede"></div>`;
    const ricarica = () => ui.pagine.mezzo(el, id);
    $('#m-mod', el).onclick = () => ui.modulo({ titolo: 'Dati del mezzo', campi: campiMezzo(), valori: m, salva: async d => { await db.aggiorna('mezzi', id, salvaMezzo(d)); ui.dimentica('mezzi'); avviso('Salvato'); ricarica(); }, elimina: async () => { await db.elimina('mezzi', id); ui.dimentica('mezzi'); ui.vai('mezzi'); } });
    const bg = $('#m-guasto', el);
    if (bg) bg.onclick = () => ui.modulo({ titolo: `Guasto: ${m.nome}`, testoSalva: 'Segnala guasto', valori: { data: oggi(), cantiere_id: ora ? ora.cantiere_id : '' },
      campi: [{ k: 'data', label: 'Data', tipo: 'data', richiesto: true }, { k: 'descrizione', label: 'Cosa è successo', tipo: 'area', richiesto: true }, { k: 'cantiere_id', label: 'Su quale cantiere', tipo: 'rif', rif: App.RIF.cantiere }],
      salva: async d => { await db.inserisci('manutenzioni', { mezzo_id: id, data: d.data, tipo: 'Guasto', descrizione: d.descrizione, cantiere_id: d.cantiere_id || null, costo: 0, officina: '', contatore: m.contatore || null, note: '' }); await db.aggiorna('mezzi', id, { stato: 'guasto' }); avviso('Guasto segnalato: il mezzo risulta fermo'); ricarica(); } });
    const br = $('#m-riattiva', el); if (br) br.onclick = async () => { try { await db.aggiorna('mezzi', id, { stato: 'attivo', attivo: true }); avviso('Mezzo di nuovo attivo'); ricarica(); } catch (e) { errore(e); } };
    const ba = $('#m-assegna', el);
    if (ba) ba.onclick = () => ui.modulo({ titolo: `Assegna ${m.nome} a un cantiere`, testoSalva: 'Assegna', valori: { dal: oggi() },
      campi: [{ k: 'cantiere_id', label: 'Cantiere', tipo: 'rif', rif: App.RIF.cantiereAperto, richiesto: true }, { k: 'dal', label: 'Dal', tipo: 'data', richiesto: true }, { k: 'al', label: 'Fino al (previsto)', tipo: 'data', aiuto: 'Lascia vuoto se non lo sai: quando rientra premi "Rientro dal cantiere"' }, { k: 'note', label: 'Note' }],
      salva: async d => { await db.inserisci('assegnazioni_mezzi', { mezzo_id: id, cantiere_id: Number(d.cantiere_id), dal: d.dal, al: d.al || null, note: d.note || '' }); avviso('Mezzo assegnato'); ricarica(); } });
    const bri = $('#m-rientro', el);
    if (bri) bri.onclick = async () => { try { await db.aggiorna('assegnazioni_mezzi', ora.id, { al: oggi() < ora.dal ? ora.dal : fmt.piuGiorni(oggi(), -1) }); avviso('Mezzo rientrato: ora è libero'); ricarica(); } catch (e) { errore(e); } };

    App.schede($('#m-schede', el), [['cantieri', 'Cantieri'], ['scadenze', 'Assicurazione, bollo, revisione'], ['manutenzione', 'Manutenzione'], ['ore', 'Ore di lavoro']], null, (k, c) => {
      if (k === 'scadenze') return App.scadenziario(c, { ambito: 'mezzi', mezzo_id: id, compatto: true });
      if (k === 'cantieri') {
        c.innerHTML = `<div class="scorri"><table class="tabella"><thead><tr><th>Cantiere</th><th>Dal</th><th>Al</th><th>Note</th><th></th></tr></thead><tbody>${ass.map(a => `<tr><td><a href="#cantiere-${a.cantiere_id}"><b>${esc(a.cantiere ? a.cantiere.nome : '')}</b></a></td><td>${fmt.data(a.dal)}</td><td>${a.al ? fmt.data(a.al) : '<span class="stato blu">in corso</span>'}</td><td>${esc(a.note)}</td><td><button class="btn testo piccolo" data-via="${a.id}">Elimina</button></td></tr>`).join('') || '<tr><td colspan="5" class="vuota">Mai assegnato a un cantiere.</td></tr>'}</tbody></table></div>
          <p class="nota" style="margin-top:8px">Un mezzo è "impegnato" quando oggi è compreso tra le date di un'assegnazione. Le ore lavorate e il costo sul cantiere si registrano con le ore mezzi del capocantiere.</p>`;
        c.onclick = async e => { const b = e.target.closest('[data-via]'); if (!b || !await conferma('Eliminare questa assegnazione?', { si: 'Elimina', pericolo: true })) return; try { await db.elimina('assegnazioni_mezzi', Number(b.dataset.via)); ricarica(); } catch (er) { errore(er); } };
        return;
      }
      if (k === 'ore') {
        const per = {}; for (const o of ore) per[o.cantiere_id] = (per[o.cantiere_id] || 0) + n(o.ore);
        return db.lista('cantieri', { sel: 'id,nome' }).then(cs => { c.innerHTML = `<div class="scorri"><table class="tabella"><thead><tr><th>Cantiere</th><th class="num">Ore</th><th class="num">Costo</th></tr></thead><tbody>${Object.entries(per).map(([cid, h]) => `<tr><td>${esc((cs.find(x => String(x.id) === cid) || {}).nome || '')}</td><td class="num">${fmt.ore(h)}</td><td class="num">${fmt.euro(h * n(m.costo_orario))}</td></tr>`).join('') || '<tr><td colspan="3" class="vuota">Nessuna ora registrata.</td></tr>'}</tbody></table></div>`; });
      }
      c.innerHTML = '<div id="m-man"></div>';
      ui.elenco($('#m-man', c), { tabella: 'manutenzioni', q: { eq: { mezzo_id: id }, sel: '*,cantiere:cantieri(nome)' }, ordina: 'data.desc', esporta: `Manutenzioni ${m.nome}`, nuovo: 'Nuovo intervento', fissi: { mezzo_id: id },
        filtri: [{ k: 'tipo', label: 'Tipo', opzioni: [['', 'Tutti'], 'Tagliando', 'Ordinaria', 'Straordinaria', 'Guasto', 'Gomme', 'Carrozzeria'] }],
        campi: [{ k: 'data', label: 'Data', tipo: 'data', richiesto: true }, { k: 'tipo', label: 'Tipo', tipo: 'select', richiesto: true, opzioni: ['Tagliando', 'Ordinaria', 'Straordinaria', 'Guasto', 'Gomme', 'Carrozzeria'] },
          { k: 'descrizione', label: 'Lavori fatti', tipo: 'area', richiesto: true }, { k: 'officina', label: 'Officina' }, { k: 'contatore', label: 'Km o ore motore', tipo: 'numero' },
          { k: 'costo', label: 'Costo senza IVA', tipo: 'euro' }, { k: 'cantiere_id', label: 'Cantiere (se il guasto è avvenuto lì)', tipo: 'rif', rif: App.RIF.cantiere }, { k: 'note', label: 'Note', tipo: 'area' }],
        predefiniti: () => ({ data: oggi(), tipo: 'Ordinaria', contatore: m.contatore }), dopoSalva: ricarica,
        colonne: [{ k: 'data', t: 'Data', f: r => fmt.data(r.data), x: r => r.data }, { k: 'tipo', t: 'Tipo', f: r => r.tipo === 'Guasto' ? '<span class="stato rosso">guasto</span>' : esc(r.tipo), x: r => r.tipo }, { k: 'descrizione', t: 'Lavori', f: r => esc((r.descrizione || '').slice(0, 90)) },
          { k: 'officina', t: 'Officina' }, { k: 'contatore', t: 'Km / ore', num: true, f: r => r.contatore ? fmt.num(r.contatore) : '', x: r => n(r.contatore) }, { k: 'costo', t: 'Costo', num: true, f: r => fmt.euro(r.costo), x: r => n(r.costo) }],
        piede: r => `<tr><td colspan="5">Totale</td><td class="num">${fmt.euro(r.reduce((s, x) => s + n(x.costo), 0))}</td></tr>` });
    });
  });

  // ---------- Ripartizione dei costi fissi aziendali sui cantieri ----------
  const paginaFissi = ui.pagine.costifissi;
  ui.pagina('costifissi', async el => {
    await paginaFissi(el);
    const [cantieri, rip, fissi, econ] = await Promise.all([
      db.lista('cantieri', { neq: { stato: 'chiuso' }, ordina: 'codice,nome', sel: '*,committente:anagrafiche(ragione_sociale)' }),
      db.lista('ripartizione_fissi', {}), db.lista('costi_fissi', { eq: { attivo: true }, sel: 'importo_annuo' }), db.lista('v_economia_cantieri', {}).catch(() => [])
    ]);
    const tot = fissi.reduce((s, x) => s + n(x.importo_annuo), 0);
    const pct = {}; for (const r of rip) pct[r.cantiere_id] = n(r.pct);
    // anche i cantieri chiusi che hanno già una quota restano visibili
    const sez = document.createElement('div'); sez.className = 'sezione'; sez.id = 'cf-rip';
    const quotaVecchia = $('#cf-quota', el); if (quotaVecchia) quotaVecchia.insertAdjacentElement('afterend', sez); else el.append(sez);
    sez.innerHTML = `<h2>Ripartizione sui cantieri</h2>
      <p class="nota" style="margin-bottom:12px;max-width:80ch">Spunta i cantieri che devono coprire i costi fissi e scrivi la percentuale per ognuno. Ogni cantiere si carica quella parte dei <b class="forte">${fmt.euro(tot)}</b> annui e la vede nel suo resoconto. I cantieri senza spunta usano la quota sui ricavi impostata sopra.</p>
      <div class="pannello"><div class="barra-elenco" style="margin-bottom:10px"><div class="azioni"><button class="btn vuoto piccolo" data-r="uguali">Parti uguali tra gli spuntati</button><button class="btn vuoto piccolo" data-r="contratto">In proporzione al contratto</button><button class="btn vuoto piccolo" data-r="tutti">Spunta tutti gli aperti</button><button class="btn testo piccolo" data-r="zero">Togli tutto</button></div>
        <div class="azioni" style="margin-left:auto"><button class="btn rosso" data-r="salva">Salva ripartizione</button></div></div>
      <div class="scorri"><table class="tabella cf-tab"><thead><tr><th style="width:36px"></th><th>Cantiere</th><th>Committente</th><th>Stato</th><th class="num">Contratto</th><th class="num">Fatturato</th><th class="num" style="width:120px">Percentuale</th><th class="num">Quota annua</th><th class="num">Al mese</th></tr></thead>
        <tbody>${cantieri.map(c => { const e = econ.find(x => x.cantiere_id === c.id) || {}; return `<tr data-c="${c.id}"><td><input type="checkbox" data-sel ${pct[c.id] != null ? 'checked' : ''} aria-label="Carica costi fissi su ${esc(c.nome)}"></td>
          <td><b>${esc(c.codice ? c.codice + ' – ' : '')}${esc(c.nome)}</b></td><td>${esc(c.committente ? c.committente.ragione_sociale : '')}</td><td>${App.statoCantiere(c.stato)}</td>
          <td class="num">${fmt.euro(c.importo_contratto)}</td><td class="num">${fmt.euro(e.fatturato || 0)}</td>
          <td><div class="cf-pct"><input data-pct inputmode="decimal" value="${pct[c.id] != null ? String(pct[c.id]).replace('.', ',') : ''}" ${pct[c.id] == null ? 'disabled' : ''} aria-label="Percentuale per ${esc(c.nome)}"><span>%</span></div></td>
          <td class="num" data-q></td><td class="num" data-m></td></tr>`; }).join('') || '<tr><td colspan="9" class="vuota">Nessun cantiere aperto.</td></tr>'}</tbody>
        <tfoot><tr><td colspan="6" id="cf-msg">Totale</td><td class="num" id="cf-tp"></td><td class="num" id="cf-tq"></td><td class="num" id="cf-tm"></td></tr></tfoot></table></div>
      <p class="stato" id="cf-avviso" style="display:block;padding:9px 12px;margin-top:10px" hidden></p></div>`;
    const righe = () => $$('tr[data-c]', sez);
    const leggi = tr => { const v = ui.leggiNumero(tr.querySelector('[data-pct]').value); return Number.isNaN(v) || v == null ? 0 : v; };
    function aggiorna() {
      let tp = 0;
      for (const tr of righe()) { const on = tr.querySelector('[data-sel]').checked, p = on ? leggi(tr) : 0; tp += p; tr.querySelector('[data-pct]').disabled = !on; tr.classList.toggle('spento', !on);
        tr.querySelector('[data-q]').textContent = on ? fmt.euro(tot * p / 100) : ''; tr.querySelector('[data-m]').textContent = on ? fmt.euro(tot * p / 1200) : ''; }
      tp = Math.round(tp * 100) / 100;
      $('#cf-tp', sez).textContent = fmt.pct(tp); $('#cf-tq', sez).textContent = fmt.euro(tot * tp / 100); $('#cf-tm', sez).textContent = fmt.euro(tot * tp / 1200);
      const av = $('#cf-avviso', sez), sel = righe().filter(tr => tr.querySelector('[data-sel]').checked).length;
      av.hidden = !sel || Math.abs(tp - 100) < 0.01;
      av.className = 'stato ' + (tp > 100 ? 'rosso' : 'giallo');
      av.textContent = tp > 100 ? `Il totale è ${fmt.pct(tp)}: stai caricando sui cantieri più dei costi fissi reali (${fmt.euro(tot * (tp - 100) / 100)} in più).` : `Il totale è ${fmt.pct(tp)}: restano ${fmt.pct(100 - tp)} dei costi fissi non coperti da nessun cantiere (${fmt.euro(tot * (100 - tp) / 100)} all'anno).`;
      return tp;
    }
    sez.addEventListener('input', aggiorna);
    sez.addEventListener('change', e => { if (e.target.matches('[data-sel]')) { const tr = e.target.closest('tr'), i = tr.querySelector('[data-pct]'); if (e.target.checked && !i.value) { i.disabled = false; i.focus(); } } aggiorna(); });
    const metti = (tr, v) => { tr.querySelector('[data-pct]').value = String(Math.round(v * 100) / 100).replace('.', ','); };
    // divide 100% in proporzione ai pesi; l'ultimo prende il resto, così il totale fa esattamente 100
    const dividi = (righe, pesi) => { const t = pesi.reduce((a, b) => a + b, 0); let resto = 100; righe.forEach((tr, i) => { const v = i === righe.length - 1 ? resto : Math.round(pesi[i] / t * 10000) / 100; resto = Math.round((resto - v) * 100) / 100; metti(tr, v); }); };
    sez.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => {
      const on = righe().filter(tr => tr.querySelector('[data-sel]').checked);
      if (b.dataset.r === 'tutti') { righe().forEach(tr => { tr.querySelector('[data-sel]').checked = true; }); return aggiorna(); }
      if (b.dataset.r === 'zero') { righe().forEach(tr => { tr.querySelector('[data-sel]').checked = false; tr.querySelector('[data-pct]').value = ''; }); return aggiorna(); }
      if (b.dataset.r === 'uguali') { if (!on.length) return avviso('Spunta prima i cantieri.', { errore: true }); dividi(on, on.map(() => 1)); return aggiorna(); }
      if (b.dataset.r === 'contratto') { if (!on.length) return avviso('Spunta prima i cantieri.', { errore: true }); const imp = tr => n((cantieri.find(c => String(c.id) === tr.dataset.c) || {}).importo_contratto), t = on.reduce((s, tr) => s + imp(tr), 0); if (!t) return avviso('I cantieri spuntati non hanno l\'importo del contratto.', { errore: true }); dividi(on, on.map(imp)); return aggiorna(); }
      if (b.dataset.r === 'salva') {
        const tp = aggiorna();
        if (tp > 100.05 && !await conferma(`Il totale è ${fmt.pct(tp)}, più del 100%. Salvare lo stesso?`, { si: 'Salva lo stesso' })) return;
        try {
          for (const r of rip.filter(r => cantieri.some(c => c.id === r.cantiere_id))) await db.elimina('ripartizione_fissi', r.id);
          const ins = on.map(tr => ({ cantiere_id: Number(tr.dataset.c), pct: leggi(tr) })).filter(x => x.pct > 0);
          if (ins.length) await db.inserisci('ripartizione_fissi', ins);
          avviso('Ripartizione salvata'); ui.pagine.costifissi(el);
        } catch (e) { errore(e); }
      }
    });
    aggiorna();
  });
})();
