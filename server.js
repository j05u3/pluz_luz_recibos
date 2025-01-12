const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// In production, allow only requests from our domain
if (process.env.NODE_ENV === "production") {
  app.use(
    cors({
      origin:
        process.env.RENDER_EXTERNAL_URL ||
        "https://pluz-luz-recibos.onrender.com",
    })
  );
}

// New function to find closest reference
function findClosestReference(
  targetDate,
  genericReferences,
  priorityReferences
) {
  // get the references array from both arrays but if the date matches, use the priority reference
  const references = genericReferences.map((ref) => {
    const priorityRef = priorityReferences.find(
      (pRef) => pRef.date.getTime() === ref.date.getTime()
    );
    return priorityRef || ref;
  });

  let closestRef = references[0];
  let minDiff = Math.abs(targetDate - references[0].date);

  for (const ref of references) {
    const diff = Math.abs(targetDate - ref.date);
    if (diff < minDiff) {
      minDiff = diff;
      closestRef = ref;
    }
  }

  return { closestRef, minDiff };
}

app.post("/check-receipts", async (req, res) => {
  const { numeroCliente, startDate, endDate, dayRange } = req.body;

  // Add validation
  if (!numeroCliente || !startDate || !endDate || !dayRange) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  // Validate date format
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: "Invalid date format" });
  }

  if (end < start) {
    return res.status(400).json({ error: "End date must be after start date" });
  }

  const results = [];

  try {
    // Convert dates to Date objects
    const start = new Date(startDate);
    const end = new Date(endDate);
    console.log("start: " + start + " end: " + end);

    // Reference values
    const references = [
      { date: new Date("2024-12-11"), number: 4525267 },
      { date: new Date("2024-05-13"), number: 3953051 },
      { date: new Date("2024-03-12"), number: 3790710 },
      { date: new Date("2024-04-11"), number: 3871824 },
      { date: new Date("2024-02-12"), number: 3709720 },
    ];

    const dailyIncrement = 2620;
    const monthlyIncrement = 81227;

    // Function to try variations of a receipt number
    async function tryReceiptNumbers(baseNumber, formattedDate, numeroCliente) {
      const variations = [0]; // Start with the base number
      for (let i = 1; i <= dailyIncrement; i++) {
        // Try up to ± dailyIncrement variations
        variations.push(i); // Try base + i
        variations.push(-i); // Try base - i
      }

      for (const variation of variations) {
        const receiptNumber = Math.round(baseNumber + variation);
        try {
          console.log(
            "trying date: " +
              formattedDate +
              " with receipt number:  " +
              receiptNumber
          );
          const url = `https://servicioweb.enel.com/descarga-api-documento-bridge/descargarPDF?ns=${numeroCliente}&nd=${receiptNumber}&fd=${formattedDate}`;
          const response = await axios.head(url);

          if (response.status === 200) {
            return { success: true, receiptNumber, url };
          }
        } catch (error) {
          // Add at least some logging
          console.error(`Failed to fetch receipt: ${error.message}`);
          // Skip failed requests
        }
      }
      return { success: false };
    }

    const priorityReferences = [];

    // Iterate through months
    for (
      let currentDate = new Date(start);
      currentDate <= end;
      currentDate.setMonth(currentDate.getMonth() + 1)
    ) {
      // Skip to first day of month to avoid date rollover issues
      currentDate.setDate(1);
      let foundForThisMonth = false;

      // Try each day in the range
      for (let day of dayRange) {
        if (foundForThisMonth) break;

        // Create new date object to avoid modifying currentDate
        const testDate = new Date(currentDate.getTime());
        testDate.setDate(day);

        console.log("testDate: " + testDate);
        if (testDate >= start && testDate <= end) {
          const formattedDate = `${String(day).padStart(2, "0")}/${String(
            currentDate.getMonth() + 1
          ).padStart(2, "0")}/${currentDate.getFullYear()}`;

          // Calculate days difference for base receipt number
          const { closestRef } = findClosestReference(
            start,
            references,
            priorityReferences
            );
          const daysDiff = Math.floor(
            (testDate - closestRef.date) / (1000 * 60 * 60 * 24)
          );
          console.log(
            "daysDiff: " +
              daysDiff +
              " for reference date: " +
              closestRef.date +
              " and testDate: " +
              testDate
          );
          const currentBase = closestRef.number + daysDiff * dailyIncrement;

          const result = await tryReceiptNumbers(
            currentBase,
            formattedDate,
            numeroCliente
          );

          if (result.success) {
            priorityReferences.push({
              date: testDate,
              number: result.receiptNumber,
            });

            foundForThisMonth = true;
            results.push({
              url: result.url,
              date: formattedDate,
              receiptNumber: result.receiptNumber,
            });
          }
        }
      }
      // Don't reset lastSuccessfulReceipt and lastSuccessfulDate anymore
      // as we want to use them for calculating the next month's base
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: "Error al procesar la solicitud" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
