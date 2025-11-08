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

const SPREADSHEET_ID = "1fFWnC6k9rYYeAyCbHqu0XBof7cM1xvOQp9i3RrCB1s0";
const SLOTS_RANGE = "Slots!A1:F20";
const NAMES_RANGE = "Nomi!A1:A230";
const BOOKINGS_RANGE = "Prenotazioni!A1:C1";

let sheets;
let SLOT_CACHE = [];
let HEADER = [];

async function initSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const client = await auth.getClient();
  sheets = google.sheets({ version: "v4", auth: client });

  await loadSlots();
}

async function loadSlots() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SLOTS_RANGE
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return;

  HEADER = rows[0].slice(1); // Lunedì, Martedì, ...
  SLOT_CACHE = [];

  for (let i = 1; i < rows.length; i++) {
    const ora = rows[i][0];
    const posti = rows[i].slice(1).map(n => parseInt(n) || 0);
    SLOT_CACHE.push({ ora, posti });
  }
}

// Endpoint per ottenere slot
app.get("/api/slots", async (req, res) => {
  if (SLOT_CACHE.length === 0) await loadSlots();
  res.json({ header: HEADER, slots: SLOT_CACHE });
});

// Endpoint per ottenere nomi
app.get("/api/names", async (req, res) => {
  const resSheet = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: NAMES_RANGE
  });
  const names = resSheet.data.values?.flat() || [];
  res.json(names);
});

// Endpoint per prenotare
app.post("/api/book", async (req, res) => {
  const { oraIndex, giornoIndex, nome } = req.body;
  if (oraIndex === undefined || giornoIndex === undefined || !nome) {
    return res.status(400).json({ error: "Dati mancanti" });
  }

  const slot = SLOT_CACHE[oraIndex];
  if (!slot) return res.status(400).json({ error: "Slot non trovato" });

  if (slot.posti[giornoIndex] <= 0) {
    return res.status(400).json({ error: "Slot pieno" });
  }

  // Aggiorna cache
  slot.posti[giornoIndex]--;

  try {
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
    const rowNumber = oraIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Slots!${colLetter}${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[slot.posti[giornoIndex]]] }
    });

    res.json({ success: true, postiRimasti: slot.posti[giornoIndex] });
  } catch (err) {
    console.error("Errore salvataggio su Google Sheets:", err);
    res.status(500).json({ error: "Errore salvatag
