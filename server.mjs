// server.mjs
import express from "express";
import cors from "cors";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const SPREADSHEET_ID = "1xma-pf0vVdvCE3At3tP3P7Cd7vfde8V4H5GlCV8Iqow";
const SLOTS_RANGE = "Slots!A1:F20";      // Foglio Slots
const NAMES_RANGE = "Nomi!A1:A230";      // Foglio Nomi
const BOOKINGS_RANGE = "Prenotazioni!A1:C1"; // Foglio Prenotazioni

let sheets;
let SLOT_CACHE = [];
let HEADER = [];

// Inizializza Google Sheets
async function initSheets() {
  try {
    if (!process.env.GOOGLE_CREDENTIALS) {
      throw new Error("La variabile GOOGLE_CREDENTIALS non è impostata!");
    }

    
const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    sheets = google.sheets({ version: "v4", auth });

    console.log("✅ Google Sheets inizializzato correttamente");
  } catch (err) {
    console.error("❌ Errore initSheets:", err);
  }
}

// Carica slot da Google Sheets
async function loadSlots() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SLOTS_RANGE
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      console.log("⚠️ Nessuna riga trovata in Slots!");
      return;
    }

    HEADER = rows[0].slice(1); // Lunedì, Martedì, ...
    SLOT_CACHE = [];

    for (let i = 1; i < rows.length; i++) {
      const ora = rows[i][0];
      const posti = rows[i].slice(1).map(n => parseInt(n) || 0);
      SLOT_CACHE.push({ ora, posti });
    }

    console.log("✅ Slots caricati:", SLOT_CACHE);
  } catch (err) {
    console.error("❌ Errore loadSlots:", err);
  }
}

// Endpoint per ottenere slot (SEMPLICE refresh ogni richiesta)
app.get("/api/slots", async (req, res) => {
  try {
    await loadSlots(); // ✅ ricarica sempre dal foglio
    res.json({ header: HEADER, slots: SLOT_CACHE });
  } catch (err) {
    console.error("❌ Errore /api/slots:", err);
    res.status(500).json({ error: "Errore caricamento slot" });
  }
});

// Endpoint per ottenere nomi
app.get("/api/names", async (req, res) => {
  try {
    const resSheet = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: NAMES_RANGE
    });
    const names = resSheet.data.values?.flat() || [];
    res.json(names);
  } catch (err) {
    console.error("❌ Errore /api/names:", err);
    res.status(500).json({ error: "Errore caricamento nomi" });
  }
});

// Endpoint per prenotare
app.post("/api/book", async (req, res) => {
  try {
    const { oraIndex, giornoIndex, nome } = req.body;
    if (oraIndex === undefined || giornoIndex === undefined || !nome) {
      return res.status(400).json({ error: "Dati mancanti" });
    }

    const slot = SLOT_CACHE[oraIndex];
    if (!slot) return res.status(400).json({ error: "Slot non trovato" });
    if (slot.posti[giornoIndex] <= 0) return res.status(400).json({ error: "Slot pieno" });

    // Aggiorna cache
    slot.posti[giornoIndex]--;

    // Scrivi su Prenotazioni
    const giorno = HEADER[giornoIndex];
    const ora = slot.ora;
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: BOOKINGS_RANGE,
      valueInputOption: "RAW",
      requestBody: { values: [[nome, giorno, ora]] }
    });

    // Aggiorna Slots nel foglio
    const colLetter = String.fromCharCode(66 + giornoIndex); // B = 66
    const rowNumber = oraIndex + 2; // header = 1
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Slots!${colLetter}${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[slot.posti[giornoIndex]]] }
    });

    res.json({ success: true, postiRimasti: slot.posti[giornoIndex] });

  } catch (err) {
    console.error("❌ Errore /api/book:", err);
    res.status(500).json({ error: "Errore prenotazione" });
  }
});

// Avvio server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ Server online su http://localhost:${PORT}`);
  await initSheets();
});
