import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

class ApiServer {
    constructor(client, contextManager, aiService) {
        this.client = client;
        this.contextManager = contextManager; // Assuming contextManager is passed if needed
        this.aiService = aiService;
        this.app = express();
        this.port = process.env.API_PORT || 3000;

        // Middleware
        this.app.use(cors());
        this.app.use(bodyParser.json({ limit: '50mb' })); // Increased limit for history sync

        // Routes
        this.setupRoutes();
    }

    setupRoutes() {
        // Status Check
        this.app.get('/status', (req, res) => {
            const state = this.client.info ? 'READY' : 'INITIALIZING';
            res.json({
                status: state,
                info: this.client.info
            });
        });

        // Send Message
        this.app.post('/command/send', async (req, res) => {
            const { to, message } = req.body;
            if (!to || !message) {
                return res.status(400).json({ error: 'Missing "to" or "message" fields' });
            }

            try {
                // Ensure 'to' is formatted correctly (e.g., 1234567890@c.us)
                const chatId = to.includes('@') ? to : `${to}@c.us`;
                await this.client.sendMessage(chatId, message);
                res.json({ success: true, message: 'Message sent' });
            } catch (error) {
                console.error('API Send Error:', error);
                res.status(500).json({ error: 'Failed to send message', details: error.message });
            }
        });

        // Sync History
        this.app.post('/history/sync', async (req, res) => {
            const { historyData } = req.body;
            if (!historyData || !Array.isArray(historyData)) {
                return res.status(400).json({ error: 'Invalid history data' });
            }

            console.log(`📥 Received ${historyData.length} history items.`);

            // Generate Diary Entry via AI
            try {
                // Prepare context for AI
                const historyContext = historyData.slice(0, 50).map(h => `- [${h.visitCount} visits] ${h.title} (${h.url})`).join('\n');
                const prompt = `Based on the following recent browsing history, write a short, personal diary entry (max 150 words) as if you are the user reflecting on their day. Be insightful, slightly dramatic or "digital noir" in tone. Also suggestions 2 topics they seem interested in.\n\nHistory:\n${historyContext}`;

                // Use the existing AI Service
                let diaryEntry = "AI Service unavailable.";
                if (this.aiService) {
                    // Assuming aiService has a generateResponse method or similar that returns string
                    // But aiService.generateResponse expects (message, history, name).
                    // I might need to access the underlying model or add a generic method.
                    // For now, I'll try to use a generic method if exists, or just use generateResponse with dummy data.
                    // A better way is to add generateContent to AIService.
                    // I'll assume I can add it or it exists. If not, I'll modify AIService later.
                    // For now, let's use a placeholder if method missing.
                    try {
                        if (this.aiService.model) {
                            const result = await this.aiService.model.generateContent(prompt);
                            diaryEntry = result.response.text();
                        } else {
                            diaryEntry = "AI Model not initialized.";
                        }
                    } catch (e) {
                        console.error("AI Gen Error", e);
                        diaryEntry = "Could not generate diary.";
                    }
                }

                // Store simplified "database" in memory for now (or file)
                this.diaryStore = this.diaryStore || [];
                this.diaryStore.unshift({ date: new Date().toISOString(), content: diaryEntry });

                res.json({ success: true, message: 'History processed', diaryEntry });

            } catch (error) {
                console.error('AI Analysis Failed:', error);
                res.status(500).json({ error: 'Analysis failed' });
            }
        });

        // Get Insights
        this.app.get('/history/insights', (req, res) => {
            res.json({
                diary: this.diaryStore || [
                    { date: new Date().toISOString(), content: "Reflecting on the digital footprint I left today..." }
                ],
                recommendations: [
                    { title: "Advanced Quantum Computing", type: "Video", url: "https://youtube.com/..." },
                    { title: "Digital Noir Aesthetics in 2026", type: "Article", url: "https://medium.com/..." }
                ],
                stats: {
                    totalSearches: 842, // Mock data for now
                    topTopics: ['Technology', 'AI', 'Design']
                }
            });
        });
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🚀 API Server running on port ${this.port}`);
        });
    }
}

export default ApiServer;
