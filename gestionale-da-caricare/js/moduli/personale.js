// Personale e mezzi: anagrafiche con costo orario, scadenze collegate.
(function () {
  const { $, esc, fmt } = ui;

  ui.pagina('personale', async el => {
    el.innerHTML = App.testata('Personale') + '<div id="schede-pers"></div>';
    App.schede($('#schede-pers', el), [['lavoratori', 'Lavoratori'], ['scadenze', 'Scadenze del personale']], null, (k, corpo) => {
      if (k === 'scadenze') return App.elencoScadenze(corpo, { ambito: 'personale' });
      corpo.innerHTML = '<div id="el-lav"></div>';
      ui.elenco($('#el-lav', corpo), {
        tabella: 'lavoratori', esporta: 'Personale', nuovo: 'Nuovo lavoratore', ordina: 'cognome,nome',
        cerca: ['cognome', 'nome', 'qualifica', 'codice_fiscale'],
        filtri: [{ k: 'attivo', label: 'Stato', predef: 'true', opzioni: [['true', 'In forza'], ['false', 'Non più in forza'], ['', 'Tutti']] }],
        campi: [
          { k: 'cognome', label: 'Cognome', richiesto: true }, { k: 'nome', label: 'Nome', richiesto: true },
          { k: 'qualifica', label: 'Qualifica', aiuto: 'es. operaio specializzato, autista' },
          { k: 'codice_fiscale', label: 'Codice fiscale' },
          { k: 'telefono', label: 'Telefono', tipo: 'tel' },
          { k: 'data_assunzione', label: 'Data di assunzione', tipo: 'data' },
          { k: 'tipo_contratto', label: 'Contratto', tipo: 'select', opzioni: ['Tempo indeterminato', 'Tempo determinato', 'Apprendistato', 'Stagionale', 'Somministrato', 'Altro'] },
          { k: 'costo_orario', label: 'Costo orario aziendale', tipo: 'euro', aiuto: 'Serve per calcolare il costo della manodopera sui cantieri' },
          { k: 'attivo', label: 'In forza (compare nelle presenze)', tipo: 'bool', largo: true },
          { k: 'note', label: 'Note', tipo: 'area' }
        ],
        predefiniti: { attivo: true },
        eliminabile: true,
        colonne: [
          { k: 'cognome', t: 'Cognome e nome', f: r => `<b>${esc(r.cognome)} ${esc(r.nome)}</b>` },
          { k: 'qualifica', t: 'Qualifica' }, { k: 'tipo_contratto', t: 'Contratto' },
          { k: 'data_assunzione', t: 'Assunto il', f: r => fmt.data(r.data_assunzione) },
          { k: 'telefono', t: 'Telefono' },
          { k: 'costo_orario', t: 'Costo orario', num: true, f: r => Number(r.costo_orario) ? fmt.euro(r.costo_orario) : '<span class="stato giallo">da inserire</span>', x: r => Number(r.costo_orario) }
        ],
        classeRiga: r => r.attivo ? '' : 'spento'
      });
    });
  });

  ui.pagina('mezzi', async el => {
    el.innerHTML = App.testata('Mezzi e attrezzature') + '<div id="schede-mezzi"></div>';
    App.schede($('#schede-mezzi', el), [['elenco', 'Elenco'], ['scadenze', 'Revisioni e assicurazioni']], null, (k, corpo) => {
      if (k === 'scadenze') return App.elencoScadenze(corpo, { ambito: 'mezzi' });
      corpo.innerHTML = '<div id="el-mezzi"></div>';
      ui.elenco($('#el-mezzi', corpo), {
        tabella: 'mezzi', esporta: 'Mezzi', nuovo: 'Nuovo mezzo', ordina: 'tipo,nome', cerca: ['nome', 'targa'],
        filtri: [
          { k: 'tipo', label: 'Tipo', opzioni: [['', 'Tutti'], ['mezzo', 'Mezzi'], ['attrezzatura', 'Attrezzature']] },
          { k: 'attivo', label: 'Stato', predef: 'true', opzioni: [['true', 'In uso'], ['false', 'Dismessi'], ['', 'Tutti']] }
        ],
        campi: [
          { k: 'nome', label: 'Nome', richiesto: true, aiuto: 'es. Battipalo Orteco, Autocarro Iveco' },
          { k: 'tipo', label: 'Tipo', tipo: 'select', opzioni: [['mezzo', 'Mezzo'], ['attrezzatura', 'Attrezzatura']], richiesto: true },
          { k: 'targa', label: 'Targa o matricola' },
          { k: 'costo_orario', label: 'Costo orario', tipo: 'euro', aiuto: 'Carburante, ammortamento, manutenzione: serve per il costo sui cantieri' },
          { k: 'attivo', label: 'In uso', tipo: 'bool' },
          { k: 'note', label: 'Note', tipo: 'area' }
        ],
        predefiniti: { tipo: 'mezzo', attivo: true },
        colonne: [
          { k: 'nome', t: 'Nome', f: r => `<b>${esc(r.nome)}</b>` }, { k: 'tipo', t: 'Tipo' }, { k: 'targa', t: 'Targa / matricola' },
          { k: 'costo_orario', t: 'Costo orario', num: true, f: r => Number(r.costo_orario) ? fmt.euro(r.costo_orario) : '<span class="stato giallo">da inserire</span>', x: r => Number(r.costo_orario) }
        ],
        classeRiga: r => r.attivo ? '' : 'spento'
      });
    });
  });
})();
