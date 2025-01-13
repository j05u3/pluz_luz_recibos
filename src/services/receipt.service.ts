import axios from 'axios';
import { Reference, ReceiptResponse, ReceiptSearchParams } from '../types';
import { config } from '../config/app.config';
import { findClosestReferenceUsingPriorities, interpolateNumber, parseDate } from '../utils/date.utils';

export class ReceiptService {
  private async tryReceiptNumbers(
    baseNumber: number,
    formattedDate: string,
    numeroCliente: string
  ): Promise<ReceiptResponse> {
    const variations = [0];
    for (let i = 1; i <= config.dailyIncrement; i++) {
      variations.push(i);
      variations.push(-i);
    }

    for (const variation of variations) {
      const receiptNumber = Math.round(baseNumber + variation);
      try {
        console.log(
          `trying date: ${formattedDate} with receipt number: ${receiptNumber}`
        );
        const url = `https://servicioweb.enel.com/descarga-api-documento-bridge/descargarPDF?ns=${numeroCliente}&nd=${receiptNumber}&fd=${formattedDate}`;
        const response = await axios.head(url);

        if (response.status === 200) {
          return { success: true, receiptNumber, url };
        }
      } catch (error) {
        console.debug(`Failed to fetch receipt: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    return { success: false };
  }

  public async findReceipts(params: ReceiptSearchParams) {
    const start = parseDate(params.startDate);
    const end = parseDate(params.endDate);
    console.log("Start: ", start);
    console.log("End: ", end);
    const results = [];
    const priorityReferences: Reference[] = [];

    for (
      let currentDate = new Date(start.getTime());
      currentDate < end;
      currentDate.setMonth(currentDate.getMonth() + 1)
    ) {
      console.log("Current date: ", currentDate);
      let foundForThisMonth = false;

      for (const day of params.dayRange) {
        if (foundForThisMonth) break;

        const testDate = new Date(currentDate.getTime());
        testDate.setUTCDate(day);
        console.log("Test date: ", testDate);

        if (testDate >= start && testDate <= end) {
          const formattedDate = `${String(day).padStart(2, "0")}/${String(
            currentDate.getUTCMonth() + 1
          ).padStart(2, "0")}/${currentDate.getUTCFullYear()}`;

          const { before, after } = findClosestReferenceUsingPriorities(
            testDate,
            [...config.references],
            priorityReferences
          );

          const currentBase = interpolateNumber(testDate, before, after);

          const result = await this.tryReceiptNumbers(
            currentBase,
            formattedDate,
            params.numeroCliente
          );

          if (result.success && result.receiptNumber && result.url) {
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
    }

    return results;
  }
} 