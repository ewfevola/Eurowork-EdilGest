# Gestionale EUROWORK

Gestionale interno di EUROWORK s.r.l. per ufficio e capicantiere. Si apre dal browser, su PC e telefono, e non ha costi di licenza.

## Cosa fa

| Sezione | Chi la vede | Cosa contiene |
|---|---|---|
| **Home** | Ufficio | Chi è in cantiere adesso, scadenze, soldi da incassare e da pagare, preventivi in attesa, andamento dei cantieri. |
| **Cantieri** | Ufficio | Dati del cantiere (committente, CIG, CUP, importo), budget e consuntivo per voce, spese previste, resoconto economico (ricavi, costi variabili e fissi, margini, utile), costi, fatturato, ore, giornale, documenti. |
| **Presenze** | Tutti | Il capocantiere registra entrata e uscita dei lavoratori. L'ufficio vede le ore, corregge le dimenticanze ed esporta in Excel. |
| **Giornale lavori** | Tutti | Una pagina per cantiere e giorno: meteo, lavorazioni, materiali, ore dei mezzi e foto. Presenze aggiunte da sole. Si stampa o si salva in PDF. |
| **Personale** | Ufficio | Lavoratori con costo orario, contratto e scadenze (visite, corsi, UNILAV). |
| **Mezzi e attrezzature** | Ufficio | Mezzi con costo orario, revisioni e assicurazioni. |
| **Scadenze** | Ufficio | Tutte le scadenze in un elenco: personale, mezzi, cantieri, fornitori (DURC), azienda (SOA, ISO). *Rinnova* chiude la scadenza e crea la successiva. |
| **Preventivi** | Ufficio | Voci con prezzo e costo stimato, quindi margine. Righe incollabili da Excel o dal prezzario regionale. Stampa con intestazione. Da un preventivo accettato si crea il cantiere. |
| **Costi fissi aziendali** | Ufficio | Costi dell'azienda che non appartengono a un cantiere (ufficio, sede, assicurazioni, consulenze) e la quota percentuale che ogni cantiere deve coprire. |
| **Contabilità** | Ufficio | Fatture emesse e ricevute collegate ai cantieri, regime IVA (anche split payment e reverse charge), scadenziario incassi e pagamenti, prima nota di cassa e banca con saldi. |
| **Clienti e fornitori** | Ufficio | Anagrafiche di clienti, enti, fornitori, subappaltatori. |
| **Documenti** | Ufficio; il capocantiere vede solo quelli dei cantieri | Archivio di file e foto per cantiere, lavoratore, mezzo, fornitore o azienda. |
| **Utenti** | Ufficio | Attiva o blocca gli account e sceglie il ruolo. |

**Cosa non fa:** non emette fatture elettroniche XML, non le invia allo SDI e non tiene i registri IVA. Le fatture si emettono con il programma che usate oggi e i registri restano al commercialista. Nel gestionale si registrano importo, scadenza e cantiere, per avere scadenziario e conti dei cantieri.

**Come si calcolano i costi del cantiere:**
- la manodopera è ore dalle presenze × costo orario del lavoratore;
- i mezzi sono ore dal giornale × costo orario del mezzo;
- a questi si aggiungono le fatture dei fornitori collegate al cantiere e le altre spese registrate.

Tutti gli importi sono senza IVA.

**Spese previste.** Quando decidete o ordinate un acquisto per un cantiere (attrezzi, materiali, un nolo), registratelo in *Cantiere → Costi → Spese previste*. Entra subito nella stima a fine lavori, anche se la fattura non è ancora arrivata.

Quando arriva la fattura, premete *Registra fattura*: si apre già compilata con cantiere, fornitore, voce e importo. Se la fattura è già stata registrata da Contabilità, usate invece *Collega esistente*.

Da quel momento conta la fattura e non più la previsione, quindi la spesa non viene contata due volte.

**Costo stimato a fine lavori.** Si calcola voce per voce: vale il budget, oppure speso + previsto se è di più. Il margine stimato è l'importo del contratto meno questo costo.

**Collegare una fattura a un cantiere.** Ci sono tre modi:
- dal cantiere: *Costi* per le fatture dei fornitori, *Fatturato* per le fatture emesse. Il cantiere è già impostato;
- da *Contabilità*: nel modulo della fattura scegli il campo *Cantiere*;
- per una fattura già registrata: aprila con un clic e scegli il cantiere.

Una fattura ricevuta senza cantiere conta come costo fisso aziendale.

**Resoconto di cantiere** (scheda *Resoconto*). È il conto economico del cantiere, nell'ordine:
1. ricavi;
2. meno i costi variabili, voce per voce (manodopera, mezzi, materiali, attrezzature, subappalti, noli, trasporti);
3. uguale **margine di contribuzione**;
4. meno i costi fissi di cantiere (spese generali di cantiere: allestimento, sicurezza, baracche, guardiania);
5. uguale **margine di cantiere**;
6. meno la quota dei costi fissi aziendali;
7. uguale **utile del cantiere**.

