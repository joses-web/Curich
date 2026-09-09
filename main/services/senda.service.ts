import axios from 'axios';
import { getDatabase } from '../db';
import { randomUUID } from 'crypto';

// Helper to convert number to words in Spanish
export function numeroALetras(monto: number): string {
    const unidades = ['', 'UNO ', 'DOS ', 'TRES ', 'CUATRO ', 'CINCO ', 'SEIS ', 'SIETE ', 'OCHO ', 'NUEVE '];
    const decenas = ['DIEZ ', 'ONCE ', 'DOCE ', 'TRECE ', 'CATORCE ', 'QUINCE ', 'DIECISEIS ', 'DIECISIETE ', 'DIECIOCHO ', 'DIECINUEVE ', 'VEINTE ', 'TREINTA ', 'CUARENTA ', 'CINCUENTA ', 'SESENTA ', 'SETENTA ', 'OCHENTA ', 'NOVENTA '];
    const centenas = ['', 'CIENTO ', 'DOSCIENTOS ', 'TRESCIENTOS ', 'CUATROCIENTOS ', 'QUINIENTOS ', 'SEISCIENTOS ', 'SETECIENTOS ', 'OCHOCIENTOS ', 'NOVECIENTOS '];

    const getUnidades = (numero: number) => unidades[numero];
    const getDecenas = (numero: number) => {
        if (numero < 10) return getUnidades(numero);
        if (numero < 20) return decenas[numero - 10];
        if (numero === 20) return 'VEINTE ';
        if (numero < 30) return 'VEINTI' + getUnidades(numero - 20);
        const dec = Math.floor(numero / 10);
        const uni = numero - (dec * 10);
        if (uni === 0) return decenas[dec + 8];
        return decenas[dec + 8] + 'Y ' + getUnidades(uni);
    };
    const getCentenas = (numero: number) => {
        if (numero > 99) {
            if (numero === 100) return 'CIEN ';
            return centenas[Math.floor(numero / 100)] + getDecenas(numero % 100);
        }
        return getDecenas(numero);
    };

    const getMiles = (numero: number) => {
        const c = Math.floor(numero / 1000);
        const m = numero % 1000;
        let p = '';
        if (c > 0) {
            if (c === 1) p = 'MIL ';
            else p = getCentenas(c) + 'MIL ';
        }
        return p + getCentenas(m);
    };

    const getMillones = (numero: number) => {
        const c = Math.floor(numero / 1000000);
        const m = numero % 1000000;
        let p = '';
        if (c > 0) {
            if (c === 1) p = 'UN MILLON ';
            else p = getCentenas(c) + 'MILLONES ';
        }
        return p + getMiles(m);
    };

    const enteros = Math.floor(monto);
    const centavos = Math.round((monto - enteros) * 100);

    if (enteros === 0) return `CERO CON ${centavos.toString().padStart(2, '0')}/100 SOLES`;

    return `${getMillones(enteros)}CON ${centavos.toString().padStart(2, '0')}/100 SOLES`.trim();
}

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


      const seqKey = `senda_efact_${nro_serie_efact}`;
      const seqQuery = db.prepare('UPDATE sequences SET value = value + 1 WHERE key = ? RETURNING value');
      let seqRes = seqQuery.get(seqKey) as any;
      if (!seqRes) {
        db.prepare('INSERT INTO sequences (key, value) VALUES (?, 1)').run(seqKey);
        seqRes = { value: 1 };
      }
      const numero = seqRes.value.toString().padStart(6, '0');



      const ruc_emisor = (db.prepare("SELECT value FROM settings WHERE key = 'tenant_tax_registration_number'").get() as any)?.value || '20610414983';
      const razonsocial_emisor = (db.prepare("SELECT value FROM settings WHERE key = 'tenant_name'").get() as any)?.value || 'CAVAS REUNIDAS PERU S.A';
      const direccion_emisor = (db.prepare("SELECT value FROM settings WHERE key = 'tenant_address'").get() as any)?.value || '';
      const telefono_emisor = (db.prepare("SELECT value FROM settings WHERE key = 'tenant_phone'").get() as any)?.value || '';
      const email_emisor = (db.prepare("SELECT value FROM settings WHERE key = 'tenant_email'").get() as any)?.value || '';

      const op_gravada = Number(orderData.subtotal || 0).toFixed(2);
      const igv = Number(orderData.tax_amount || 0).toFixed(2);
      const importe_total = Number(orderData.total || 0).toFixed(2);

      const cabecera = {
        ruc_emisor,
        razonsocial_emisor,
        direccion_emisor,
        telefono_emisor,
        email_emisor,

        tipodocu,
        nro_serie_efact,
        numero,

        tipodoi: isInvoice ? '6' : '0',
        numerodoi: isInvoice ? customer.tax_registration_number : '00000000',
        razonsocial: isInvoice ? customer.name : (customer?.name || 'PUBLICO GENERAL'),
        direccion: customer?.address || '',
        email_cliente: customer?.email || '',

        op_gravada,
        tot_valorventa: op_gravada,
        igv,
        porc_igv: '18',
        importe_total,
        importe_letras: numeroALetras(Number(importe_total)),

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
