import dotenv from 'dotenv';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import ContextManager from './contextManager.js';
import AIService from './aiService.js';
import ImageService from './imageService.js';
import { initApi, pushLog } from './api.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { clearChromiumLocks, clearChromiumLocksOnShutdown } from './clearChromiumLocks.js';

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

// Clear Chromium lock files - CRITICAL when droplet/container restarts after "down"
// Prevents "profile in use" / SingletonLock error - no need to delete session or rescan QR
const cleared = clearChromiumLocks(authDir);
if (cleared > 0) {
    console.log(`🔓 Cleared ${cleared} stale Chromium lock file(s)`);
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
const imageService = new ImageService();

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
            '--disable-extensions',
            // Prevent singleton lock issues
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows'
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
    pushLog('WhatsApp Bot ready', 'info');
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

        // Handle /gen command to generate images
        if (userMessage.toLowerCase().startsWith('/gen')) {
            const prompt = userMessage.substring(4).trim();
            
            if (!prompt) {
                await message.reply('🎨 Please provide a description for the image!\n\nExample: /gen a beautiful sunset over the ocean\n\nYou can also specify options:\n/gen [prompt] --aspect 16:9 --count 2');
                return;
            }

            // Parse options from prompt
            let imagePrompt = prompt;
            let aspectRatio = '1:1';
            let numberOfImages = 1;

            // Check for --aspect option
            const aspectMatch = prompt.match(/--aspect\s+(\d+:\d+)/i);
            if (aspectMatch) {
                aspectRatio = aspectMatch[1];
                imagePrompt = prompt.replace(/--aspect\s+\d+:\d+/i, '').trim();
            }

            // Check for --count option
            const countMatch = prompt.match(/--count\s+(\d+)/i);
            if (countMatch) {
                numberOfImages = Math.min(Math.max(parseInt(countMatch[1]), 1), 4);
                imagePrompt = prompt.replace(/--count\s+\d+/i, '').trim();
            }

            // Clean up prompt (remove multiple spaces)
            imagePrompt = imagePrompt.replace(/\s+/g, ' ').trim();

            if (!imagePrompt) {
                await message.reply('🎨 Please provide a description for the image!\n\nExample: /gen a beautiful sunset over the ocean');
                return;
            }

            try {
                await message.reply('🎨 Generating image... This may take a moment.');
                console.log(`🎨 Generating image for ${userId}: ${imagePrompt}`);

                const images = await imageService.generateImages(imagePrompt, {
                    numberOfImages,
                    aspectRatio,
                    imageSize: '1K'
                });

                if (images && images.length > 0) {
                    const { MessageMedia } = pkg;
                    
                    // Send each generated image
                    for (let i = 0; i < images.length; i++) {
                        const imageBase64 = images[i];
                        const media = new MessageMedia('image/png', imageBase64, `generated-${i + 1}.png`);
                        await client.sendMessage(userId, media, { caption: i === 0 ? `🎨 Generated: "${imagePrompt}"` : '' });
                    }
                    
                    console.log(`✅ Sent ${images.length} image(s) to ${userId}`);
                } else {
                    await message.reply('❌ Failed to generate image. Please try again with a different prompt.');
                }
            } catch (error) {
                console.error('❌ Error generating image:', error);
                let errorMessage = '❌ Failed to generate image. ';
                
                if (error.message?.includes('quota') || error.message?.includes('429')) {
                    errorMessage += 'API quota exceeded. Please try again later.';
                } else if (error.message?.includes('API key')) {
                    errorMessage += 'Configuration error.';
                } else {
                    errorMessage += error.message || 'Please try again.';
                }
                
                await message.reply(errorMessage);
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

        // Show typing indicator (fires immediately so user sees we're working)
        chat.sendStateTyping();

        // Generate AI response - optimized for low latency (short prompt, limited context)
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

// Graceful shutdown - properly close Chromium to avoid leaving lock files
async function shutdown(signal) {
    console.log(`\n⏹️  Received ${signal}, shutting down gracefully...`);
    contextManager.close();
    try {
        await client.destroy();
    } catch (e) {
        console.error('Error destroying client:', e.message);
    }
    // Clear locks on shutdown to prevent issues on next restart
    clearChromiumLocksOnShutdown(authDir);
    process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM')); // Docker sends SIGTERM on "down"

// Initialize API server for mobile app control
initApi(client, contextManager, imageService);

// Initialize client
pushLog('Starting WhatsApp AI Bot...', 'info');
console.log('🚀 Starting WhatsApp AI Bot...');
async function startClientWithRetries(maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await client.initialize();
            return;
        } catch (e) {
            const msg = String(e?.message || e);
            const looksLikeProfileLock =
                msg.includes('Failed to launch the browser process') ||
                msg.includes('profile appears to be in use') ||
                msg.includes('SingletonLock') ||
                msg.includes('process_singleton');

            console.error(`❌ WhatsApp client initialize failed (attempt ${attempt}/${maxAttempts}):`, msg);

            if (!looksLikeProfileLock || attempt === maxAttempts) {
                throw e;
            }

            // Clear stale locks and retry after short backoff
            const clearedNow = clearChromiumLocks(authDir);
            if (clearedNow > 0) {
                console.log(`🔓 Cleared ${clearedNow} stale Chromium lock file(s) before retry`);
            }
            const delayMs = 1500 * attempt;
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
}

startClientWithRetries().catch((e) => {
    console.error('❌ Fatal startup error:', e?.message || e);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
