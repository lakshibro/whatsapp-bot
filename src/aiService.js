import { GoogleGenerativeAI } from '@google/generative-ai';


class AIService {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not found in environment variables');
        }

        this.genAI = new GoogleGenerativeAI(apiKey);

        // Primary model + Fallbacks
        this.models = [
            process.env.GEMINI_MODEL || 'gemini-2.5-pro',
            'gemini-2.5-flash',
            'gemini-flash-lite-latest'
        ];

        this.generationConfig = {
            maxOutputTokens: 256,
            temperature: 0.8,
        };

        this.botName = 'Asuna';
        console.log(`🧠 AI Models configured: ${this.models.join(', ')}`);
    }

    async generateResponse(userMessage, conversationHistory = [], userName = null) {
        // Format conversation history for context
        let relationship = 'girlfriend';

        // Concise prompt = faster API response
        let contextPrompt = `You are ${this.botName}, ${userName || 'User'}'s ${relationship}. Chat naturally in Sinhala+English (Sri Lankan style). Warm, caring, playful. Match their mood. Keep replies SHORT (1-3 sentences max). No reasoning/thinking output. Adult chat ok if natural. Be direct if they're rude. Created by Lakshitha.
        
        `;

        // Check if the user is confused about the bot's gender and if it's 'gimhara'
        const lowerCaseUserMessage = userMessage.toLowerCase();
        const genderConfusionKeywords = ['girl', 'she', 'female', 'gender', 'are you a girl', 'are you female'];
        const isConfusedAboutGender = genderConfusionKeywords.some(keyword => lowerCaseUserMessage.includes(keyword));

        if (isConfusedAboutGender) {
            relationship = 'friend';
            contextPrompt = `You are ${this.botName} a native sri lankan teenage girl very fluent in sinhala, ${userName || 'User'}'s friend. Chat naturally as a teenager would in Sinhala+English (Sri Lankan style). Warm, caring, playful. Keep replies SHORT (1-3 sentences max). No reasoning output. Created by Lakshitha.
            
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

        let lastError = null;

        for (const modelName of this.models) {
            try {
                const model = this.genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig: this.generationConfig
                });

                const result = await model.generateContent(contextPrompt);
                const response = result.response;
                const text = response.text();
                return text.trim();

            } catch (error) {
                console.warn(`⚠️ Model ${modelName} failed: ${error.message}`);
                lastError = error;

                // Check if we should try the next model
                const isQuotaError = error.message?.includes('quota') ||
                    error.message?.includes('429') ||
                    error.message?.includes('503') ||
                    error.message?.includes('capacity');

                if (isQuotaError) {
                    console.log(`🔄 Switching to next fallback model...`);
                    continue;
                } else {
                    // Non-quota error, probably shouldn't retry with other models (e.g. safety, invalid request)
                    break;
                }
            }
        }

        console.error('❌ All AI models failed.');

        // Handle the final error
        if (lastError?.message?.includes('API key')) {
            return 'Sorry, there\'s an issue with my configuration. Please check the API key.';
        } else if (lastError?.message?.includes('quota') || lastError?.message?.includes('capacity')) {
            return 'I\'m currently at maximum capacity. Please try again in a moment.';
        }

        return 'Sorry, I encountered an error processing your message. Please try again.';
    }

}

export default AIService;
