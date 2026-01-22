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

function getCurrentApiUrl() {
  try {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    return appJson.expo?.extra?.apiBaseUrl || null;
  } catch (error) {
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
    const currentUrl = appJson.expo.extra.apiBaseUrl;
    
    // Only update if IP has changed
    if (currentUrl === apiBaseUrl) {
      return { updated: false, url: apiBaseUrl };
    }
    
    appJson.expo.extra.apiBaseUrl = apiBaseUrl;
    
    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
    
    console.log(`Updated API URL in app.json to: ${apiBaseUrl}`);
    if (currentUrl) {
      console.log(`   Previous: ${currentUrl}`);
    }
    return { updated: true, url: apiBaseUrl };
  } catch (error) {
    console.error('Error updating app.json:', error.message);
    return { updated: false, url: null };
  }
}

// Main execution
const ipAddress = getLocalIP();

if (!ipAddress) {
  console.error('Could not detect your IP address. Please set it manually in app.json under expo.extra.apiBaseUrl');
  process.exit(1);
}

console.log(`Detected IP address: ${ipAddress}`);

const result = updateAppJson(ipAddress);
if (result.url) {
  if (result.updated) {
    console.log('IP address changed! Restart Expo to use the new IP.');
  } else {
    console.log(`IP address unchanged (${ipAddress})`);
  }
  // Exit with success code (0) so npm scripts can continue
  process.exit(0);
} else {
  process.exit(1);
}
