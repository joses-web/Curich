import axios from 'axios';
import { getDatabase, now } from '../db';
import { app } from 'electron';

export interface SendaItem {
  tipodocu: string;
  codigo: string;
  codigo_sunat: string;
  codigo_gs1: string;
  descripcion: string;
  cantidad: string;
  unid: string;
  tipoprecioventa: string;
  tipo_afect_igv: string;
  codigo_tributo: string;
  is_anticipo: number;
  valorunitbruto: string;
  valorunit: string;
  valorventabruto: string;
  valorventa: string;
  preciounitbruto: string;
  preciounit: string;
  precioventa: string;
  precioventabruto: string;
  igv: string;
  porc_igv: string;
  isc: string;
  porc_isc: string;
  dscto_unit: string;
  porc_dscto_unit: string;
  tipo_operacion: string;
}

export interface SendaCabecera {
  ruc_emisor: string;
  razonsocial_emisor: string;
  direccion_emisor: string;
  telefono_emisor: string;
  email_emisor: string;
  cod_domifiscal: string;
  tiop_codi: string;
  fecha: string;
  fvenc: string;
  tipodocu: string;
  nro_serie_efact: string;
  numero: string;
  tipo_moneda: string;
  tipodoi: string;
  numerodoi: string;
  desc_tipodocu: string;
  razonsocial: string;
  direccion: string;
  cliente: string;
  email_cliente: string;
  vendedor: string;
  metodo_pago: string;
  codigo_metodopago: string;
  totalpagado_efectivo: string;
  vuelto: string;
  nro_pedido: string;
  local: string;
  op_gravada: string;
  op_exonerada: string;
  op_inafecta: string;
  tot_valorventa: string;
  tot_precioventa: string;
  igv: string;
  porc_igv: string;
  importe_total: string;
  total_pagar: string;
  importe_letras: string;
  usuario: string;
  tipocambio: string;
}

export interface SendaPayload {
  cabecera: SendaCabecera;
  items: SendaItem[];
}

export class SendaService {
  private static readonly API_URL = 'https://int.sendaefact.pe/webservice';
  private static readonly TOKEN = process.env.SENDA_TOKEN || 'jdnqviUqmItb2TtzGc68ungW7WffOVSlyjd9003xTeGVniPqK4EGKoE4SG2v';

  // Helper formatting numbers to fixed string
  private static fmt(val: number, decimals = 2) {
    return val.toFixed(decimals);
  }

  // Converts a number to spanish words (simplified mock for now)
  private static numeroALetras(monto: number): string {
    const enteros = Math.floor(monto);
    const centavos = Math.round((monto - enteros) * 100);
    return `${enteros} CON ${centavos.toString().padStart(2, '0')}/100 SOLES`; // Should use a proper library in production
  }

  public static async emitirComprobante(orderId: number, billId: number): Promise<void> {
    const db = getDatabase();

    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId) as any;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    if (!bill || !order) return;

    let customerInfo = {
      name: 'CLIENTE DE PRUEBA',
      doi: '77889900',
      tipo_doi: '1',
      desc_doi: 'DNI',
      email: 'cliente_test@gmail.com',
      address: 'AV. LARCO 123 - MIRAFLORES'
    };

    if (bill.customer_id) {
       const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(bill.customer_id) as any;
       if (customer) {
          customerInfo.name = customer.name;
          // In a real app we would determine RUC vs DNI here based on phone or a new field
       }
    }

    // Determine DNI (03) vs Factura (01)
    const tipodocu = customerInfo.tipo_doi === '6' ? '01' : '03';
    const nro_serie_efact = tipodocu === '03' ? 'B121' : 'F122';
    // For now we mock the numero
    const numero = bill.bill_number.replace(/\D/g, '').padStart(8, '0');

    const currentDate = new Date().toISOString().split('T')[0] + 'T' + new Date().toTimeString().split(' ')[0];
    const onlyDate = new Date().toISOString().split('T')[0];

    const total = bill.total || 0;
    const opGravada = total / 1.18;
    const igvTotal = total - opGravada;

