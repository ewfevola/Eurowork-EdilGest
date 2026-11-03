// Costi fissi aziendali e quota da caricare sui cantieri.
(function () {
  const { $, esc, fmt, avviso, errore } = ui;

  ui.pagina('costifissi', async el => {
    const oggi = fmt.oggi(), annoFa = fmt.piuGiorni(oggi, -365);
    const [fissi, senzaCant, emesse, [imp]] = await Promise.all([
      db.lista('costi_fissi', { eq: { attivo: true }, sel: 'importo_annuo' }),
      db.lista('fatture', { eq: { tipo: 'ricevuta' }, nullo: { cantiere_id: true }, gte: { data: annoFa }, sel: 'imponibile' }),
      db.lista('fatture', { eq: { tipo: 'emessa' }, gte: { data: annoFa }, sel: 'imponibile' }),
      db.lista('impostazioni', { eq: { chiave: 'quota_costi_fissi_pct' } })
    ]);
    const tFissi = fissi.reduce((a, x) => a + Number(x.importo_annuo), 0);
    const tSenza = senzaCant.reduce((a, x) => a + Number(x.imponibile), 0);
    const tFatt = emesse.reduce((a, x) => a + Number(x.imponibile), 0);
    const suggerita = tFatt ? Math.round((tFissi + tSenza) / tFatt * 1000) / 10 : null;
    const quota = imp ? Number(imp.valore) : 0;

    el.innerHTML = App.testata('Costi fissi aziendali') + `
      <p class="nota" style="margin:-10px 0 18px;max-width:75ch">Sono i costi dell'azienda che non appartengono a un cantiere: personale d'ufficio, sede, assicurazioni, consulenze, certificazioni. Ogni cantiere ne copre una parte, in percentuale sui suoi ricavi: è la "quota costi fissi aziendali" che compare nel resoconto di cantiere, prima dell'utile.</p>
      <div class="cifre">
        <div class="cifra"><b>${fmt.euro(tFissi)}</b><span>costi fissi annui inseriti qui sotto</span></div>
        <div class="cifra"><b>${fmt.euro(tSenza)}</b><span>fatture ricevute senza cantiere, ultimi 12 mesi</span></div>
        <div class="cifra"><b>${fmt.euro(tFatt)}</b><span>fatturato degli ultimi 12 mesi</span></div>
        <div class="cifra"><b>${suggerita == null ? '–' : fmt.pct(suggerita)}</b><span>quota che servirebbe a coprirli</span></div>
      </div>
      <form class="barra-elenco pannello" id="cf-quota" style="align-items:end">
        <div class="filtro" style="flex-basis:220px"><label for="cf-pct">Quota applicata ai cantieri (%)</label><input id="cf-pct" inputmode="decimal" value="${String(quota).replace('.', ',')}"></div>
        <div class="azioni"><button class="btn rosso" type="submit">Salva quota</button>${suggerita != null ? `<button class="btn vuoto" type="button" id="cf-usa">Usa ${fmt.pct(suggerita)}</button>` : ''}</div>
        <p class="nota" style="flex-basis:100%">La quota suggerita è (costi fissi annui + fatture senza cantiere) diviso il fatturato degli ultimi 12 mesi. Nel primo anno, con poco fatturato registrato, conviene inserire una stima concordata con il commercialista (spesso tra l'8 e il 15%).</p>
      </form>
      <div class="sezione"><h2>Costi fissi annui</h2><p class="nota" style="margin-bottom:12px">Scrivi l'importo di un anno intero, senza IVA. Per gli stipendi d'ufficio usa il costo aziendale annuo.</p><div id="cf-el"></div></div>
      <div class="sezione"><h2>Fatture ricevute senza cantiere</h2><p class="nota" style="margin-bottom:12px">Contano come costi fissi. Se una di queste riguarda un cantiere, aprila e scegli il cantiere: passerà nei costi di quel cantiere.</p><div id="cf-fatt"></div></div>`;

    $('#cf-quota', el).onsubmit = async e => {
      e.preventDefault();
      const v = ui.leggiNumero($('#cf-pct', el).value);
      if (v == null || Number.isNaN(v) || v < 0 || v > 100) return avviso('Scrivi una percentuale tra 0 e 100, es. 11,5.', { errore: true });
      try { await App.salvaImpostazione('quota_costi_fissi_pct', v); avviso('Quota salvata'); ui.pagine.costifissi(el); } catch (err) { errore(err); }
    };
    const usa = $('#cf-usa', el);
    if (usa) usa.onclick = () => { $('#cf-pct', el).value = String(suggerita).replace('.', ','); };

    ui.elenco($('#cf-el', el), {
      tabella: 'costi_fissi', esporta: 'Costi fissi aziendali', nuovo: 'Aggiungi costo fisso', ordina: 'categoria,descrizione',
      campi: [
        { k: 'descrizione', label: 'Descrizione', richiesto: true, largo: true, aiuto: 'es. Stipendio impiegata amministrativa, affitto sede, RC aziendale' },
        { k: 'categoria', label: 'Categoria', tipo: 'select', opzioni: App.CATEGORIE_FISSI_AZIENDA, richiesto: true },
        { k: 'importo_annuo', label: 'Importo annuo senza IVA', tipo: 'euro', richiesto: true },
        { k: 'attivo', label: 'Ancora in corso', tipo: 'bool' },
        { k: 'note', label: 'Note', tipo: 'area' }
      ],
      predefiniti: { categoria: 'Sede e utenze', attivo: true },
      dopoSalva: () => ui.pagine.costifissi(el),
      colonne: [
        { k: 'descrizione', t: 'Descrizione', f: r => `<b>${esc(r.descrizione)}</b>` }, { k: 'categoria', t: 'Categoria' },
        { k: 'importo_annuo', t: 'All\'anno', num: true, f: r => fmt.euro(r.importo_annuo), x: r => Number(r.importo_annuo) },
        { k: 'mese', t: 'Al mese', num: true, f: r => fmt.euro(r.importo_annuo / 12), x: r => Math.round(r.importo_annuo / 12 * 100) / 100 }
      ],
      classeRiga: r => r.attivo ? '' : 'spento',
      piede: r => { const t = r.filter(x => x.attivo).reduce((a, x) => a + Number(x.importo_annuo), 0); return `<tr><td colspan="2">Totale (solo quelli in corso)</td><td class="num">${fmt.euro(t)}</td><td class="num">${fmt.euro(t / 12)}</td></tr>`; }
    });
    App.elencoFatture($('#cf-fatt', el), 'ricevuta', {}, { senzaCantiere: true });
  });

  App.salvaImpostazione = (chiave, valore) => db.aggiornaDove('impostazioni', { chiave }, { valore, aggiornato_il: new Date().toISOString() });
})();
