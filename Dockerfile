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
    dbus \
    su-exec

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

# Copy application files
COPY . .

# Run as non-root user - create user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create data and auth directories with proper permissions BEFORE switching user
RUN mkdir -p /app/data/.wwebjs_auth && \
    chown -R nodejs:nodejs /app && \
    chmod -R 755 /app/data

# Create volume mount point for persistence
VOLUME ["/app/data"]

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Use entrypoint to fix permissions before starting app
ENTRYPOINT ["docker-entrypoint.sh"]

# Start the bot
CMD ["npm", "start"]