Mentre il cantiere è aperto ci sono due colonne, *a oggi* e *stima a fine lavori*; quando lo chiudi resta il dato finale. Accanto ci sono gli indicatori: incassato e da incassare, ore, costo orario medio, ricavo per ora lavorata, durata, confronto con il preventivo. Il resoconto si stampa, si salva in PDF o si scarica in Excel.

**Pagamenti.** Ogni fattura ha il suo metodo di pagamento (bonifico, RiBa, assegno, contanti, carta, addebito SEPA, F24, PagoPA) e, se serve, l'IBAN. Con *Incassa* o *Paga* registri data, conto, importo, metodo e riferimento (CRO del bonifico o numero dell'assegno). Il movimento finisce da solo in prima nota, con cliente o fornitore, cantiere e fattura collegata.

Si possono registrare anche **acconti**: la fattura resta *pagata in parte* finché non è saldata. Puoi anche collegare a una fattura un movimento scritto a mano in prima nota: la fattura si aggiorna lo stesso.

**Importare le fatture elettroniche.** In *Contabilità → Fatture ricevute* (o *emesse*) premi **Importa fatture XML** e scegli i file: `.xml`, `.xml.p7m` firmati, oppure uno `.zip` con tante fatture. Si scaricano dal programma di fatturazione (CGN compreso) o dal cassetto fiscale dell'Agenzia delle Entrate.

Il gestionale legge numero, data, importi, IVA (anche split payment e reverse charge), scadenze, metodo di pagamento e IBAN. Crea da solo i fornitori e i clienti nuovi a partire dalla partita IVA e non importa le fatture già registrate. Prima di confermare scegli il cantiere e la voce di costo.

Per riconoscere da solo se una fattura è emessa o ricevuta, inserisci la partita IVA dell'azienda in `config.js`.

**Fatture doppie.** La stessa fattura dello stesso fornitore non si può registrare due volte nello stesso anno.

## Sicurezza dei dati

- Ogni persona ha il suo account. Un account nuovo nasce **bloccato** finché l'ufficio non lo attiva.
- I permessi li controlla il database, non l'app. Un capocantiere non può leggere costi, fatture, preventivi o stipendi, nemmeno chiamando il database direttamente.
- L'orario delle timbrature lo decide il server: dal telefono non si può scrivere un orario diverso da "adesso".
- Le timbrature non si cancellano. Si annullano e resta traccia di chi l'ha fatto.
- I file stanno in una cartella privata. Si aprono con link temporanei che scadono dopo pochi minuti.
- Ogni notte un PC dell'ufficio copia tutto sul NAS (vedi sotto). Il NAS non viene mai esposto su internet.

---

## Installazione (circa un'ora, una volta sola)

### 1. Crea il database su Supabase

