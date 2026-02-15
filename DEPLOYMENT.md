# Digital Ocean Deployment Guide (Asuna Ecosystem)

Complete instructions to deploy **whatsapp-ai-bot** and **asuna-backend** on a Digital Ocean droplet, open ports, and configure the Asuna mobile app. Includes fix for the Chromium profile lock so you **never need to rescan QR** after code updates.

---

## Prerequisites

- Digital Ocean account
- SSH key added to Digital Ocean
- Google Gemini API key
- GitHub (or your repo) with: `whatsapp-ai-bot`, `asuna-backend`

---

## Step 1: Create Droplet

1. Digital Ocean → **Create** → **Droplets**
2. Choose:
   - **Image**: Ubuntu 24.04 LTS
   - **Plan**: Basic ($6/mo, 1GB RAM) or higher
   - **Region**: Closest to you
   - **SSH Key**: Add your key
3. Create Droplet
4. **Note the droplet IP** (e.g. `165.232.123.45`)

---

## Step 2: Initial Server Setup

SSH in:

```bash
ssh root@YOUR_DROPLET_IP
```

Install Docker, Docker Compose, Node.js, Git:

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt install docker-compose git -y

# Verify
docker --version
docker-compose --version
```

---

## Step 3: Open Ports (3847 & 3848)

```bash
# Allow SSH (don't lock yourself out)
ufw allow 22/tcp

# Asuna API ports
ufw allow 3847/tcp   # whatsapp-ai-bot API
ufw allow 3848/tcp   # asuna-backend API

# Optional: HTTP/HTTPS for web
ufw allow 80/tcp
ufw allow 443/tcp

ufw --force enable
ufw status
```

Also open ports in **Digital Ocean Firewall** (Dashboard → Networking → Firewalls):

- Create firewall → Add inbound rules: **Custom TCP 3847**, **Custom TCP 3848**
- Apply to your droplet

---

## Step 4: Deploy whatsapp-ai-bot

```bash
# Create directory
mkdir -p /opt/whatsapp-ai-bot
cd /opt/whatsapp-ai-bot

# Clone (replace with your repo URL)
git clone https://github.com/YOUR_USER/whatsapp-ai-bot.git .
# Or if you deploy from your machine, use scp/rsync to copy files

# Create .env
cp .env.example .env
nano .env
```

**.env contents** (minimum):

```
GEMINI_API_KEY=your_gemini_api_key
BOT_NAME=Asuna
MAX_CONTEXT_MESSAGES=20
API_PORT=3847
```

Save and exit (`Ctrl+O`, Enter, `Ctrl+X`).

```bash
# Build and start
docker-compose up -d --build

# Watch logs
docker-compose logs -f
```

1. Wait for QR code in logs
2. Open WhatsApp on phone → **Settings** → **Linked Devices** → **Link a Device**
3. Scan the QR code
4. Wait for `WhatsApp Bot is ready!`
5. Press `Ctrl+C` to exit logs (bot keeps running)

---

## Step 5: Deploy asuna-backend

```bash
# Create directory
mkdir -p /opt/asuna-backend
cd /opt/asuna-backend

# Clone (replace with your repo)
git clone https://github.com/YOUR_USER/asuna-backend.git .
# Or copy files from your machine

# Create .env
cp .env.example .env
nano .env
```

**.env contents**:

```
GEMINI_API_KEY=your_gemini_api_key
PORT=3848
```

```bash
# Install and run with pm2 (or use Docker)
npm install
npm install -g pm2
pm2 start src/index.js --name asuna-backend
pm2 save
pm2 startup   # Enable on reboot
```

Or use Docker if you have a Dockerfile for asuna-backend.

---

## Step 6: Configure Asuna Mobile App

1. Open the **Asuna** app on your phone
2. Go to **Profile** (last tab)
3. Set:
   - **Bot URL**: `http://YOUR_DROPLET_IP:3847`  
     (Use `https://` only if you set up SSL/reverse proxy)
   - **Backend URL**: `http://YOUR_DROPLET_IP:3848`
4. Tap **Save**

Example: `http://165.232.123.45:3847` and `http://165.232.123.45:3848`

---

## Step 7: Configure Chrome Extension (Optional)

1. Load the Asuna Chrome extension (unpacked)
2. Click extension icon → enter **Backend URL**: `http://YOUR_DROPLET_IP:3848`
3. Click **Save & Sync Now**

---

## Code Updates (No Rescan Required)

The app clears Chromium lock files on every startup. You can update code and restart **without** losing your WhatsApp session or rescanning QR.

### Update whatsapp-ai-bot

```bash
cd /opt/whatsapp-ai-bot

# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Check logs
docker-compose logs -f
```

No need to delete `.wwebjs_auth` or rescan QR. The lock cleanup runs automatically on startup.

### Update asuna-backend

```bash
cd /opt/asuna-backend
git pull origin main
npm install
pm2 restart asuna-backend
```

---

## Chromium Lock Fix (Built-in)

After `docker-compose down` or droplet shutdown, Chromium sometimes leaves lock files. The app now:

1. **On startup**: Recursively clears all Chromium lock files (SingletonLock, SingletonSocket, SingletonCookie, etc.) in `.wwebjs_auth` and `.wwebjs_cache`
2. **On shutdown**: Handles SIGTERM/SIGINT, calls `client.destroy()` so Chromium exits cleanly
3. **Docker**: `stop_grace_period: 30s` gives Chromium time to shut down

You no longer need to:
- Delete `.wwebjs_auth`
- Rescan QR after updates
- Use `-v` or `docker-compose down -v`

---

## Firewall Summary

| Port | Service        | Purpose                    |
|------|----------------|----------------------------|
| 22   | SSH            | Server access              |
| 3847 | whatsapp-ai-bot| API for Asuna mobile app   |
| 3848 | asuna-backend  | Diary, interests, content  |

---

## Management Commands

### whatsapp-ai-bot (Docker)

```bash
cd /opt/whatsapp-ai-bot
docker-compose logs -f      # View logs
docker-compose restart      # Restart
docker-compose down         # Stop
docker-compose up -d        # Start
```

### asuna-backend (PM2)

```bash
pm2 logs asuna-backend
pm2 restart asuna-backend
pm2 stop asuna-backend
pm2 start asuna-backend
```

---

## Troubleshooting

### "Profile in use" / SingletonLock after update

The app should clear this automatically. If it still fails:

```bash
cd /opt/whatsapp-ai-bot
docker-compose down
docker-compose up -d --build
docker-compose logs -f
```

Only if that fails, clear volume and rescan QR:

```bash
docker-compose down -v
docker-compose up -d
docker-compose logs -f
# Rescan QR
```

### Mobile app can't reach droplet

- Confirm UFW allows 3847, 3848
- Confirm Digital Ocean firewall has those rules
- Use `http://` not `https://` unless you have SSL
- Ensure droplet IP is correct (no typo)

### API not responding

```bash
# Test from droplet
curl http://localhost:3847/api/health
curl http://localhost:3848/api/health
```

---

## Backup WhatsApp Session

```bash
cd /opt/whatsapp-ai-bot
VOL=$(docker volume ls -q | grep wwebjs)
docker run --rm -v $VOL:/data -v $(pwd):/backup alpine tar czf /backup/session-backup.tar.gz -C /data .
# Download: scp root@YOUR_DROPLET_IP:/opt/whatsapp-ai-bot/session-backup.tar.gz .
```

---

## Cost Estimate

- Droplet: ~$6/month (1GB)
- Gemini API: ~$2/month (moderate use)
- **Total**: ~$8/month
