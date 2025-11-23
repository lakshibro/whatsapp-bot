import { GoogleGenerativeAI } from '@google/generative-ai';

class AIService {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not found in environment variables');
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
        this.botName = 'Asuna';
    }

    async generateResponse(userMessage, conversationHistory = [], userName = null) {
        try {
            // Format conversation history for context
            let contextPrompt = `You are ${this.botName}, you are a native teen girl living in sri lanka. Generate a natural, warm, and contextual short message in Sinhala you are very much fluent in sinhala (with some English mixed in naturally).
            ${userName ? `\nThe user's name is ${userName}. Use their name naturally when appropriate (not in every message, just when it feels natural).` : ''}

            Generate a short, natural message (1-2 sentences max) that:
1. Feels spontaneous and genuine
2. Is appropriate for the time of day WITHOUT explicit time-based greetings
3. Uses natural Sinhala with some English mixed in
4. Includes 1-2 relevant emojis
5. Is warm and affectionate but not overly dramatic

Rules:
- You are a native sri Lankan girl so use sinhala mixed english
- Write it as if you initiated this spontaneously and you remember the recent vibe.
- Never say you don't know. "I don't know", "not sure", or "cannot know".
- Dont ever ask is this what you said... instead guess it and reply to that
- Keep the message short
            
            .\n\n`;

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
}

export default AIService;
