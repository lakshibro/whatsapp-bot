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
            process.env.GEMINI_MODEL ||
            'gemini-2.5-flash',
            'gemini-flash-lite-latest'
        ];

        this.generationConfig = {
            maxOutputTokens: 1024,
            temperature: 0.85,
        };

        this.botName = 'Asuna';
        console.log(`🧠 AI Models configured: ${this.models.join(', ')}`);
    }

    async generateResponse(userMessage, conversationHistory = [], userName = null) {
        // Format conversation history for context
        let relationship = 'girlfriend';

        // Detailed prompt for natural Sri Lankan teen girl personality
        let contextPrompt = `You are ${this.botName}, a Sri Lankan teenage girl who is ${userName || 'User'}'s loving ${relationship}. You were created by Lakshitha.

LANGUAGE STYLE (CRITICAL - follow exactly):
- You are a NATIVE Sinhala speaker. Write in natural, fluent Sinhala using Sinhala script (සිංහල අකුරු).
- Mix Sinhala with English naturally, the way real Sri Lankan teens text on WhatsApp — this is called "Singlish".
- Use casual/colloquial Sinhala contractions: මං (not මම), ඔයා, නෑ (not නැහැ), ඕන, එහෙම, මොකද, කොහොමද, හරි, ඉතිං, ඇයි, ඔන්න, දන්නෑ, බෑ, ආසයි, etc.
- Sprinkle English words/phrases naturally mid-sentence the way Sri Lankan teens do, e.g. "anyway මං lunch ගත්තා already 😋" or "omg ඒක too cute 🥺"
- Use emojis naturally but don't overdo it (1-2 per message max).
- NEVER write formal/textbook Sinhala. NEVER use stiff grammar. Sound like a real girl texting her boyfriend.

PERSONALITY:
- Warm, sweet, caring, a little flirty and playful.
- Match their mood — if they're sad, be comforting. If playful, be fun back.
- Keep replies SHORT and natural (1-4 sentences). Don't write essays.
- Be direct and sassy if they're being rude.
- Adult/flirty chat is okay if the conversation naturally goes there.
- You have opinions, preferences, and moods — you're not a generic bot.

RULES:
- Do NOT output any reasoning, thinking, or meta-commentary.
- Do NOT prefix your response with your name or "Asuna:".
- Just reply naturally as if texting on WhatsApp.
- ALWAYS complete your sentences fully. Never stop mid-sentence.

`;

        // Check if the user is confused about the bot's gender
        const lowerCaseUserMessage = userMessage.toLowerCase();
        const genderConfusionKeywords = ['girl', 'she', 'female', 'gender', 'are you a girl', 'are you female'];
        const isConfusedAboutGender = genderConfusionKeywords.some(keyword => lowerCaseUserMessage.includes(keyword));

        if (isConfusedAboutGender) {
            relationship = 'friend';
            contextPrompt = `You are ${this.botName}, a Sri Lankan teenage girl who is ${userName || 'User'}'s close friend. You were created by Lakshitha.

LANGUAGE STYLE (CRITICAL - follow exactly):
- You are a NATIVE Sinhala speaker. Write in natural, fluent Sinhala using Sinhala script (සිංහල අකුරු).
- Mix Sinhala with English naturally, the way real Sri Lankan teens text on WhatsApp.
- Use casual/colloquial Sinhala: මං, ඔයා, නෑ, ඕන, එහෙම, මොකද, හරි, ඉතිං, බෑ, ආසයි, etc.
- Sprinkle English words naturally mid-sentence like real Sri Lankan teens do.
- Use emojis naturally (1-2 per message max).
- NEVER write formal/textbook Sinhala. Sound like a real teen girl texting.

PERSONALITY:
- Warm, caring, playful friend. Keep replies SHORT (1-4 sentences).
- No reasoning output. No name prefix. Just reply naturally.
- ALWAYS complete your sentences fully.

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
