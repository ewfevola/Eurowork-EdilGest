// Clienti, fornitori, subappaltatori, enti. E gestione degli utenti dell'app.
(function () {
  const { $, esc, fmt, avviso, errore } = ui;
  const TIPI = [['cliente', 'Cliente'], ['ente', 'Ente pubblico'], ['fornitore', 'Fornitore'], ['subappaltatore', 'Subappaltatore']];

  ui.pagina('anagrafiche', async el => {
    el.innerHTML = App.testata('Clienti e fornitori') + '<div id="el-anag"></div>';
    ui.elenco($('#el-anag', el), {
      tabella: 'anagrafiche', esporta: 'Clienti e fornitori', nuovo: 'Nuovo', ordina: 'ragione_sociale',
      cerca: ['ragione_sociale', 'piva', 'comune', 'referente'],
      filtri: [
        { k: 'tipo', label: 'Tipo', opzioni: [['', 'Tutti'], ...TIPI] },
        { k: 'attivo', label: 'Stato', predef: 'true', opzioni: [['true', 'Attivi'], ['false', 'Archiviati'], ['', 'Tutti']] }
      ],
      campi: [
        { k: 'ragione_sociale', label: 'Ragione sociale', richiesto: true, largo: true },
        { k: 'tipo', label: 'Tipo', tipo: 'select', opzioni: TIPI, richiesto: true },
        { k: 'piva', label: 'Partita IVA' }, { k: 'codice_fiscale', label: 'Codice fiscale' },
        { k: 'referente', label: 'Referente' },
        { k: 'indirizzo', label: 'Indirizzo', largo: true }, { k: 'comune', label: 'Comune' }, { k: 'provincia', label: 'Provincia' },
        { k: 'telefono', label: 'Telefono', tipo: 'tel' }, { k: 'email', label: 'Email', tipo: 'email' }, { k: 'pec', label: 'PEC', tipo: 'email' },
        { k: 'attivo', label: 'Attivo (compare negli elenchi)', tipo: 'bool' },
        { k: 'note', label: 'Note', tipo: 'area' }
      ],
      predefiniti: { tipo: 'cliente', attivo: true },
      dopoSalva: () => ui.dimentica('anagrafiche'),
      colonne: [
        { k: 'ragione_sociale', t: 'Ragione sociale', f: r => `<b>${esc(r.ragione_sociale)}</b>` },
        { k: 'tipo', t: 'Tipo', f: r => esc((TIPI.find(t => t[0] === r.tipo) || [, r.tipo])[1]) },
        { k: 'piva', t: 'P.IVA' }, { k: 'comune', t: 'Comune' }, { k: 'telefono', t: 'Telefono' }, { k: 'email', t: 'Email' }
      ],
      classeRiga: r => r.attivo ? '' : 'spento'
    });
  });

  ui.pagina('utenti', async el => {
    el.innerHTML = App.testata('Utenti') + `<p class="nota" style="margin:-10px 0 20px;max-width:70ch">Per aggiungere una persona: in Supabase apri Authentication → Users → Add user, con la sua email e una password. Comparirà qui come <b>bloccato</b>: scrivi il nome, scegli il ruolo, mettilo su attivo e salva.</p>
      <div class="scorri pannello"><table class="tabella" id="u-tab"></table></div>`;
    async function disegna() {
      const p = await db.lista('profili', { ordina: 'attivo.desc,nome' });
      $('#u-tab', el).innerHTML = `<thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Stato</th><th></th></tr></thead><tbody>${p.map(u => {
        const io = u.id === App.profilo.id;
        return `<tr data-id="${u.id}" class="${u.attivo ? '' : 'spento'}">
          <td><input data-c="nome" value="${esc(u.nome)}" aria-label="Nome di ${esc(u.email)}"></td><td>${esc(u.email)}</td>
          <td><select data-c="ruolo" aria-label="Ruolo" ${io ? 'disabled' : ''}><option value="capocantiere" ${u.ruolo === 'capocantiere' ? 'selected' : ''}>Capocantiere</option><option value="admin" ${u.ruolo === 'admin' ? 'selected' : ''}>Ufficio (vede tutto)</option></select></td>
          <td><select data-c="attivo" aria-label="Stato" ${io ? 'disabled' : ''}><option value="true" ${u.attivo ? 'selected' : ''}>attivo</option><option value="false" ${u.attivo ? '' : 'selected'}>bloccato</option></select></td>
          <td><button class="btn piccolo" data-salva>Salva</button></td></tr>`;
      }).join('')}</tbody>`;
    }
    $('#u-tab', el).addEventListener('click', async e => {
      if (!e.target.closest('[data-salva]')) return;
      const tr = e.target.closest('tr'), v = c => tr.querySelector(`[data-c=${c}]`).value;
      try { await db.aggiorna('profili', tr.dataset.id, { nome: v('nome').trim(), ruolo: v('ruolo'), attivo: v('attivo') === 'true' }); ui.dimentica('profili'); avviso('Utente salvato'); disegna(); }
      catch (err) { errore(err); }
    });
    disegna();
  });
})();
