FROM node:20-alpine

# Install Chromium and all required dependencies for whatsapp-web.js
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    ttf-liberation \
    font-noto-emoji \
    fontconfig \
    udev \
    dbus

# Tell Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Force whatsapp-web.js 1.34.6+ (fixes "ready" event not firing after auth)
RUN npm install whatsapp-web.js@1.34.6 --save --omit=dev

# Copy application files
COPY . .

# Run as non-root user - create user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create auth directory with proper permissions BEFORE switching user
RUN mkdir -p /app/.wwebjs_auth && \
    chown -R nodejs:nodejs /app && \
    chmod -R 755 /app/.wwebjs_auth

# Now switch to non-root user
USER nodejs

# Start the bot
CMD ["npm", "start"]
