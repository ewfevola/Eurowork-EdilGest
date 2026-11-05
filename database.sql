-- =====================================================================
--  EUROWORK – Gestionale interno
--  Da incollare in Supabase: SQL Editor → New query → Run.
--  Si può rieseguire senza perdere dati.
-- =====================================================================

-- ---------- Utenti ---------------------------------------------------

create table if not exists public.profili (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  nome       text not null default '',
  ruolo      text not null default 'capocantiere' check (ruolo in ('admin','capocantiere')),
  attivo     boolean not null default false,
  creato_il  timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profili where id = auth.uid() and ruolo = 'admin' and attivo);
$$;

create or replace function public.is_utente_attivo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profili where id = auth.uid() and attivo);
$$;

create or replace function public.oggi() returns date
language sql stable as $$ select (now() at time zone 'Europe/Rome')::date $$;

-- Ogni utente creato in Supabase (Authentication → Add user) nasce BLOCCATO:
-- l'ufficio lo attiva dall'app, nella sezione Utenti.
create or replace function public.nuovo_profilo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profili (id, email, nome, attivo)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), false)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists crea_profilo on auth.users;
create trigger crea_profilo after insert on auth.users
  for each row execute function public.nuovo_profilo();

-- ---------- Clienti, fornitori, subappaltatori, enti ------------------

create table if not exists public.anagrafiche (
  id              bigint generated always as identity primary key,
  tipo            text not null default 'cliente' check (tipo in ('cliente','fornitore','subappaltatore','ente')),
  ragione_sociale text not null,
  piva            text not null default '',
  codice_fiscale  text not null default '',
  indirizzo       text not null default '',
  comune          text not null default '',
  provincia       text not null default '',
  telefono        text not null default '',
  email           text not null default '',
  pec             text not null default '',
  referente       text not null default '',
  note            text not null default '',
  attivo          boolean not null default true,
  creato_il       timestamptz not null default now()
);

-- ---------- Cantieri -------------------------------------------------

create table if not exists public.cantieri (
  id                  bigint generated always as identity primary key,
  codice              text not null default '',
  nome                text not null,
  comune              text not null default '',
  indirizzo           text not null default '',
  committente_id      bigint references public.anagrafiche(id),
  cig                 text not null default '',
  cup                 text not null default '',
  importo_contratto   numeric(14,2) not null default 0,
  data_inizio         date,
  data_fine_prevista  date,
  stato               text not null default 'aperto' check (stato in ('in preparazione','aperto','sospeso','chiuso')),
  responsabile_id     uuid references public.profili(id),
  note                text not null default '',
  creato_il           timestamptz not null default now(),
  attivo              boolean generated always as (stato = 'aperto') stored
);

-- ---------- Personale ------------------------------------------------

create table if not exists public.lavoratori (
  id               bigint generated always as identity primary key,
  cognome          text not null,
  nome             text not null,
  qualifica        text not null default '',
  codice_fiscale   text not null default '',
  telefono         text not null default '',
  data_assunzione  date,
  tipo_contratto   text not null default '',
  costo_orario     numeric(8,2) not null default 0,
  attivo           boolean not null default true,
  note             text not null default '',
  creato_il        timestamptz not null default now()
);

-- I capicantiere vedono solo nome e qualifica, non costi e dati personali.
create or replace view public.lavoratori_base as
  select id, cognome, nome, qualifica, attivo from public.lavoratori where public.is_utente_attivo();

-- ---------- Mezzi e attrezzature -------------------------------------

create table if not exists public.mezzi (
  id            bigint generated always as identity primary key,
  nome          text not null,
  tipo          text not null default 'mezzo' check (tipo in ('mezzo','attrezzatura')),
  targa         text not null default '',
  costo_orario  numeric(8,2) not null default 0,
  attivo        boolean not null default true,
  note          text not null default '',
  creato_il     timestamptz not null default now()
);

create or replace view public.mezzi_base as
  select id, nome, tipo, targa, attivo from public.mezzi where public.is_utente_attivo();

-- ---------- Presenze -------------------------------------------------

create table if not exists public.timbrature (
  id             bigint generated always as identity primary key,
  lavoratore_id  bigint not null references public.lavoratori(id),
  cantiere_id    bigint not null references public.cantieri(id),
  tipo           text not null check (tipo in ('entrata','uscita')),
  ora            timestamptz not null default now(),
  registrata_da  uuid references public.profili(id) default auth.uid(),
  nota           text not null default '',
  annullata      boolean not null default false,
  annullata_da   uuid references public.profili(id),
  annullata_il   timestamptz,
  creata_il      timestamptz not null default now()
);
create index if not exists timbrature_ora_idx on public.timbrature (ora);
create index if not exists timbrature_lav_ora_idx on public.timbrature (lavoratore_id, ora);

