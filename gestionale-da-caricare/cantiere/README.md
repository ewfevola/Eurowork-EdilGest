# EUROWORK – App di cantiere

App per i capicantiere, per iPhone e Android, collegata al gestionale **EdilGest**:
usa lo stesso database Supabase, quindi tutto quello che si registra in cantiere
compare subito in ufficio.

| Nell'app | Nel gestionale |
|---|---|
| Presenze (entrata/uscita) | Presenze → Riepilogo ed Excel |
| Mezzi e attrezzature (ore) | Giornale dei lavori, costi del cantiere |
| Meteo, Lavorazioni, Materiali, Note | Giornale dei lavori |
| Foto | Giornale dei lavori → Foto del giorno, Documenti |
| DDT e documenti | Documenti del cantiere |
| Spese (con foto dello scontrino) | Documenti del cantiere, categoria "Spese" |

Non serve modificare il database: l'app usa le tabelle e i permessi che ci sono già.

## Dove si trova

L'app sta nella cartella `cantiere`, **dentro** la cartella del gestionale
(`gestionale-da-caricare/cantiere`). Usa il `config.js` e il collegamento al database
del gestionale: se cambi qualcosa in `config.js`, vale per tutti e due.

## Caricarla su GitHub

1. Nel repository **Eurowork-EdilGest** apri la cartella `gestionale-da-caricare`.
2. **Add file** → **Upload files** e trascina **la cartella `cantiere` intera** (con dentro `icone`).
3. Premi **Commit changes**.
4. Dopo 1–2 minuti l'app si apre all'indirizzo del gestionale con `cantiere/` in fondo,
   per esempio `.../gestionale-da-caricare/cantiere/`.

## Installarla sul telefono

- **iPhone**: apri il link con **Safari** → **Condividi** → **Aggiungi alla schermata Home**.
- **Android**: apri il link con **Chrome** → menu **⋮** → **Installa app** (oppure il pulsante "Installa" nell'app).

## Account dei capicantiere

Si entra con lo stesso account del gestionale.
1. Supabase → **Authentication** → **Users** → **Add user** (email e password del capocantiere).
2. Nel gestionale, sezione **Utenti**: attivalo con ruolo **capocantiere**.
3. Nel gestionale, nella scheda del cantiere, indicalo come **responsabile**: nell'app quel cantiere gli compare per primo.

## Cosa può fare il capocantiere (regole del database)

- Timbra solo all'ora reale (la decide il server) e può annullare le sue timbrature entro 12 ore.
- Compila il giornale e le ore dei mezzi fino a 3 giorni indietro.
- Carica foto e documenti solo nei cantieri; non vede costi, contabilità e dati personali.

## Senza campo

L'app si apre anche senza rete e mostra gli ultimi dati scaricati. I testi del giornale
restano salvati sul telefono come bozza finché non si riesce a inviarli.
Le timbrature richiedono la rete, perché l'ora deve essere quella reale del server.

## Aggiornare l'app

Modifica i file nella cartella `cantiere` su GitHub. Poi, in `sw.js`, aumenta il numero in `VERSIONE`
(es. `cantiere-v2`): così i telefoni scaricano la versione nuova.

## Piccola modifica consigliata nel gestionale

Per filtrare le spese nella sezione Documenti del gestionale, in `js/comune.js`
aggiungi `'Spese'` all'elenco `CATEGORIE_DOC`.
