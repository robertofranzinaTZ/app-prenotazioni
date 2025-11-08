// server.cjs
const express = require("express");
const cors = require("cors");
const path = require("path");
const { google } = require("googleapis");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3000;

// =====================
// Middleware
// =====================
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// =====================
// CONFIG GOOGLE SHEETS
// =====================
const SPREADSHEET_ID = "1fFWnC6k9rYYeAyCbHqu0XBof7cM1xvOQp9i3RrCB1s0";
const SLOT_RANGE = "SlotPrenotazioni!A1:F20";
const NAMES_RANGE = "Nomi!A2:A";

const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json", // il tuo file JSON
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

// =====================
// SLOT CACHE
// =====================
let SLOT_CACHE = [];

// Funzione per caricare gli slot dal foglio Google
async function loadSlots() {
  const client = await auth.getClient();
  const sheetsApi = google.sheets({ version: "v4", auth: client });

  const res = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SLOT_RANGE
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    console.log("Nessun dato trovato nel foglio SlotPrenotazioni.");
    return [];
  }

  const header = rows[0]; // ["Ora","Lunedì","Martedì",...]
  const days = header.slice(1);

  let slots = [];
  for (let i = 1; i < rows.length; i++) {
    const time = rows[i][0];
    for (let j = 1; j < rows[i].length; j++) {
      const cap = parseInt(rows[i][j]) || 0;
      slots.push({
        id: `${i-1}-${j}`,
        time,
        day: days[j-1],
        cap,
        booked: 0
      });
    }
  }

  return slots;
}

// Inizializza cache
async function initSlots() {
  SLOT_CACHE = await loadSlots();
  console.log("✅ Slot caricati:", SLOT_CACHE.length);
}

// =====================
// ENDPOINTS
// =====================

// Ottieni tutti gli slot
app.get("/api/slots", async (req, res) => {
  if (SLOT_CACHE.length === 0) await initSlots();
  res.json(SLOT_CACHE);
});

// Prenota uno slot
app.post("/api/book", async (req, res) => {
  const { id, nome } = req.body;

  if (!id || !nome) return res.status(400).json({ error: "ID slot o nome mancanti" });

  const slot = SLOT_CACHE.find(s => s.id === id);
  if (!slot) return res.status(400).json({ error: "Slot non trovato" });
  if (slot.booked >= slot.cap) return res.status(400).json({ error: "Slot pieno" });

  slot.booked++;
  console.log(`📌 Prenotazione: ${nome} -> ${slot.day} ore ${slot.time}`);
  res.json({ success: true, slot });
});

// Ottieni lista nomi dal foglio
app.get("/api/names", async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheetsApi = google.sheets({ version: "v4", auth: client });

    const response = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: NAMES_RANGE
    });

    const nomi = (response.data.values || []).map(r => r[0]);
    res.json(nomi);
  } catch (err) {
    console.error("Errore lettura nomi:", err);
    res.status(500).send("Errore lettura nomi");
  }
});

// =====================
// AVVIO SERVER
// =====================
app.listen(PORT, () => {
  console.log(`✅ Server online su http://localhost:${PORT}`);
  initSlots();
});