-- L'ora della timbratura la decide il server: il capocantiere non può
-- scrivere un orario diverso da "adesso". L'ufficio può inserire correzioni.
create or replace function public.prepara_timbratura() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    new.ora := now(); new.annullata := false; new.annullata_da := null; new.annullata_il := null;
  end if;
  new.registrata_da := auth.uid();
  new.creata_il := now();
  if not exists (select 1 from lavoratori where id = new.lavoratore_id and attivo) then raise exception 'Lavoratore non attivo'; end if;
  if not exists (select 1 from cantieri where id = new.cantiere_id and attivo) then raise exception 'Cantiere non aperto'; end if;
  return new;
end $$;
drop trigger if exists prima_di_timbrare on public.timbrature;
create trigger prima_di_timbrare before insert on public.timbrature
  for each row execute function public.prepara_timbratura();

-- Le timbrature non si cancellano: si annullano e resta traccia.
create or replace function public.annulla_timbratura(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_utente_attivo() then raise exception 'Utente non autorizzato'; end if;
  update timbrature set annullata = true, annullata_da = auth.uid(), annullata_il = now()
   where id = p_id and not annullata
     and (is_admin() or (registrata_da = auth.uid() and ora > now() - interval '12 hours'));
  if not found then raise exception 'Timbratura non annullabile'; end if;
end $$;
revoke execute on function public.annulla_timbratura(bigint) from anon, public;
grant execute on function public.annulla_timbratura(bigint) to authenticated;

create or replace view public.v_timbrature with (security_invoker = true) as
select t.id, t.ora,
       (t.ora at time zone 'Europe/Rome')::date             as giorno,
       to_char(t.ora at time zone 'Europe/Rome', 'HH24:MI') as ora_locale,
       t.tipo, t.nota, t.annullata,
       t.lavoratore_id, l.cognome, l.nome, l.qualifica,
       t.cantiere_id, c.nome as cantiere, c.comune,
       p.nome as registrata_da
  from public.timbrature t
  join public.lavoratori_base l on l.id = t.lavoratore_id
  join public.cantieri c on c.id = t.cantiere_id
  left join public.profili p on p.id = t.registrata_da;

-- Turni completi (entrata seguita da uscita nello stesso giorno), con le ore.
create or replace view public.v_turni with (security_invoker = true) as
select lavoratore_id, cantiere_id, giorno, entrata, uscita,
       round(extract(epoch from (uscita - entrata)) / 3600.0, 2) as ore
  from (
    select t.lavoratore_id, t.cantiere_id, t.tipo, t.ora as entrata,
           (t.ora at time zone 'Europe/Rome')::date as giorno,
           lead(t.tipo) over w as tipo_dopo, lead(t.ora) over w as uscita
      from public.timbrature t
     where not t.annullata
    window w as (partition by t.lavoratore_id, (t.ora at time zone 'Europe/Rome')::date order by t.ora)
  ) x
 where tipo = 'entrata' and tipo_dopo = 'uscita';

-- ---------- Ore dei mezzi --------------------------------------------

create table if not exists public.ore_mezzi (
  id             bigint generated always as identity primary key,
  mezzo_id       bigint not null references public.mezzi(id),
  cantiere_id    bigint not null references public.cantieri(id),
  giorno         date not null default public.oggi(),
  ore            numeric(5,2) not null check (ore > 0 and ore <= 24),
  note           text not null default '',
  registrato_da  uuid references public.profili(id) default auth.uid(),
  creato_il      timestamptz not null default now()
);

-- ---------- Giornale dei lavori --------------------------------------

create table if not exists public.giornale (
  id             bigint generated always as identity primary key,
  cantiere_id    bigint not null references public.cantieri(id),
  giorno         date not null default public.oggi(),
  meteo          text not null default '',
  lavorazioni    text not null default '',
  materiali      text not null default '',
  note           text not null default '',
  compilato_da   uuid references public.profili(id) default auth.uid(),
  aggiornato_il  timestamptz not null default now(),
  unique (cantiere_id, giorno)
);

-- ---------- Scadenziario ---------------------------------------------

create table if not exists public.scadenze (
  id                bigint generated always as identity primary key,
  ambito            text not null default 'personale' check (ambito in ('personale','mezzi','cantiere','fornitore','azienda')),
  tipo              text not null,
  lavoratore_id     bigint references public.lavoratori(id),
  mezzo_id          bigint references public.mezzi(id),
  cantiere_id       bigint references public.cantieri(id),
  anagrafica_id     bigint references public.anagrafiche(id),
  data_scadenza     date not null,
  preavviso_giorni  int not null default 30,
  completata        boolean not null default false,
  note              text not null default '',
  creato_il         timestamptz not null default now()
);

-- ---------- Documenti e foto -----------------------------------------

create table if not exists public.documenti (
  id             bigint generated always as identity primary key,
  titolo         text not null,
  categoria      text not null default 'Altro',
  cantiere_id    bigint references public.cantieri(id),
  lavoratore_id  bigint references public.lavoratori(id),
  mezzo_id       bigint references public.mezzi(id),
  anagrafica_id  bigint references public.anagrafiche(id),
  giorno         date,            -- per le foto del giornale dei lavori
  percorso       text not null unique,
  nome_file      text not null default '',
  dimensione     bigint not null default 0,
  tipo_mime      text not null default '',
  caricato_da    uuid references public.profili(id) default auth.uid(),
  creato_il      timestamptz not null default now()
);

-- ---------- Preventivi -----------------------------------------------

create table if not exists public.preventivi (
  id               bigint generated always as identity primary key,
  numero           text not null default '',
  data             date not null default public.oggi(),
  cliente_id       bigint references public.anagrafiche(id),
  oggetto          text not null default '',
  luogo            text not null default '',
  stato            text not null default 'bozza' check (stato in ('bozza','inviato','accettato','rifiutato')),
  sconto_pct       numeric(5,2) not null default 0,
  iva_pct          numeric(4,2) not null default 22,
  validita_giorni  int not null default 30,
  condizioni       text not null default '',
  note             text not null default '',
  cantiere_id      bigint references public.cantieri(id),
  creato_da        uuid references public.profili(id) default auth.uid(),
  creato_il        timestamptz not null default now()
);

-- Numero progressivo per anno: 2026/001, 2026/002…
create or replace function public.numera_preventivo() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.numero = '' then
    perform pg_advisory_xact_lock(hashtext('preventivi' || extract(year from new.data)::text));
    select coalesce(max(split_part(numero, '/', 2)::int), 0) + 1 into n
      from preventivi where numero like extract(year from new.data)::text || '/%' and split_part(numero, '/', 2) ~ '^\d+$';
    new.numero := extract(year from new.data)::text || '/' || lpad(n::text, 3, '0');
  end if;
  return new;
end $$;
drop trigger if exists numera on public.preventivi;
create trigger numera before insert on public.preventivi
  for each row execute function public.numera_preventivo();

create table if not exists public.preventivo_voci (
  id              bigint generated always as identity primary key,
  preventivo_id   bigint not null references public.preventivi(id) on delete cascade,
  ordine          int not null default 0,
  codice          text not null default '',
  descrizione     text not null default '',
  um              text not null default '',
  quantita        numeric(14,3) not null default 0,
  prezzo          numeric(14,2) not null default 0,
  costo           numeric(14,2) not null default 0
);

-- ---------- Economia del cantiere ------------------------------------

create table if not exists public.budget (
  id           bigint generated always as identity primary key,
  cantiere_id  bigint not null references public.cantieri(id) on delete cascade,
  categoria    text not null,
  importo      numeric(14,2) not null default 0,
  note         text not null default ''
);

create table if not exists public.costi (
  id            bigint generated always as identity primary key,
  cantiere_id   bigint not null references public.cantieri(id) on delete cascade,
  data          date not null default public.oggi(),
  categoria     text not null,
  fornitore_id  bigint references public.anagrafiche(id),
  descrizione   text not null default '',
  documento     text not null default '',
  importo       numeric(14,2) not null default 0,
  creato_il     timestamptz not null default now()
);

-- ---------- Contabilità gestionale ----------------------------------
-- Registro delle fatture (non sostituisce la fatturazione elettronica né
-- i registri IVA, che restano al programma di fatturazione e al commercialista).

create table if not exists public.conti (
  id              bigint generated always as identity primary key,
  nome            text not null,
  saldo_iniziale  numeric(14,2) not null default 0,
  data_saldo      date not null default public.oggi(),
  attivo          boolean not null default true
);

create table if not exists public.fatture (
  id              bigint generated always as identity primary key,
  tipo            text not null check (tipo in ('emessa','ricevuta')),
  numero          text not null,
  data            date not null default public.oggi(),
  anagrafica_id   bigint references public.anagrafiche(id),
  cantiere_id     bigint references public.cantieri(id),
  descrizione     text not null default '',
  categoria       text not null default '',
  imponibile      numeric(14,2) not null default 0,
  iva_pct         numeric(4,2) not null default 22,
  regime          text not null default 'ordinario' check (regime in ('ordinario','split payment','reverse charge','esente')),
  iva             numeric(14,2) generated always as (case when regime in ('reverse charge','esente') then 0 else round(imponibile * iva_pct / 100, 2) end) stored,
  totale          numeric(14,2) generated always as (imponibile + case when regime in ('reverse charge','esente') then 0 else round(imponibile * iva_pct / 100, 2) end) stored,
  -- Con lo split payment l'ente paga solo l'imponibile; l'IVA la versa direttamente.
  da_pagare       numeric(14,2) generated always as (case when regime = 'ordinario' then imponibile + round(imponibile * iva_pct / 100, 2) else imponibile end) stored,
  scadenza        date,
  pagata          boolean not null default false,
  data_pagamento  date,
  note            text not null default '',
  creato_il       timestamptz not null default now()
);
create index if not exists fatture_scadenza_idx on public.fatture (pagata, scadenza);
-- La stessa fattura dello stesso fornitore non si può registrare due volte nello stesso anno.
create unique index if not exists fatture_unica on public.fatture (tipo, coalesce(anagrafica_id, 0), numero, extract(year from data));

-- Spese previste per un cantiere (acquisti decisi o ordinati, fattura non ancora
-- arrivata). Quando arriva la fattura si collega qui e la spesa diventa effettiva:
-- da quel momento conta la fattura, non la previsione.
create table if not exists public.spese_previste (
  id             bigint generated always as identity primary key,
  cantiere_id    bigint not null references public.cantieri(id) on delete cascade,
  data_prevista  date,
  categoria      text not null,
  descrizione    text not null,
  fornitore_id   bigint references public.anagrafiche(id),
  importo        numeric(14,2) not null default 0,
  fattura_id     bigint references public.fatture(id) on delete set null,
  note           text not null default '',
  creato_il      timestamptz not null default now()
);

-- Prima nota: entrate e uscite di cassa e banca.
create table if not exists public.movimenti (
  id             bigint generated always as identity primary key,
  data           date not null default public.oggi(),
  conto_id       bigint not null references public.conti(id),
  tipo           text not null check (tipo in ('entrata','uscita')),
  importo        numeric(14,2) not null check (importo > 0),
  descrizione    text not null default '',
  fattura_id     bigint references public.fatture(id) on delete set null,
  anagrafica_id  bigint references public.anagrafiche(id),
  cantiere_id    bigint references public.cantieri(id),
  creato_il      timestamptz not null default now()
);

-- Segna una fattura come incassata/pagata e scrive il movimento in prima nota.
create or replace function public.registra_pagamento(p_fattura bigint, p_data date, p_conto bigint) returns void
language plpgsql security invoker set search_path = public as $$
declare f fatture;
begin
  if not is_admin() then raise exception 'Solo l''ufficio può registrare pagamenti'; end if;
  select * into f from fatture where id = p_fattura for update;
  if not found then raise exception 'Fattura non trovata'; end if;
  if f.pagata then raise exception 'Fattura già segnata come pagata'; end if;
  update fatture set pagata = true, data_pagamento = p_data where id = p_fattura;
  insert into movimenti (data, conto_id, tipo, importo, descrizione, fattura_id, anagrafica_id, cantiere_id)
  values (p_data, p_conto, case when f.tipo = 'emessa' then 'entrata' else 'uscita' end, f.da_pagare,
          case when f.tipo = 'emessa' then 'Incasso' else 'Pagamento' end || ' fattura ' || f.numero, f.id, f.anagrafica_id, f.cantiere_id);
end $$;
revoke execute on function public.registra_pagamento(bigint, date, bigint) from anon, public;
grant execute on function public.registra_pagamento(bigint, date, bigint) to authenticated;

create or replace view public.v_saldi_conti with (security_invoker = true) as
select c.id, c.nome, c.saldo_iniziale, c.data_saldo, c.attivo,
       c.saldo_iniziale + coalesce(sum(case when m.tipo = 'entrata' then m.importo else -m.importo end)
                                   filter (where m.data >= c.data_saldo), 0) as saldo
  from public.conti c left join public.movimenti m on m.conto_id = c.id
 group by c.id;

-- ---------- Costi fissi aziendali ------------------------------------
-- Costi dell'azienda che non appartengono a un cantiere (ufficio, sede,
-- assicurazioni, consulenze…). Servono a calcolare la quota da caricare
-- su ogni cantiere per arrivare all'utile vero.
create table if not exists public.costi_fissi (
  id             bigint generated always as identity primary key,
  descrizione    text not null,
  categoria      text not null default 'Altro',
  importo_annuo  numeric(14,2) not null default 0,
  attivo         boolean not null default true,
  note           text not null default '',
  creato_il      timestamptz not null default now()
);

