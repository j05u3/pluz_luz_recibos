import axios from 'axios';
import { Reference, ReceiptResponse, ReceiptSearchParams } from '../types';
import { config } from '../config/app.config';
import { parseDate } from '../utils/date.utils';
import logger from '../config/logger.config';
import { getForecastedNumber } from '../utils/forecast.utils';

export class ReceiptService {
  private async tryReceiptNumbers(
    baseNumber: number,
    formattedDate: string,
    numeroCliente: string
  ): Promise<ReceiptResponse> {
    const variations = [0];
    for (let i = 1; i <= 30 * config.dailyIncrement; i++) {
      // for (let i = 23 * config.dailyIncrement; i <= 30 * config.dailyIncrement; i++) {
      variations.push(i);
      variations.push(-i);
    }

    // Split variations into chunks of 100
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < variations.length; i += chunkSize) {
      chunks.push(variations.slice(i, i + chunkSize));
    }

    // Process each chunk in parallel
    for (const chunk of chunks) {
      const promises = chunk.map(variation => {
        const receiptNumber = Math.round(baseNumber + variation);
        return (async () => {
          try {
            logger.debug(
              `Attempting receipt fetch - date: ${formattedDate}, receipt number: ${receiptNumber}`
            );
            const url = `https://servicioweb.enel.com/descarga-api-documento-bridge/descargarPDF?ns=${numeroCliente}&nd=${receiptNumber}&fd=${formattedDate}`;
            const response = await axios.head(url);

            if (response.status === 200) {
              return { success: true, receiptNumber, url };
            }
          } catch (error) {
            logger.debug(
              `Failed to fetch receipt: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
          return null;
        })();
      });

      const results = await Promise.all(promises);
      const validResult = results.find(result => result?.success);
      if (validResult) {
        return validResult;
      }
    }

    return { success: false };
  }

  public async findReceipts(params: ReceiptSearchParams) {
    const start = parseDate(params.startDate);
    const end = parseDate(params.endDate);
    logger.debug({ start, end }, 'Search date range');
    const numeroMedidor = parseInt(params.numeroMedidor);
    // cap the absolute value to monthlyIncrement
    const refMinusProvidedNumeroMedidor = Math.max(Math.min(config.numeroMedidor - numeroMedidor, config.monthlyIncrement), -1 * config.monthlyIncrement);

    const results = [];
    const priorityReferences: Reference[] = [];

    for (
      let currentDate = new Date(start.getTime());
      currentDate < end;
      currentDate.setMonth(currentDate.getMonth() + 1)
    ) {
      logger.debug({ currentDate }, 'Processing month');
      let foundForThisMonth = false;

      for (const day of params.dayRange) {
        if (foundForThisMonth) break;

        const testDate = new Date(currentDate.getTime());
        testDate.setUTCDate(day);
        logger.debug({ testDate }, 'Processing date');

        if (testDate >= start && testDate <= end) {
          const formattedDate = `${String(day).padStart(2, "0")}/${String(
            currentDate.getUTCMonth() + 1
          ).padStart(2, "0")}/${currentDate.getUTCFullYear()}`;

          const currentBase = getForecastedNumber(
            testDate,
            [...config.references],
            priorityReferences
          ) - refMinusProvidedNumeroMedidor;
          logger.debug({ currentBase }, 'Calculated base receipt number');

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
            logger.info(
              { date: formattedDate },
              '🙌 Found valid receipt'
            );
          }
        }
      }
    }

    return results;
  }
} 