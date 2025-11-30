/**
 * ContextManager - In-memory conversation history management
 * Stores conversation context per user without persistent database
 */
class ContextManager {
    constructor() {
        // In-memory storage: Map of userId -> array of messages
        this.conversations = new Map();
        // In-memory storage: Map of userId -> user name
        this.userNames = new Map();
        // In-memory storage: Map of userId -> boolean (voice mode enabled/disabled)
        this.voiceModes = new Map();
        this.maxMessages = parseInt(process.env.MAX_CONTEXT_MESSAGES) || 20;

        console.log('💾 Context Manager initialized (in-memory mode)');
    }

    /**
     * Get conversation history for a user
     * @param {string} userId - WhatsApp user ID
     * @returns {Array} Array of message objects with role and message
     */
    getContext(userId) {
        const userConversation = this.conversations.get(userId) || [];
        // Return last N messages in chronological order
        return userConversation.slice(-this.maxMessages);
    }

    /**
     * Save a message to user's conversation history
     * @param {string} userId - WhatsApp user ID
     * @param {string} role - Message role ('user' or 'assistant')
     * @param {string} message - Message content
     */
    saveMessage(userId, role, message) {
        if (!this.conversations.has(userId)) {
            this.conversations.set(userId, []);
        }

        const userConversation = this.conversations.get(userId);
        userConversation.push({
            role,
            message,
            created_at: new Date().toISOString()
        });

        // Automatically prune old messages
        this.pruneOldMessages(userId);
    }

    /**
     * Prune old messages to prevent memory bloat
     * Keeps only the last MAX_CONTEXT_MESSAGES * 2 messages per user
     * @param {string} userId - WhatsApp user ID
     */
    pruneOldMessages(userId) {
        const userConversation = this.conversations.get(userId);
        if (!userConversation) return;

        const limit = this.maxMessages * 2;
        if (userConversation.length > limit) {
            // Keep only the most recent messages
            const pruned = userConversation.slice(-limit);
            this.conversations.set(userId, pruned);
        }
    }

    /**
     * Clear all conversation history for a user
     * @param {string} userId - WhatsApp user ID
     */
    clearContext(userId) {
        this.conversations.delete(userId);
        console.log(`🗑️  Cleared context for user: ${userId}`);
    }

    /**
     * Get total number of users with active conversations
     * @returns {number} Number of active users
     */
    getActiveUsersCount() {
        return this.conversations.size;
    }

    /**
     * Get user's name
     * @param {string} userId - WhatsApp user ID
     * @returns {string|null} User's name or null if not set
     */
    getUserName(userId) {
        return this.userNames.get(userId) || null;
    }

    /**
     * Set user's name
     * @param {string} userId - WhatsApp user ID
     * @param {string} name - User's name
     */
    setUserName(userId, name) {
        this.userNames.set(userId, name);
        console.log(`👤 Set name for ${userId}: ${name}`);
    }

    /**
     * Get user's voice mode preference
     * @param {string} userId - WhatsApp user ID
     * @returns {boolean} True if voice mode is enabled
     */
    getVoiceMode(userId) {
        return this.voiceModes.get(userId) || false;
    }

    /**
     * Set user's voice mode preference
     * @param {string} userId - WhatsApp user ID
     * @param {boolean} enabled - Whether voice mode is enabled
     */
    setVoiceMode(userId, enabled) {
        this.voiceModes.set(userId, enabled);
        console.log(`🎤 Voice mode set for ${userId}: ${enabled}`);
    }

    /**
     * Extract name from user message using pattern matching
     * Detects patterns like "my name is X", "I'm X", "call me X", etc.
     * @param {string} message - User's message
     * @returns {string|null} Extracted name or null
     */
    extractNameFromMessage(message) {
        // Convert to lowercase for pattern matching
        const lowerMessage = message.toLowerCase();

        // Patterns to detect name introduction
        const patterns = [
            /(?:my name is|මගේ නම|මගෙ නම)\s+(\w+)/i,
            /(?:i'm|i am|මම|මං)\s+(\w+)/i,
            /(?:call me|මට කියන්න)\s+(\w+)/i,
            /(?:this is|it's|මේ)\s+(\w+)/i,
            /(?:නම|name)[\s:]+(\w+)/i
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                // Capitalize first letter
                const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
                // Ignore common words that might be mistakenly captured
                const ignoreWords = ['the', 'a', 'an', 'is', 'was', 'are', 'were', 'මම', 'මං', 'එක'];
                if (!ignoreWords.includes(match[1].toLowerCase())) {
                    return name;
                }
            }
        }

        return null;
    }

    /**
     * Close method for compatibility (no-op for in-memory storage)
     */
    close() {
        console.log('💾 Context Manager closed');
        this.conversations.clear();
        this.userNames.clear();
    }
}

export default ContextManager;
