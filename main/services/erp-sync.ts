import axios from 'axios';
import { getDatabase } from '../db';

export class ErpSyncService {
  private static readonly ERP_API_URL = process.env.ERP_API_URL || 'https://erp.example.com/api/v1';

  static queueSync(orderId: string, type: 'sale' | 'cancellation', payload: any) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO sync_queue (id, order_id, type, status, payload)
      VALUES (?, ?, ?, 'pending', ?)
    `);
    stmt.run(
      Math.random().toString(36).substring(7),
      orderId,
      type,
      JSON.stringify(payload)
    );
  }

  static async startWorker() {
    console.log('Starting ERP Sync Worker...');
    setInterval(async () => {
      await this.processQueue();
    }, 10000); // Poll every 10 seconds
  }

  private static async processQueue() {
    const db = getDatabase();

    // Check if table exists (may not exist during early init)
    try {
        db.prepare('SELECT 1 FROM sync_queue LIMIT 1').get();
    } catch (e) {
        return;
    }

    const pendingItems = db.prepare(`SELECT * FROM sync_queue WHERE status = 'pending' LIMIT 10`).all() as any[];

    for (const item of pendingItems) {
      try {
        await axios.post(`${this.ERP_API_URL}/sync`, {
          orderId: item.order_id,
          type: item.type,
          payload: JSON.parse(item.payload)
        });

        db.prepare(`UPDATE sync_queue SET status = 'completed' WHERE id = ?`).run(item.id);
      } catch (error: any) {
        console.error(`ERP Sync Failed for item ${item.id}:`, error.message);
        // Optionally update status to 'error' and implement retry logic
      }
    }
  }
}
