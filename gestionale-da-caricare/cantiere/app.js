// EUROWORK – App di cantiere.
// Usa lo stesso database del gestionale EdilGest (tabelle cantieri, lavoratori,
// timbrature, ore_mezzi, giornale, documenti): quello che il capocantiere
// registra qui compare subito in ufficio, nelle sezioni Presenze, Giornale dei lavori e Documenti.
(function () {
  'use strict';

  // ---------- Strumenti ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const app = () => $('#app');

  const FUSO = 'Europe/Rome';
  const fmt = {
    oggi: () => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date()),
    piuGiorni(d, n) { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); },
    dataLunga: d => new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
    data: d => new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }),
    ora: v => new Date(v).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: FUSO }),
    ore: n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('it-IT'),
    euro: n => (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }),
    maiuscola: s => s.charAt(0).toUpperCase() + s.slice(1)
  };
  const leggiNumero = s => { const n = Number(String(s || '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isFinite(n) ? n : NaN; };
  const nomeSicuro = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);

  // Riduce le foto prima di caricarle (meno attesa con poco campo).
  async function comprimi(file, lato = 1800) {
    if (!/^image\/(jpeg|png|webp|heic)/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const s = Math.min(1, lato / Math.max(bmp.width, bmp.height));
      if (s === 1 && file.size < 900e3) return file;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .82));
      return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
    } catch { return file; }
  }

  const memo = {
    leggi(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    scrivi(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  // ---------- Avvisi e finestre ----------
  function avviso(testo, { errore = false, annulla = null, durata } = {}) {
    const el = document.createElement('div');
    el.className = 'avviso' + (errore ? ' errore' : '');
    el.innerHTML = `<span>${esc(testo)}</span>${annulla ? '<button type="button">Annulla</button>' : ''}`;
    $('#avvisi').append(el);
    const via = () => el.remove();
    if (annulla) el.querySelector('button').onclick = () => { via(); annulla(); };
    setTimeout(via, durata || (annulla ? 7000 : errore ? 6000 : 3000));
  }
  const errore = e => avviso((e && e.message) || String(e), { errore: true });

  function foglio(html) {
    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = `<div class="foglio" role="dialog" aria-modal="true">${html}</div>`;
    document.body.append(velo);
    const chiudi = () => velo.remove();
    velo.addEventListener('click', e => { if (e.target === velo) chiudi(); });
    const primo = velo.querySelector('button, input, select'); if (primo) primo.focus();
    return { el: velo.firstElementChild, chiudi };
  }
  function conferma(testo, si = 'Conferma') {
    return new Promise(ok => {
      const f = foglio(`<h2>${esc(testo)}</h2><button class="btn rosso grande" data-si>${esc(si)}</button><button class="btn vuoto grande" data-no>Annulla</button>`);
      $('[data-si]', f.el).onclick = () => { f.chiudi(); ok(true); };
      $('[data-no]', f.el).onclick = () => { f.chiudi(); ok(false); };
    });
  }

  // ---------- Icone ----------
  const svg = (d, n = 30) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONE = {
    presenze: '<circle cx="9" cy="7" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 11-4.7"/><circle cx="17.5" cy="16.5" r="4"/><path d="M17.5 14.5v2l1.3 1.2"/>',
    mezzi: '<rect x="2" y="12" width="13" height="5" rx="1"/><path d="M5 12V8h5l2 4"/><path d="M15 14l4-6 3 1-2 5"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    meteo: '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1"/><path d="M7 20h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.5A3.3 3.3 0 0 0 7 20z"/>',
    lavorazioni: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    materiali: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5"/><path d="M12 12v10"/>',
    foto: '<path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
    documenti: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    spese: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
    note: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    cantiere: '<path d="M3 21h18"/><path d="M5 21v-4a7 7 0 0 1 14 0v4"/><path d="M12 10V7"/><path d="M9 7h6"/>',
    giu: '<path d="M6 9l6 6 6-6"/>',
    indietro: '<path d="M15 18l-6-6 6-6"/>',
    aggiorna: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'
  };

  const METEO = [['Sereno', '☀️'], ['Nuvoloso', '☁️'], ['Pioggia', '🌧️'], ['Vento forte', '💨'], ['Nebbia', '🌫️'], ['Neve', '❄️']];
  const CATEGORIE_DOC = ['DDT', 'Verbale', 'POS e sicurezza', 'Disegni', 'Certificati', 'Contratto', 'Corrispondenza', 'Altro'];
  const CAT_SPESE = 'Spese';

  // ---------- Stato dell'app ----------
  const S = {
    profilo: null, cantieri: [], lavoratori: [], mezzi: [],
    cantiereId: null, giorno: null,
    giornale: null, timb: [], oreMezzi: [], docs: [],
    offline: false
  };
  const cantiere = () => S.cantieri.find(c => c.id === S.cantiereId) || null;
  const oggi = () => fmt.oggi();
  const eOggi = () => S.giorno === oggi();
  const modificabile = () => S.giorno >= fmt.piuGiorni(oggi(), -3) && S.giorno <= oggi();
  const io = () => (S.profilo && S.profilo.id) || (db.utente && db.utente.id);

  // Legge dal database; se manca il campo usa l'ultima copia salvata sul telefono.
  async function conCopia(chiave, carica) {
    try {
      const v = await carica();
      memo.scrivi('copia:' + chiave, v);
      S.offline = false;
      return v;
    } catch (e) {
      if (e && e.codice === 'rete') {
        const v = memo.leggi('copia:' + chiave);
        if (v !== null) { S.offline = true; return v; }
      }
      throw e;
    }
  }

  // ---------- Avvio ----------
  async function avvio() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
    window.addEventListener('online', () => { S.offline = false; aggiornaChip(); });
    window.addEventListener('offline', aggiornaChip);
    window.addEventListener('hashchange', disegna);
    window.addEventListener('sessione-scaduta', () => accesso('La sessione è scaduta: accedi di nuovo.'));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !S.profilo) return;
      if (S.giorno && S.giorno < oggi() && memo.leggi('giorno-auto', true)) S.giorno = oggi();
      ricarica(false);
    });
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installa = e; if (!location.hash) disegna(); });

    if (!db.configurato) { app().innerHTML = '<div class="accesso"><form><h1>App non configurata</h1><p>Inserisci indirizzo e chiave di Supabase nel file config.js.</p></form></div>'; return; }
    if (!db.collegato) return accesso();
    entra();
  }

  function accesso(messaggio) {
    S.profilo = null;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    app().innerHTML = `<div class="accesso"><form id="f-accesso" novalidate>
        <div class="marchio"><i>E</i>EUROWORK</div>
        <h1>App di cantiere</h1>
        <p>Accedi con lo stesso account del gestionale EdilGest.</p>
        ${messaggio ? `<p style="color:#FFD38A">${esc(messaggio)}</p>` : ''}
        <div class="campo"><label for="a-email">Email</label><input id="a-email" type="email" autocomplete="username" inputmode="email" required></div>
        <div class="campo"><label for="a-pw">Password</label><input id="a-pw" type="password" autocomplete="current-password" required></div>
        <button class="btn rosso grande" type="submit">Accedi</button>
        <p class="nota" style="color:#9A9A9A">Non hai un account? Chiedilo all'ufficio: viene creato e attivato dal gestionale.</p>
      </form></div>`;
    $('#f-accesso').addEventListener('submit', async e => {
      e.preventDefault();
      const b = $('button[type=submit]', e.target);
      const email = $('#a-email').value.trim(), pw = $('#a-pw').value;
      if (!email || !pw) return avviso('Scrivi email e password.', { errore: true });
      b.disabled = true; b.textContent = 'Accesso…';
      try { await db.accedi(email, pw); entra(); }
      catch (err) { errore(err); b.disabled = false; b.textContent = 'Accedi'; }
    });
  }

  async function entra() {
    app().innerHTML = '<div class="caricamento">Caricamento dei cantieri…</div>';
    try {
      const [p] = await conCopia('profilo', () => db.lista('profili', { eq: { id: db.utente.id }, limite: 1 }));
      if (!p || !p.attivo) {
        app().innerHTML = `<div class="accesso"><form><div class="marchio"><i>E</i>EUROWORK</div><h1>Account in attesa</h1>
          <p>Il tuo account esiste ma non è ancora stato attivato. Chiedi all'ufficio di attivarlo nel gestionale, sezione Utenti.</p>
          <button class="btn vuoto grande" type="button" id="b-esci">Esci</button></form></div>`;
        $('#b-esci').onclick = async () => { await db.esci(); accesso(); };
        return;
      }
      S.profilo = p;
      const [cantieri, lavoratori, mezzi] = await Promise.all([
        conCopia('cantieri', () => db.lista('cantieri', { sel: 'id,codice,nome,comune,indirizzo,responsabile_id,stato', eq: { stato: 'aperto' }, ordina: 'nome' })),
        conCopia('lavoratori', () => db.lista('lavoratori_base', { eq: { attivo: true }, ordina: 'cognome,nome' })),
        conCopia('mezzi', () => db.lista('mezzi_base', { eq: { attivo: true }, ordina: 'nome' }))
      ]);
      // I cantieri di cui sono responsabile vengono per primi.
      S.cantieri = [...cantieri].sort((a, b) => (b.responsabile_id === p.id) - (a.responsabile_id === p.id) || a.nome.localeCompare(b.nome));
      S.lavoratori = lavoratori; S.mezzi = mezzi;
      const salvato = Number(memo.leggi('cantiere'));
      S.cantiereId = (S.cantieri.find(c => c.id === salvato) || S.cantieri[0] || {}).id || null;
      S.giorno = oggi();
      await caricaGiornata();
      disegna();
    } catch (e) {
      if (e && e.codice === 'sessione') return;
      app().innerHTML = `<div class="accesso"><form><h1>Impossibile caricare</h1><p>${esc(e.message || e)}</p>
        <button class="btn rosso grande" type="button" id="b-riprova">Riprova</button><button class="btn vuoto grande" type="button" id="b-esci">Esci</button></form></div>`;
      $('#b-riprova').onclick = entra;
      $('#b-esci').onclick = async () => { await db.esci(); accesso(); };
    }
  }

  // Dati della giornata scelta, per il cantiere scelto.
  async function caricaGiornata() {
    if (!S.cantiereId) { S.giornale = null; S.timb = []; S.oreMezzi = []; S.docs = []; return; }
    const c = S.cantiereId, g = S.giorno, k = `${c}:${g}`;
    const [gior, timb, ore, docs] = await Promise.all([
      conCopia('giornale:' + k, () => db.lista('giornale', { eq: { cantiere_id: c, giorno: g }, limite: 1 })),
      conCopia('timb:' + g, () => db.lista('v_timbrature', { eq: { giorno: g, annullata: false }, ordina: 'ora' })),
      conCopia('ore:' + k, () => db.lista('ore_mezzi', { eq: { cantiere_id: c, giorno: g }, ordina: 'id' })),
      conCopia('docs:' + k, () => db.lista('documenti', { eq: { cantiere_id: c, giorno: g }, ordina: 'creato_il' }))
    ]);
    S.giornale = gior[0] || null; S.timb = timb; S.oreMezzi = ore; S.docs = docs;
  }
  async function ricarica(avvisa = true) {
    try { await caricaGiornata(); disegna(); if (avvisa) avviso(S.offline ? 'Senza rete: mostro gli ultimi dati salvati' : 'Dati aggiornati'); }
    catch (e) { errore(e); }
  }

  // ---------- Calcoli ----------
  const ultima = id => { const s = S.timb.filter(t => t.lavoratore_id === id); return s[s.length - 1] || null; };
  const dentroQui = () => S.lavoratori.filter(l => { const u = ultima(l.id); return u && u.tipo === 'entrata' && u.cantiere_id === S.cantiereId; });
  const timbQui = () => S.timb.filter(t => t.cantiere_id === S.cantiereId);
  const persone = () => new Set(timbQui().map(t => t.lavoratore_id)).size;
  const foto = () => S.docs.filter(d => d.categoria === 'Foto');
  const spese = () => S.docs.filter(d => d.categoria === CAT_SPESE);
  const altriDoc = () => S.docs.filter(d => d.categoria !== 'Foto' && d.categoria !== CAT_SPESE);
  const importoSpesa = d => { const m = /€\s*([\d.,]+)/.exec(d.titolo || ''); return m ? leggiNumero(m[1]) || 0 : 0; };
  const gv = campo => (S.giornale && S.giornale[campo]) || '';
  function turni() {
    const per = {};
    for (const t of timbQui()) (per[t.lavoratore_id] = per[t.lavoratore_id] || []).push(t);
    const out = [];
    for (const lista of Object.values(per)) {
      let aperta = null;
      for (const t of lista) {
        if (t.tipo === 'entrata') { if (aperta) out.push({ t: aperta, e: aperta.ora_locale }); aperta = t; }
        else { out.push({ t: aperta || t, e: aperta ? aperta.ora_locale : null, u: t.ora_locale, ore: aperta ? (new Date(t.ora) - new Date(aperta.ora)) / 36e5 : null }); aperta = null; }
      }
      if (aperta) out.push({ t: aperta, e: aperta.ora_locale, inCorso: true });
    }
    return out.map(x => ({ nome: `${x.t.cognome} ${x.t.nome}`, entrata: x.e, uscita: x.u, ore: x.ore, inCorso: x.inCorso }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  // ---------- Moduli della home ----------
  const MODULI = [
    { k: 'presenze', t: 'Presenze', s: () => { const n = persone(); return n ? { ok: true, x: `${n} ${n === 1 ? 'persona' : 'persone'} · ${dentroQui().length} dentro` } : { x: eOggi() ? 'Timbra entrate e uscite' : 'Nessuna' }; } },
    { k: 'mezzi', t: 'Mezzi e attrezzature', s: () => { const h = S.oreMezzi.reduce((a, o) => a + Number(o.ore), 0); return S.oreMezzi.length ? { ok: true, x: `${fmt.ore(h)} ore` } : { x: 'Ore di lavoro' }; } },
    { k: 'meteo', t: 'Meteo', s: () => gv('meteo') ? { ok: true, x: gv('meteo') } : { x: 'Da indicare' } },
    { k: 'lavorazioni', t: 'Lavorazioni', s: () => gv('lavorazioni') ? { ok: true, x: 'Compilate' } : { x: 'Cosa si è fatto' } },
    { k: 'materiali', t: 'Materiali', s: () => gv('materiali') ? { ok: true, x: 'Compilati' } : { x: 'Arrivati o usati' } },
    { k: 'foto', t: 'Foto', s: () => foto().length ? { ok: true, x: `${foto().length} foto` } : { x: 'Del cantiere' } },
    { k: 'documenti', t: 'DDT e documenti', s: () => altriDoc().length ? { ok: true, x: `${altriDoc().length} file` } : { x: 'Bolle, verbali' } },
    { k: 'spese', t: 'Spese', s: () => spese().length ? { ok: true, x: fmt.euro(spese().reduce((a, d) => a + importoSpesa(d), 0)) } : { x: 'Scontrini' } },
    { k: 'note', t: 'Note e problemi', s: () => gv('note') ? { ok: true, x: 'Scritte' } : { x: 'Visite, guasti' } }
  ];

  function disegna() {
    if (!S.profilo) return;
    const r = location.hash.slice(1);
    if (!S.cantiereId && r) { history.replaceState(null, '', location.pathname); return home(); }
    (PAGINE[r] || home)();
    window.scrollTo(0, 0);
  }

  function aggiornaChip() {
    const ch = $('#chip-rete'); if (!ch) return;
    const off = !navigator.onLine || S.offline;
    ch.className = 'chip-rete' + (off ? ' spento' : '');
    ch.textContent = off ? 'Senza rete' : 'Collegato';
  }

  function home() {
    const c = cantiere(), p = S.profilo;
    const nome = (p.nome || '').split(' ')[0];
    const iniziali = (p.nome || p.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
    const ora = new Date().toLocaleString('it-IT', { hour: 'numeric', hour12: false, timeZone: FUSO });
    const saluto = Number(ora) < 13 ? 'Buongiorno' : Number(ora) < 18 ? 'Buon pomeriggio' : 'Buonasera';
    const fatti = MODULI.filter(m => m.s().ok).length;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const mostraInstalla = !standalone && !memo.leggi('installa-chiuso') && (S.installa || ios);

    app().innerHTML = `
      <header class="testa">
        <div class="testa-riga">
          <div class="marchio"><i>E</i>EUROWORK</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span id="chip-rete" class="chip-rete">Collegato</span>
            <button class="tondo pieno" id="b-profilo" aria-label="Profilo e uscita">${esc(iniziali)}</button>
          </div>
        </div>
        <div class="saluto">
          <div><small>${saluto}${nome ? ', ' + esc(nome) : ''}</small>
            <button id="b-giorno" aria-label="Cambia giorno">${esc(fmt.maiuscola(fmt.dataLunga(S.giorno)))} ${svg(ICONE.giu, 20)}</button></div>
        </div>
      </header>
      <main class="contenuto">
        ${c ? `<button class="scheda-cantiere" id="b-cantiere" aria-label="Cambia cantiere">
          <span class="icona-tonda">${svg(ICONE.cantiere, 24)}</span>
          <span class="testi"><span class="etichetta">Cantiere${S.cantieri.length > 1 ? ' · tocca per cambiare' : ''}</span><b>${esc(c.nome)}</b>
            <span class="sotto">${esc([c.codice, c.comune].filter(Boolean).join(' · ') || ' ')}</span></span>
          ${S.cantieri.length > 1 ? svg(ICONE.giu, 20) : ''}</button>` :
          `<div class="scheda-cantiere"><span class="testi"><b>Nessun cantiere aperto</b><span class="sotto">Chiedi all'ufficio di aprirne uno nel gestionale.</span></span></div>`}
        ${S.giorno !== oggi() ? `<div class="banner">Stai compilando la giornata di ${esc(fmt.dataLunga(S.giorno))}.<button id="b-torna-oggi">Torna a oggi</button></div>` : ''}
        ${mostraInstalla ? `<div class="banner"><span>${S.installa ? 'Installa l\'app sul telefono per aprirla con un tocco.' : 'Per installarla: tocca <b>Condividi</b> e poi <b>Aggiungi alla schermata Home</b>.'}</span>
          ${S.installa ? '<button id="b-installa">Installa</button>' : ''}<button id="b-chiudi-installa" aria-label="Chiudi">✕</button></div>` : ''}
        ${c ? `<div class="titoletto"><h2>Rapportino del giorno</h2><span class="nota">${fatti} di ${MODULI.length} compilati</span></div>
        <div class="griglia">${MODULI.map(m => { const s = m.s(); return `<button class="tassello ${s.ok ? 'fatto' : ''}" data-vai="${m.k}">
          ${svg(ICONE[m.k])}<b>${esc(m.t)}</b><small>${esc(s.x)}</small></button>`; }).join('')}</div>
        <div class="azioni-home">
          <button class="btn rosso grande" data-vai="riepilogo">Riepilogo e invio all'ufficio</button>
          <button class="btn vuoto grande" id="b-aggiorna">${svg(ICONE.aggiorna, 20)} Aggiorna i dati</button>
        </div>` : ''}
      </main>`;
    aggiornaChip();
    $$('[data-vai]').forEach(b => b.onclick = () => { location.hash = b.dataset.vai; });
    $('#b-profilo').onclick = profilo;
    $('#b-giorno').onclick = sceltaGiorno;
    const bc = $('#b-cantiere'); if (bc) bc.onclick = sceltaCantiere;
    const ba = $('#b-aggiorna'); if (ba) ba.onclick = () => ricarica();
    const bo = $('#b-torna-oggi'); if (bo) bo.onclick = () => cambiaGiorno(oggi());
    const bi = $('#b-installa'); if (bi) bi.onclick = async () => { S.installa.prompt(); await S.installa.userChoice.catch(() => {}); S.installa = null; home(); };
    const bci = $('#b-chiudi-installa'); if (bci) bci.onclick = () => { memo.scrivi('installa-chiuso', true); home(); };
  }

  function sceltaCantiere() {
    const f = foglio(`<h2>Scegli il cantiere</h2>${S.cantieri.map(c => `<button class="opzione ${c.id === S.cantiereId ? 'attiva' : ''}" data-id="${c.id}">
      <b>${esc(c.nome)}</b><small>${esc([c.codice, c.comune, c.responsabile_id === S.profilo.id ? 'sei il responsabile' : ''].filter(Boolean).join(' · '))}</small></button>`).join('')}`);
    $$('[data-id]', f.el).forEach(b => b.onclick = async () => {
      f.chiudi();
      S.cantiereId = Number(b.dataset.id); memo.scrivi('cantiere', S.cantiereId);
      await ricarica(false);
    });
  }

  function sceltaGiorno() {
    const g = [0, -1, -2, -3].map(n => fmt.piuGiorni(oggi(), n));
    const nomi = ['Oggi', 'Ieri', '2 giorni fa', '3 giorni fa'];
    const f = foglio(`<h2>Quale giornata compili?</h2><p class="nota">Puoi completare il rapportino fino a 3 giorni indietro. Le presenze si timbrano solo nel giorno stesso.</p>
      ${g.map((d, i) => `<button class="opzione ${d === S.giorno ? 'attiva' : ''}" data-g="${d}"><b>${nomi[i]}</b><small>${esc(fmt.maiuscola(fmt.dataLunga(d)))}</small></button>`).join('')}`);
    $$('[data-g]', f.el).forEach(b => b.onclick = () => { f.chiudi(); cambiaGiorno(b.dataset.g); });
  }
  async function cambiaGiorno(g) { S.giorno = g; memo.scrivi('giorno-auto', g === oggi()); await ricarica(false); }

  function profilo() {
    const p = S.profilo;
    const f = foglio(`<h2>${esc(p.nome || 'Profilo')}</h2>
      <p class="nota">${esc(p.email)}<br>Ruolo: ${p.ruolo === 'admin' ? 'ufficio (amministratore)' : 'capocantiere'}</p>
      <button class="btn vuoto grande" id="p-ricarica">Aggiorna l'app</button>
      <button class="btn rosso grande" id="p-esci">Esci</button>`);
    $('#p-ricarica', f.el).onclick = async () => {
      try { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); } catch {}
      location.reload();
    };
    $('#p-esci', f.el).onclick = async () => {
      f.chiudi();
      if (!await conferma('Vuoi uscire dall\'app?', 'Esci')) return;
      await db.esci();
      Object.keys(localStorage).filter(k => k.startsWith('copia:')).forEach(k => localStorage.removeItem(k));
      accesso();
    };
  }

  // ---------- Pagina generica ----------
  function pagina(titolo, corpo) {
    const c = cantiere();
    app().innerHTML = `<div class="barra"><button class="tondo" id="b-indietro" aria-label="Torna alla home">${svg(ICONE.indietro, 24)}</button>
      <h1>${esc(titolo)}<small>${esc(c ? c.nome : '')} · ${esc(fmt.dataLunga(S.giorno))}</small></h1></div>
      <main class="corpo">${corpo}</main>`;
    $('#b-indietro').onclick = () => { if (history.length > 1 && location.hash) history.back(); else location.hash = ''; };
    return $('.corpo');
  }
  const avvisoLettura = () => modificabile() ? '' : '<p class="sola-lettura">Questa giornata si può solo leggere.</p>';

  // ---------- Presenze ----------
  function presenze() {
    const el = pagina('Presenze', `
      ${eOggi() ? '' : '<p class="sola-lettura">Le presenze si timbrano solo nel giorno stesso. Qui vedi quelle registrate. Per correzioni chiedi all\'ufficio.</p>'}
      <div class="contatori"><div class="contatore"><b id="n-dentro">0</b><span>in cantiere adesso</span></div>
        <div class="contatore"><b>${S.lavoratori.length}</b><span>lavoratori in elenco</span></div></div>
      ${eOggi() ? `<div class="carica"><button class="btn vuoto" id="b-tutti-entrata">Entrata a tutti</button><button class="btn vuoto" id="b-tutti-uscita">Uscita a tutti</button></div>
        <div class="campo"><label for="p-cerca">Cerca lavoratore</label><input id="p-cerca" type="search" placeholder="Cognome o nome" autocomplete="off"></div>
        <ul class="lista" id="p-lista"></ul>` : '<div id="p-turni"></div>'}`);

    function aggiornaConteggio() { $('#n-dentro', el).textContent = dentroQui().length; }
    aggiornaConteggio();

    if (!eOggi()) {
      const t = turni();
      $('#p-turni', el).innerHTML = t.length ? `<ul class="lista">${t.map(x => `<li><div class="chi"><b>${esc(x.nome)}</b>
        <span class="stato">${x.entrata || '?'} – ${x.uscita || (x.inCorso ? 'senza uscita' : '?')}</span></div><b>${x.ore != null ? fmt.ore(x.ore) + ' h' : ''}</b></li>`).join('')}</ul>`
        : '<p class="vuota">Nessuna presenza registrata in questo cantiere.</p>';
      return;
    }

    async function ricaricaTimb() {
      S.timb = await conCopia('timb:' + S.giorno, () => db.lista('v_timbrature', { eq: { giorno: S.giorno, annullata: false }, ordina: 'ora' }));
      lista(); aggiornaConteggio();
    }

    function lista() {
      const q = ($('#p-cerca', el).value || '').trim().toLowerCase();
      const vis = S.lavoratori.filter(l => !q || `${l.cognome} ${l.nome} ${l.nome} ${l.cognome}`.toLowerCase().includes(q));
      const ul = $('#p-lista', el);
      if (!S.lavoratori.length) { ul.innerHTML = '<li class="vuota">Nessun lavoratore. L\'ufficio li aggiunge nel gestionale, sezione Personale.</li>'; return; }
      if (!vis.length) { ul.innerHTML = `<li class="vuota">Nessuno corrisponde a "${esc(q)}".</li>`; return; }
      ul.innerHTML = vis.map(l => {
        const u = ultima(l.id), dentro = u && u.tipo === 'entrata', altrove = dentro && u.cantiere_id !== S.cantiereId;
        let st = '<span class="stato">Non ancora entrato oggi</span>';
        if (dentro) st = `<span class="stato ${altrove ? '' : 'dentro'}">Entrato alle ${esc(u.ora_locale)}${altrove ? ' · ' + esc(u.cantiere) : ''}</span>`;
        else if (u) st = `<span class="stato">Uscito alle ${esc(u.ora_locale)}</span>`;
        const tipo = dentro && !altrove ? 'uscita' : 'entrata';
        return `<li><div class="chi"><b>${esc(l.cognome)} ${esc(l.nome)}</b>${l.qualifica ? `<span class="stato">${esc(l.qualifica)}</span>` : ''}${st}</div>
          <button class="btn ${tipo === 'uscita' ? 'vuoto' : 'rosso'} piccolo" data-lav="${l.id}" data-tipo="${tipo}">${tipo === 'entrata' ? 'Entrata' : 'Uscita'}</button></li>`;
      }).join('');
    }

    async function timbra(righe, messaggio) {
      if (!navigator.onLine) return avviso('Serve la rete: l\'ora della timbratura la registra il server, per legge deve essere quella reale.', { errore: true, durata: 7000 });
      const r = await db.inserisci('timbrature', righe);
      await ricaricaTimb();
      const ids = r.map(x => x.id);
      avviso(messaggio(r[0]), {
        annulla: async () => {
          try { for (const id of ids) await db.rpc('annulla_timbratura', { p_id: id }); await ricaricaTimb(); avviso('Timbratura annullata'); }
          catch (e) { errore(e); }
        }
      });
    }

    $('#p-cerca', el).addEventListener('input', lista);
    $('#p-lista', el).addEventListener('click', async e => {
      const b = e.target.closest('button[data-lav]'); if (!b) return;
      const id = Number(b.dataset.lav), tipo = b.dataset.tipo;
      const l = S.lavoratori.find(x => x.id === id), u = ultima(id);
      if (tipo === 'entrata' && u && u.tipo === 'entrata' && u.cantiere_id !== S.cantiereId &&
          !await conferma(`${l.cognome} ${l.nome} risulta entrato in ${u.cantiere}. Registrare l'entrata qui?`, 'Registra entrata')) return;
      b.disabled = true;
      try { await timbra([{ lavoratore_id: id, cantiere_id: S.cantiereId, tipo }], r => `${tipo === 'entrata' ? 'Entrata' : 'Uscita'} di ${l.cognome} ${l.nome} alle ${fmt.ora(r.ora)}`); }
      catch (err) { b.disabled = false; errore(err); }
    });
    $('#b-tutti-entrata', el).onclick = async () => {
      const da = S.lavoratori.filter(l => { const u = ultima(l.id); return !u || u.tipo === 'uscita'; });
      if (!da.length) return avviso('Sono già tutti entrati.');
      if (!await conferma(`Registrare l'entrata di ${da.length} lavoratori in questo cantiere, adesso?`, 'Registra entrate')) return;
      try { await timbra(da.map(l => ({ lavoratore_id: l.id, cantiere_id: S.cantiereId, tipo: 'entrata' })), r => `${da.length} entrate registrate alle ${fmt.ora(r.ora)}`); } catch (e) { errore(e); }
    };
    $('#b-tutti-uscita', el).onclick = async () => {
      const da = dentroQui();
      if (!da.length) return avviso('Nessuno risulta dentro questo cantiere.');
      if (!await conferma(`Registrare l'uscita di ${da.length} lavoratori, adesso?`, 'Registra uscite')) return;
      try { await timbra(da.map(l => ({ lavoratore_id: l.id, cantiere_id: S.cantiereId, tipo: 'uscita' })), r => `${da.length} uscite registrate alle ${fmt.ora(r.ora)}`); } catch (e) { errore(e); }
    };
    lista();
  }

  // ---------- Ore dei mezzi ----------
  function mezzi() {
    const ed = modificabile();
    const nome = id => { const m = S.mezzi.find(x => x.id === id); return m ? m.nome + (m.targa ? ` (${m.targa})` : '') : 'Mezzo #' + id; };
    const tot = S.oreMezzi.reduce((a, o) => a + Number(o.ore), 0);
    const el = pagina('Mezzi e attrezzature', `${avvisoLettura()}
      ${ed && S.mezzi.length ? `<form class="pannello" id="m-form">
        <h2>Aggiungi ore di lavoro</h2>
        <div class="campo"><label for="m-mezzo">Mezzo o attrezzatura</label><select id="m-mezzo">${S.mezzi.map(m => `<option value="${m.id}">${esc(m.nome)}${m.targa ? ' (' + esc(m.targa) + ')' : ''}${m.tipo === 'attrezzatura' ? ' · attrezzatura' : ''}</option>`).join('')}</select></div>
        <div class="campo"><label for="m-ore">Ore</label><input id="m-ore" inputmode="decimal" placeholder="es. 6,5" required>
          <div class="veloci">${[1, 2, 4, 6, 8].map(n => `<button type="button" data-ore="${n}">${n} h</button>`).join('')}</div></div>
        <div class="campo"><label for="m-note">Nota (facoltativa)</label><input id="m-note" placeholder="es. scavo per plinti barriera"></div>
        <button class="btn rosso grande" type="submit">Aggiungi</button></form>` : ''}
      ${!S.mezzi.length ? '<p class="vuota">Nessun mezzo in elenco. L\'ufficio li aggiunge nel gestionale, sezione Mezzi.</p>' : ''}
      <h2 style="font-size:16px">Registrate oggi${S.oreMezzi.length ? ` · ${fmt.ore(tot)} ore` : ''}</h2>
      ${S.oreMezzi.length ? `<ul class="lista">${S.oreMezzi.map(o => `<li><div class="chi"><b>${esc(nome(o.mezzo_id))}</b>${o.note ? `<span class="stato">${esc(o.note)}</span>` : ''}</div>
        <b>${fmt.ore(o.ore)} h</b>${ed && o.registrato_da === io() ? `<button class="btn vuoto piccolo" data-togli="${o.id}" aria-label="Togli">Togli</button>` : ''}</li>`).join('')}</ul>`
        : '<p class="vuota">Nessuna ora registrata per questo cantiere.</p>'}`);

    const f = $('#m-form', el);
    if (f) {
      $$('[data-ore]', f).forEach(b => b.onclick = () => { $('#m-ore', f).value = b.dataset.ore; });
      f.onsubmit = async e => {
        e.preventDefault();
        const o = leggiNumero($('#m-ore', f).value);
        if (!o || o <= 0 || o > 24) return avviso('Scrivi le ore come numero tra 0 e 24, es. 6,5.', { errore: true });
        const b = $('button[type=submit]', f); b.disabled = true;
        try {
          await db.inserisci('ore_mezzi', { mezzo_id: Number($('#m-mezzo', f).value), cantiere_id: S.cantiereId, giorno: S.giorno, ore: o, note: $('#m-note', f).value.trim() });
          await caricaGiornata(); mezzi(); avviso('Ore registrate');
        } catch (err) { b.disabled = false; errore(err); }
      };
    }
    $$('[data-togli]', el).forEach(b => b.onclick = async () => {
      if (!await conferma('Togliere queste ore?', 'Togli')) return;
      try { await db.elimina('ore_mezzi', b.dataset.togli); await caricaGiornata(); mezzi(); } catch (e) { errore(e); }
    });
  }

  // ---------- Giornale dei lavori (meteo, lavorazioni, materiali, note) ----------
  async function salvaGiornale(campi) {
    if (S.giornale) {
      S.giornale = await db.aggiorna('giornale', S.giornale.id, { ...campi, aggiornato_il: new Date().toISOString() });
    } else {
      try { S.giornale = await db.inserisci('giornale', { ...campi, cantiere_id: S.cantiereId, giorno: S.giorno }); }
      catch (e) {
        if (e.codice !== '23505') throw e;
        // L'ufficio (o un collega) l'ha appena creata: aggiorno quella.
        const [g] = await db.lista('giornale', { eq: { cantiere_id: S.cantiereId, giorno: S.giorno }, limite: 1 });
        S.giornale = await db.aggiorna('giornale', g.id, { ...campi, aggiornato_il: new Date().toISOString() });
      }
    }
    memo.scrivi(`copia:giornale:${S.cantiereId}:${S.giorno}`, [S.giornale]);
  }

  function meteo() {
    const ed = modificabile();
    const el = pagina('Meteo', `${avvisoLettura()}
      <p class="nota">Tocca il tempo di oggi in cantiere: finisce nel giornale dei lavori.</p>
      <div class="scelte">${METEO.map(([v, e]) => `<button class="scelta ${gv('meteo') === v ? 'attiva' : ''}" data-m="${esc(v)}" ${ed ? '' : 'disabled'} aria-pressed="${gv('meteo') === v}"><span aria-hidden="true">${e}</span>${esc(v)}</button>`).join('')}</div>
      ${ed && eOggi() ? '<button class="btn vuoto grande" id="b-gps">Rileva il meteo dalla posizione</button><p class="nota">Usa il GPS del telefono e il servizio gratuito Open-Meteo.</p>' : ''}`);
    async function scegli(v) {
      try { await salvaGiornale({ meteo: v }); meteo(); avviso('Meteo salvato: ' + v); } catch (e) { errore(e); }
    }
    $$('[data-m]', el).forEach(b => b.onclick = () => scegli(b.dataset.m));
    const g = $('#b-gps', el);
    if (g) g.onclick = () => {
      if (!navigator.geolocation) return avviso('Questo telefono non dà la posizione.', { errore: true });
      g.disabled = true; g.textContent = 'Rilevo la posizione…';
      navigator.geolocation.getCurrentPosition(async pos => {
        try {
          const { latitude: la, longitude: lo } = pos.coords;
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la.toFixed(3)}&longitude=${lo.toFixed(3)}&current=weather_code,wind_speed_10m,temperature_2m&timezone=Europe%2FRome`);
          const d = (await r.json()).current;
          const c = d.weather_code;
          let v = c <= 1 ? 'Sereno' : c <= 3 ? 'Nuvoloso' : (c === 45 || c === 48) ? 'Nebbia' : ((c >= 71 && c <= 77) || c === 85 || c === 86) ? 'Neve' : 'Pioggia';
          if (d.wind_speed_10m >= 40 && v !== 'Pioggia' && v !== 'Neve') v = 'Vento forte';
          if (await conferma(`Adesso: ${v}, ${Math.round(d.temperature_2m)}°C, vento ${Math.round(d.wind_speed_10m)} km/h. Salvo "${v}"?`, 'Salva')) scegli(v);
          else meteo();
        } catch { avviso('Meteo non disponibile ora: sceglilo a mano.', { errore: true }); meteo(); }
      }, () => { avviso('Posizione non disponibile: sceglilo a mano.', { errore: true }); meteo(); }, { timeout: 15000, maximumAge: 600000 });
    };
  }

  function testoGiornale(campo, titolo, aiuto, esempio) {
    return () => {
      const ed = modificabile();
      const kb = `bozza:${S.cantiereId}:${S.giorno}:${campo}`;
      const bozza = memo.leggi(kb);
      const el = pagina(titolo, `${avvisoLettura()}
        <form class="pannello" id="t-form"><div class="campo"><label for="t-testo">${esc(aiuto)}</label>
          <textarea id="t-testo" placeholder="${esc(esempio)}" ${ed ? '' : 'disabled'}></textarea></div>
          ${bozza != null && bozza !== gv(campo) ? '<p class="nota">Bozza non ancora salvata, recuperata da questo telefono.</p>' : ''}
          ${ed ? '<button class="btn rosso grande" type="submit">Salva</button>' : ''}</form>
        <p class="nota">Quello che scrivi compare nel giornale dei lavori del gestionale, che l'ufficio stampa in PDF.</p>`);
      const ta = $('#t-testo', el);
      ta.value = bozza != null ? bozza : gv(campo);
      ta.addEventListener('input', () => memo.scrivi(kb, ta.value));
      $('#t-form', el).onsubmit = async e => {
        e.preventDefault();
        const b = $('button[type=submit]', e.target); b.disabled = true;
        try { await salvaGiornale({ [campo]: ta.value.trim() }); memo.scrivi(kb, null); avviso('Salvato'); location.hash = ''; }
        catch (err) { b.disabled = false; errore(err.codice === 'rete' ? new Error('Nessuna rete: il testo resta salvato sul telefono, riprova quando c\'è campo.') : err); }
      };
    };
  }

  // ---------- File: foto, documenti, spese ----------
  async function caricaDocumento(file0, { categoria, titolo }) {
    const file = await comprimi(file0);
    const percorso = `cantieri/${S.cantiereId}/${S.giorno}/${Date.now()}-${nomeSicuro(file.name || 'file')}`;
    await db.caricaFile(percorso, file);
    return db.inserisci('documenti', { titolo, categoria, cantiere_id: S.cantiereId, giorno: S.giorno, percorso, nome_file: file0.name || file.name, dimensione: file.size, tipo_mime: file.type || '' });
  }
  const link = new Map();
  async function apriFile(percorso) {
    const w = window.open('', '_blank');
    try { const u = await db.linkFile(percorso); if (w) w.location = u; else location.href = u; }
    catch (e) { if (w) w.close(); errore(e); }
  }
  function miniature(el, lista) {
    for (const b of $$('[data-percorso]', el)) {
      const p = b.dataset.percorso, d = lista.find(x => x.percorso === p);
      b.onclick = () => apriFile(p);
      if (d && !/^image\//.test(d.tipo_mime)) continue;
      const usa = u => { const i = new Image(); i.alt = b.getAttribute('aria-label') || ''; i.loading = 'lazy'; i.src = u; b.textContent = ''; b.append(i); };
      if (link.has(p)) usa(link.get(p));
      else db.linkFile(p, 3600).then(u => { link.set(p, u); usa(u); }).catch(() => {});
    }
  }

  function fotoPagina() {
    const ed = modificabile(), lista = foto();
    const el = pagina('Foto', `${avvisoLettura()}
      ${ed ? `<div class="carica">
        <label class="btn rosso">Scatta foto<input id="f-scatta" type="file" accept="image/*" capture="environment" hidden></label>
        <label class="btn vuoto">Dalla galleria<input id="f-galleria" type="file" accept="image/*" multiple hidden></label></div>` : ''}
      <div class="miniature">${lista.length ? lista.map(d => `<button class="miniatura" data-percorso="${esc(d.percorso)}" aria-label="${esc(d.titolo)}">foto</button>`).join('') : ''}</div>
      ${lista.length ? '' : '<p class="vuota">Nessuna foto per questa giornata.</p>'}
      <p class="nota">Le foto finiscono nell'archivio del cantiere e nel giornale dei lavori del gestionale.</p>`);
    miniature(el, lista);
    for (const inp of $$('input[type=file]', el)) inp.onchange = async () => {
      const files = [...inp.files]; inp.value = '';
      let ok = 0;
      for (const [i, f] of files.entries()) {
        avviso(`Carico la foto ${i + 1} di ${files.length}…`, { durata: 2000 });
        try { await caricaDocumento(f, { categoria: 'Foto', titolo: `Foto ${fmt.data(S.giorno)}` }); ok++; }
        catch (e) { errore(e); break; }
      }
      if (ok) { avviso(ok === 1 ? 'Foto caricata' : `${ok} foto caricate`); await caricaGiornata(); fotoPagina(); }
    };
  }

  function documentiPagina() {
    const ed = modificabile(), lista = altriDoc();
    const el = pagina('DDT e documenti', `${avvisoLettura()}
      ${ed ? `<form class="pannello" id="d-form"><h2>Carica un documento</h2>
        <div class="campo"><label for="d-cat">Tipo</label><select id="d-cat">${CATEGORIE_DOC.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="campo"><label for="d-titolo">Descrizione</label><input id="d-titolo" placeholder="es. DDT barriere fornitore, bolla n. 123" required></div>
        <div class="campo"><label for="d-file">File o foto del documento</label><input id="d-file" type="file" accept="image/*,application/pdf" required></div>
        <button class="btn rosso grande" type="submit">Carica</button></form>` : ''}
      <h2 style="font-size:16px">Caricati in questa giornata</h2>
      ${lista.length ? `<ul class="lista">${lista.map(d => `<li><div class="chi"><b>${esc(d.titolo)}</b><span class="stato">${esc(d.categoria)}</span></div>
        <button class="btn vuoto piccolo" data-apri="${esc(d.percorso)}">Apri</button></li>`).join('')}</ul>` : '<p class="vuota">Nessun documento.</p>'}`);
    $$('[data-apri]', el).forEach(b => b.onclick = () => apriFile(b.dataset.apri));
    const f = $('#d-form', el);
    if (f) f.onsubmit = async e => {
      e.preventDefault();
      const file = $('#d-file', f).files[0], titolo = $('#d-titolo', f).value.trim();
      if (!titolo || !file) return avviso('Scrivi una descrizione e scegli il file.', { errore: true });
      const b = $('button[type=submit]', f); b.disabled = true; b.textContent = 'Caricamento…';
      try { await caricaDocumento(file, { categoria: $('#d-cat', f).value, titolo }); avviso('Documento caricato'); await caricaGiornata(); documentiPagina(); }
      catch (err) { b.disabled = false; b.textContent = 'Carica'; errore(err); }
    };
  }

  function spesePagina() {
    const ed = modificabile(), lista = spese();
    const tot = lista.reduce((a, d) => a + importoSpesa(d), 0);
    const el = pagina('Spese', `${avvisoLettura()}
      ${ed ? `<form class="pannello" id="s-form"><h2>Nuova spesa</h2>
        <div class="campo"><label for="s-importo">Importo in euro</label><input id="s-importo" inputmode="decimal" placeholder="es. 45,90" required></div>
        <div class="campo"><label for="s-cosa">Cosa hai pagato</label><input id="s-cosa" placeholder="es. gasolio generatore, bulloneria" required></div>
        <div class="campo"><label for="s-foto">Foto dello scontrino o della ricevuta</label><input id="s-foto" type="file" accept="image/*,application/pdf" required></div>
        <button class="btn rosso grande" type="submit">Registra spesa</button></form>` : ''}
      <h2 style="font-size:16px">Spese della giornata${lista.length ? ' · ' + fmt.euro(tot) : ''}</h2>
      ${lista.length ? `<ul class="lista">${lista.map(d => `<li><div class="chi"><b>${esc(d.titolo.replace(/^Spesa\s*/, ''))}</b></div>
        <button class="btn vuoto piccolo" data-apri="${esc(d.percorso)}">Scontrino</button></li>`).join('')}</ul>` : '<p class="vuota">Nessuna spesa registrata.</p>'}
      <p class="nota">Lo scontrino arriva all'ufficio nei documenti del cantiere, che lo registra nei costi.</p>`);
    $$('[data-apri]', el).forEach(b => b.onclick = () => apriFile(b.dataset.apri));
    const f = $('#s-form', el);
    if (f) f.onsubmit = async e => {
      e.preventDefault();
      const imp = leggiNumero($('#s-importo', f).value), cosa = $('#s-cosa', f).value.trim(), file = $('#s-foto', f).files[0];
      if (!(imp > 0)) return avviso('Scrivi l\'importo, es. 45,90.', { errore: true });
      if (!cosa || !file) return avviso('Scrivi cosa hai pagato e aggiungi la foto dello scontrino.', { errore: true });
      const b = $('button[type=submit]', f); b.disabled = true; b.textContent = 'Caricamento…';
      const importo = imp.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      try { await caricaDocumento(file, { categoria: CAT_SPESE, titolo: `Spesa € ${importo} – ${cosa}` }); avviso('Spesa registrata'); await caricaGiornata(); spesePagina(); }
      catch (err) { b.disabled = false; b.textContent = 'Registra spesa'; errore(err); }
    };
  }

  // ---------- Riepilogo della giornata ----------
  function riepilogo() {
    const c = cantiere(), t = turni();
    const nomeMezzo = id => { const m = S.mezzi.find(x => x.id === id); return m ? m.nome : 'Mezzo #' + id; };
    const mancano = MODULI.filter(m => !m.s().ok && !['documenti', 'spese', 'note'].includes(m.k)).map(m => m.t);
    const testo = [
      `RAPPORTINO – ${c.nome}${c.comune ? ' (' + c.comune + ')' : ''}`,
      fmt.maiuscola(fmt.dataLunga(S.giorno)),
      '',
      `Meteo: ${gv('meteo') || '—'}`,
      `Personale (${t.length}):`, ...t.map(x => `- ${x.nome}: ${x.entrata || '?'}–${x.uscita || (x.inCorso ? 'in corso' : '?')}${x.ore != null ? ` (${fmt.ore(x.ore)} h)` : ''}`),
      `Mezzi: ${S.oreMezzi.length ? S.oreMezzi.map(o => `${nomeMezzo(o.mezzo_id)} ${fmt.ore(o.ore)} h`).join(', ') : '—'}`,
      `Lavorazioni: ${gv('lavorazioni') || '—'}`,
      `Materiali: ${gv('materiali') || '—'}`,
      `Note: ${gv('note') || '—'}`,
      `Foto: ${foto().length} · Documenti: ${altriDoc().length} · Spese: ${fmt.euro(spese().reduce((a, d) => a + importoSpesa(d), 0))}`,
      '',
      `Compilato da ${S.profilo.nome || S.profilo.email}`
    ].join('\n');

    const el = pagina('Riepilogo', `
      ${mancano.length ? `<p class="sola-lettura">Mancano: <b>${esc(mancano.join(', '))}</b>.</p>` : '<p class="sola-lettura" style="background:var(--verde-chiaro)">Rapportino completo.</p>'}
      <div class="pannello riepilogo"><dl>
        <dt>Meteo</dt><dd>${esc(gv('meteo')) || '<span class="mancante">non indicato</span>'}</dd>
        <dt>Personale</dt><dd>${t.length ? t.map(x => `${esc(x.nome)} · ${esc(x.entrata || '?')}–${esc(x.uscita || (x.inCorso ? 'in corso' : '?'))}${x.ore != null ? ' · ' + fmt.ore(x.ore) + ' h' : ''}`).join('<br>') : '<span class="mancante">nessuna presenza</span>'}</dd>
        <dt>Mezzi</dt><dd>${S.oreMezzi.length ? S.oreMezzi.map(o => `${esc(nomeMezzo(o.mezzo_id))} · ${fmt.ore(o.ore)} h`).join('<br>') : '—'}</dd>
        <dt>Lavorazioni</dt><dd>${esc(gv('lavorazioni')) || '<span class="mancante">non compilate</span>'}</dd>
        <dt>Materiali</dt><dd>${esc(gv('materiali')) || '—'}</dd>
        <dt>Note</dt><dd>${esc(gv('note')) || '—'}</dd>
        <dt>Allegati</dt><dd>${foto().length} foto · ${altriDoc().length} documenti · ${spese().length} spese</dd>
      </dl></div>
      <p class="nota">Tutto è già nel gestionale: l'ufficio lo trova nel Giornale dei lavori. Se vuoi, avvisa l'ufficio con un messaggio.</p>
      <button class="btn rosso grande" id="b-invia">Invia il riepilogo (WhatsApp, email…)</button>`);
    $('#b-invia', el).onclick = async () => {
      try {
        if (navigator.share) await navigator.share({ title: 'Rapportino ' + c.nome, text: testo });
        else { await navigator.clipboard.writeText(testo); avviso('Riepilogo copiato: incollalo dove vuoi'); }
      } catch (e) { if (e && e.name !== 'AbortError') errore(e); }
    };
  }

  const PAGINE = {
    presenze, mezzi, meteo,
    lavorazioni: testoGiornale('lavorazioni', 'Lavorazioni', 'Lavorazioni eseguite oggi', 'es. Posa barriera H2 bordo ponte, km 12+300 – 12+450'),
    materiali: testoGiornale('materiali', 'Materiali', 'Materiali arrivati o usati', 'es. Arrivati 40 paletti C120, usati 25 sacchi di cemento'),
    note: testoGiornale('note', 'Note e problemi', 'Visite, imprevisti, guasti, richieste all\'ufficio', 'es. Visita del direttore lavori alle 10. Escavatore perde olio.'),
    foto: fotoPagina, documenti: documentiPagina, spese: spesePagina, riepilogo
  };

  avvio();
})();
