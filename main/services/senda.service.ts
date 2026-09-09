import axios from 'axios';
import { getDatabase } from '../db';
import { randomUUID } from 'crypto';

export class SendaService {
  private static readonly API_URL = 'https://api.senda.pe/v1';

  private static getToken(): string {
    const token = process.env.SENDA_TOKEN;
    if (!token) {
      throw new Error('SENDA_TOKEN is not defined in environment variables');
    }
    return token;
  }

  static async emitirComprobante(orderId: string, orderData: any): Promise<void> {
    const db = getDatabase();

    try {
      const response = await axios.post(
        `${this.API_URL}/comprobantes`,
        orderData,
        {
          headers: {
            'Authorization': `Bearer ${this.getToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const invoiceNumber = response.data.invoice_number || 'UNKNOWN';
      const qrCodeData = response.data.qr_code_data || '';

      db.exec(`UPDATE orders SET invoice_number = '${invoiceNumber}', qr_code_data = '${qrCodeData}', senda_status = 'emitted' WHERE id = '${orderId}'`);

    } catch (error: any) {
      console.error('Failed to emit receipt via Senda:', error.message);
      db.exec(`UPDATE orders SET senda_status = 'error' WHERE id = '${orderId}'`);
      throw error;
    }
  }

  static async anularComprobante(orderId: string): Promise<void> {
    const db = getDatabase();

    try {
      const order = db.prepare('SELECT invoice_number FROM orders WHERE id = ?').get(orderId) as any;
      if (!order || !order.invoice_number) {
         console.log('No invoice number found to cancel for order', orderId);
         return;
      }

      await axios.post(
        `${this.API_URL}/comprobantes/${order.invoice_number}/anular`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${this.getToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );

      db.exec(`UPDATE orders SET senda_status = 'cancelled' WHERE id = '${orderId}'`);
    } catch (error: any) {
      console.error('Failed to cancel receipt via Senda:', error.message);
      throw error;
    }
  }
}