1. Vai su [supabase.com](https://supabase.com), registrati e crea un nuovo progetto (piano *Free*). Scegli una regione europea, per esempio Frankfurt, e conserva la password del database che ti chiede.
2. Apri **SQL Editor → New query**, incolla tutto `database.sql` e premi **Run**. Deve comparire *Success*.
3. Apri **Authentication → Sign In / Providers** e **disattiva "Allow new users to sign up"**.

### 2. Crea il tuo utente amministratore

1. **Authentication → Users → Add user → Create new user**: inserisci la tua email e una password, e spunta *Auto Confirm User*.
2. In **SQL Editor** esegui questa riga, con la tua email e il tuo nome:
   ```sql
   update public.profili set ruolo = 'admin', attivo = true, nome = 'Il tuo nome' where email = 'tua@email.it';
   ```

### 3. Collega l'app

1. In Supabase apri **Project Settings → API** (o *API Keys*) e copia due valori:
   - **Project URL**;
   - la chiave **anon public** (oppure **publishable**, che inizia con `sb_publishable_`).

   **Non** usare mai la chiave *service_role* o *secret*.
2. Apri `config.js` e incolla i due valori. Nello stesso file completa i dati dell'azienda (indirizzo, P.IVA, telefono, email, PEC): compaiono in testa a preventivi e giornale dei lavori.

### 4. Pubblica l'app con GitHub Pages

1. Su GitHub crea un nuovo repository **pubblico**, per esempio `gestionale`. GitHub Pages gratis funziona solo con i repository pubblici: il codice si vede, i dati no.
2. Carica `index.html`, `config.js` e le cartelle `css` e `js` (*Add file → Upload files*, trascinandole). **Non caricare** la cartella `backup`.
3. In **Settings → Pages** scegli *Deploy from a branch*, branch `main`, cartella `/ (root)`, e salva.
4. Dopo un paio di minuti l'app è su `https://ewfevola.github.io/gestionale/`.

Se preferisci un indirizzo tuo, per esempio `gestionale.dominio.it`, scrivilo in *Settings → Pages → Custom domain*. Poi su Aruba aggiungi un record **CNAME** `gestionale` → `ewfevola.github.io`.

### 5. Primi dati, in quest'ordine

1. **Contabilità → Conti**: crea *Cassa* e il conto in banca, con il saldo di partenza.
2. **Clienti e fornitori**: i committenti (ANAS, Comuni, clienti privati) e i fornitori principali.
3. **Personale**: i lavoratori, con il **costo orario aziendale**. Senza costo orario, il costo della manodopera dei cantieri risulta zero.
4. **Mezzi e attrezzature**, con il costo orario.
5. **Costi fissi aziendali**: i costi annui dell'azienda e la quota da applicare ai cantieri. Senza questa quota l'utile dei cantieri risulta più alto del vero.
6. **Cantieri**: quelli aperti, con importo del contratto e budget (*scheda Economia → Modifica budget*).
7. **Scadenze**: visite mediche, corsi, UNILAV, revisioni, DURC, SOA.

### 6. Aggiungi i capicantiere

1. In Supabase: **Authentication → Users → Add user**, con email e password, e *Auto Confirm User* spuntato.
2. Nel gestionale, sezione **Utenti**: il nuovo account compare *bloccato*. Scrivi il nome, scegli il ruolo *Capocantiere*, mettilo su *attivo* e salva.
3. Mandagli il link. Sul telefono può aggiungerlo alla schermata Home:
   - da Safari: *Condividi → Aggiungi alla schermata Home*;
   - da Chrome: *⋮ → Aggiungi a schermata Home*.

Il capocantiere vede solo **Presenze**, **Giornale lavori** e **Foto e documenti**.

---

## Backup notturno sul NAS

Ogni notte un PC dell'ufficio, già collegato al NAS, salva:
- una copia di tutte le tabelle in una cartella con la data, in CSV che si aprono con Excel;
- tutti i file nuovi dell'archivio, nella cartella `archivio-file`.

1. Sul NAS crea la cartella condivisa `backup\gestionale`.
2. In Supabase crea l'utente `backup@eurowork.it` con una password lunga, poi rendilo ufficio:
   ```sql
   update public.profili set ruolo = 'admin', attivo = true, nome = 'Backup' where email = 'backup@eurowork.it';
   ```
3. Copia la cartella `backup` sul PC, per esempio in `C:\EUROWORK\backup`. Apri `backup-config.json` con il Blocco note e compilalo. Il percorso del NAS si scrive con le barre doppie: `\\\\NAS326\\backup\\gestionale`.
4. Prova: tasto destro su `backup-gestionale.ps1` → *Esegui con PowerShell*. Sul NAS devono comparire la cartella con la data di oggi e il file `backup-log.txt`.
   - Se Windows blocca lo script, apri PowerShell e scrivi `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
5. Programmalo ogni notte con l'**Utilità di pianificazione**:
   - *Crea attività*: spunta *Esegui indipendentemente dalla connessione dell'utente*.
   - *Attivazione*: ogni giorno alle 22:00.
   - *Azione*: `powershell.exe` con argomenti `-NoProfile -ExecutionPolicy Bypass -File "C:\EUROWORK\backup\backup-gestionale.ps1"`.
   - *Condizioni*: spunta *Riattiva il computer per eseguire l'attività*.

`backup-config.json` contiene una password: tienilo solo su quel PC e non caricarlo mai su GitHub.

---

## Limiti del piano gratuito di Supabase

- **Database: 500 MB.** Per anni di presenze, fatture e giornali bastano.
- **File: 1 GB.** Le foto vengono ridotte prima del caricamento (circa 300–500 kB l'una), quindi lo spazio basta per circa 2.000–3.000 foto. Quando si avvicina il limite, sposta sul NAS le foto dei cantieri chiusi oppure passa al piano a pagamento.
- **Pausa per inattività.** Un progetto inutilizzato per una settimana viene messo in pausa; l'uso quotidiano e il backup notturno lo tengono attivo.

## Prima di usarlo con i dati veri

- **Privacy.** Presenze, dati dei lavoratori e costi orari sono dati personali. Informate i dipendenti sull'uso dell'app delle presenze e verificate con il consulente del lavoro come si inserisce nelle regole aziendali.
- **Prova di una settimana.** Usate il gestionale accanto ai fogli Excel attuali su un cantiere solo, poi confrontate ore e costi.

## Aggiornamento di novembre 2026

1. Supabase → SQL Editor: incolla ed esegui `aggiornamento-2026-11.sql` (si può rieseguire, non cancella dati).
2. GitHub: carica il contenuto di `aggiornamento-gestionale.zip` nella cartella `gestionale-da-caricare` del repository, sostituendo i file (il tuo `config.js` non è nel pacchetto e resta com'è).
3. Programma per Windows: si aggiorna da solo; la versione 1.1.0 dell'installatore serve solo per i computer nuovi.

Novità: grafica a riquadri con semafori in tempo reale, ricerca rapida (Ctrl+K), cronoprogramma,
"I tuoi cantieri", previsione di cantiere (analisi prezzi, fabbisogno, ordine di cantiere, richieste d'acquisto, SAL),
panoramica con le analisi del cantiere, anagrafica dipendenti con documenti e scadenziario, pagelle,
elaborazione dati stipendio, mezzi (stato, cantieri, assicurazione, bollo, manutenzioni), ripartizione dei costi fissi.
