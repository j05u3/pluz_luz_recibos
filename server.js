const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/check-receipts', async (req, res) => {
    const { numeroCliente, startDate, endDate, dayRange } = req.body;
    const results = [];

    try {
        // Convert dates to Date objects
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Reference values
        const references = [
            { date: new Date('2024-12-11'), number: 4525267 },
            { date: new Date('2024-05-13'), number: 3953051 },
            { date: new Date('2024-03-12'), number: 3790710 },
            { date: new Date('2024-04-11'), number: 3871824 },
        ];

        // Find closest reference date to start
        let closestRef = references[0];
        let minDiff = Math.abs(start - references[0].date);

        for (const ref of references) {
            const diff = Math.abs(start - ref.date);
            if (diff < minDiff) {
                minDiff = diff;
                closestRef = ref;
            }
        }

        const dailyIncrement = 2620;
        const monthlyIncrement = 81227;

        // Function to try variations of a receipt number
        async function tryReceiptNumbers(baseNumber, formattedDate, numeroCliente) {
            const variations = [0]; // Start with the base number
            for (let i = 1; i <= dailyIncrement; i++) {  // Try up to ± dailyIncrement variations
                variations.push(i);     // Try base + i
                variations.push(-i);    // Try base - i
            }

            for (const variation of variations) {
                const receiptNumber = Math.round(baseNumber + variation);
                try {
                    console.log("trying date: " + formattedDate + " with receipt number:  " + receiptNumber);
                    const url = `https://servicioweb.enel.com/descarga-api-documento-bridge/descargarPDF?ns=${numeroCliente}&nd=${receiptNumber}&fd=${formattedDate}`;
                    const response = await axios.head(url);
                    
                    if (response.status === 200) {
                        return { success: true, receiptNumber, url };
                    }
                } catch (error) {
                    // Skip failed requests
                }
            }
            return { success: false };
        }

        let lastSuccessfulReceipt = null;
        let lastSuccessfulDate = null;

        // Iterate through months
        for (let currentDate = new Date(start); currentDate <= end; currentDate.setMonth(currentDate.getMonth() + 1)) {
            let foundForThisMonth = false;

            // Try each day in the range
            for (let day of dayRange) {
                if (foundForThisMonth) break;

                const testDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                if (testDate >= start && testDate <= end) {
                    const formattedDate = `${String(day).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
                    
                    let currentBase;
                    if (lastSuccessfulDate && lastSuccessfulReceipt) {
                        // Calculate days difference from last successful date
                        const daysDiffFromLast = Math.floor((testDate - lastSuccessfulDate) / (1000 * 60 * 60 * 24));
                        currentBase = lastSuccessfulReceipt + (daysDiffFromLast * dailyIncrement);
                    } else {
                        // Calculate days difference for base receipt number
                        const daysDiff = Math.floor((testDate - closestRef.date) / (1000 * 60 * 60 * 24));
                        currentBase = closestRef.number + (daysDiff * dailyIncrement);
                    }

                    const result = await tryReceiptNumbers(currentBase, formattedDate, numeroCliente);
                    
                    if (result.success) {
                        lastSuccessfulReceipt = result.receiptNumber;
                        lastSuccessfulDate = testDate;
                        foundForThisMonth = true;
                        results.push({
                            url: result.url,
                            date: formattedDate,
                            receiptNumber: result.receiptNumber
                        });
                    }
                }
            }
            // Don't reset lastSuccessfulReceipt and lastSuccessfulDate anymore
            // as we want to use them for calculating the next month's base
        }

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Error al procesar la solicitud' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
}); 