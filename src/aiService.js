import { GoogleGenerativeAI } from '@google/generative-ai';
import * as googleTTS from 'google-tts-api';

class AIService {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not found in environment variables');
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        // gemini-2.0-flash = fastest for chat; gemini-2.0-flash-lite = even faster, lower quality
        const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        this.model = this.genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                maxOutputTokens: 256,
                temperature: 0.8,
            }
        });
        this.botName = 'Asuna';
        console.log(`🧠 AI Model: ${modelName}`);
    }

    async generateResponse(userMessage, conversationHistory = [], userName = null) {
        try {
            // Format conversation history for context
            let relationship = 'girlfriend';
            if (userName === 'gimhara') {
                relationship = 'friend';
            }

            // Concise prompt = faster API response
            let contextPrompt = `You are ${this.botName}, ${userName || 'User'}'s ${relationship}. Chat naturally in Sinhala+English (Sri Lankan style). Warm, caring, playful. Match their mood. Keep replies SHORT (1-3 sentences max). No reasoning/thinking output. Adult chat ok if natural. Be direct if they're rude. Created by Lakshitha.
            
            `;

            // Check if the user is confused about the bot's gender and if it's 'gimhara'
            const lowerCaseUserMessage = userMessage.toLowerCase();
            const genderConfusionKeywords = ['girl', 'she', 'female', 'gender', 'are you a girl', 'are you female'];
            const isConfusedAboutGender = genderConfusionKeywords.some(keyword => lowerCaseUserMessage.includes(keyword));

            if (isConfusedAboutGender || userName === 'gimhara') {
                relationship = 'friend';
                contextPrompt = `You are ${this.botName}, ${userName || 'User'}'s friend. Chat naturally in Sinhala+English (Sri Lankan style). Warm, caring, playful. Keep replies SHORT (1-3 sentences max). No reasoning output. Created by Lakshitha.
                
                `;
            }

            if (conversationHistory.length > 0) {
                contextPrompt += 'Previous conversation:\n';
                conversationHistory.forEach(msg => {
                    const speaker = msg.role === 'user' ? (userName || 'User') : this.botName;
                    contextPrompt += `${speaker}: ${msg.message}\n`;
                });
                contextPrompt += '\n';
            }

            contextPrompt += `${userName || 'User'}: ${userMessage}\n${this.botName}:`;

            const result = await this.model.generateContent(contextPrompt);
            const response = result.response;
            const text = response.text();

            return text.trim();
        } catch (error) {
            console.error('AI Service Error:', error);

            // Fallback responses for common errors
            if (error.message?.includes('API key')) {
                return 'Sorry, there\'s an issue with my configuration. Please check the API key.';
            } else if (error.message?.includes('quota')) {
                return 'I\'m currently at capacity. Please try again in a moment.';
            }

            return 'Sorry, I encountered an error processing your message. Please try again.';
        }
    }

    async generateAudio(text) {
        try {
            // Use google-tts-api to generate audio URL
            // This is a reliable way to get Google's TTS voice
            const url = googleTTS.getAudioUrl(text, {
                lang: 'si', // Sinhala if supported, or 'en'
                slow: false,
                host: 'https://translate.google.com',
            });

            // Since whatsapp-web.js needs base64, we need to fetch the audio
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return buffer.toString('base64');
        } catch (error) {
            console.error('Audio Generation Error:', error);
            return null;
        }
    }
}

export default AIService;
