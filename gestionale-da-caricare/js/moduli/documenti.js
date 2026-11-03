// Archivio documenti e foto: per cantiere, lavoratore, mezzo, cliente/fornitore o azienda.
(function () {
  const { $, esc, fmt, avviso, errore, conferma } = ui;
  const peso = b => b > 1e6 ? (b / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' kB';

  // filtro: { cantiere_id } | { lavoratore_id } | { mezzo_id } | { anagrafica_id } oppure niente (tutto)
  App.archivio = function (el, filtro = {}) {
    const fisso = Object.keys(filtro).length > 0;
    el.classList.add('pannello');
    el.innerHTML = `<div class="barra-elenco non-stampare">
        <div class="cerca"><label for="d-cerca">Cerca</label><input id="d-cerca" type="search" autocomplete="off"></div>
        <div class="filtro"><label for="d-cat">Categoria</label><select id="d-cat"><option value="">Tutte</option>${App.CATEGORIE_DOC.map(c => `<option>${c}</option>`).join('')}</select></div>
        ${!fisso && App.admin ? `<div class="filtro"><label for="d-amb">Riguarda</label><select id="d-amb"><option value="">Tutto</option><option value="cantiere_id">Cantieri</option><option value="lavoratore_id">Personale</option><option value="mezzo_id">Mezzi</option><option value="anagrafica_id">Clienti e fornitori</option><option value="azienda">Azienda</option></select></div>` : ''}
        <div class="azioni" style="margin-left:auto"><button class="btn rosso" id="d-carica">Carica file</button></div>
      </div><div class="conteggio-righe" id="d-conta"></div><div class="scorri"><table class="tabella" id="d-tab"></table></div>`;
    let righe = [];
    async function carica() {
      const q = { sel: '*,cantiere:cantieri(nome),lavoratore:lavoratori(cognome,nome),mezzo:mezzi(nome),anagrafica:anagrafiche(ragione_sociale)', eq: { ...filtro }, ordina: 'creato_il.desc', limite: 500 };
      if (!App.admin) q.sel = '*,cantiere:cantieri(nome)';
      const cat = $('#d-cat', el).value; if (cat) q.eq.categoria = cat;
      const amb = $('#d-amb', el) ? $('#d-amb', el).value : '';
      if (amb === 'azienda') q.nullo = { cantiere_id: true, lavoratore_id: true, mezzo_id: true, anagrafica_id: true };
      else if (amb) q.nullo = { [amb]: false };
      const t = $('#d-cerca', el).value.trim(); if (t) q.cerca = { titolo: t };
      try { righe = await db.lista('documenti', q); disegna(); } catch (e) { errore(e); }
    }
    const rif = r => r.cantiere ? 'Cantiere: ' + r.cantiere.nome : r.lavoratore ? `${r.lavoratore.cognome} ${r.lavoratore.nome}` : r.mezzo ? r.mezzo.nome : r.anagrafica ? r.anagrafica.ragione_sociale : 'Azienda';
    function disegna() {
      $('#d-conta', el).textContent = righe.length === 1 ? '1 file' : `${righe.length} file`;
      $('#d-tab', el).innerHTML = righe.length ? `<thead><tr><th>Titolo</th><th>Categoria</th>${fisso ? '' : '<th>Riguarda</th>'}<th>Caricato il</th><th class="num">Peso</th><th></th></tr></thead><tbody>${righe.map((r, i) => `<tr>
        <td><b>${esc(r.titolo)}</b><br><span class="nota">${esc(r.nome_file)}</span></td><td>${esc(r.categoria)}</td>${fisso ? '' : `<td>${esc(rif(r))}</td>`}
        <td>${fmt.data(r.creato_il)}</td><td class="num">${peso(r.dimensione)}</td>
        <td class="azioni"><button class="btn vuoto piccolo" data-apri="${i}">Apri</button>${App.admin ? `<button class="btn testo piccolo" data-elimina="${i}">Elimina</button>` : ''}</td></tr>`).join('')}</tbody>`
        : '<tbody><tr><td class="vuota">Nessun file. Premi "Carica file" per aggiungerne uno.</td></tr></tbody>';
    }
    let attesa;
    $('#d-cerca', el).addEventListener('input', () => { clearTimeout(attesa); attesa = setTimeout(carica, 250); });
    $('#d-cat', el).addEventListener('change', carica);
    $('#d-amb', el) && $('#d-amb', el).addEventListener('change', carica);
    $('#d-tab', el).addEventListener('click', async e => {
      const a = e.target.closest('[data-apri]'), d = e.target.closest('[data-elimina]');
      if (a) { const w = window.open('', '_blank'); try { const u = await db.linkFile(righe[a.dataset.apri].percorso); if (w) w.location = u; else location.href = u; } catch (err) { w && w.close(); errore(err); } }
      if (d) {
        const r = righe[d.dataset.elimina];
        if (!await conferma(`Eliminare "${r.titolo}"? Il file viene cancellato.`, { si: 'Elimina', pericolo: true })) return;
        try { await db.eliminaFile(r.percorso); await db.elimina('documenti', r.id); avviso('File eliminato'); carica(); } catch (err) { errore(err); }
      }
    });
    $('#d-carica', el).onclick = () => finestraCarica(filtro, carica);
    carica();
  };

  async function finestraCarica(filtro, dopo) {
    const fisso = Object.keys(filtro)[0];
    const scelte = App.admin ? [['cantiere_id', 'Un cantiere'], ['lavoratore_id', 'Un lavoratore'], ['mezzo_id', 'Un mezzo'], ['anagrafica_id', 'Un cliente o fornitore'], ['azienda', 'L\'azienda']] : [['cantiere_id', 'Un cantiere']];
    const rifPer = { cantiere_id: App.admin ? App.RIF.cantiere : App.RIF.cantiereAperto, lavoratore_id: App.RIF.lavoratore, mezzo_id: App.RIF.mezzo, anagrafica_id: App.RIF.anagrafica };
    const sel = {};
    if (!fisso) for (const [k] of scelte) if (rifPer[k]) sel[k] = await ui.campoHtml({ k, label: 'Quale', tipo: 'rif', rif: rifPer[k] }, null);
    const w = ui.finestra(`<h2>Carica file</h2><form novalidate><div class="campi">
        <div class="largo"><label for="u-file">File (anche più di uno) *</label><input id="u-file" type="file" multiple required></div>
        <div class="largo"><label for="u-titolo">Titolo</label><input id="u-titolo" placeholder="Se lo lasci vuoto si usa il nome del file"></div>
        <div><label for="u-cat">Categoria</label><select id="u-cat">${App.CATEGORIE_DOC.map(c => `<option>${c}</option>`).join('')}</select></div>
        ${fisso ? '' : `<div><label for="u-amb">Riguarda</label><select id="u-amb">${scelte.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          ${Object.entries(sel).map(([k, h]) => `<div class="largo" data-per="${k}">${h}</div>`).join('')}`}
      </div><p class="errore" role="alert" hidden></p><div class="azioni"><button type="button" class="btn vuoto" data-no>Annulla</button><button class="btn rosso" type="submit">Carica</button></div></form>`, { chiudiFuori: false });
    const f = w.el.querySelector('form'), msg = w.el.querySelector('.errore');
    const amb = f.querySelector('#u-amb');
    const mostra = () => { if (amb) f.querySelectorAll('[data-per]').forEach(d => d.hidden = d.dataset.per !== amb.value); };
    amb && amb.addEventListener('change', mostra); mostra();
    w.el.querySelector('[data-no]').onclick = w.chiudi;
    f.onsubmit = async e => {
      e.preventDefault(); msg.hidden = true;
      const files = [...f.querySelector('#u-file').files];
      if (!files.length) { msg.hidden = false; msg.textContent = 'Scegli almeno un file.'; return; }
      let chiave = fisso, id = fisso ? filtro[fisso] : null;
      if (!fisso && amb.value !== 'azienda') { chiave = amb.value; id = Number(f.querySelector(`[data-per="${chiave}"] select`).value); if (!id) { msg.hidden = false; msg.textContent = 'Scegli a cosa si riferisce il file.'; return; } }
      if (!fisso && amb.value === 'azienda') chiave = null;
      const cartella = { cantiere_id: 'cantieri', lavoratore_id: 'personale', mezzo_id: 'mezzi', anagrafica_id: 'anagrafiche' }[chiave] || 'azienda';
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try {
        for (const [i, f0] of files.entries()) {
          btn.textContent = `Carico ${i + 1} di ${files.length}…`;
          const file = await ui.comprimi(f0);
          const percorso = `${cartella}/${id ? id + '/' : ''}${Date.now()}-${ui.nomeSicuro(file.name)}`;
          await db.caricaFile(percorso, file);
          const titolo = f.querySelector('#u-titolo').value.trim();
          await db.inserisci('documenti', {
            titolo: titolo ? (files.length > 1 ? `${titolo} (${i + 1})` : titolo) : f0.name.replace(/\.\w+$/, ''),
            categoria: f.querySelector('#u-cat').value, percorso, nome_file: f0.name, dimensione: file.size, tipo_mime: file.type || '',
            ...(chiave ? { [chiave]: id } : {}), ...(f.querySelector('#u-cat').value === 'Foto' ? { giorno: fmt.oggi() } : {})
          });
        }
        w.chiudi(); avviso(files.length === 1 ? 'File caricato' : `${files.length} file caricati`); dopo();
      } catch (err) { msg.hidden = false; msg.textContent = err.message; btn.disabled = false; btn.textContent = 'Carica'; }
    };
  }

  ui.pagina('documenti', async el => {
    el.innerHTML = App.testata(App.admin ? 'Documenti' : 'Foto e documenti') + (App.admin ? '' : '<p class="nota" style="margin:-10px 0 16px">Qui vedi e carichi i file dei cantieri. Le foto della giornata puoi caricarle anche dal Giornale lavori.</p>') + '<div id="arch"></div>';
    App.archivio($('#arch', el));
  });
})();
