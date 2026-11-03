// Valori e pezzi condivisi tra i moduli.
(function () {
  const { esc, fmt } = ui;
  const AZ = (window.CONFIG && window.CONFIG.AZIENDA) || {};

  const App = window.App = {
    profilo: null,
    get admin() { return App.profilo && App.profilo.ruolo === 'admin'; },

    CATEGORIE_COSTO: ['Materiali', 'Attrezzature', 'Subappalti', 'Noli esterni', 'Trasporti', 'Spese generali di cantiere', 'Altro'],
    CATEGORIE_BUDGET: ['Manodopera', 'Mezzi interni', 'Materiali', 'Attrezzature', 'Subappalti', 'Noli esterni', 'Trasporti', 'Spese generali di cantiere', 'Altro'],
    // Costi fissi del cantiere: non dipendono da quanto si produce (allestimento, sicurezza, baracche, guardiania).
    // Tutte le altre voci sono costi variabili.
    COSTI_FISSI_CANTIERE: ['Spese generali di cantiere'],
    CATEGORIE_FISSI_AZIENDA: ['Personale d\'ufficio', 'Sede e utenze', 'Assicurazioni', 'Consulenze', 'Mezzi e auto aziendali', 'Ammortamenti e leasing', 'Certificazioni (SOA, ISO)', 'Altro'],
    STATI_CANTIERE: ['in preparazione', 'aperto', 'sospeso', 'chiuso'],
    METEO: ['Sereno', 'Nuvoloso', 'Pioggia', 'Vento forte', 'Nebbia', 'Neve'],
    CATEGORIE_DOC: ['Foto', 'Contratto', 'Verbale', 'POS e sicurezza', 'Disegni', 'DDT', 'Certificati', 'Corrispondenza', 'Altro'],

    RIF: {
      cliente: { tab: 'anagrafiche', q: { in: { tipo: ['cliente', 'ente'] }, eq: { attivo: true }, ordina: 'ragione_sociale' }, etichetta: r => r.ragione_sociale },
      fornitore: { tab: 'anagrafiche', q: { in: { tipo: ['fornitore', 'subappaltatore'] }, eq: { attivo: true }, ordina: 'ragione_sociale' }, etichetta: r => r.ragione_sociale },
      anagrafica: { tab: 'anagrafiche', q: { eq: { attivo: true }, ordina: 'ragione_sociale' }, etichetta: r => `${r.ragione_sociale} (${r.tipo})` },
      cantiere: { tab: 'cantieri', q: { ordina: 'nome' }, etichetta: r => (r.codice ? r.codice + ' – ' : '') + r.nome + (r.stato === 'chiuso' ? ' (chiuso)' : '') },
      cantiereAperto: { tab: 'cantieri', q: { eq: { stato: 'aperto' }, ordina: 'nome' }, etichetta: r => (r.codice ? r.codice + ' – ' : '') + r.nome },
      lavoratore: { tab: 'lavoratori', q: { eq: { attivo: true }, ordina: 'cognome,nome' }, etichetta: r => `${r.cognome} ${r.nome}` },
      mezzo: { tab: 'mezzi', q: { eq: { attivo: true }, ordina: 'nome' }, etichetta: r => r.nome + (r.targa ? ` (${r.targa})` : '') },
      conto: { tab: 'conti', q: { eq: { attivo: true }, ordina: 'nome' }, etichetta: r => r.nome },
      utente: { tab: 'profili', q: { eq: { attivo: true }, ordina: 'nome' }, etichetta: r => r.nome || r.email }
    },

    statoCantiere: s => `<span class="stato ${{ aperto: 'verde', sospeso: 'giallo', chiuso: 'grigio', 'in preparazione': 'nero' }[s] || ''}">${esc(s)}</span>`,

    // Stato di una scadenza rispetto a oggi
    statoScadenza(data, preavviso = 30, completata = false) {
      if (completata) return { classe: 'grigio', testo: 'fatta', ordine: 3 };
      if (!data) return { classe: 'grigio', testo: '—', ordine: 4 };
      const g = fmt.giorniTra(fmt.oggi(), data);
      if (g < 0) return { classe: 'rosso', testo: `scaduta da ${-g} gg`, ordine: 0 };
      if (g <= preavviso) return { classe: 'giallo', testo: g === 0 ? 'scade oggi' : `tra ${g} gg`, ordine: 1 };
      return { classe: 'verde', testo: 'in regola', ordine: 2 };
    },

    // Testata di pagina: percorso, titolo, pulsanti
    testata(titolo, { sopra = '', azioni = '' } = {}) {
      return `<div class="testata"><div>${sopra ? `<div class="sopra">${sopra}</div>` : ''}<h1>${esc(titolo)}</h1></div><div class="azioni non-stampare">${azioni}</div></div>`;
    },

    // Intestazione per le stampe (preventivi, giornale dei lavori)
    intestazioneStampa(titoloDoc, destra = '') {
      return `<div class="intestazione-stampa"><div><div class="marchio"><i aria-hidden="true"></i>${esc(AZ.ragione_sociale || 'EUROWORK s.r.l.')}</div>
        <div class="nota" style="margin-top:6px">${esc(AZ.indirizzo || '')}${AZ.piva ? ' – P.IVA ' + esc(AZ.piva) : ''}<br>${esc([AZ.telefono, AZ.email, AZ.pec].filter(Boolean).join(' – '))}</div></div>
        <small><b style="font-size:1.1rem">${esc(titoloDoc)}</b><br>${destra}</small></div>`;
    },

    // Schede (tab) dentro una pagina; restituisce l'elemento del contenuto
    schede(el, voci, scelta, quandoCambia) {
      el.innerHTML = `<div class="schede non-stampare" role="tablist">${voci.map(([k, l]) => `<button role="tab" data-k="${k}" aria-selected="${k === scelta}">${esc(l)}</button>`).join('')}</div><div class="corpo-scheda"></div>`;
      let corpo = el.querySelector('.corpo-scheda');
      // ogni scheda riceve un contenitore nuovo, così non restano attivi i comandi della scheda precedente
      const nuovoCorpo = () => { const n = document.createElement('div'); n.className = 'corpo-scheda'; corpo.replaceWith(n); corpo = n; return n; };
      el.querySelector('.schede').addEventListener('click', e => {
        const b = e.target.closest('button[data-k]'); if (!b) return;
        el.querySelectorAll('.schede button').forEach(x => x.setAttribute('aria-selected', x === b));
        try { sessionStorage.setItem('scheda-' + voci.map(v => v[0]).join(), b.dataset.k); } catch {}
        quandoCambia(b.dataset.k, nuovoCorpo());
      });
      let ricordata = null; try { ricordata = sessionStorage.getItem('scheda-' + voci.map(v => v[0]).join()); } catch {}
      if (!scelta && ricordata && voci.some(v => v[0] === ricordata)) {
        scelta = ricordata; el.querySelectorAll('.schede button').forEach(x => x.setAttribute('aria-selected', x.dataset.k === scelta));
      }
      quandoCambia(scelta || voci[0][0], corpo);
      if (!scelta) el.querySelector('.schede button').setAttribute('aria-selected', 'true');
      return corpo;
    }
  };
})();
