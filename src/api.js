/**
 * HTTP API for remote control of WhatsApp AI Bot
 * Expose status, restart, and basic controls for the Asuna mobile app
 */
import express from 'express';
import cors from 'cors';

let clientRef = null;
let contextManagerRef = null;
const logBuffer = [];
const MAX_LOGS = 100;

export function pushLog(message, level = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    logBuffer.push({ timestamp, level, message });
    if (logBuffer.length > MAX_LOGS) logBuffer.shift();
}

export function initApi(client, contextManager) {
    clientRef = client;
    contextManagerRef = contextManager;

    const app = express();
    const port = process.env.API_PORT || 3847;

    app.use(cors());
    app.use(express.json());

    // Health check
    app.get('/api/health', (req, res) => {
        res.json({ ok: true, service: 'whatsapp-ai-bot', timestamp: new Date().toISOString() });
    });

    // System status
    app.get('/api/status', (req, res) => {
        const state = clientRef?.info ? 'connected' : (clientRef ? 'connecting' : 'disconnected');
        res.json({
            status: state,
            whatsapp: state === 'connected' ? 'connected' : (state === 'connecting' ? 'authenticating' : 'disconnected'),
            server: 'DigitalOcean',
            serverHealth: state === 'connected' ? 92 : 0,
            activeUsers: contextManagerRef?.getActiveUsersCount?.() ?? 0,
        });
    });

    // System logs
    app.get('/api/logs', (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 50, MAX_LOGS);
        const logs = logBuffer.slice(-limit).map(l => `[${l.timestamp}] ${l.message}`);
        res.json({ logs });
    });

    // Info (for compatibility)
    app.get('/api/info', (req, res) => {
        res.json({
            name: process.env.BOT_NAME || 'Asuna',
            maxContextMessages: process.env.MAX_CONTEXT_MESSAGES || 20,
            model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        });
    });

    app.listen(port, '0.0.0.0', () => {
        pushLog(`API server running on port ${port}`, 'info');
        console.log(`📡 API server running on http://0.0.0.0:${port}`);
    });

    return app;
}
