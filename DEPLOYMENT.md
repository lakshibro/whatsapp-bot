# Digital Ocean Deployment Guide

Simple guide to deploy WhatsApp AI bot on Digital Ocean.

## Prerequisites

- Digital Ocean account
- SSH key setup
- Gemini API key

## Step 1: Create Droplet

1. Go to Digital Ocean dashboard
2. Create → Droplets
3. Choose:
   - **Image**: Ubuntu 24.04 LTS
   - **Plan**: Basic ($6/month, 1GB RAM)
   - **Region**: Choose closest to you
   - **SSH Key**: Add your SSH key
4. Create Droplet
5. Note the IP address

## Step 2: Setup Server

SSH into your droplet:
```bash
ssh root@your-droplet-ip
```

Install Docker:
```bash
# Update system
apt update && apt upgrade -y

# Install Docker and Git
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt install docker-compose git -y

# Verify
docker --version
docker-compose --version
git --version
```

## Step 3: Deploy Bot



1.  **Clone the Repository**

    SSH into your droplet if you haven't already:
    ```bash
    ssh root@your-droplet-ip
    ```

    Clone the repository (replace with your repo URL):
    ```bash
    git clone https://github.com/LAKSHIBRO/whatsapp-bot.git
    cd whatsapp-bot
    ```

2.  **Setup Environment**

    ```bash
    cp .env.example .env
    nano .env
    ```
    - Paste your `GEMINI_API_KEY` and other configurations.
    - Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

3.  **Start the Bot**

    ```bash
    # Create auth directory
    mkdir -p .wwebjs_auth

    # Start with Docker Compose
    docker-compose up -d
    ```

## Step 4: Scan QR Code

View logs and scan QR:
```bash
docker-compose logs -f
```

1. QR code appears in logs
2. Open WhatsApp on phone
3. Settings → Linked Devices → Link a Device
4. Scan the QR code from terminal
5. Wait for "WhatsApp Bot is ready!" message

Press `Ctrl+C` to exit logs (bot keeps running).

## Managing the Bot

### View Logs
```bash
docker-compose logs -f
```

### Restart Bot
```bash
docker-compose restart
```

### Stop Bot
```bash
docker-compose down
```

### Start Bot
```bash
docker-compose up -d
```

### Update Code
```bash
# Go to bot directory
cd ~/whatsapp-bot

# Stop bot
docker-compose down

# Pull latest code
git pull origin main

# Rebuild and start
docker-compose up -d --build
```

## Troubleshooting

### Bot Showing Multiple "Authentication successful!" Messages (RESTART LOOP)

**Symptoms:**
- You see multiple "🔐 Authentication successful!" messages
- You see multiple "✅ WhatsApp Bot is ready!" messages
- Bot only fully starts after you logout from WhatsApp mobile app

**Cause:** Multiple container instances running OR container restart loop

**Fix:**

1. **First, diagnose the issue:**
   ```bash
   # Check how many containers are running
   docker ps -a | grep whatsapp
   
   # You should see only 1 container. If you see multiple, that's the problem!
   # Example bad output:
   # abc123  whatsapp-ai-bot  Up 2 minutes
   # def456  whatsapp-ai-bot  Up 5 minutes
   # ghi789  whatsapp-ai-bot  Exited (1)
   
   # Check current status
   docker-compose ps
   
   # View recent logs to see restart pattern
   docker-compose logs --tail=100
   ```

2. **Clean up duplicate containers:**
   ```bash
   # Stop all containers
   docker-compose down
   
   # Remove any orphaned whatsapp containers
   docker ps -a | grep whatsapp | awk '{print $1}' | xargs -r docker rm -f
   
   # Check no containers remain
   docker ps -a | grep whatsapp
   # Should return nothing
   ```

3. **Restart cleanly:**
   
   **Option A: Keep WhatsApp session (no need to re-scan QR):**
   ```bash
   docker-compose up -d
   docker-compose logs -f
   ```

   **Option B: Fresh start (will need to re-scan QR):**
   ```bash
   docker-compose down -v
   docker-compose up -d
   docker-compose logs -f
   ```

4. **Verify fix:**
   ```bash
   # Should show exactly 1 container
   docker ps | grep whatsapp
   
   # Logs should show single authentication flow
   docker-compose logs
   ```

### Bot won't start
```bash
# Check logs
docker-compose logs

# Check if port is in use
netstat -tulpn | grep docker

# Restart Docker
systemctl restart docker

# Remove any stuck profile lock
docker-compose down -v
docker-compose up -d
```

### QR code not appearing
```bash
# Remove old session and restart
docker-compose down -v
docker-compose up -d
docker-compose logs -f
```

### Out of memory
```bash
# Check memory usage
free -h

# Restart bot
docker-compose restart

# If persistent, upgrade droplet to 2GB RAM
```

### WhatsApp disconnected
```bash
# Check logs
docker-compose logs -f

# If needed, rescan QR
docker-compose down -v
docker-compose up -d
docker-compose logs -f
```

### Container keeps restarting
```bash
# View crash logs
docker-compose logs --tail=200

# Common causes:
# 1. Out of memory - upgrade droplet
# 2. Missing GEMINI_API_KEY - check .env file
# 3. Chromium crash - clear volumes and restart

# Fix:
docker-compose down -v
docker-compose up -d --build
```


## Firewall Setup (Optional)

```bash
# Enable firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## Backup Session

Backup WhatsApp session data:

```bash
# From server
cd /root/whatsapp-bot
tar -czf session-backup.tar.gz .wwebjs_auth

# Download to local machine
scp root@your-droplet-ip:/root/whatsapp-bot/session-backup.tar.gz .
```

Restore session:
```bash
# Upload to server
scp session-backup.tar.gz root@your-droplet-ip:/root/whatsapp-bot/

# On server
cd /root/whatsapp-bot
tar -xzf session-backup.tar.gz
docker-compose restart
```

## Cost Estimate

- **Droplet**: $6/month (1GB RAM)
- **Gemini API**: ~$2/month (moderate usage)
- **Total**: ~$8/month

## Security Notes

⚠️ **Change default SSH port**
⚠️ **Setup firewall**
⚠️ **Use non-root user** (optional but recommended)
⚠️ **Keep `.env` file secure**
⚠️ **Regular backups of `.wwebjs_auth/`**

## Support

If bot stops working:
1. Check logs: `docker-compose logs`
2. Restart: `docker-compose restart`
3. Rescan QR: Delete `.wwebjs_auth` and restart
4. Check server resources: `htop` or `free -h`
