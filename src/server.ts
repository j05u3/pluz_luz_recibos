import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/app.config';
import receiptRoutes from './routes/receipt.routes';

const app = express();

app.use(cors({
  origin: config.corsOrigin
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', receiptRoutes);

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
}); 