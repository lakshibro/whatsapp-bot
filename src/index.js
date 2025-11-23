import dotenv from 'dotenv';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import ContextManager from './contextManager.js';
import AIService from './aiService.js';

// Load environment variables
dotenv.config();

// Initialize services
const contextManager = new ContextManager();
const aiService = new AIService();

// Initialize WhatsApp client with persistent session in data directory
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './data/.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// QR Code generation for authentication
client.on('qr', (qr) => {
    console.log('\n📱 Scan this QR code with your WhatsApp mobile app:\n');
    qrcode.generate(qr, { small: true });
    console.log('\n');
});

// Client ready
client.on('ready', () => {
    console.log('✅ WhatsApp Bot is ready!');
    console.log(`🤖 Bot Name: ${process.env.BOT_NAME || 'AI Assistant'}`);
    console.log(`💾 Max context messages: ${process.env.MAX_CONTEXT_MESSAGES || 20}`);
});

// Handle authentication success
client.on('authenticated', () => {
    console.log('🔐 Authentication successful!');
});

// Handle authentication failure
client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
});

// Handle incoming messages
client.on('message', async (message) => {
    try {
        // Ignore group messages and status updates
        const chat = await message.getChat();
        if (chat.isGroup) {
            return;
        }

        // Get sender info
        const userId = message.from;
        const userMessage = message.body;

        // Ignore empty messages
        if (!userMessage || userMessage.trim() === '') {
            return;
        }

        console.log(`\n📨 Message from ${userId}: ${userMessage}`);

        // Special commands
        if (userMessage.toLowerCase() === '/reset') {
            contextManager.clearContext(userId);
            await message.reply('🔄 Conversation history has been reset!');
            console.log(`🗑️  Context cleared for ${userId}`);
            return;
        }

        // Get conversation context
        const conversationHistory = contextManager.getContext(userId);

        // Save user message
        contextManager.saveMessage(userId, 'user', userMessage);

        // Show typing indicator
        chat.sendStateTyping();

        // Generate AI response
        const aiResponse = await aiService.generateResponse(userMessage, conversationHistory);

        // Save bot response
        contextManager.saveMessage(userId, 'assistant', aiResponse);

        // Send response
        await message.reply(aiResponse);
        console.log(`✉️  Response sent: ${aiResponse.substring(0, 50)}...`);

    } catch (error) {
        console.error('❌ Error handling message:', error);
        try {
            await message.reply('Sorry, I encountered an error. Please try again.');
        } catch (replyError) {
            console.error('❌ Failed to send error message:', replyError);
        }
    }
});

// Handle disconnection
client.on('disconnected', (reason) => {
    console.log('⚠️  Client was disconnected:', reason);
    contextManager.close();
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⏹️  Shutting down gracefully...');
    contextManager.close();
    client.destroy();
    process.exit(0);
});

// Initialize client
console.log('🚀 Starting WhatsApp AI Bot...');
client.initialize();
