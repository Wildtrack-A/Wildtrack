#!/usr/bin/env node
/**
 * Script to automatically detect your computer's IP address and update app.json
 * This allows the app to work when you move between different network locations
 * 
 * Usage:
 *   node update-api-url.js
 * 
 * Or run automatically before starting Expo:
 *   node update-api-url.js && npm start
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, 'app.json');

function getLocalIP() {
  try {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    
    // Prefer IPv4 addresses
    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        // Skip internal and non-IPv4 addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          // Skip 169.254.x.x (link-local) and 127.x.x.x (localhost)
          if (!iface.address.startsWith('169.254.') && !iface.address.startsWith('127.')) {
            return iface.address;
          }
        }
      }
    }
    
    // Fallback: try ipconfig on Windows or ifconfig on Unix
    try {
      if (process.platform === 'win32') {
        const output = execSync('ipconfig', { encoding: 'utf8' });
        const match = output.match(/IPv4 Address[.\s]+:\s+(\d+\.\d+\.\d+\.\d+)/);
        if (match && match[1] && !match[1].startsWith('169.254.') && !match[1].startsWith('127.')) {
          return match[1];
        }
      } else {
        const output = execSync('ifconfig', { encoding: 'utf8' });
        const match = output.match(/inet (\d+\.\d+\.\d+\.\d+)/);
        if (match && match[1] && !match[1].startsWith('169.254.') && !match[1].startsWith('127.')) {
          return match[1];
        }
      }
    } catch (e) {
      // Fallback failed, continue
    }
    
    return null;
  } catch (error) {
    console.error('Error detecting IP:', error.message);
    return null;
  }
}

function updateAppJson(ipAddress, port = 8000) {
  try {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    
    if (!appJson.expo.extra) {
      appJson.expo.extra = {};
    }
    
    const apiBaseUrl = `http://${ipAddress}:${port}/api/v1`;
    appJson.expo.extra.apiBaseUrl = apiBaseUrl;
    
    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
    
    console.log(`✅ Updated API URL in app.json to: ${apiBaseUrl}`);
    return true;
  } catch (error) {
    console.error('❌ Error updating app.json:', error.message);
    return false;
  }
}

// Main execution
const ipAddress = getLocalIP();

if (!ipAddress) {
  console.error('❌ Could not detect your IP address. Please set it manually in app.json under expo.extra.apiBaseUrl');
  process.exit(1);
}

console.log(`📍 Detected IP address: ${ipAddress}`);

if (updateAppJson(ipAddress)) {
  console.log('💡 Tip: You may need to restart Expo for changes to take effect');
  console.log('💡 Run: npm start (or npx expo start)');
} else {
  process.exit(1);
}
