import dotenv from 'dotenv';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import ContextManager from './contextManager.js';
import AIService from './aiService.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

// Load environment variables
dotenv.config();

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Create WhatsApp authentication directory
const authDir = join(projectRoot, '.wwebjs_auth');

console.log('🔧 Setting up directories...');
console.log(`🔐 Auth directory: ${authDir}`);

if (!existsSync(authDir)) {
    mkdirSync(authDir, { recursive: true });
    console.log('✅ Created auth directory');
}

// Verify environment variables
if (!process.env.GEMINI_API_KEY) {
    console.error('❌ ERROR: GEMINI_API_KEY not found in environment variables');
    console.error('Please create a .env file with your GEMINI_API_KEY');
    process.exit(1);
}

// Initialize services
const contextManager = new ContextManager();
const aiService = new AIService();

// Initialize WhatsApp client with persistent session in data directory
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: authDir
    }),
    puppeteer: {
        headless: true,
        // Only use the Alpine Linux path if we are not on Windows
        // On Windows, let Puppeteer use its bundled Chromium or default path
        ...(process.platform === 'win32' ? {} : { executablePath: '/usr/bin/chromium-browser' }),
        timeout: 300000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            // Critical for Docker/low-memory: use /tmp instead of /dev/shm (often 64MB on droplets)
            '--disable-dev-shm-usage',
            '--disable-software-rasterizer',
            '--no-first-run',
            '--disable-extensions'
        ]
    }
});

// QR Code generation for authentication
client.on('qr', (qr) => {
    console.log('\n📱 Scan this QR code with your WhatsApp mobile app:\n');
    qrcode.generate(qr, { small: true });
    console.log('\n');
});

// Loading screen progress
client.on('loading_screen', (percent, message) => {
    if (percent % 20 === 0 || percent === 100) {
        console.log(`⏳ Loading WhatsApp: ${percent}% - ${message}`);
    }
});

// Client ready
client.on('ready', () => {
    console.log('✅ WhatsApp Bot is ready!');
    console.log(`🤖 Bot Name: ${process.env.BOT_NAME || 'AI Assistant'}`);
    console.log(`💾 Max context messages: ${process.env.MAX_CONTEXT_MESSAGES || 20}`);
});

// Handle authentication success
client.on('authenticated', (session) => {
    console.log('🔐 Authentication successful!');
    console.log('📋 Session data received, initializing client...');
});

// Handle authentication failure
client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
});

// Monitor state changes
client.on('change_state', (state) => {
    console.log('🔄 Connection state changed to:', state);
});

// Monitor remote session saved
client.on('remote_session_saved', () => {
    console.log('💾 Remote session saved successfully');
});

// Handle incoming messages
client.on('message', async (message) => {
    try {
        // Ignore status updates
        if (message.from === 'status@broadcast') {
            return;
        }

        const chat = await message.getChat();

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

        // Handle /name command to set user's name manually
        if (userMessage.toLowerCase().startsWith('/name ')) {
            const name = userMessage.substring(6).trim();
            if (name) {
                contextManager.setUserName(userId, name);
                await message.reply(`✨ Nice to meet you, ${name}! මට ඔයාව මතක් තියෙන්නම්.`);
                console.log(`👤 Name set manually for ${userId}: ${name}`);
            } else {
                await message.reply('Please provide your name like: /name YourName');
            }
            return;
        }

        // Handle /voice command to toggle voice mode
        if (userMessage.toLowerCase().startsWith('/voice')) {
            const parts = userMessage.trim().split(' ');
            const mode = parts[1]?.toLowerCase();

            if (mode === 'on') {
                contextManager.setVoiceMode(userId, true);
                await message.reply('🎤 Voice mode enabled! I will now reply with voice messages.');
            } else if (mode === 'off') {
                contextManager.setVoiceMode(userId, false);
                await message.reply('📝 Voice mode disabled. I will reply with text.');
            } else {
                const currentMode = contextManager.getVoiceMode(userId);
                await message.reply(`Voice mode is currently ${currentMode ? 'ON 🎤' : 'OFF 📝'}.\nUse '/voice on' or '/voice off' to change it.`);
            }
            return;
        }

        // Try to extract name from user message
        const extractedName = contextManager.extractNameFromMessage(userMessage);
        if (extractedName && !contextManager.getUserName(userId)) {
            contextManager.setUserName(userId, extractedName);
            console.log(`👤 Automatically detected name: ${extractedName}`);
        }

        // Get user's name and conversation context
        const userName = contextManager.getUserName(userId);
        const conversationHistory = contextManager.getContext(userId);

        // Save user message
        contextManager.saveMessage(userId, 'user', userMessage);

        // Show typing indicator
        chat.sendStateTyping();

        // Generate AI response with user's name if available
        const aiResponse = await aiService.generateResponse(userMessage, conversationHistory, userName);

        // Save bot response
        contextManager.saveMessage(userId, 'assistant', aiResponse);

        // Check if voice mode is enabled
        const isVoiceMode = contextManager.getVoiceMode(userId);

        if (isVoiceMode) {
            try {
                // Generate audio
                const audioBase64 = await aiService.generateAudio(aiResponse);

                if (audioBase64) {
                    // Send audio message
                    const { MessageMedia } = pkg;
                    const media = new MessageMedia('audio/mp3', audioBase64, 'voice.mp3');
                    await client.sendMessage(userId, media, { sendAudioAsVoice: true });
                    console.log(`🎤 Voice response sent to ${userId}`);
                } else {
                    // Fallback to text if audio generation fails
                    await message.reply(aiResponse);
                    console.log(`✉️  Response sent (audio failed): ${aiResponse.substring(0, 50)}...`);
                }
            } catch (audioError) {
                console.error('❌ Error sending voice message:', audioError);
                await message.reply(aiResponse);
            }
        } else {
            // Send text response
            await message.reply(aiResponse);
            console.log(`✉️  Response sent: ${aiResponse.substring(0, 50)}...`);
        }

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

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
