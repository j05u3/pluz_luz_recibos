export interface Reference {
  date: Date;
  number: number;
}

export interface ReceiptResult {
  url: string;
  date: string;
  receiptNumber: number;
}

export interface ReceiptSearchParams {
  numeroCliente: string;
  numeroMedidor: string;
  startDate: string;
  endDate: string;
  dayRange: number[];
}

export interface ReceiptResponse {
  success: boolean;
  receiptNumber?: number;
  url?: string;
} 