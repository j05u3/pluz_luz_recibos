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
        const referenceDate = new Date('2024-04-11');
        const referenceReceiptNumber = 3871824;
        const dailyIncrement = 2620;
        const monthlyIncrement = 81227;

        // Calculate days difference for base receipt number
        const daysDiff = Math.floor((start - referenceDate) / (1000 * 60 * 60 * 24));
        let baseReceiptNumber = referenceReceiptNumber + (daysDiff * dailyIncrement);

        // Iterate through months
        for (let currentDate = new Date(start); currentDate <= end; currentDate.setMonth(currentDate.getMonth() + 1)) {
            // Try each day in the range
            for (let day of dayRange) {
                const testDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                if (testDate >= start && testDate <= end) {
                    const formattedDate = `${String(day).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
                    
                    try {
                        const url = `https://servicioweb.enel.com/descarga-api-documento-bridge/descargarPDF?ns=${numeroCliente}&nd=${Math.round(baseReceiptNumber)}&fd=${formattedDate}`;
                        const response = await axios.head(url);
                        
                        if (response.status === 200) {
                            results.push({
                                url,
                                date: formattedDate,
                                receiptNumber: Math.round(baseReceiptNumber)
                            });
                        }
                    } catch (error) {
                        // Skip failed requests
                    }
                }
            }
            
            baseReceiptNumber += monthlyIncrement;
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