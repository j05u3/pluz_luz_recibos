import axios from 'axios';
import { Reference, ReceiptResponse, ReceiptSearchParams } from '../types';
import { config } from '../config/app.config';
import { parseDate } from '../utils/date.utils';
import logger from '../config/logger.config';
import { getForecastedNumber } from '../utils/forecast.utils';
import { retry } from '../utils/retry.utils';

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

    // Split variations into chunks of 5
    const chunkSize = 5;
    const chunks = [];
    for (let i = 0; i < variations.length; i += chunkSize) {
      chunks.push(variations.slice(i, i + chunkSize));
    }

    // Process each chunk in parallel
    for (const chunk of chunks) {
      const promises = chunk.map(variation => {
        const receiptNumber = Math.round(baseNumber + variation);
        return (async () => {

          // Link de recibo con nombres y direccion (suele tomar más tiempo porque hay rate limits más estrictos)
          const url = `https://servicioweb.enel.com/descarga-api-documento-bridge/descargarPDF?ns=${numeroCliente}&nd=${receiptNumber}&fd=${formattedDate}`;

          // Link de recibo sin nombres ni direccion
          // ejemplo: https://servicioweb.enel.com/descarga-api-documento-bridge/descargar-recibo/{nCliente}}/3551572/12122023
          // const url = `https://servicioweb.enel.com/descarga-api-documento-bridge/descargar-recibo/${numeroCliente}/${receiptNumber}/${formattedDate}`;

          logger.debug(
            `Attempting receipt fetch - date: ${formattedDate}, receipt number: ${receiptNumber}`
          );
          
          const checkUrl = async () => {
            const response = await axios.head(url);
            
            if (response.status === 200) {
              // Check if it's not a 0 bytes file by downloading the file
              const fileResponse = await axios.get(url, { responseType: 'arraybuffer' });
              if (fileResponse.data.length > 0) {
                return { success: true, receiptNumber, url };
              } else {
                logger.debug({ url }, 'Found 0 bytes file');
              }
            }
            return null;
          };
          
          try {
            await new Promise(resolve => setTimeout(resolve, 3 * 1000));
            const result = await retry(checkUrl, {
              maxRetries: 10,
              initialDelay: 3 * 1000,
              retryableError: (error: unknown) => {
                return axios.isAxiosError(error) && error.response?.status === 401;
              },
              onRetry: (attempt: number, delay: number, error: unknown) => {
                logger.debug(
                  `Retrying URL ${url} (attempt ${attempt}) after ${delay}ms due to 401 error`
                );
              }
            });
            
            if (result) return result;
          } catch (error) {
            logger.debug(
              `Failed to fetch ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`
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

          // 13012025 (ddmmyyyy) (para link de recibo sin nombres ni direccion)
          // const formattedDate = `${String(day).padStart(2, "0")}${String(
          //   currentDate.getUTCMonth() + 1
          // ).padStart(2, "0")}${currentDate.getUTCFullYear()}`;


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