import express from "express";
import cors from "cors";
import { google } from "googleapis";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ==========================
// CONFIG GOOGLE SHEETS
// ==========================
const SHEET_ID = "1fFWnC6k9rYYeAyCbHqu0XBof7cM1xvOQp9i3RrCB1s0";
const SERVICE_ACCOUNT_FILE = "./service-account.json";

const auth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_FILE,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

// ==========================
// LETTURA SLOT
// ==========================
app.get("/api/slots", async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "SlotPrenotazioni!A2:E" // A2:E contiene le ore per i 5 giorni
    });

    const data = response.data.values || [];
    // Trasforma in array di oggetti per ogni giorno
    const slots = [];
    data.forEach((row, i) => {
      row.forEach((cell, j) => {
        if (cell.trim() !== "") {
          slots.push({
            id: `${i}-${j}`,
            day: ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì"][j],
            time: cell,
            booked: 0, // aggiorneremo con prenotazioni
          });
        }
      });
    });

    // Leggi prenotazioni per aggiornare booked
    const prenResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Prenotazioni!A2:C"
    });
    const prenData = prenResponse.data.values || [];
    prenData.forEach(p => {
      const slot = slots.find(s => s.day === p[1] && s.time === p[2]);
      if (slot) slot.booked += 1;
    });

    res.json(slots);

  } catch (err) {
    console.error("Errore lettura slot:", err);
    res.status(500).send("Errore nella lettura degli slot");
  }
});

// ==========================
// LETTURA NOMI
// ==========================
app.get("/api/nomi", async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Nomi!A2:A" // Colonna dei nomi
    });
    const nomi = response.data.values.map(r => r[0]);
    res.json(nomi);
  } catch (err) {
    console.error("Errore lettura nomi:", err);
    res.status(500).send("Errore nella lettura dei nomi");
  }
});

// ==========================
// REGISTRAZIONE PRENOTAZIONE
// ==========================
app.post("/api/prenota", async (req, res) => {
  const { nome, day, time } = req.body;
  if (!nome || !day || !time) return res.status(400).send("Dati mancanti");

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Prenotazioni!A:C",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[nome, day, time]]
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Errore registrazione prenotazione:", err);
    res.status(500).send("Errore registrazione prenotazione");
  }
});

// ==========================
// AVVIO SERVER
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server online su http://localhost:${PORT}`);
});
