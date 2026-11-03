// Giornale dei lavori: una pagina per cantiere e giorno, con presenze,
// ore dei mezzi e foto raccolte in automatico. Si stampa o si salva in PDF.
(function () {
  const { $, esc, fmt, avviso, errore, conferma } = ui;
  const K = 'giornale-scelta';

  App.apriGiornale = (cantiere, giorno) => {
    try { sessionStorage.setItem(K, JSON.stringify({ cantiere, giorno })); } catch {}
    if (location.hash === '#giornale') ui.pagine.giornale($('#contenuto')); else ui.vai('giornale');
  };

  ui.pagina('giornale', async el => {
    const cantieri = await db.lista('cantieri', App.admin ? { in: { stato: ['aperto', 'sospeso', 'chiuso'] }, ordina: 'stato,nome' } : { eq: { stato: 'aperto' }, ordina: 'nome' });
    if (!cantieri.length) { el.innerHTML = App.testata('Giornale dei lavori') + '<p class="nota">Non ci sono cantieri aperti.</p>'; return; }
    let scelta = {}; try { scelta = JSON.parse(sessionStorage.getItem(K) || '{}'); } catch {}
    let preferito = null; try { preferito = localStorage.getItem('cantiere'); } catch {}
    const idC = cantieri.some(c => c.id === scelta.cantiere) ? scelta.cantiere : (cantieri.find(c => String(c.id) === preferito) || cantieri[0]).id;
    const oggi = fmt.oggi();
    const giorno = scelta.giorno || oggi;
    const minimo = fmt.piuGiorni(oggi, -3);
    const modificabile = App.admin || (giorno >= minimo && giorno <= oggi);

    el.innerHTML = App.testata('Giornale dei lavori', { azioni: '<button class="btn vuoto" id="g-stampa">Stampa o salva PDF</button>' }) + `
      <div class="barra-elenco non-stampare pannello" style="margin-bottom:16px">
        <div class="filtro" style="flex-basis:320px"><label for="g-cant">Cantiere</label><select id="g-cant">${cantieri.map(c => `<option value="${c.id}" ${c.id === idC ? 'selected' : ''}>${esc(c.nome)}${c.stato !== 'aperto' ? ` (${c.stato})` : ''}</option>`).join('')}</select></div>
        <div class="filtro"><label for="g-giorno">Giorno</label><input id="g-giorno" type="date" value="${giorno}" max="${oggi}" ${App.admin ? '' : `min="${fmt.piuGiorni(oggi, -30)}"`}></div>
        <div class="azioni"><button class="btn vuoto piccolo" id="g-prima" aria-label="Giorno prima">◀</button><button class="btn vuoto piccolo" id="g-dopo" aria-label="Giorno dopo" ${giorno >= oggi ? 'disabled' : ''}>▶</button></div>
      </div>
      <h2 class="non-stampare" style="margin-bottom:14px">${esc(fmt.dataLunga(giorno).replace(/^./, c => c.toUpperCase()))}</h2>
      ${modificabile ? '' : '<p class="stato giallo" style="display:block;padding:10px 12px;margin-bottom:16px">Questa giornata si può solo leggere: i capicantiere possono modificare gli ultimi 3 giorni.</p>'}
      <div class="due-col non-stampare pannello">
        <form id="g-form"><div class="campi">
          <div><label for="g-meteo">Meteo</label><select id="g-meteo" ${modificabile ? '' : 'disabled'}><option value=""></option>${App.METEO.map(m => `<option>${m}</option>`).join('')}</select></div>
          <div></div>
          <div class="largo"><label for="g-lav">Lavorazioni eseguite</label><textarea id="g-lav" rows="5" ${modificabile ? '' : 'disabled'} placeholder="es. Posa barriera H2 bordo ponte, km 12+300 – 12+450"></textarea></div>
          <div class="largo"><label for="g-mat">Materiali arrivati o usati</label><textarea id="g-mat" rows="3" ${modificabile ? '' : 'disabled'}></textarea></div>
          <div class="largo"><label for="g-note">Note, visite, problemi</label><textarea id="g-note" rows="3" ${modificabile ? '' : 'disabled'}></textarea></div>
        </div>${modificabile ? '<div class="azioni" style="margin-top:14px"><button class="btn rosso" type="submit">Salva giornata</button><span class="nota" id="g-salvato"></span></div>' : ''}</form>
        <div>
          <h3 style="margin-bottom:8px">Presenze del giorno</h3><div id="g-pres" class="nota">Caricamento…</div>
          <h3 style="margin:22px 0 8px">Ore dei mezzi</h3><div id="g-mezzi"></div>
        </div>
      </div>
      <div class="sezione non-stampare pannello"><div class="testata" style="margin-bottom:12px"><h2>Foto del giorno</h2>
        ${modificabile ? '<label class="btn vuoto" style="margin:0">Aggiungi foto<input id="g-foto" type="file" accept="image/*" multiple hidden></label>' : ''}</div>
        <div class="miniature" id="g-miniature"></div></div>
      <div class="solo-stampa" id="g-stampabile"></div>`;

    const cambia = (c, g) => App.apriGiornale(Number(c), g);
    $('#g-cant', el).onchange = e => cambia(e.target.value, giorno);
    $('#g-giorno', el).onchange = e => e.target.value && cambia(idC, e.target.value);
    $('#g-prima', el).onclick = () => cambia(idC, fmt.piuGiorni(giorno, -1));
    $('#g-dopo', el).onclick = () => cambia(idC, fmt.piuGiorni(giorno, 1));

    const [voce] = await db.lista('giornale', { eq: { cantiere_id: idC, giorno }, limite: 1 });
    let attuale = voce || null;
    if (attuale) { $('#g-meteo', el).value = attuale.meteo; $('#g-lav', el).value = attuale.lavorazioni; $('#g-mat', el).value = attuale.materiali; $('#g-note', el).value = attuale.note; }

    $('#g-form', el).addEventListener('submit', async e => {
      e.preventDefault();
      const d = { meteo: $('#g-meteo', el).value, lavorazioni: $('#g-lav', el).value.trim(), materiali: $('#g-mat', el).value.trim(), note: $('#g-note', el).value.trim() };
      try {
        attuale = attuale ? await db.aggiorna('giornale', attuale.id, { ...d, aggiornato_il: new Date().toISOString() }) : await db.inserisci('giornale', { ...d, cantiere_id: idC, giorno });
        $('#g-salvato', el).textContent = 'Salvato alle ' + fmt.ora(new Date());
        avviso('Giornata salvata');
      } catch (err) { errore(err); }
    });

    // Presenze
    const timb = await db.lista('v_timbrature', { eq: { cantiere_id: idC, giorno }, ordina: 'ora' });
    const turni = App.calcolaTurni(timb);
    $('#g-pres', el).innerHTML = turni.length ? `<table class="tabella"><tbody>${turni.map(t => `<tr><td>${esc(t.lavoratore)}</td><td>${t.entrata || '?'} – ${t.uscita || (t.inCorso ? 'in corso' : '?')}</td><td class="num">${fmt.ore(t.ore)}</td></tr>`).join('')}</tbody></table>`
      : 'Nessuna presenza registrata per questo cantiere in questo giorno.';

    // Mezzi
    const mezzi = await db.lista('mezzi_base', { eq: { attivo: true }, ordina: 'nome' });
    async function disegnaMezzi() {
      const ore = await db.lista('ore_mezzi', { eq: { cantiere_id: idC, giorno }, ordina: 'id' });
      const nome = id => { const m = mezzi.find(x => x.id === id); return m ? m.nome : 'mezzo #' + id; };
      $('#g-mezzi', el).innerHTML = (ore.length ? `<table class="tabella"><tbody>${ore.map(o => `<tr><td>${esc(nome(o.mezzo_id))}${o.note ? ` <span class="nota">– ${esc(o.note)}</span>` : ''}</td><td class="num">${fmt.ore(o.ore)} h</td>
          <td>${modificabile && (App.admin || o.registrato_da === App.profilo.id) ? `<button class="btn testo piccolo" data-togli="${o.id}">Togli</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="nota">Nessuna ora registrata.</p>') +
        (modificabile && mezzi.length ? `<form id="g-nuovo-mezzo" class="barra-elenco" style="margin-top:10px">
          <div class="filtro" style="flex:1 1 180px"><label for="g-mz">Mezzo</label><select id="g-mz">${mezzi.map(m => `<option value="${m.id}">${esc(m.nome)}${m.targa ? ' (' + esc(m.targa) + ')' : ''}</option>`).join('')}</select></div>
          <div class="filtro" style="flex:0 1 90px"><label for="g-ore">Ore</label><input id="g-ore" inputmode="decimal" required></div>
          <button class="btn" type="submit">Aggiungi</button></form>` : '');
      ui.$$('[data-togli]', el).forEach(b => b.onclick = async () => { try { await db.elimina('ore_mezzi', b.dataset.togli); disegnaMezzi(); } catch (e) { errore(e); } });
      const f = $('#g-nuovo-mezzo', el);
      if (f) f.onsubmit = async e => {
        e.preventDefault();
        const o = ui.leggiNumero($('#g-ore', el).value);
        if (!o || o <= 0 || o > 24) return avviso('Scrivi le ore come numero tra 0 e 24, es. 6,5.', { errore: true });
        try { await db.inserisci('ore_mezzi', { mezzo_id: Number($('#g-mz', el).value), cantiere_id: idC, giorno, ore: o }); disegnaMezzi(); } catch (e) { errore(e); }
      };
      return ore;
    }
    const oreMezzi = await disegnaMezzi();

    // Foto
    async function disegnaFoto() {
      const foto = await db.lista('documenti', { eq: { cantiere_id: idC, giorno, categoria: 'Foto' }, ordina: 'creato_il' });
      $('#g-miniature', el).innerHTML = foto.length ? foto.map(f => `<button class="miniatura" data-percorso="${esc(f.percorso)}" title="${esc(f.titolo)}"><span>${esc(f.titolo)}</span></button>`).join('') : '<p class="nota">Nessuna foto per questa giornata.</p>';
      for (const b of ui.$$('[data-percorso]', el)) {
        db.linkFile(b.dataset.percorso, 3600).then(u => { const i = new Image(); i.alt = b.title; i.loading = 'lazy'; i.src = u; b.prepend(i); }).catch(() => {});
        b.onclick = async () => { try { window.open(await db.linkFile(b.dataset.percorso), '_blank', 'noopener'); } catch (e) { errore(e); } };
      }
      return foto;
    }
    const foto = await disegnaFoto();
    const inp = $('#g-foto', el);
    if (inp) inp.onchange = async () => {
      const files = [...inp.files]; inp.value = '';
      let ok = 0;
      for (const [i, f0] of files.entries()) {
        avviso(`Carico la foto ${i + 1} di ${files.length}…`);
        try {
          const f = await ui.comprimi(f0);
          const percorso = `cantieri/${idC}/${giorno}/${Date.now()}-${ui.nomeSicuro(f.name)}`;
          await db.caricaFile(percorso, f);
          await db.inserisci('documenti', { titolo: `Foto ${fmt.data(giorno)}`, categoria: 'Foto', cantiere_id: idC, giorno, percorso, nome_file: f.name, dimensione: f.size, tipo_mime: f.type });
          ok++;
        } catch (e) { errore(e); return; }
      }
      avviso(ok === 1 ? 'Foto caricata' : `${ok} foto caricate`); disegnaFoto();
    };

    // Versione da stampare
    $('#g-stampa', el).onclick = () => {
      const c = cantieri.find(x => x.id === idC);
      const testo = id => esc($(id, el).value).replace(/\n/g, '<br>') || '<span class="nota">—</span>';
      $('#g-stampabile', el).innerHTML = App.intestazioneStampa('Giornale dei lavori', `${esc(fmt.dataLunga(giorno))}`) + `
        <p><b>Cantiere:</b> ${esc(c.nome)}${c.comune ? ' – ' + esc(c.comune) : ''}${c.cig ? ' &nbsp; <b>CIG:</b> ' + esc(c.cig) : ''}${c.cup ? ' &nbsp; <b>CUP:</b> ' + esc(c.cup) : ''}</p>
        <p style="margin-top:6px"><b>Meteo:</b> ${esc($('#g-meteo', el).value) || '—'}</p>
        <h3 style="margin-top:16px">Lavorazioni eseguite</h3><p>${testo('#g-lav')}</p>
        <h3 style="margin-top:14px">Materiali</h3><p>${testo('#g-mat')}</p>
        <h3 style="margin-top:14px">Personale presente</h3>${$('#g-pres', el).innerHTML}
        <h3 style="margin-top:14px">Mezzi e attrezzature</h3>${oreMezzi.length ? $('#g-mezzi table', el).outerHTML.replace(/<button[^>]*>.*?<\/button>/g, '') : '<p>—</p>'}
        <h3 style="margin-top:14px">Note</h3><p>${testo('#g-note')}</p>
        <p style="margin-top:14px" class="nota">Foto allegate nell'archivio: ${foto.length}</p>
        <div style="display:flex;justify-content:space-between;margin-top:48px"><span>Il direttore di cantiere ______________________</span><span>Il direttore dei lavori ______________________</span></div>`;
      window.print();
    };
  });
})();
