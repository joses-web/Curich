import axios from 'axios';
import { getDatabase } from '../db';

export class ErpSyncService {
  private static readonly API_URL = 'http://localhost:3000/api/ventas/sync'; // Dummy local endpoint for the ERP as per instruction (or to our real endpoint if configured)

  public static async processSyncQueue(): Promise<void> {
    const db = getDatabase();

    // Pick pending jobs
    const queue = db.prepare('SELECT * FROM sync_queue WHERE status = "pending"').all() as any[];

    for (const job of queue) {
      try {
        const orderId = job.order_id;
        const type = job.type;

        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as any[];

        const payload = {
          order_id: orderId,
          type: type, // 'pago' | 'anulacion'
          items: items.map(item => ({
             product_id: item.product_id,
             product_name: item.product_name,
             quantity: item.quantity
          }))
        };

        const res = await axios.post(this.API_URL, payload);

        if (res.status === 200 || res.status === 201) {
          db.prepare('UPDATE sync_queue SET status = "completed" WHERE id = ?').run(job.id);
        } else {
          db.prepare('UPDATE sync_queue SET status = "failed" WHERE id = ?').run(job.id);
        }
      } catch (err: any) {
         console.error('ERP Sync Background Error:', err.message);
         // Keep pending if offline or failed
      }
    }
  }

  public static startWorker(): void {
    // Run every minute
    setInterval(() => {
       this.processSyncQueue();
    }, 60000);
    // Initial run
    this.processSyncQueue();
  }
}
