/**
 * Auth0 authentication service for React Native/Expo
 * Uses Auth0 Universal Login via expo-auth-session
 */

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthToken, removeAuthToken } from './api';

// Storage key for pending account type selection
const PENDING_ACCOUNT_TYPE_KEY = '@wildtrack:pending_account_type';
// Storage key for PKCE code verifier (temporary storage during auth flow)
const PKCE_CODE_VERIFIER_KEY = '@wildtrack:pkce_code_verifier';

// Complete the web browser session for better UX (called conditionally in functions)
// Note: We don't call this at module load time to avoid initialization issues

// Auth0 Configuration
// TODO: Move these to environment variables or config file
const AUTH0_DOMAIN = 'dev-gmmzbhmqdbfi7xyf.us.auth0.com';
const AUTH0_CLIENT_ID = '2IE665cTcelCcap4T4swdanlDdRQS4FG'; // WildTrack Native Application - supports authorization_code grant (note: lowercase L not number 1)
const AUTH0_AUDIENCE = 'https://api.wildtrack.com';

// Redirect URI - must match what's configured in Auth0 Dashboard
// For Expo Go, use your redirect URI
const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'wildtrackapp',
  path: 'auth/callback',
});

// Log the redirect URI for debugging (check console to see what to add to Auth0)
console.log('Auth0 Redirect URI:', REDIRECT_URI);

// Auth0 authorization endpoint
const discovery = {
  authorizationEndpoint: `https://${AUTH0_DOMAIN}/authorize`,
  tokenEndpoint: `https://${AUTH0_DOMAIN}/oauth/token`,
  revocationEndpoint: `https://${AUTH0_DOMAIN}/oauth/revoke`,
};

/**
 * Generate a random string for PKCE code verifier
 */
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Base64 URL encode a string
 */