create table if not exists public.impostazioni (
  chiave         text primary key,
  valore         numeric(14,4) not null default 0,
  aggiornato_il  timestamptz not null default now()
);
insert into public.impostazioni (chiave, valore) values ('quota_costi_fissi_pct', 0) on conflict (chiave) do nothing;

-- Riepilogo economico per cantiere. Manodopera e mezzi interni sono
-- calcolati dalle ore registrate per il costo orario attuale. Ricavi e costi
-- arrivano dalle fatture collegate al cantiere (imponibile, IVA esclusa);
-- la tabella costi serve per le spese senza fattura. Le spese previste ancora
-- senza fattura sono a parte (spese_previste), per la stima a fine lavori.
create or replace view public.v_economia_cantieri with (security_invoker = true) as
select c.id as cantiere_id, c.nome, c.stato, c.importo_contratto,
       coalesce(b.tot, 0)                       as budget,
       coalesce(m.ore, 0)                       as ore_manodopera,
       coalesce(m.costo, 0)                     as costo_manodopera,
       coalesce(z.ore, 0)                       as ore_mezzi,
       coalesce(z.costo, 0)                     as costo_mezzi,
       coalesce(fr.tot, 0)                      as costo_fatture,
       coalesce(k.tot, 0)                       as altri_costi,
       coalesce(m.costo,0) + coalesce(z.costo,0) + coalesce(fr.tot,0) + coalesce(k.tot,0) as costi_totali,
       coalesce(fe.tot, 0)                      as fatturato,
       coalesce(fe.incassato, 0)                as incassato,
       coalesce(sp.tot, 0)                      as spese_previste
  from public.cantieri c
  left join (select cantiere_id, sum(importo) tot from public.budget group by 1) b on b.cantiere_id = c.id
  left join (select t.cantiere_id, sum(t.ore) ore, sum(t.ore * l.costo_orario) costo
               from public.v_turni t join public.lavoratori l on l.id = t.lavoratore_id group by 1) m on m.cantiere_id = c.id
  left join (select o.cantiere_id, sum(o.ore) ore, sum(o.ore * x.costo_orario) costo
               from public.ore_mezzi o join public.mezzi x on x.id = o.mezzo_id group by 1) z on z.cantiere_id = c.id
  left join (select cantiere_id, sum(importo) tot from public.costi group by 1) k on k.cantiere_id = c.id
  left join (select cantiere_id, sum(imponibile) tot from public.fatture where tipo = 'ricevuta' group by 1) fr on fr.cantiere_id = c.id
  left join (select cantiere_id, sum(imponibile) tot, sum(imponibile) filter (where pagata) incassato
               from public.fatture where tipo = 'emessa' group by 1) fe on fe.cantiere_id = c.id
  left join (select cantiere_id, sum(importo) tot from public.spese_previste where fattura_id is null group by 1) sp on sp.cantiere_id = c.id
 where public.is_admin();

