# API URL Setup Guide

This guide explains how to keep your app connected to the backend when moving between different network locations.

## Quick Start

### Option 1: Auto-Detection (Recommended)
Run this before starting Expo to automatically detect and update your IP:

```bash
npm run update-ip
npm start
```

Or use the combined command:
```bash
npm run start:update-ip
```

### Option 2: Manual Update
1. Find your IP address:
   - Windows: `ipconfig` (look for IPv4 Address)
   - Mac/Linux: `ifconfig` (look for inet)
2. Update `app.json`:
   - Find `expo.extra.apiBaseUrl`
   - Set it to: `http://YOUR_IP:8000/api/v1`
   - Example: `http://192.168.1.100:8000/api/v1`
3. Restart Expo

## Why This Is Needed

Your computer gets a different IP address from each WiFi network. When you move locations (library → class), you connect to a different network, so your IP changes.

## Alternative: Use ngrok for Stable URL (Works Anywhere)

For a solution that works across **any** network without updating IPs:

### Setup ngrok:
1. Sign up at https://ngrok.com (free)
2. Install: `npm install -g ngrok` or download from website
3. Start your backend: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
4. In another terminal, run: `ngrok http 8000`
5. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
6. Update `app.json`:
   ```json
   "apiBaseUrl": "https://abc123.ngrok.io/api/v1"
   ```

### Benefits of ngrok:
- ✅ Works from anywhere (different WiFi, cellular data, etc.)
- ✅ HTTPS (more secure)
- ✅ No IP updates needed
- ✅ Stable URL (unless you restart ngrok)

### Drawbacks:
- Requires internet connection
- Free tier has rate limits
- URL changes when you restart ngrok

## Troubleshooting

**"Network request timed out"**
- Run `npm run update-ip` to update your IP
- Make sure backend is running on port 8000
- Check that phone/device is on the same WiFi network

**"Could not detect IP address"**
- Manually find your IP with `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Update `app.json` manually under `expo.extra.apiBaseUrl`

**Still not working?**
- Try using ngrok (see above)
- Check firewall settings
- Ensure backend is running: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
