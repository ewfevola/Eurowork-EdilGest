// Impostazioni del gestionale. Vedi la guida (README) per dove trovare i valori.
window.CONFIG = {
  // Supabase → Project Settings → API: "Project URL" e chiave "anon public" (o "publishable").
  // Non usare mai la chiave "service_role" o "secret".
  SUPABASE_URL: "https://exubtwdpqwyzxiyxqkzj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_lFyTpOA4FDrdkJFnJNAUeg_D0DhklOH",

  // Dati dell'azienda per l'intestazione di preventivi e giornale dei lavori.
  AZIENDA: {
    ragione_sociale: "EUROWORK s.r.l.",
    indirizzo: "Piazza Vittorio Emanuele,52 – 90047 Partinico (PA)",
    piva: "[00000000000]",
    telefono: "091 508 5959 - 379 193 1154",
    email: "eurowork@libero.it",
  }
};
