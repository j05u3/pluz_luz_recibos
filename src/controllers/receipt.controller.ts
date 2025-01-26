import { Request, Response } from 'express';
import { ReceiptService } from '../services/receipt.service';
import { ReceiptSearchParams } from '../types';
import logger from '../config/logger.config';

export class ReceiptController {
  private receiptService: ReceiptService;

  constructor() {
    this.receiptService = new ReceiptService();
  }

  public async checkReceipts(req: Request, res: Response) {
    try {
      const params = req.body as ReceiptSearchParams;

      if (!this.validateParams(params)) {
        logger.warn({ params }, 'Missing required parameters');
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const results = await this.receiptService.findReceipts(params);
      res.json(results);
    } catch (error) {
      logger.error(error, 'Error processing receipt request');
      res.status(500).json({ error: "Error al procesar la solicitud" });
    }
  }

  private validateParams(params: Partial<ReceiptSearchParams>): params is ReceiptSearchParams {
    return !!(params.numeroCliente && params.startDate && params.endDate && params.dayRange && params.numeroMedidor);
  }
} 