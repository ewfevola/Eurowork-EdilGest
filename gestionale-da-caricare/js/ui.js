// Strumenti comuni: formati, avvisi, finestre, moduli, elenchi, Excel, navigazione.
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FUSO = 'Europe/Rome';

  // ---------- Formati italiani ----------
  const fEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const fNum = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });
  const fmt = {
    euro: n => n == null || n === '' ? '' : fEuro.format(n),
    num: n => n == null || n === '' ? '' : fNum.format(n),
    ore: n => n == null ? '' : new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n),
    pct: n => n == null || !isFinite(n) ? '–' : new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(n) + '%',
    data: iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '',
    dataLunga: iso => new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')),
    ora: ts => new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(new Date(ts)),
    oggi: () => new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO }).format(new Date()),
    piuGiorni: (iso, g) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + g); return d.toISOString().slice(0, 10); },
    giorniTra: (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5)
  };
  // Accetta "1.234,50" e "1234.5"
  function leggiNumero(v) {
    if (v === '' || v == null) return null;
    let s = String(v).trim().replace(/\s|€/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');   // "2.400" = duemilaquattrocento
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  // ---------- Avvisi ----------
  let timer;
  function avviso(testo, { annulla, errore } = {}) {
    let a = $('#avviso');
    if (!a) {
      a = document.createElement('div'); a.id = 'avviso'; a.className = 'avviso'; a.setAttribute('role', 'status'); a.setAttribute('aria-live', 'polite');
      a.innerHTML = '<span></span><button type="button" hidden>Annulla</button>'; document.body.append(a);
    }
    clearTimeout(timer);
    a.querySelector('span').textContent = testo;
    a.classList.toggle('errore-avviso', !!errore);
    const b = a.querySelector('button'); b.hidden = !annulla;
    b.onclick = annulla ? () => { a.hidden = true; annulla(); } : null;
    a.hidden = false;
    timer = setTimeout(() => a.hidden = true, annulla ? 8000 : errore ? 6000 : 3500);
  }
  function errore(e) { console.error(e); avviso(e && e.message ? e.message : String(e), { errore: true }); }

  // ---------- Finestre ----------
  function finestra(html, { chiudiFuori = true } = {}) {
    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = `<div class="finestra" role="dialog" aria-modal="true">${html}</div>`;
    const prima = document.activeElement;
    const chiudi = () => { velo.remove(); document.removeEventListener('keydown', tasto); prima && prima.focus && prima.focus(); };
    const tasto = e => { if (e.key === 'Escape') chiudi(); };
    document.addEventListener('keydown', tasto);
    if (chiudiFuori) velo.addEventListener('mousedown', e => { if (e.target === velo) chiudi(); });
    document.body.append(velo);
    const f = velo.querySelector('input,select,textarea,button'); f && f.focus();
    return { el: velo.firstElementChild, chiudi };
  }
  function conferma(testo, { si = 'Conferma', pericolo = false } = {}) {
    return new Promise(ris => {
      const w = finestra(`<h2>${esc(testo)}</h2><div class="azioni"><button class="btn vuoto" data-no>Annulla</button><button class="btn ${pericolo ? 'rosso' : ''}" data-si>${esc(si)}</button></div>`);
      w.el.querySelector('[data-no]').onclick = () => { w.chiudi(); ris(false); };
      w.el.querySelector('[data-si]').onclick = () => { w.chiudi(); ris(true); };
      w.el.querySelector('[data-si]').focus();
    });
  }

  // ---------- Elenchi collegati (clienti, cantieri…) con memoria breve ----------
  const memoria = new Map();
  async function opzioniRif(rif) {
    const chiave = rif.tab + JSON.stringify(rif.q || {});
    if (!memoria.has(chiave)) memoria.set(chiave, db.lista(rif.tab, rif.q || {}).catch(e => { memoria.delete(chiave); throw e; }));
    return memoria.get(chiave);
  }
  const dimentica = tab => { for (const k of memoria.keys()) if (!tab || k.startsWith(tab)) memoria.delete(k); };

  // ---------- Modulo di inserimento / modifica ----------
  // campo: { k, label, tipo, opzioni, rif:{tab,q,etichetta}, richiesto, largo, mostraSe(dati), aiuto, sola }
  async function campoHtml(c, v) {
    const id = 'c-' + c.k;
    const req = c.richiesto ? 'required' : '';
    const dis = c.sola ? 'disabled' : '';
    const aiuto = c.aiuto ? `<span class="nota">${esc(c.aiuto)}</span>` : '';
    let input;
    switch (c.tipo) {
      case 'area': input = `<textarea id="${id}" name="${c.k}" ${req} ${dis}>${esc(v)}</textarea>`; break;
      case 'bool': return `<div class="${c.largo ? 'largo' : ''}" data-campo="${c.k}"><label class="spunta"><input type="checkbox" id="${id}" name="${c.k}" ${v ? 'checked' : ''} ${dis}> ${esc(c.label)}</label>${aiuto}</div>`;
      case 'select': {
        const ops = (c.opzioni || []).map(o => Array.isArray(o) ? o : [o, o]);
        input = `<select id="${id}" name="${c.k}" ${req} ${dis}>${c.richiesto ? '' : '<option value=""></option>'}${ops.map(([val, lab]) => `<option value="${esc(val)}" ${String(v ?? '') === String(val) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
        break;
      }
      case 'rif': {
        const righe = await opzioniRif(c.rif);
        const et = c.rif.etichetta || (r => r.nome);
        input = `<select id="${id}" name="${c.k}" ${req} ${dis}><option value="">${c.richiesto ? 'Scegli…' : '—'}</option>${righe.map(r => `<option value="${r.id}" ${String(v ?? '') === String(r.id) ? 'selected' : ''}>${esc(et(r))}</option>`).join('')}</select>`;
        break;
      }
      case 'euro': case 'numero': case 'pct':
        input = `<input id="${id}" name="${c.k}" inputmode="decimal" autocomplete="off" value="${v == null ? '' : esc(String(v).replace('.', ','))}" ${req} ${dis}>`; break;
      case 'data': input = `<input id="${id}" name="${c.k}" type="date" value="${esc(v || '')}" ${req} ${dis}>`; break;
      case 'email': input = `<input id="${id}" name="${c.k}" type="email" value="${esc(v)}" ${req} ${dis}>`; break;
      case 'tel': input = `<input id="${id}" name="${c.k}" type="tel" value="${esc(v)}" ${req} ${dis}>`; break;
      default: input = `<input id="${id}" name="${c.k}" value="${esc(v)}" ${req} ${dis} autocomplete="off" ${c.suggerimenti ? `list="${id}-l"` : ''}>` +
        (c.suggerimenti ? `<datalist id="${id}-l">${c.suggerimenti.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : '');
    }
    const unita = c.tipo === 'euro' ? ' (€)' : c.tipo === 'pct' ? ' (%)' : '';
    return `<div class="${c.largo || c.tipo === 'area' ? 'largo' : ''}" data-campo="${c.k}"><label for="${id}">${esc(c.label)}${unita}${c.richiesto ? ' *' : ''}</label>${input}${aiuto}</div>`;
  }
  function leggiCampi(form, campi) {
    const out = {};
    for (const c of campi) {
      if (c.sola) continue;
      const el = form.elements[c.k]; if (!el) continue;
      const box = el.closest('[data-campo]');
      if (box && box.hidden) continue;
      let v = c.tipo === 'bool' ? el.checked : el.value.trim();
      if (['euro', 'numero', 'pct'].includes(c.tipo)) {
        v = leggiNumero(v);
        if (Number.isNaN(v)) throw new Error(`"${c.label}" non è un numero valido.`);
        if (v === null) v = c.richiesto ? null : (c.vuoto !== undefined ? c.vuoto : 0);
      } else if (c.tipo === 'rif') v = v ? Number(v) : null;
      else if (c.tipo === 'data') v = v || null;
      if (c.richiesto && (v === null || v === '')) throw new Error(`Compila "${c.label}".`);
      out[c.k] = v;
    }
    return out;
  }
  async function modulo({ titolo, campi, valori = {}, salva, elimina, testoSalva = 'Salva' }) {
    const html = (await Promise.all(campi.map(c => campoHtml(c, valori[c.k])))).join('');
    const w = finestra(`<h2>${esc(titolo)}</h2><form novalidate><div class="campi">${html}</div>
      <p class="errore" role="alert" hidden></p>
      <div class="azioni">${elimina ? '<button type="button" class="btn testo" data-elimina style="margin-right:auto">Elimina</button>' : ''}
      <button type="button" class="btn vuoto" data-annulla>Annulla</button><button type="submit" class="btn rosso">${esc(testoSalva)}</button></div></form>`, { chiudiFuori: false });
    const form = w.el.querySelector('form');
    const aggiornaVisibili = () => {
      let dati = {}; try { dati = leggiCampiGrezzi(form, campi); } catch {}
      for (const c of campi) if (c.mostraSe) form.querySelector(`[data-campo="${c.k}"]`).hidden = !c.mostraSe(dati);
    };
    form.addEventListener('change', aggiornaVisibili); aggiornaVisibili();
    w.el.querySelector('[data-annulla]').onclick = w.chiudi;
    const msg = w.el.querySelector('.errore');
    if (elimina) w.el.querySelector('[data-elimina]').onclick = async () => {
      if (!await conferma('Eliminare definitivamente?', { si: 'Elimina', pericolo: true })) return;
      try { await elimina(); w.chiudi(); avviso('Eliminato'); } catch (e) { msg.hidden = false; msg.textContent = e.message; }
    };
    form.addEventListener('submit', async e => {
      e.preventDefault(); msg.hidden = true;
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try { await salva(leggiCampi(form, campi)); w.chiudi(); }
      catch (err) { msg.hidden = false; msg.textContent = err.message; }
      finally { btn.disabled = false; }
    });
    return w;
  }
  function leggiCampiGrezzi(form, campi) {
    const o = {}; for (const c of campi) { const el = form.elements[c.k]; if (el) o[c.k] = c.tipo === 'bool' ? el.checked : el.value; } return o;
  }

  // ---------- Elenco generico con ricerca, filtri, Excel ----------
  // conf: { tabella, vista, campi, colonne:[{k,t,f(r),num}], q, cerca:[col], filtri:[{k,label,opzioni,predef}], ordina,
  //         nuovo:'Nuovo …', predefiniti, apri(r), titoloModifica(r), dopoSalva, eliminabile, piede(righe), esporta:'nome', classeRiga(r) }
  function elenco(el, conf) {
    el.classList.add('pannello');
    const st = { filtri: {}, testo: '', righe: [] };
    for (const f of conf.filtri || []) st.filtri[f.k] = f.predef ?? '';
    el.innerHTML = `<div class="barra-elenco non-stampare">
      ${conf.cerca ? `<div class="cerca"><label for="cerca-${conf.tabella}">Cerca</label><input id="cerca-${conf.tabella}" type="search" autocomplete="off"></div>` : ''}
      ${(conf.filtri || []).map(f => `<div class="filtro"><label for="f-${conf.tabella}-${f.k}">${esc(f.label)}</label><select id="f-${conf.tabella}-${f.k}" data-filtro="${f.k}">
        ${f.opzioni.map(o => Array.isArray(o) ? o : [o, o]).map(([v, l]) => `<option value="${esc(v)}" ${String(st.filtri[f.k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`).join('')}
      <div class="azioni" style="margin-left:auto">${conf.esporta ? '<button class="btn vuoto" data-excel>Excel</button>' : ''}${conf.nuovo ? `<button class="btn rosso" data-nuovo>${esc(conf.nuovo)}</button>` : ''}</div>
    </div><div class="conteggio-righe"></div><div class="scorri"><table class="tabella"></table></div>`;

    let attesa;
    const cerca = $(`#cerca-${conf.tabella}`, el);
    if (cerca) cerca.addEventListener('input', () => { clearTimeout(attesa); attesa = setTimeout(() => { st.testo = cerca.value.trim(); carica(); }, 250); });
    $$('[data-filtro]', el).forEach(s => s.addEventListener('change', () => { st.filtri[s.dataset.filtro] = s.value; carica(); }));

    async function carica() {
      const q = JSON.parse(JSON.stringify(conf.q || {}));
      q.eq = q.eq || {};
      for (const f of conf.filtri || []) {
        const v = st.filtri[f.k]; if (v === '') continue;
        if (f.applica) f.applica(q, v); else q.eq[f.k] = v;
      }
      if (st.testo && conf.cerca) {
        const t = st.testo.replace(/[*,()"]/g, ' ');
        q.or = conf.cerca.map(c => `${c}.ilike.*${t}*`).join(',');
      }
      q.ordina = q.ordina || conf.ordina;
      try {
        st.righe = await db.lista(conf.vista || conf.tabella, q);
        disegna();
      } catch (e) { errore(e); }
    }
    function disegna() {
      const r = st.righe;
      $('.conteggio-righe', el).textContent = r.length === 1 ? '1 elemento' : `${r.length} elementi`;
      const t = $('table', el);
      if (!r.length) { t.innerHTML = `<tbody><tr><td class="vuota">${esc(conf.vuoto || 'Nessun elemento. ' + (conf.nuovo ? `Premi "${conf.nuovo}" per aggiungerne uno.` : ''))}</td></tr></tbody>`; return; }
      t.innerHTML = `<thead><tr>${conf.colonne.map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead>
        <tbody>${r.map((x, i) => `<tr class="cliccabile ${conf.classeRiga ? conf.classeRiga(x) : ''}" data-i="${i}" tabindex="0">${conf.colonne.map(c => `<td class="${c.num ? 'num' : ''}">${c.f ? c.f(x) : esc(x[c.k])}</td>`).join('')}</tr>`).join('')}</tbody>
        ${conf.piede ? `<tfoot>${conf.piede(r)}</tfoot>` : ''}`;
    }
    async function apriModifica(riga) {
      if (conf.apri) return conf.apri(riga);
      const valori = conf.vista ? await db.uno(conf.tabella, riga.id) : riga;
      modulo({
        titolo: conf.titoloModifica ? conf.titoloModifica(valori) : 'Modifica',
        campi: conf.campi, valori,
        salva: async d => { await db.aggiorna(conf.tabella, riga.id, d); dimentica(conf.tabella); avviso('Salvato'); conf.dopoSalva && conf.dopoSalva(); carica(); },
        elimina: conf.eliminabile === false ? null : async () => { await db.elimina(conf.tabella, riga.id); dimentica(conf.tabella); carica(); }
      });
    }
    $('table', el).addEventListener('click', e => {
      if (e.target.closest('button,a,input')) return;
      const tr = e.target.closest('tr[data-i]'); if (tr) apriModifica(st.righe[tr.dataset.i]);
    });
    $('table', el).addEventListener('keydown', e => {
      const tr = e.target.closest('tr[data-i]'); if (tr && e.key === 'Enter') apriModifica(st.righe[tr.dataset.i]);
    });
    const bn = $('[data-nuovo]', el);
    if (bn) bn.onclick = () => typeof conf.nuovoAzione === 'function' ? conf.nuovoAzione() : modulo({
      titolo: conf.nuovo, campi: conf.campi, valori: typeof conf.predefiniti === 'function' ? conf.predefiniti() : (conf.predefiniti || {}),
      salva: async d => { await db.inserisci(conf.tabella, { ...d, ...(conf.fissi || {}) }); dimentica(conf.tabella); avviso('Aggiunto'); conf.dopoSalva && conf.dopoSalva(); carica(); }
    });
    const bx = $('[data-excel]', el);
    if (bx) bx.onclick = () => excel(conf.esporta, [{ nome: conf.esporta.slice(0, 31), righe: st.righe.map(x => {
      const o = {}; for (const c of conf.colonne) o[c.t] = c.x ? c.x(x) : (c.f ? testo(c.f(x)) : x[c.k]); return o;
    }) }]);
    carica();
    return { ricarica: carica, get righe() { return st.righe; } };
  }
  const testo = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };

  // ---------- Excel ----------
  function excel(nomeFile, fogli) {
    if (!window.XLSX) return avviso('Impossibile creare il file Excel: controlla la connessione e ricarica la pagina.', { errore: true });
    const wb = XLSX.utils.book_new();
    for (const f of fogli) {
      const ws = XLSX.utils.json_to_sheet(f.righe.length ? f.righe : [{ Nota: 'Nessun dato' }]);
      const chiavi = Object.keys(f.righe[0] || { Nota: 1 });
      ws['!cols'] = chiavi.map(k => ({ wch: Math.min(48, Math.max(k.length, ...f.righe.slice(0, 200).map(r => String(r[k] ?? '').length)) + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, f.nome.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    }
    XLSX.writeFile(wb, nomeFile.replace(/[\\/:*?"<>|]/g, '') + '.xlsx');
  }

  // ---------- Foto: riduce le immagini grandi prima di caricarle ----------
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
  const nomeSicuro = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);

  // ---------- Navigazione (#pagina oppure #pagina-id) ----------
  const pagine = {};
  function pagina(nome, fn) { pagine[nome] = fn; }
  function vai(nome, id) { location.hash = id != null ? `${nome}-${id}` : nome; }
  function letturaHash() {
    const h = location.hash.slice(1);
    const m = h.match(/^([a-z]+)(?:-(\d+))?$/);
    return m ? { nome: m[1], id: m[2] ? Number(m[2]) : null } : { nome: '', id: null };
  }

  window.ui = { campoHtml, $, $$, esc, fmt, leggiNumero, avviso, errore, finestra, conferma, modulo, elenco, excel, comprimi, nomeSicuro, opzioniRif, dimentica, pagina, pagine, vai, letturaHash, testo };
})();
