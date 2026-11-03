// Avvio: accesso, menu in base al ruolo, navigazione tra le pagine.
(function () {
  const { $, esc } = ui;

  const ICONE = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    cantieri: '<path d="M2 20h20M5 20V9l7-5 7 5v11"/><path d="M9 20v-6h6v6"/>',
    presenze: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    giornale: '<path d="M5 3h11l3 3v15H5z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
    personale: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.2 2.5 3.5 5.4"/>',
    mezzi: '<path d="M2 17V9h11v8M13 12h5l3 3v2h-8"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
    scadenze: '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/>',
    preventivi: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    contabilita: '<rect x="3" y="6" width="18" height="13"/><path d="M3 10h18M7 15h4"/>',
    anagrafiche: '<rect x="3" y="4" width="18" height="16"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17c.6-2 1.8-3 3.5-3s2.9 1 3.5 3M15 9h3M15 13h3"/>',
    documenti: '<path d="M3 6h7l2 2h9v12H3z"/>',
    costifissi: '<path d="M4 20V10l8-6 8 6v10z"/><path d="M9 14h6M9 17h6"/>',
    utenti: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'
  };

  const MENU_UFFICIO = [
    [null, [['home', 'Home'], ['cantieri', 'Cantieri'], ['presenze', 'Presenze'], ['giornale', 'Giornale lavori']]],
    ['Persone e mezzi', [['personale', 'Personale'], ['mezzi', 'Mezzi e attrezzature'], ['scadenze', 'Scadenze']]],
    ['Amministrazione', [['preventivi', 'Preventivi'], ['contabilita', 'Contabilità'], ['costifissi', 'Costi fissi aziendali'], ['anagrafiche', 'Clienti e fornitori']]],
    ['Archivio', [['documenti', 'Documenti'], ['utenti', 'Utenti']]]
  ];
  const MENU_CAPO = [[null, [['presenze', 'Presenze'], ['giornale', 'Giornale lavori'], ['documenti', 'Foto e documenti']]]];
  // Le pagine di dettaglio accendono la voce del loro elenco.
  const PADRE = { cantiere: 'cantieri', preventivo: 'preventivi' };

  function disegnaMenu() {
    const menu = App.admin ? MENU_UFFICIO : MENU_CAPO;
    $('#menu-voci').innerHTML = menu.map(([gruppo, voci]) =>
      (gruppo ? `<li class="gruppo">${esc(gruppo)}</li>` : '') +
      voci.map(([k, l]) => `<li><a href="#${k}" data-voce="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONE[k]}</svg>${esc(l)}</a></li>`).join('')
    ).join('');
  }

  const PERMESSE_CAPO = ['presenze', 'giornale', 'documenti'];
  async function mostraPagina() {
    let { nome, id } = ui.letturaHash();
    if (!nome || !ui.pagine[nome] || (!App.admin && !PERMESSE_CAPO.includes(nome))) {
      nome = App.admin ? 'home' : 'presenze'; id = null;
      history.replaceState(null, '', '#' + nome);
    }
    document.querySelectorAll('#menu-voci a').forEach(a => a.toggleAttribute('aria-current', a.dataset.voce === (PADRE[nome] || nome)));
    document.querySelectorAll('#menu-voci a[aria-current]').forEach(a => a.setAttribute('aria-current', 'page'));
    chiudiMenu();
    const el = $('#contenuto');
    el.innerHTML = '<p class="nota">Caricamento…</p>';
    window.scrollTo(0, 0);
    try { await ui.pagine[nome](el, id); }
    catch (e) { el.innerHTML = `<h1>Qualcosa non va</h1><p class="errore" style="margin-top:12px">${esc(e.message)}</p><p class="nota">Ricarica la pagina. Se il problema resta, controlla la connessione.</p>`; console.error(e); }
  }

  function chiudiMenu() { $('#laterale').classList.remove('aperta'); $('#apri-menu').setAttribute('aria-expanded', 'false'); }
  $('#apri-menu').addEventListener('click', e => {
    e.stopPropagation();
    const ap = $('#laterale').classList.toggle('aperta'); $('#apri-menu').setAttribute('aria-expanded', ap);
  });
  document.addEventListener('click', e => { if ($('#laterale').classList.contains('aperta') && !e.target.closest('#laterale')) chiudiMenu(); });

  function mostraAccesso(msg) {
    $('#vista-app').hidden = true; $('#vista-accesso').hidden = false;
    $('#errore-accesso').hidden = !msg; $('#errore-accesso').textContent = msg || '';
  }

  async function avvia() {
    if (!db.configurato) { $('#vista-config').hidden = false; return; }
    if (!db.collegato) return mostraAccesso();
    let p;
    try { p = (await db.lista('profili', { eq: { id: db.utente.id }, limite: 1 }))[0]; }
    catch (e) { if (!db.collegato) return mostraAccesso(e.message); return mostraAccesso(e.message); }
    if (!p || !p.attivo) { await db.esci(); return mostraAccesso('Il tuo utente non è ancora attivo. Chiedi all\'ufficio di attivarlo.'); }
    App.profilo = p;
    $('#vista-accesso').hidden = true; $('#vista-app').hidden = false;
    $('#nome-utente').textContent = p.nome || p.email;
    $('#ruolo-utente').textContent = p.ruolo === 'admin' ? 'Ufficio' : 'Capocantiere';
    disegnaMenu();
    mostraPagina();
  }

  $('#form-accesso').addEventListener('submit', async e => {
    e.preventDefault();
    const b = e.submitter || $('#form-accesso button'); b.disabled = true;
    try { await db.accedi($('#email').value.trim(), $('#password').value); $('#password').value = ''; await avvia(); }
    catch (err) { mostraAccesso(err.message); }
    finally { b.disabled = false; }
  });
  // Aspetto: chiaro, scuro o automatico (segue il computer). Rimane salvato su questo dispositivo.
  function applicaTema(t) {
    if (t) document.documentElement.dataset.tema = t; else delete document.documentElement.dataset.tema;
    try { t ? localStorage.setItem('tema', t) : localStorage.removeItem('tema'); } catch {}
    document.querySelectorAll('.tema button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tema === (t || '')));
  }
  let temaSalvato = ''; try { temaSalvato = localStorage.getItem('tema') || ''; } catch {}
  applicaTema(temaSalvato);
  document.querySelector('.tema').addEventListener('click', e => { const b = e.target.closest('button[data-tema]'); if (b) applicaTema(b.dataset.tema); });

  $('#esci').addEventListener('click', async () => { await db.esci(); location.hash = ''; location.reload(); });
  window.addEventListener('hashchange', () => { if (App.profilo) mostraPagina(); });
  window.addEventListener('sessione-scaduta', () => mostraAccesso('Sessione scaduta: accedi di nuovo.'));

  avvia();
})();
