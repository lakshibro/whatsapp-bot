#!/bin/sh
set -e

# Ensure data directory exists and has correct permissions
echo "🔧 Ensuring data directory permissions..."

# Create directories if they don't exist
mkdir -p /app/data/.wwebjs_auth

# Fix permissions (we're still running as root at this point in Alpine)
chown -R nodejs:nodejs /app/data
chmod -R 755 /app/data

echo "✅ Permissions set correctly"

# Now switch to nodejs user and run the application
exec su-exec nodejs "$@"
