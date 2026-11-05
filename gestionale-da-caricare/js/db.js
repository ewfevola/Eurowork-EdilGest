// Collegamento al database Supabase (accesso, tabelle, file).
// Client minimo scritto apposta: nessuna libreria esterna da aggiornare.
(function () {
  const C = window.CONFIG || {};
  const URL_BASE = (C.SUPABASE_URL || '').replace(/\/+$/, '');
  const CHIAVE = C.SUPABASE_ANON_KEY || '';
  const K_SESSIONE = 'eurowork-sessione';

  let sessione = null;
  try { sessione = JSON.parse(localStorage.getItem(K_SESSIONE) || 'null'); } catch {}

  function salvaSessione(s) {
    sessione = s;
    try { s ? localStorage.setItem(K_SESSIONE, JSON.stringify(s)) : localStorage.removeItem(K_SESSIONE); } catch {}
  }

  class ErroreDb extends Error {
    constructor(messaggio, codice) { super(messaggio); this.codice = codice; }
  }

  // Traduce gli errori del database in frasi comprensibili.
  function spiega(stato, corpo) {
    const c = corpo || {};
    const codice = c.code || c.error || '';
    const msg = c.message || c.msg || c.error_description || '';
    if (codice === '23503') return new ErroreDb('Non si può eliminare: è collegato ad altri dati. Puoi disattivarlo o chiuderlo invece.', codice);
    if (codice === '23505') return new ErroreDb(/fatture_unica/.test(msg) ? 'Questa fattura è già registrata: stesso numero e stesso cliente o fornitore nello stesso anno.' : 'Esiste già un elemento con questi dati.', codice);
    if (codice === '23514') return new ErroreDb('Un valore non è ammesso: controlla i campi.', codice);
    if (codice === '22P02' || codice === '22007' || codice === '22008') return new ErroreDb('Un campo contiene un valore non valido.', codice);
    if (codice === '42501' || stato === 403) return new ErroreDb('Non hai i permessi per questa operazione.', codice);
    if (codice === 'P0001') return new ErroreDb(msg, codice);
    if (stato === 401) return new ErroreDb('Sessione scaduta: accedi di nuovo.', 'sessione');
    return new ErroreDb(msg || `Errore ${stato}`, codice);
  }

  async function chiama(percorso, { metodo = 'GET', corpo, intestazioni = {}, grezzo = false } = {}) {
    await rinnovaSeServe();
    const h = { apikey: CHIAVE, ...intestazioni };
    if (sessione) h.Authorization = 'Bearer ' + sessione.access_token;
    if (corpo !== undefined && !(corpo instanceof Blob) && !h['Content-Type']) h['Content-Type'] = 'application/json';
    let r;
    try {
      r = await fetch(URL_BASE + percorso, {
        method: metodo, headers: h,
        body: corpo === undefined ? undefined : (corpo instanceof Blob ? corpo : JSON.stringify(corpo))
      });
    } catch (e) {
      throw new ErroreDb('Nessuna connessione. Riprova quando c\'è campo.', 'rete');
    }
    if (grezzo) return r;
    const testo = await r.text();
    let dati = null;
    try { dati = testo ? JSON.parse(testo) : null; } catch { dati = testo; }
    if (!r.ok) {
      const err = spiega(r.status, dati);
      if (err.codice === 'sessione') { salvaSessione(null); window.dispatchEvent(new Event('sessione-scaduta')); }
      throw err;
    }
    return { dati, risposta: r };
  }

  // ---------- Accesso ----------
  async function richiestaToken(tipo, corpo) {
    let r;
    try {
      r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=${tipo}`, {
        method: 'POST', headers: { apikey: CHIAVE, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
      });
    } catch { throw new ErroreDb('Nessuna connessione.', 'rete'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErroreDb(/invalid/i.test(d.error_description || d.msg || d.error || '') ? 'Email o password sbagliate.' : (d.msg || d.error_description || 'Accesso non riuscito.'), 'accesso');
    const s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), utente: d.user };
    salvaSessione(s);
    return s;
  }

  let rinnovo = null;
  async function rinnovaSeServe() {
    if (!sessione) return;
    if (sessione.expires_at - 60 > Date.now() / 1000) return;
    if (!rinnovo) {
      rinnovo = richiestaToken('refresh_token', { refresh_token: sessione.refresh_token })
        .catch(() => { salvaSessione(null); window.dispatchEvent(new Event('sessione-scaduta')); })
        .finally(() => { rinnovo = null; });
    }
    await rinnovo;
  }

  // ---------- Filtri per le tabelle ----------
  // q = { sel, eq:{col:v}, neq, gte, lte, gt, lt, in:{col:[...]}, nullo:{col:true|false}, cerca:{col:'testo'}, or:'raw', ordina:'col,col2.desc', limite }
  function parametri(q = {}) {
    const p = new URLSearchParams();
    p.set('select', q.sel || '*');
    for (const op of ['eq', 'neq', 'gte', 'lte', 'gt', 'lt']) {
      for (const [k, v] of Object.entries(q[op] || {})) if (v !== undefined && v !== null && v !== '') p.append(k, `${op}.${v}`);
    }
    for (const [k, v] of Object.entries(q.in || {})) p.append(k, `in.(${v.map(x => `"${String(x).replace(/"/g, '')}"`).join(',')})`);
    for (const [k, v] of Object.entries(q.nullo || {})) p.append(k, v ? 'is.null' : 'not.is.null');
    for (const [k, v] of Object.entries(q.cerca || {})) if (v) p.append(k, `ilike.*${v.replace(/[*,()]/g, ' ')}*`);
    if (q.or) p.append('or', `(${q.or})`);
    if (q.ordina) p.set('order', q.ordina.split(',').map(s => s.includes('.') ? s : s + '.asc').join(','));
    return p;
  }

  const db = {
    configurato: !!URL_BASE && !URL_BASE.includes('INCOLLA') && !!CHIAVE,
    ErroreDb,
    get utente() { return sessione && sessione.utente; },
    get collegato() { return !!sessione; },

    accedi: (email, password) => richiestaToken('password', { email, password }),
    async esci() {
      try { if (sessione) await fetch(`${URL_BASE}/auth/v1/logout`, { method: 'POST', headers: { apikey: CHIAVE, Authorization: 'Bearer ' + sessione.access_token } }); } catch {}
      salvaSessione(null);
    },

    // Tutte le righe (a blocchi di 1000) oppure fino a q.limite.
    async lista(tabella, q = {}) {
      const p = parametri(q);
      const passo = 1000; let da = 0, tutte = [];
      for (;;) {
        const quante = q.limite ? Math.min(passo, q.limite - tutte.length) : passo;
        p.set('limit', quante); p.set('offset', da);
        const { dati } = await chiama(`/rest/v1/${tabella}?${p}`);
        tutte = tutte.concat(dati);
        if (dati.length < quante || (q.limite && tutte.length >= q.limite)) return tutte;
        da += passo;
      }
    },
    async uno(tabella, id, sel) {
      const r = await db.lista(tabella, { sel, eq: { id }, limite: 1 });
      if (!r.length) throw new ErroreDb('Elemento non trovato o non visibile.', 'manca');
      return r[0];
    },
    async inserisci(tabella, righe) {
      const { dati } = await chiama(`/rest/v1/${tabella}`, { metodo: 'POST', corpo: righe, intestazioni: { Prefer: 'return=representation' } });
      return Array.isArray(righe) ? dati : dati[0];
    },
    async aggiorna(tabella, id, valori) {
      const { dati } = await chiama(`/rest/v1/${tabella}?id=eq.${encodeURIComponent(id)}`, { metodo: 'PATCH', corpo: valori, intestazioni: { Prefer: 'return=representation' } });
      if (!dati.length) throw new ErroreDb('Modifica non salvata: non hai i permessi o l\'elemento non esiste più.', '42501');
      return dati[0];
    },
    // Modifica le righe che corrispondono a tutti i valori di "dove" (per tabelle senza colonna id).
    async aggiornaDove(tabella, dove, valori) {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(dove)) p.append(k, `eq.${v}`);
      const { dati } = await chiama(`/rest/v1/${tabella}?${p}`, { metodo: 'PATCH', corpo: valori, intestazioni: { Prefer: 'return=representation' } });
      if (!dati.length) throw new ErroreDb('Modifica non salvata: non hai i permessi o l\'elemento non esiste.', '42501');
      return dati[0];
    },
    async elimina(tabella, id) {
      const { dati } = await chiama(`/rest/v1/${tabella}?id=eq.${encodeURIComponent(id)}`, { metodo: 'DELETE', intestazioni: { Prefer: 'return=representation' } });
      if (!dati.length) throw new ErroreDb('Eliminazione non riuscita: non hai i permessi.', '42501');
    },
    async rpc(funzione, argomenti = {}) {
      const { dati } = await chiama(`/rest/v1/rpc/${funzione}`, { metodo: 'POST', corpo: argomenti });
      return dati;
    },
    // Funzioni sul server di Supabase (es. lettura dei documenti con l'IA: la chiave resta sul server)
    async funzione(nome, corpo = {}) {
      const r = await chiama(`/functions/v1/${nome}`, { metodo: 'POST', corpo, grezzo: true });
      const testo = await r.text(); let d = null; try { d = JSON.parse(testo); } catch {}
      if (r.status === 404) throw new ErroreDb(`La funzione "${nome}" non è ancora attiva su Supabase: va pubblicata una volta (vedi le istruzioni).`, 'funzione');
      if (!r.ok) throw new ErroreDb((d && (d.message || d.error || d.msg)) || `Errore ${r.status}`, 'funzione');
      return d;
    },

    // ---------- File (cartella privata "documenti") ----------
    async caricaFile(percorso, file) {
      const p = percorso.split('/').map(encodeURIComponent).join('/');
      await chiama(`/storage/v1/object/documenti/${p}`, { metodo: 'POST', corpo: file, intestazioni: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' } });
    },
    async linkFile(percorso, secondi = 600) {
      const p = percorso.split('/').map(encodeURIComponent).join('/');
      const { dati } = await chiama(`/storage/v1/object/sign/documenti/${p}`, { metodo: 'POST', corpo: { expiresIn: secondi } });
      const firmato = dati.signedURL || dati.signedUrl;
      return /^https?:/.test(firmato) ? firmato : `${URL_BASE}/storage/v1${firmato}`;
    },
    async eliminaFile(percorso) {
      await chiama(`/storage/v1/object/documenti`, { metodo: 'DELETE', corpo: { prefixes: [percorso] } });
    }
  };

  window.db = db;
})();