    const payload: SendaPayload = {
      cabecera: {
        ruc_emisor: "26666666666",
        razonsocial_emisor: "EMPRESA DEMO",
        direccion_emisor: "AV. SALAVERRY NRO. 2409 DPTO. 301 LIMA - LIMA - SAN ISIDRO",
        telefono_emisor: "(01) 480 1614",
        email_emisor: "ventas@sendatisolutions.com",
        cod_domifiscal: "0000",
        tiop_codi: "0101",
        fecha: currentDate,
        fvenc: currentDate,
        tipodocu,
        nro_serie_efact,
        numero,
        tipo_moneda: "PEN",
        tipodoi: customerInfo.tipo_doi,
        numerodoi: customerInfo.doi,
        desc_tipodocu: customerInfo.desc_doi,
        razonsocial: customerInfo.name,
        direccion: customerInfo.address,
        cliente: customerInfo.name,
        email_cliente: customerInfo.email,
        vendedor: "CAJA_POS",
        metodo_pago: "CONTADO",
        codigo_metodopago: "CON",
        totalpagado_efectivo: this.fmt(total),
        vuelto: "0.00",
        nro_pedido: order.order_number,
        local: "SUCURSAL SAN ISIDRO",
        op_gravada: this.fmt(opGravada),
        op_exonerada: "0.00",
        op_inafecta: "0.00",
        tot_valorventa: this.fmt(opGravada),
        tot_precioventa: this.fmt(total),
        igv: this.fmt(igvTotal),
        porc_igv: "18.00",
        importe_total: this.fmt(total),
        total_pagar: this.fmt(total),
        importe_letras: this.numeroALetras(total),
        usuario: "CAJERO_01",
        tipocambio: "1.000"
      },
      items: []
    };

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND status != "cancelled"').all(orderId) as any[];

    for (const item of items) {
      const price = item.unit_price || 0;
      const qty = item.quantity || 1;
      const precioventa = price * qty;
      const valorventa = precioventa / 1.18;
      const igv = precioventa - valorventa;
      const valorunit = price / 1.18;

      payload.items.push({
        tipodocu,
        codigo: item.product_id || 'ITM-01',
        codigo_sunat: "95101501",
        codigo_gs1: "",
        descripcion: item.product_name || "Item",
        cantidad: this.fmt(qty, 10),
        unid: "NIU",
        tipoprecioventa: "01",
        tipo_afect_igv: "10",
        codigo_tributo: "1000",
        is_anticipo: 0,
        valorunitbruto: this.fmt(valorunit, 10),
        valorunit: this.fmt(valorunit, 10),
        valorventabruto: this.fmt(valorventa),
        valorventa: this.fmt(valorventa),
        preciounitbruto: this.fmt(price, 10),
        preciounit: this.fmt(price, 10),
        precioventa: this.fmt(precioventa),
        precioventabruto: this.fmt(precioventa),
        igv: this.fmt(igv),
        porc_igv: "18.00",
        isc: "0.00",
        porc_isc: "0.00",
        dscto_unit: "0.00",
        porc_dscto_unit: "0.00",
        tipo_operacion: "OP_GRAV"
      });
    }

    try {
      const res = await axios.post(`${this.API_URL}/emitir_comprobante`, payload, {
        headers: {
          'Authorization': `Bearer ${this.TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.data && res.data.type === 'success') {
         // Success
         const cpe = res.data.cpe; // e.g. "03-B12100000001"
         const nro_efact = cpe.split('-')[1];

         const detalle = await axios.post(`${this.API_URL}/detalle_comprobante`, {
            ruc_emisor: payload.cabecera.ruc_emisor,
            nro_efact,
            tipodocu
         }, {
            headers: {
              'Authorization': `Bearer ${this.TOKEN}`,
              'Content-Type': 'application/json'
            }
         });

         if (detalle.data && detalle.data.type === 'success' && detalle.data.response && detalle.data.response.length > 0) {
            const qr_data = detalle.data.response[0].codigobarra;

            db.prepare('UPDATE orders SET invoice_number = ?, qr_code_data = ?, senda_status = "sent" WHERE id = ?')
              .run(cpe, qr_data, orderId);
         }
      } else {
         console.error('Senda API error:', res.data);
         db.prepare('UPDATE orders SET senda_status = "failed" WHERE id = ?').run(orderId);
      }
    } catch (err: any) {
      console.error('Error in SendaService emitirComprobante:', err.message);
      db.prepare('UPDATE orders SET senda_status = "pending" WHERE id = ?').run(orderId);
    }
  }

  public static async anularComprobante(orderId: number, billId: number, reason: string): Promise<void> {
    const db = getDatabase();

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    if (!order || !order.invoice_number) return;

    const cpe = order.invoice_number;
    const parts = cpe.split('-');
    const tipodocu = parts[0];
    const nro_efact = parts[1];

    const currentDate = new Date().toISOString().split('T')[0] + 'T' + new Date().toTimeString().split(' ')[0];

    try {
      const res = await axios.post(`${this.API_URL}/anular_comprobante`, {
         ruc_emisor: "26666666666",
         nro_efact,
         tipodocu,
         fechabaja: currentDate,
         motivobaja: reason || "ERROR EN DIGITACION DE ITEMS"
      }, {
        headers: {
          'Authorization': `Bearer ${this.TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.data && res.data.type === 'success') {
         db.prepare('UPDATE orders SET senda_status = "voided" WHERE id = ?').run(orderId);

         // Trigger ERP Sync here as well
         db.prepare('INSERT INTO sync_queue (order_id, type) VALUES (?, ?)').run(orderId, 'anulacion');
      } else {
         console.error('Senda API anulacion error:', res.data);
      }
    } catch (err: any) {
      console.error('Error in SendaService anularComprobante:', err.message);
    }
  }
}
