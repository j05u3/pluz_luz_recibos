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

function findClosestReference(targetDate, combinedReferences) {
  // Combine and sort references
  const references = [...combinedReferences].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Find the two closest references
  let before = null;
  let after = null;

  for (let i = 0; i < references.length; i++) {
    if (references[i].date.getTime() > targetDate.getTime()) {
      after = references[i];
      before = references[i - 1] || null;
      break;
    }
  }

  // Handle edge cases
  if (!after) {
    // If target is after all references, use last two
    before = references[references.length - 2];
    after = references[references.length - 1];
  } else if (!before) {
    // If target is before all references, use first two
    before = references[0];
    after = references[1];
  }

  return { before, after };
}

// New function to find closest reference interval
function findClosestReferenceUsingPriorities(
  targetDate,
  genericReferences,
  priorityReferences
) {
  // If priority references are not empty
  // then change the generic references to have the same shift as the closest priority reference
  if (priorityReferences.length > 0) {
    // Find the closest priority reference to the target date
    const priorityRef = priorityReferences.reduce((closest, current) => {
      const currentDiff = Math.abs(
        current.date.getTime() - targetDate.getTime()
      );
      const closestDiff = Math.abs(
        closest.date.getTime() - targetDate.getTime()
      );
      return currentDiff < closestDiff ? current : closest;
    }, priorityReferences[0]);

    const { before, after } = findClosestReference(
      priorityRef.date,
      genericReferences
    );
    // Interpolate the number for the generic reference
    const interpolatedNumber = interpolateNumber(
      priorityRef.date,
      before,
      after
    );
    const prioMinusGeneric = priorityRef.number - interpolatedNumber;
    // Change the generic reference to have the same shift as the priority reference
    genericReferences.forEach((ref) => {
      ref.number = ref.number + prioMinusGeneric;
    });
  }

  // Get the references array from both arrays
  // but if the date matches then use the priority reference
  const combinedReferences = [...genericReferences, ...priorityReferences].map(
    (ref) => {
      const priorityRef = priorityReferences.find(
        (pRef) => pRef.date.getTime() === ref.date.getTime()
      );
      return priorityRef || ref;
    }
  );

  return findClosestReference(targetDate, combinedReferences);
}

function interpolateNumber(targetDate, beforeRef, afterRef) {
  const timeRange = afterRef.date.getTime() - beforeRef.date.getTime();
  const numberRange = afterRef.number - beforeRef.number;
  const timeDiff = targetDate.getTime() - beforeRef.date.getTime();
  return Math.round(beforeRef.number + (numberRange * timeDiff) / timeRange);
}

function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  // Force local timezone interpretation by using specific format
  const d = new Date(`${year}/${month}/${day}`);
  d.setHours(0, 0, 0, 0);
  return d;
}

app.post("/check-receipts", async (req, res) => {
  const { numeroCliente, startDate, endDate, dayRange } = req.body;

  // Add validation
  if (!numeroCliente || !startDate || !endDate || !dayRange) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  // Parse dates once
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: "Invalid date format" });
  }

  if (end < start) {
    return res.status(400).json({ error: "End date must be after start date" });
  }

  const results = [];

  try {
    console.log("start: " + start + " end: " + end);

    // Reference values
    const references = [
      { date: new Date("2024-02-12"), number: 3709720 },
      { date: new Date("2024-03-12"), number: 3790710 },
      { date: new Date("2024-04-11"), number: 3871824 },
      { date: new Date("2024-05-13"), number: 3953051 },
      { date: new Date("2024-10-14"), number: 4361178 },
      { date: new Date("2024-12-11"), number: 4525267 },
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
          console.debug(`Failed to fetch receipt: ${error.message}`);
          // Skip failed requests
        }
      }
      return { success: false };
    }

    const priorityReferences = [];

    // Iterate through months
    for (
      let currentDate = new Date(start.getTime());
      currentDate < end;
      currentDate.setMonth(currentDate.getMonth() + 1)
    ) {
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
          const { before, after } = findClosestReferenceUsingPriorities(
            testDate,
            references,
            priorityReferences
          );
          // Calculate base receipt number using linear interpolation/extrapolation
          const currentBase = interpolateNumber(testDate, before, after);

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
