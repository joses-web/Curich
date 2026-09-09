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
      const orderItems = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'").all(orderId) as any[];
      let customer = null;
      if (orderData.customer_id) {
        customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(orderData.customer_id) as any;
      }

      const isInvoice = customer && customer.tax_registration_number;
      const tipodocu = isInvoice ? '01' : '03'; // Factura o Boleta
      const nro_serie_efact = isInvoice ? 'F122' : 'B121';

      const numero = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');

      const op_gravada = Number(orderData.subtotal || 0).toFixed(2);
      const igv = Number(orderData.tax_amount || 0).toFixed(2);
      const importe_total = Number(orderData.total || 0).toFixed(2);

      const cabecera = {
        ruc_emisor: '20123456789', // Deberia salir de settings
        razonsocial_emisor: 'FLOCAFE S.A.C.',
        direccion_emisor: 'Av. Las Palmas 123',
        telefono_emisor: '01 555-5555',
        email_emisor: 'facturacion@flocafe.com',

        tipodocu,
        nro_serie_efact,
        numero,

        tipodoi: isInvoice ? '6' : (customer?.phone ? '1' : '0'), // 6 RUC, 1 DNI, 0 Doc Sin DNI
        numerodoi: isInvoice ? customer.tax_registration_number : (customer?.phone || '00000000'),
        razonsocial: isInvoice ? customer.name : (customer?.name || 'PUBLICO GENERAL'),
        direccion: customer?.address || '',
        email_cliente: customer?.email || '',

        op_gravada,
        tot_valorventa: op_gravada,
        igv,
        porc_igv: '18',
        importe_total,
        importe_letras: 'CANTIDAD EN LETRAS',

        nro_pedido: orderData.order_number,
        metodo_pago: orderData.payment_gateway || 'CONTADO',
        usuario: 'SISTEMA',
        fecha: new Date().toISOString()
      };

      const items = orderItems.map(item => {
         const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any;

         const qty = Number(item.quantity);
         const sub = Number(item.subtotal);
         const tax = Number(item.tax_amount || 0);
         const total = sub + tax;

         return {
           codigo: product?.sku || item.product_id,
           descripcion: product?.name || 'Producto',
           cantidad: qty.toString(),
           precioventa: (total / qty).toFixed(2),
           valorventa: (sub).toFixed(2),
           igv: tax.toFixed(2),
           codigo_sunat: '00000000',
           unid: 'NIU' // Unidad Estandar
         };
      });

      const response = await axios.post(
        `${this.API_URL}/emitir`,
        {
          cabecera,
          items
        },
        {
          headers: {
            'Authorization': `Bearer ${this.getToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const invoiceNumber = response.data.invoice_number || `${nro_serie_efact}-${numero}`;
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
