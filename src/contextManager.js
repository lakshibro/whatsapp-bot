import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ContextManager {
    constructor() {
        // Use environment variable or default path
        const dbPath = process.env.DB_PATH || join(__dirname, '..', 'data', 'conversations.db');

        // Ensure parent directory exists
        const parentDir = dirname(dbPath);
        if (!existsSync(parentDir)) {
            mkdirSync(parentDir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.initDatabase();
        this.maxMessages = parseInt(process.env.MAX_CONTEXT_MESSAGES) || 20;
    }

    initDatabase() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_id ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_created_at ON conversations(created_at);
    `);
    }

    getContext(userId) {
        const stmt = this.db.prepare(`
      SELECT role, message, created_at
      FROM conversations
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

        const messages = stmt.all(userId, this.maxMessages);
        return messages.reverse(); // Return in chronological order
    }

    saveMessage(userId, role, message) {
        const stmt = this.db.prepare(`
      INSERT INTO conversations (user_id, role, message)
      VALUES (?, ?, ?)
    `);

        stmt.run(userId, role, message);
        this.pruneOldMessages(userId);
    }

    pruneOldMessages(userId) {
        // Keep only the last MAX_CONTEXT_MESSAGES * 2 messages per user
        const limit = this.maxMessages * 2;

        this.db.prepare(`
      DELETE FROM conversations
      WHERE user_id = ?
      AND id NOT IN (
        SELECT id FROM conversations
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      )
    `).run(userId, userId, limit);
    }

    clearContext(userId) {
        this.db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
    }

    close() {
        this.db.close();
    }
}

export default ContextManager;
