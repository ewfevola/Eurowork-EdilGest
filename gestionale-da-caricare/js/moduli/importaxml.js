// Importazione delle fatture elettroniche (FatturaPA): file .xml, .xml.p7m firmati, oppure un .zip che li contiene.
// Funziona con i file scaricati da qualsiasi programma di fatturazione (CGN compreso) o dal cassetto fiscale.
(function () {
  const { $, $$, esc, fmt, avviso, errore } = ui;

  // ---------- Lettura dei file ----------
  const bytesInTesto = b => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
  const testoInBytes = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };

  function decodifica(bytes) {
    const testa = bytesInTesto(bytes.subarray(0, 200));
    const m = testa.match(/encoding=["']([^"']+)["']/i);
    try { return new TextDecoder(m ? m[1] : 'utf-8').decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
  }

  // Un .p7m è la fattura XML "imbustata" nella firma digitale: si estrae il pezzo XML.
  function estraiDaP7m(bytes) {
    let bin = bytesInTesto(bytes);
    if (/^[A-Za-z0-9+/=\s]+$/.test(bin.slice(0, 400)) && !bin.includes('<')) {   // p7m in base64
      try { bin = atob(bin.replace(/\s+/g, '')); } catch {}
    }
    let inizio = bin.indexOf('<?xml');
    if (inizio < 0) { const m = bin.match(/<([\w-]+:)?FatturaElettronica[\s>]/); inizio = m ? m.index : -1; }
    const fineTag = bin.lastIndexOf('FatturaElettronica>');
    if (inizio < 0 || fineTag < 0) throw new Error('nel file firmato non c\'è una fattura elettronica');
    let xml = bin.slice(inizio, fineTag + 'FatturaElettronica>'.length);
    // Nei file firmati il testo può essere spezzato in blocchi con piccole intestazioni binarie: si tolgono.
    xml = xml.replace(/\x04\x82[\s\S]{2}/g, '').replace(/\x04\x81[\s\S]/g, '').replace(/\x04[\s\S]/g, '');
    return decodifica(testoInBytes(xml));
  }

  async function estraiZip(buf) {
    const dv = new DataView(buf), b = new Uint8Array(buf), out = [];
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('lo zip non è leggibile');
    let p = dv.getUint32(eocd + 16, true);
    const n = dv.getUint16(eocd + 10, true);
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true), dimC = dv.getUint32(p + 20, true);
      const lNome = dv.getUint16(p + 28, true), lExtra = dv.getUint16(p + 30, true), lComm = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
      const nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + lNome));
      p += 46 + lNome + lExtra + lComm;
      if (nome.endsWith('/') || !/\.(xml|p7m)$/i.test(nome)) continue;
      const inizio = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
      const dati = b.slice(inizio, inizio + dimC);
      let contenuto;
      if (metodo === 0) contenuto = dati;
      else if (metodo === 8 && 'DecompressionStream' in window) contenuto = new Uint8Array(await new Response(new Blob([dati]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else { out.push({ nome, errore: 'compressione non supportata da questo browser' }); continue; }
      out.push({ nome: nome.split('/').pop(), bytes: contenuto });
    }
    return out;
  }

  async function leggiFile(files) {
    const pezzi = [];
    for (const f of files) {
      const buf = await f.arrayBuffer();
      if (/\.zip$/i.test(f.name)) { try { pezzi.push(...await estraiZip(buf)); } catch (e) { pezzi.push({ nome: f.name, errore: e.message }); } }
      else pezzi.push({ nome: f.name, bytes: new Uint8Array(buf) });
    }
    const xml = [];
    for (const p of pezzi) {
      if (p.errore) { xml.push(p); continue; }
      try { xml.push({ nome: p.nome, testo: /\.p7m$/i.test(p.nome) ? estraiDaP7m(p.bytes) : decodifica(p.bytes) }); }
      catch (e) { xml.push({ nome: p.nome, errore: e.message }); }
    }
    return xml;
  }

  // ---------- Lettura del contenuto FatturaPA ----------
  const giu = (el, nome) => el ? el.getElementsByTagNameNS('*', nome)[0] || null : null;
  const tutti = (el, nome) => el ? [...el.getElementsByTagNameNS('*', nome)] : [];
  const val = (el, nome) => { const x = giu(el, nome); return x ? x.textContent.trim() : ''; };
  const num = (el, nome) => { const v = val(el, nome); return v === '' ? 0 : Number(v); };
  const soloCifre = s => String(s || '').replace(/\D/g, '');

  function soggetto(el) {
    const id = giu(el, 'IdFiscaleIVA'), sede = giu(el, 'Sede');
    const anag = giu(el, 'Anagrafica');
    return {
      piva: val(id, 'IdCodice'), paese: val(id, 'IdPaese'), cf: val(giu(el, 'DatiAnagrafici'), 'CodiceFiscale'),
      nome: val(anag, 'Denominazione') || [val(anag, 'Nome'), val(anag, 'Cognome')].filter(Boolean).join(' '),
      indirizzo: [val(sede, 'Indirizzo'), val(sede, 'NumeroCivico')].filter(Boolean).join(', '),
      comune: [val(sede, 'CAP'), val(sede, 'Comune')].filter(Boolean).join(' '), provincia: val(sede, 'Provincia')
    };
  }

  function leggiFatture(testo, nomeFile, tipoPredefinito) {
    const doc = new DOMParser().parseFromString(testo, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('il file non è un XML valido');
    const radice = doc.documentElement;
    if (radice.localName !== 'FatturaElettronica') throw new Error('non è una fattura elettronica');
    const testa = giu(radice, 'FatturaElettronicaHeader');
    const cedente = soggetto(giu(testa, 'CedentePrestatore')), cessionario = soggetto(giu(testa, 'CessionarioCommittente'));
    const mia = soloCifre((window.CONFIG && window.CONFIG.AZIENDA && window.CONFIG.AZIENDA.piva) || '');
    let tipo = tipoPredefinito, riconosciuta = false;
    if (mia.length === 11 && !/^0+$/.test(mia)) {
      if (soloCifre(cedente.piva) === mia) { tipo = 'emessa'; riconosciuta = true; }
      else if (soloCifre(cessionario.piva) === mia || soloCifre(cessionario.cf) === mia) { tipo = 'ricevuta'; riconosciuta = true; }
    }
    if (!riconosciuta) {   // senza partita IVA nelle impostazioni si riconosce l'azienda dal nome
      const nomeAz = ((window.CONFIG && window.CONFIG.AZIENDA && window.CONFIG.AZIENDA.ragione_sociale) || 'EUROWORK').split(/\s+/)[0].toLowerCase();
      if (nomeAz.length > 3) { if (cedente.nome.toLowerCase().includes(nomeAz)) tipo = 'emessa'; else if (cessionario.nome.toLowerCase().includes(nomeAz)) tipo = 'ricevuta'; }
    }
    const controparte = tipo === 'emessa' ? cessionario : cedente;

    return tutti(radice, 'FatturaElettronicaBody').map(corpo => {
      const dg = giu(corpo, 'DatiGeneraliDocumento');
      const tipoDoc = val(dg, 'TipoDocumento');
      const riep = tutti(corpo, 'DatiRiepilogo');
      let imponibile = riep.reduce((s, r) => s + num(r, 'ImponibileImporto'), 0);
      const imposta = riep.reduce((s, r) => s + num(r, 'Imposta'), 0);
      const aliquote = [...new Set(riep.map(r => num(r, 'AliquotaIVA')))];
      let regime = 'ordinario';
      if (riep.some(r => val(r, 'EsigibilitaIVA') === 'S')) regime = 'split payment';
      else if (imposta === 0 && riep.some(r => /^N6/.test(val(r, 'Natura')))) regime = 'reverse charge';
      else if (imposta === 0 && imponibile) regime = 'esente';
      const ivaPct = aliquote.length === 1 ? aliquote[0] : (imponibile ? Math.round(imposta / imponibile * 10000) / 100 : 0);
      const notaCredito = ['TD04', 'TD08'].includes(tipoDoc);
      if (notaCredito) imponibile = -Math.abs(imponibile);
      const rate = tutti(corpo, 'DettaglioPagamento');
      const scadenze = rate.map(r => val(r, 'DataScadenzaPagamento')).filter(Boolean).sort();
      const mp = rate.length ? val(rate[0], 'ModalitaPagamento') : '';
      const causale = tutti(dg, 'Causale').map(c => c.textContent.trim()).join(' ');
      const prima = val(giu(corpo, 'DettaglioLinee'), 'Descrizione');
      const totaleDoc = val(dg, 'ImportoTotaleDocumento');
      return {
        file: nomeFile, tipo, tipoDoc, notaCredito, numero: val(dg, 'Numero'), data: val(dg, 'Data'), controparte,
        imponibile: Math.round(imponibile * 100) / 100, imposta: Math.round(imposta * 100) / 100, iva_pct: ivaPct, regime,
        totale: (notaCredito ? -1 : 1) * Math.abs(totaleDoc ? Number(totaleDoc) : Math.round((imponibile + imposta) * 100) / 100),
        scadenza: scadenze[0] || null, rate: rate.length,
        metodo_pagamento: App.MP_FATTURA[mp] || (mp ? 'Altro' : ''), iban: rate.length ? val(rate[0], 'IBAN') : '',
        descrizione: ((notaCredito ? 'Nota di credito – ' : '') + (causale || prima)).slice(0, 180),
        aliquoteMiste: aliquote.length > 1
      };
    });
  }

  // ---------- Finestra di importazione ----------
  App.importaFattureXml = function (tipoPredefinito, dopo) {
    const w = ui.finestra(`<h2>Importa fatture elettroniche</h2>
      <p class="nota" style="margin-bottom:12px">Scegli i file delle fatture: <b>.xml</b>, <b>.xml.p7m</b> (firmati) oppure uno <b>.zip</b> che li contiene. Si scaricano dal programma di fatturazione (per esempio CGN) o dal cassetto fiscale dell'Agenzia delle Entrate, nella sezione Fatture e corrispettivi. Fornitori e clienti nuovi vengono creati da soli, a partire dalla partita IVA.</p>
      <label for="x-file">File delle fatture</label><input id="x-file" type="file" multiple accept=".xml,.p7m,.zip">
      <div id="x-anteprima" style="margin-top:16px"></div>
      <div class="azioni"><button class="btn vuoto" data-no>Chiudi</button><button class="btn rosso" data-si disabled>Importa</button></div>`, { chiudiFuori: false });
    w.el.style.width = 'min(1100px,100%)';
    w.el.querySelector('[data-no]').onclick = w.chiudi;
    let righe = [], anag = [];

    w.el.querySelector('#x-file').onchange = async e => {
      const box = w.el.querySelector('#x-anteprima');
      box.innerHTML = '<p class="nota">Leggo le fatture…</p>';
      try {
        const xml = await leggiFile([...e.target.files]);
        const errori = [];
        righe = [];
        for (const x of xml) {
          if (x.errore) { errori.push(`${x.nome}: ${x.errore}`); continue; }
          try { righe.push(...leggiFatture(x.testo, x.nome, tipoPredefinito)); } catch (err) { errori.push(`${x.nome}: ${err.message}`); }
        }
        [anag] = await Promise.all([db.lista('anagrafiche', { sel: 'id,tipo,ragione_sociale,piva,codice_fiscale' })]);
        const numeri = [...new Set(righe.map(r => r.numero))];
        const esistenti = numeri.length ? await db.lista('fatture', { in: { numero: numeri }, sel: 'id,tipo,numero,data,cortesia,anagrafica:anagrafiche(piva,codice_fiscale)' }) : [];
        for (const r of righe) {
          const pi = soloCifre(r.controparte.piva), cf = (r.controparte.cf || '').toUpperCase();
          r.anagrafica = anag.find(a => (pi && soloCifre(a.piva) === pi) || (cf && (a.codice_fiscale || '').toUpperCase() === cf)) || null;
          const uguale = esistenti.find(f => f.tipo === r.tipo && f.numero === r.numero && f.data.slice(0, 4) === r.data.slice(0, 4) &&
            f.anagrafica && ((pi && soloCifre(f.anagrafica.piva) === pi) || (cf && (f.anagrafica.codice_fiscale || '').toUpperCase() === cf)));
          // una copia di cortesia già registrata viene sostituita dalla fattura elettronica
          r.cortesiaId = uguale && uguale.cortesia ? uguale.id : null;
          r.doppia = !!uguale && !r.cortesiaId;
          r.scelta = !r.doppia;
        }
        righe.sort((a, b) => a.data.localeCompare(b.data));
        const cantieri = await ui.opzioniRif(App.RIF.cantiere);
        const opzC = '<option value="">—</option>' + cantieri.map(c => `<option value="${c.id}">${esc(App.RIF.cantiere.etichetta(c))}</option>`).join('');
        const opzV = App.CATEGORIE_COSTO.map(c => `<option ${c === 'Materiali' ? 'selected' : ''}>${esc(c)}</option>`).join('');
        box.innerHTML = (errori.length ? `<p class="stato rosso" style="display:block;padding:10px 12px;margin-bottom:12px">Non letti: ${errori.map(esc).join('<br>')}<br>Se è un .p7m, prova a scaricare la versione .xml della stessa fattura.</p>` : '') +
          (righe.length ? `<p class="nota" style="margin-bottom:8px">${righe.length} ${righe.length === 1 ? 'fattura trovata' : 'fatture trovate'}${righe.some(r => r.doppia) ? `, di cui ${righe.filter(r => r.doppia).length} già registrate (non verranno importate)` : ''}. Scegli il cantiere e, per le ricevute, la voce di costo.</p>
          <div class="scorri"><table class="tabella"><thead><tr><th></th><th>Tipo</th><th>Numero</th><th>Data</th><th>Cliente / fornitore</th><th class="num">Imponibile</th><th class="num">Totale</th><th>Scadenza</th><th>Metodo</th><th>Cantiere</th><th>Voce</th></tr></thead><tbody>${
            righe.map((r, i) => `<tr class="${r.doppia ? 'spento' : ''}">
              <td><input type="checkbox" data-i="${i}" ${r.scelta ? 'checked' : ''} ${r.doppia ? 'disabled' : ''} aria-label="Importa fattura ${esc(r.numero)}"></td>
              <td>${r.tipo === 'emessa' ? 'emessa' : 'ricevuta'}${r.notaCredito ? '<br><span class="stato giallo">nota di credito</span>' : ''}</td>
              <td><b>${esc(r.numero)}</b></td><td>${fmt.data(r.data)}</td>
              <td>${esc(r.controparte.nome)}${r.cortesiaId ? ' <span class="stato giallo">sostituisce la copia di cortesia</span>' : ''}<br><span class="nota">${r.anagrafica ? 'già in anagrafica' : 'verrà aggiunto'}${r.controparte.piva ? ' – P.IVA ' + esc(r.controparte.piva) : ''}</span></td>
              <td class="num">${fmt.euro(r.imponibile)}</td><td class="num">${fmt.euro(r.totale)}${r.regime !== 'ordinario' ? `<br><span class="nota">${esc(r.regime)}</span>` : ''}</td>
              <td>${fmt.data(r.scadenza)}${r.rate > 1 ? `<br><span class="nota">${r.rate} rate</span>` : ''}</td><td>${esc(r.metodo_pagamento)}</td>
              <td><select data-cant="${i}" style="min-width:190px" aria-label="Cantiere" ${r.doppia ? 'disabled' : ''}>${opzC}</select></td>
              <td>${r.tipo === 'ricevuta' ? `<select data-voce="${i}" style="min-width:150px" aria-label="Voce di costo" ${r.doppia ? 'disabled' : ''}>${opzV}</select>` : ''}</td></tr>`).join('')}</tbody></table></div>`
            : '<p class="nota">Nessuna fattura trovata nei file scelti.</p>');
        aggiornaPulsante();
      } catch (err) { box.innerHTML = `<p class="errore">${esc(err.message)}</p>`; }
    };
    const bSi = w.el.querySelector('[data-si]');
    const aggiornaPulsante = () => { const n = righe.filter(r => r.scelta).length; bSi.disabled = !n; bSi.textContent = n ? `Importa ${n} ${n === 1 ? 'fattura' : 'fatture'}` : 'Importa'; };
    w.el.addEventListener('change', e => { const c = e.target.closest('[data-i]'); if (c) { righe[c.dataset.i].scelta = c.checked; aggiornaPulsante(); } });

    bSi.onclick = async () => {
      bSi.disabled = true;
      const scelte = righe.map((r, i) => ({ r, i })).filter(x => x.r.scelta);
      let fatte = 0; const problemi = [];
      for (const { r, i } of scelte) {
        bSi.textContent = `Importo ${fatte + 1} di ${scelte.length}…`;
        try {
          let a = r.anagrafica;
          if (!a) {
            const pi = soloCifre(r.controparte.piva), cf = (r.controparte.cf || '').toUpperCase();
            a = anag.find(x => (pi && soloCifre(x.piva) === pi) || (cf && (x.codice_fiscale || '').toUpperCase() === cf));
            if (!a) {
              a = await db.inserisci('anagrafiche', { tipo: r.tipo === 'emessa' ? 'cliente' : 'fornitore', ragione_sociale: r.controparte.nome || 'Senza nome', piva: r.controparte.piva || '',
                codice_fiscale: r.controparte.cf || '', indirizzo: r.controparte.indirizzo, comune: r.controparte.comune, provincia: r.controparte.provincia, note: 'Creato dall\'importazione delle fatture elettroniche' });
              anag.push(a);
            }
          }
          const cant = w.el.querySelector(`[data-cant="${i}"]`).value, voce = w.el.querySelector(`[data-voce="${i}"]`);
          const note = [r.aliquoteMiste ? 'Fattura con più aliquote IVA: aliquota media calcolata.' : '', r.rate > 1 ? `Pagamento in ${r.rate} rate, prima scadenza indicata.` : '', `Importata dal file ${r.file}`].filter(Boolean).join(' ');
          if (r.cortesiaId) {
            await db.aggiorna('fatture', r.cortesiaId, { data: r.data, imponibile: r.imponibile, iva_pct: r.iva_pct, regime: r.regime, scadenza: r.scadenza, metodo_pagamento: r.metodo_pagamento, iban: r.iban, origine: 'xml', cortesia: false,
              ...(cant ? { cantiere_id: Number(cant) } : {}), ...(voce && voce.value ? { categoria: voce.value } : {}) });
            r.scelta = false; r.doppia = true; fatte++; continue;
          }
          await db.inserisci('fatture', {
            tipo: r.tipo, numero: r.numero, data: r.data, anagrafica_id: a.id, cantiere_id: cant ? Number(cant) : null, descrizione: r.descrizione,
            categoria: voce ? voce.value : '', imponibile: r.imponibile, iva_pct: r.iva_pct, regime: r.regime, scadenza: r.scadenza,
            metodo_pagamento: r.metodo_pagamento, iban: r.iban, origine: 'xml',
            // una nota di credito non si paga: riduce i costi (o i ricavi) e si compensa con la fattura a cui si riferisce
            ...(r.notaCredito ? { pagata: true, data_pagamento: r.data } : {}),
            note: r.notaCredito ? 'Nota di credito: si compensa con la fattura a cui si riferisce. ' + note : note
          });
          r.scelta = false; r.doppia = true; fatte++;
        } catch (err) { problemi.push(`${r.numero}: ${err.message}`); }
      }
      ui.dimentica('anagrafiche'); ui.dimentica('fatture');
      if (problemi.length) { avviso(`Importate ${fatte} fatture. Non importate: ${problemi.join('; ')}`, { errore: true }); aggiornaPulsante(); }
      else { w.chiudi(); avviso(fatte === 1 ? '1 fattura importata' : `${fatte} fatture importate`); }
      dopo && dopo();
    };
  };
})();
