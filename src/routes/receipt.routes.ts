import { Router } from 'express';
import { ReceiptController } from '../controllers/receipt.controller';

const router = Router();
const receiptController = new ReceiptController();

router.post('/check-receipts', (req, res) => receiptController.checkReceipts(req, res));

export default router; 