function base64URLEncode(str: string): string {
  return str
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Login with Auth0 using Universal Login
 * Redirects to Auth0's hosted login page
 * 
 * @param screen - Optional: 'signup' to show signup screen, 'login' to show login screen
 * @returns Access token string if successful, null if cancelled, throws error on failure
 * 
 * @throws {Error} If authentication fails with error details
 */
export async function loginWithAuth0(screen?: 'signup' | 'login'): Promise<string | null> {
  let codeVerifier: string | null = null;
  
  try {
    // Generate code verifier for PKCE (43-128 characters, recommend 43+ for security)
    codeVerifier = generateRandomString(43);
    
    // Generate code challenge (SHA256 hash of verifier, base64url encoded)
    const codeChallengeBase64 = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    );
    const codeChallenge = base64URLEncode(codeChallengeBase64);
    
    // Store code verifier temporarily (in case of app reload during redirect)
    await AsyncStorage.setItem(PKCE_CODE_VERIFIER_KEY, codeVerifier).catch(err => {
      console.warn('Failed to store PKCE code verifier:', err);
    });

    // Log the exact redirect URI being used (important for debugging)
    if (__DEV__) {
      console.log('🔗 Using Redirect URI:', REDIRECT_URI);
      console.log('📱 Make sure this EXACT URI is in Auth0 Allowed Callback URLs');
    }
    
    // Create auth request with manually generated PKCE params
    const request = new AuthSession.AuthRequest({
      clientId: AUTH0_CLIENT_ID,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      responseType: AuthSession.ResponseType.Code,
      redirectUri: REDIRECT_URI,
      extraParams: {
        audience: AUTH0_AUDIENCE,
        prompt: 'login', // Force Auth0 to show login screen every time (allows switching accounts)
        ...(screen === 'signup' && { screen_hint: 'signup' }), // Show signup screen if specified
      },
      codeChallenge: codeChallenge,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      usePKCE: false, // We're handling PKCE manually
    });

    // Start authentication flow
    const result = await request.promptAsync(discovery, {
      showInRecents: true,
    });

    // Clean up stored code verifier after prompt
    await AsyncStorage.removeItem(PKCE_CODE_VERIFIER_KEY).catch(() => {});

    if (result.type === 'success') {
      // Retrieve code verifier (use stored one as fallback in case variable was lost)
      const storedCodeVerifier = await AsyncStorage.getItem(PKCE_CODE_VERIFIER_KEY);
      const verifierToUse = storedCodeVerifier || codeVerifier;
      
      if (!verifierToUse) {
        throw new Error('PKCE code verifier missing. Please try logging in again.');
      }
      
      // Exchange authorization code for access token
      let tokenResult;
      try {
        tokenResult = await AuthSession.exchangeCodeAsync(
          {
            clientId: AUTH0_CLIENT_ID,
            code: result.params.code,
            redirectUri: REDIRECT_URI,
            extraParams: {
              code_verifier: verifierToUse,
              audience: AUTH0_AUDIENCE, // Include audience in token exchange
            },
          },
          discovery
        );
      } catch (exchangeError: any) {
        console.error('Token exchange failed:', exchangeError);
        
        // Provide helpful error messages
        if (exchangeError.message?.includes('invalid_grant')) {
          throw new Error('Authentication code expired or invalid. Please try logging in again.');
        } else if (exchangeError.message?.includes('invalid_client')) {
          throw new Error('Authentication configuration error. Please contact support.');
        } else if (exchangeError.message?.includes('network')) {
          throw new Error('Network error during authentication. Please check your connection and try again.');
        }
        throw new Error(`Failed to exchange authorization code: ${exchangeError.message || 'Unknown error'}`);
      }
      
      // Clean up any remaining stored code verifier
      await AsyncStorage.removeItem(PKCE_CODE_VERIFIER_KEY).catch(() => {});

      // Get the access token
      const accessToken = tokenResult.accessToken;
      
      if (!accessToken) {
        throw new Error('No access token received from Auth0');
      }
      
      // Store the token
      try {
        await setAuthToken(accessToken);
      } catch (storageError) {
        console.error('Failed to store auth token:', storageError);
        throw new Error('Failed to save authentication token. Please try again.');
      }
      
      return accessToken;
    } else if (result.type === 'error') {
      const errorCode = result.error?.code;
      const errorMessage = result.error?.message || result.params?.error_description || 'Authentication failed';
      
      console.error('Auth0 login error:', result.error);
      
      // Provide user-friendly error messages
      let friendlyMessage = errorMessage;
      if (errorCode === 'access_denied') {
        friendlyMessage = 'Access denied. Please try again or contact support if this persists.';
      } else if (errorCode === 'server_error') {
        friendlyMessage = 'Authentication server error. Please try again in a moment.';
      } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
        friendlyMessage = 'Network error during authentication. Please check your connection and try again.';
      }
      
      throw new Error(friendlyMessage);
    } else if (result.type === 'cancel') {
      // User cancelled authentication - this is not an error
      console.log('Auth0 login cancelled by user');
      return null;
    }

    // Should not reach here, but handle just in case
    console.warn('Unexpected auth result type:', result.type);
    return null;
  } catch (error: any) {
    // Clean up stored code verifier on exception
    await AsyncStorage.removeItem(PKCE_CODE_VERIFIER_KEY).catch(() => {});
    
    // Re-throw if it's already a user-friendly error
    if (error.message && !error.message.includes('Error during Auth0 login')) {
      throw error;
    }
    
    console.error('Error during Auth0 login:', error);
    throw new Error(`Authentication failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Logout from Auth0
 * Clears the stored token and any related auth data
 */
export async function logoutWithAuth0(): Promise<void> {
  try {
    // Remove auth token
    await removeAuthToken();
    
    // Clean up any PKCE verifier that might be lingering
    await AsyncStorage.removeItem(PKCE_CODE_VERIFIER_KEY).catch(() => {});
    
    // Clean up pending account type selection if any
    await AsyncStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY).catch(() => {});
  } catch (error) {
    console.error('Error during logout:', error);
    // Don't throw - logout should always succeed even if cleanup fails
    // This ensures user can always log out
  }
}

/**
 * Check if user is authenticated
 * Returns true if a valid token exists
 * 
 * Note: This only checks for token presence, not validity.
 * The token may still be expired or invalid.
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const { getAuthToken } = await import('./api');
    const token = await getAuthToken();
    return token !== null && token.length > 0;
  } catch (error) {
    console.error('Error checking authentication status:', error);
    return false;
  }
}
