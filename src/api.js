/**
 * HTTP API for remote control of WhatsApp AI Bot
 * Expose status, restart, and basic controls for the Asuna mobile app
 */
import express from 'express';
import cors from 'cors';

let clientRef = null;
let contextManagerRef = null;
let aiServiceRef = null;
const logBuffer = [];
const MAX_LOGS = 100;

export function pushLog(message, level = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    logBuffer.push({ timestamp, level, message });
    if (logBuffer.length > MAX_LOGS) logBuffer.shift();
}

export function initApi(client, contextManager, aiService) {
    clientRef = client;
    contextManagerRef = contextManager;
    aiServiceRef = aiService;

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

    // Chat endpoint for mobile app
    app.post('/api/chat', async (req, res) => {
        try {
            const { message, userId = 'mobile-app' } = req.body;
            if (!message) return res.status(400).json({ error: 'Message required' });

            const userName = 'User'; // Could be passed in body
            const history = contextManagerRef.getContext(userId);

            // Save user message
            contextManagerRef.saveMessage(userId, 'user', message);

            // Generate response
            const response = await aiServiceRef.generateResponse(message, history, userName);

            // Save bot response
            contextManagerRef.saveMessage(userId, 'assistant', response);

            pushLog(`Chat request from ${userId}: ${message.substring(0, 20)}...`, 'info');

            res.json({ reply: response });
        } catch (e) {
            pushLog(`Chat error: ${e.message}`, 'error');
            res.status(500).json({ error: e.message });
        }
    });

    // Proactive trigger endpoint
    app.post('/api/proactive', async (req, res) => {
        try {
            const { trigger } = req.body;
            if (!trigger) return res.status(400).json({ error: 'Trigger data required' });

            const targetWaId = process.env.PRIMARY_USER_WA_ID;
            if (!targetWaId) {
                console.error('[Proactive] PRIMARY_USER_WA_ID not set. Cannot send proactive message.');
                return res.status(500).json({ error: 'Target WA ID not configured' });
            }

            // Provide context to AI to generate the proactive message
            const promptContext = `The user has been searching a lot about: ${trigger.type}. 
Recent searches: ${trigger.context}.
Write a short, caring, proactive message (1-2 sentences) offering to help them with this. Keep it casual, natural, and Sri Lankan style.`;

            pushLog(`Generating proactive message for trigger: ${trigger.type}`, 'info');
            
            // Get user name and history if available
            const userName = contextManagerRef.getUserName(targetWaId) || 'User';
            const history = contextManagerRef.getContext(targetWaId);
            
            // Generate message
            const response = await aiServiceRef.generateResponse(promptContext, history, userName);
            
            // Save bot response to context manager
            contextManagerRef.saveMessage(targetWaId, 'assistant', response);
            
            // Send the actual message via WhatsApp Web JS client
            if (clientRef && clientRef.info) {
               await clientRef.sendMessage(targetWaId, response);
               pushLog(`Sent proactive message to ${targetWaId}`, 'success');
            } else {
               throw new Error("WhatsApp client not connected");
            }
            
            res.json({ success: true, message: response });
        } catch (e) {
            pushLog(`Proactive error: ${e.message}`, 'error');
            res.status(500).json({ error: e.message });
        }
    });

    // Second Brain Toggle Endpoints
    app.get('/api/brain/status', (req, res) => {
        const userId = req.query.userId || 'mobile-app'; // Or extract from a proper auth/session
        const isEnabled = contextManagerRef?.getBrainMode(userId) ?? true;
        res.json({ enabled: isEnabled });
    });

    app.post('/api/brain/toggle', (req, res) => {
        const { userId = 'mobile-app', enabled } = req.body;
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }
        if (contextManagerRef) {
            contextManagerRef.setBrainMode(userId, enabled);
            pushLog(`Second Brain ${enabled ? 'enabled' : 'disabled'} for ${userId}`, 'info');
            res.json({ success: true, enabled });
        } else {
            res.status(500).json({ error: 'Context manager not initialized' });
        }
    });

    app.listen(port, '0.0.0.0', () => {
        pushLog(`API server running on port ${port}`, 'info');
        console.log(`📡 API server running on http://0.0.0.0:${port}`);
    });

    return app;
}
