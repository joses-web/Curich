import axios from 'axios';
import { getDatabase } from '../db';
import { randomUUID } from 'crypto';

export class SendaService {
  private static readonly API_URL = 'https://int.sendaefact.pe/webservice';

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
        `${this.API_URL}/emitir`,
        {
          cabecera: {
            idDocumento: orderData.id,
            total: orderData.total
          },
          items: []
        },
        {
          headers: {
            'Authorization': `Bearer ${this.getToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const invoiceNumber = response.data.invoice_number || 'UNKNOWN';
      const qrCodeData = response.data.qr_code_data || '';

      db.prepare(`UPDATE orders SET invoice_number = ?, qr_code_data = ?, senda_status = 'emitted' WHERE id = ?`).run(invoiceNumber, qrCodeData, orderId);

    } catch (error: any) {
      console.error('Failed to emit receipt via Senda:', error.message);
      db.prepare(`UPDATE orders SET senda_status = 'error' WHERE id = ?`).run(orderId);
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
        `${this.API_URL}/anular`,
        {
          idDocumento: order.invoice_number
        },
        {
          headers: {
            'Authorization': `Bearer ${this.getToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );

      db.prepare(`UPDATE orders SET senda_status = 'cancelled' WHERE id = ?`).run(orderId);
    } catch (error: any) {
      console.error('Failed to cancel receipt via Senda:', error.message);
      throw error;
    }
  }
}