-- ---------- Permessi (Row Level Security) ----------------------------
-- Ufficio (admin): tutto. Capocantiere: legge cantieri e nomi di lavoratori
-- e mezzi; registra presenze, ore mezzi, giornale dei lavori e documenti
-- di cantiere. Niente costi, contabilità, preventivi, anagrafiche, scadenze.

do $$
declare t text;
begin
  foreach t in array array['profili','anagrafiche','cantieri','lavoratori','mezzi','timbrature','ore_mezzi',
                           'giornale','scadenze','documenti','preventivi','preventivo_voci','budget','costi',
                           'conti','fatture','movimenti','spese_previste','costi_fissi','impostazioni']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "ufficio" on public.%I', t);
    execute format('create policy "ufficio" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists "se stesso" on public.profili;
create policy "se stesso" on public.profili for select to authenticated using (id = auth.uid());

drop policy if exists "capi leggono" on public.cantieri;
create policy "capi leggono" on public.cantieri for select to authenticated using (public.is_utente_attivo());

-- Presenze: il capocantiere vede l'ultima settimana e registra solo "adesso".
drop policy if exists "capi leggono" on public.timbrature;
drop policy if exists "capi timbrano" on public.timbrature;
create policy "capi leggono" on public.timbrature for select to authenticated
  using (public.is_utente_attivo() and ora > now() - interval '7 days');
create policy "capi timbrano" on public.timbrature for insert to authenticated
  with check (public.is_utente_attivo());

-- Ore mezzi: il capocantiere registra e corregge le sue degli ultimi 3 giorni.
drop policy if exists "capi leggono" on public.ore_mezzi;
drop policy if exists "capi registrano" on public.ore_mezzi;
drop policy if exists "capi correggono" on public.ore_mezzi;
drop policy if exists "capi cancellano" on public.ore_mezzi;
create policy "capi leggono" on public.ore_mezzi for select to authenticated
  using (public.is_utente_attivo() and giorno >= public.oggi() - 7);
create policy "capi registrano" on public.ore_mezzi for insert to authenticated
  with check (public.is_utente_attivo() and registrato_da = auth.uid() and giorno between public.oggi() - 3 and public.oggi());
create policy "capi correggono" on public.ore_mezzi for update to authenticated
  using (public.is_utente_attivo() and registrato_da = auth.uid() and giorno >= public.oggi() - 3)
  with check (registrato_da = auth.uid() and giorno between public.oggi() - 3 and public.oggi());
create policy "capi cancellano" on public.ore_mezzi for delete to authenticated
  using (public.is_utente_attivo() and registrato_da = auth.uid() and giorno >= public.oggi() - 3);

-- Giornale dei lavori: il capocantiere legge l'ultimo mese e scrive gli ultimi 3 giorni.
drop policy if exists "capi leggono" on public.giornale;
drop policy if exists "capi scrivono" on public.giornale;
drop policy if exists "capi aggiornano" on public.giornale;
create policy "capi leggono" on public.giornale for select to authenticated
  using (public.is_utente_attivo() and giorno >= public.oggi() - 30);
create policy "capi scrivono" on public.giornale for insert to authenticated
  with check (public.is_utente_attivo() and giorno between public.oggi() - 3 and public.oggi());
create policy "capi aggiornano" on public.giornale for update to authenticated
  using (public.is_utente_attivo() and giorno >= public.oggi() - 3)
  with check (giorno between public.oggi() - 3 and public.oggi());

-- Documenti: il capocantiere vede e carica solo quelli dei cantieri.
drop policy if exists "capi leggono" on public.documenti;
drop policy if exists "capi caricano" on public.documenti;
create policy "capi leggono" on public.documenti for select to authenticated
  using (public.is_utente_attivo() and cantiere_id is not null);
create policy "capi caricano" on public.documenti for insert to authenticated
  with check (public.is_utente_attivo() and cantiere_id is not null and caricato_da = auth.uid()
              and percorso like 'cantieri/' || cantiere_id || '/%');

-- ---------- Archivio file (Supabase Storage) -------------------------
-- Crea la cartella privata "documenti" e i suoi permessi.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('documenti', 'documenti', false) on conflict (id) do nothing;
    execute 'drop policy if exists "eurowork legge file" on storage.objects';
    execute 'drop policy if exists "eurowork carica file" on storage.objects';
    execute 'drop policy if exists "eurowork cancella file" on storage.objects';
    execute $p$create policy "eurowork legge file" on storage.objects for select to authenticated
      using (bucket_id = 'documenti' and (public.is_admin() or (public.is_utente_attivo() and name like 'cantieri/%')))$p$;
    execute $p$create policy "eurowork carica file" on storage.objects for insert to authenticated
      with check (bucket_id = 'documenti' and (public.is_admin() or (public.is_utente_attivo() and name like 'cantieri/%')))$p$;
    execute $p$create policy "eurowork cancella file" on storage.objects for delete to authenticated
      using (bucket_id = 'documenti' and public.is_admin())$p$;
  end if;
end $$;

-- ---------- Primo amministratore -------------------------------------
-- Dopo aver creato il tuo utente in Authentication → Users, esegui da sola
-- questa riga con la tua email:
--
--   update public.profili set ruolo = 'admin', attivo = true, nome = 'Il tuo nome' where email = 'tua@email.it';
