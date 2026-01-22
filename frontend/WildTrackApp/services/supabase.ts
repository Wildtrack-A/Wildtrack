/**
 * Supabase client and authentication service
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Get Supabase URL and key from environment or constants
// Note: These are optional since we use the backend API for authentication
// The Supabase client is only used for session management if needed
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Create Supabase client only if URL and key are provided
// If not provided, we'll use token storage only (no Supabase client needed)
let supabase: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } catch (error) {
    console.warn('⚠️ Failed to create Supabase client:', error);
  }
} else {
  console.log('ℹ️ Supabase client not initialized (using backend API for auth). This is fine if you only use the backend API.');
}

/**
 * Sign up a new user
 */
export async function signUp(email: string, password: string, username?: string, role: string = 'public') {
  try {
    // Use the same API base URL as api.ts
    const API_BASE_URL = __DEV__ 
      ? 'http://100.64.56.244:8000/api/v1'  // Match api.ts
      : 'https://your-production-url.com/api/v1';
    
    console.log('📤 Signing up user:', { email, role, url: `${API_BASE_URL}/auth/signup` });
    
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        username,
        role,
      }),
    });

    console.log('📥 Signup response status:', response.status, response.statusText);

    if (!response.ok) {
      let errorMessage = 'Failed to sign up';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || JSON.stringify(errorData);
        console.error('❌ Signup error response:', errorData);
      } catch (e) {
        // If JSON parsing fails, try to get text
        try {
          const text = await response.text();
          errorMessage = text || `HTTP ${response.status}: ${response.statusText}`;
          console.error('❌ Signup error (text):', errorMessage);
        } catch (e2) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          console.error('❌ Signup error (status only):', errorMessage);
        }
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('✅ Signup successful:', data);
    return data;
  } catch (error: any) {
    console.error('❌ Sign up error:', error);
    // Re-throw with better error message
    if (error.message) {
      throw error;
    }
    throw new Error(error.message || 'Failed to sign up. Please check your connection and try again.');
  }
}

/**
 * Sign in a user
 */
export async function signIn(email: string, password: string) {
  try {
    // Use the same API base URL as api.ts
    const API_BASE_URL = __DEV__ 
      ? 'http://100.64.56.244:8000/api/v1'  // Match api.ts
      : 'https://your-production-url.com/api/v1';
    
    console.log('📤 Signing in user:', { email, url: `${API_BASE_URL}/auth/signin` });
    
    const response = await fetch(`${API_BASE_URL}/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    console.log('📥 Signin response status:', response.status, response.statusText);

    if (!response.ok) {
      let errorMessage = 'Invalid email or password';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || JSON.stringify(errorData);
        console.error('❌ Signin error response:', errorData);
      } catch (e) {
        try {
          const text = await response.text();
          errorMessage = text || `HTTP ${response.status}: ${response.statusText}`;
          console.error('❌ Signin error (text):', errorMessage);
        } catch (e2) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          console.error('❌ Signin error (status only):', errorMessage);
        }
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('✅ Signin successful');
    
    // Store tokens
    if (data.access_token) {
      await AsyncStorage.setItem('@wildtrack:access_token', data.access_token);
    }
    if (data.refresh_token) {
      await AsyncStorage.setItem('@wildtrack:refresh_token', data.refresh_token);
    }
    
    return data;
  } catch (error: any) {
    console.error('❌ Sign in error:', error);
    if (error.message) {
      throw error;
    }
    throw new Error(error.message || 'Failed to sign in. Please check your connection and try again.');
  }
}

/**
 * Sign out the current user
 */
export async function signOut() {
  try {
    // Clear tokens
    await AsyncStorage.removeItem('@wildtrack:access_token');
    await AsyncStorage.removeItem('@wildtrack:refresh_token');
    
    // Sign out from Supabase if client exists
    if (supabase) {
      await supabase.auth.signOut();
    }
  } catch (error) {
    console.error('Sign out error:', error);
  }
}

/**
 * Get current session token
 */
export async function getSessionToken(): Promise<string | null> {
  try {
    // Try to get token from storage first
    const token = await AsyncStorage.getItem('@wildtrack:access_token');
    if (token) {
      return token;
    }
    
    // Try to get from Supabase session if client exists
    if (supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await AsyncStorage.setItem('@wildtrack:access_token', session.access_token);
          return session.access_token;
        }
      } catch (error) {
        // Supabase client not available or error - that's okay, we'll use token storage only
        console.log('Supabase session not available, using token storage only');
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting session token:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getSessionToken();
  return token !== null;
}
