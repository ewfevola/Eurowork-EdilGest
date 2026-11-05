// Scadenziario unico: personale, mezzi, cantieri, fornitori, azienda.
(function () {
  const { $, esc, fmt, avviso, errore } = ui;

  const AMBITI = [['personale', 'Personale'], ['mezzi', 'Mezzi'], ['cantiere', 'Cantieri'], ['fornitore', 'Fornitori'], ['azienda', 'Azienda']];
  const SUGG = {
    personale: ['Visita medica', 'Corso sicurezza generale', 'Formazione specifica', 'Corso preposto', 'Primo soccorso', 'Antincendio', 'Patentino PLE', 'Patentino gru', 'Segnaletica stradale (DI 22/01/2019)', 'UNILAV – fine contratto'],
    mezzi: ['Revisione', 'Assicurazione', 'Bollo', 'Verifica periodica INAIL', 'Tagliando', 'Cronotachigrafo'],
    cantiere: ['Fine lavori', 'POS', 'Notifica preliminare', 'Polizza fideiussoria', 'Ordinanza di chiusura strada'],
    fornitore: ['DURC', 'Visura camerale', 'Polizza RC', 'Iscrizione white list'],
    azienda: ['Attestazione SOA', 'Certificazione ISO 9001', 'DURC aziendale', 'Iscrizione white list prefettura', 'Polizza RCT/RCO']
  };

  function campi(ambitoFisso) {
    return [
      ...(ambitoFisso ? [] : [{ k: 'ambito', label: 'Riguarda', tipo: 'select', opzioni: AMBITI, richiesto: true }]),
      { k: 'tipo', label: 'Cosa scade', richiesto: true, suggerimenti: ambitoFisso ? SUGG[ambitoFisso] : Object.values(SUGG).flat() },
      { k: 'lavoratore_id', label: 'Lavoratore', tipo: 'rif', rif: App.RIF.lavoratore, mostraSe: d => (ambitoFisso || d.ambito) === 'personale' },
      { k: 'mezzo_id', label: 'Mezzo', tipo: 'rif', rif: App.RIF.mezzo, mostraSe: d => (ambitoFisso || d.ambito) === 'mezzi' },
      { k: 'cantiere_id', label: 'Cantiere', tipo: 'rif', rif: App.RIF.cantiere, mostraSe: d => (ambitoFisso || d.ambito) === 'cantiere' },
      { k: 'anagrafica_id', label: 'Fornitore', tipo: 'rif', rif: App.RIF.fornitore, mostraSe: d => (ambitoFisso || d.ambito) === 'fornitore' },
      { k: 'data_scadenza', label: 'Data di scadenza', tipo: 'data', richiesto: true },
      { k: 'preavviso_giorni', label: 'Avvisami con quanti giorni di anticipo', tipo: 'numero', vuoto: 30 },
      { k: 'completata', label: 'Già rinnovata / sistemata', tipo: 'bool' },
      { k: 'note', label: 'Note', tipo: 'area' }
    ];
  }

  const riferito = r => esc(r.lavoratore ? `${r.lavoratore.cognome} ${r.lavoratore.nome}` : r.mezzo ? r.mezzo.nome : r.cantiere ? r.cantiere.nome : r.anagrafica ? r.anagrafica.ragione_sociale : 'Azienda');

  App.elencoScadenze = function (el, { ambito } = {}) {
    const oggi = fmt.oggi();
    const e = ui.elenco(el, {
      tabella: 'scadenze', esporta: 'Scadenze', nuovo: 'Nuova scadenza',
      q: { sel: '*,lavoratore:lavoratori(cognome,nome),mezzo:mezzi(nome),cantiere:cantieri(nome),anagrafica:anagrafiche(ragione_sociale)', eq: ambito ? { ambito } : {} },
      ordina: 'data_scadenza', cerca: ['tipo', 'note'],
      filtri: [
        ...(ambito ? [] : [{ k: 'ambito', label: 'Riguarda', opzioni: [['', 'Tutto'], ...AMBITI] }]),
        { k: 'vista', label: 'Mostra', predef: 'aperte', opzioni: [['aperte', 'Da sistemare'], ['urgenti', 'Scadute e in arrivo (60 gg)'], ['fatte', 'Già sistemate'], ['', 'Tutte']],
          applica: (q, v) => { if (v === 'aperte') q.eq.completata = false; if (v === 'fatte') q.eq.completata = true; if (v === 'urgenti') { q.eq.completata = false; q.lte = { data_scadenza: fmt.piuGiorni(oggi, 60) }; } } }
      ],
      campi: campi(ambito), fissi: ambito ? { ambito } : {},
      predefiniti: () => ({ ambito: ambito || 'personale', preavviso_giorni: 30 }),
      titoloModifica: r => r.tipo,
      colonne: [
        { k: 'stato', t: 'Stato', f: r => { const s = App.statoScadenza(r.data_scadenza, r.preavviso_giorni, r.completata); return `<span class="stato ${s.classe}">${esc(s.testo)}</span>`; }, x: r => App.statoScadenza(r.data_scadenza, r.preavviso_giorni, r.completata).testo },
        { k: 'data_scadenza', t: 'Scadenza', f: r => fmt.data(r.data_scadenza) },
        { k: 'tipo', t: 'Cosa', f: r => `<b>${esc(r.tipo)}</b>` },
        { k: 'rif', t: 'Riferita a', f: riferito },
        { k: 'note', t: 'Note', f: r => esc(r.note.slice(0, 80)) },
        { k: 'az', t: '', f: r => r.completata ? '' : `<button class="btn vuoto piccolo" data-rinnova="${r.id}">Rinnova</button>`, x: () => '' }
      ],
      classeRiga: r => r.completata ? 'spento' : ''
    });
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-rinnova]'); if (!b) return;
      const r = e.righe.find(x => String(x.id) === b.dataset.rinnova);
      ui.modulo({
        titolo: `Rinnovo: ${r.tipo} – ${ui.testo(riferito(r))}`, testoSalva: 'Rinnova',
        campi: [{ k: 'nuova', label: 'Nuova data di scadenza', tipo: 'data', richiesto: true }, { k: 'note', label: 'Note', tipo: 'area' }],
        valori: { nuova: fmt.piuGiorni(r.data_scadenza, 365), note: r.note },
        salva: async d => {
          await db.aggiorna('scadenze', r.id, { completata: true });
          const { id, creato_il, lavoratore, mezzo, cantiere, anagrafica, ...copia } = r;
          await db.inserisci('scadenze', { ...copia, data_scadenza: d.nuova, note: d.note, completata: false });
          avviso('Scadenza rinnovata'); e.ricarica();
        }
      });
    });
    return e;
  };

  ui.pagina('scadenze', async el => {
    el.innerHTML = App.testata('Scadenze') + '<p class="nota" style="margin:-10px 0 16px">Visite mediche, corsi, UNILAV, revisioni, DURC, SOA: tutto in un posto. "Rinnova" chiude la scadenza e crea la successiva.</p><div id="el-scad"></div>';
    App.elencoScadenze($('#el-scad', el));
  });
})();
