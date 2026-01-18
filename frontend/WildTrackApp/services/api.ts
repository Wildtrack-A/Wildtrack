/**
 * API service for communicating with the WildTrack backend
 * 
 * For development on physical device:
 * - Replace localhost with your computer's IP address (e.g., http://192.168.1.100:8000/api/v1)
 * - Find your IP: macOS/Linux: `ifconfig` or `ip addr`, Windows: `ipconfig`
 * - Make sure your phone and computer are on the same network
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// For Expo Go on physical device, use your computer's IP address instead of localhost
const API_BASE_URL = __DEV__ 
  ? 'http://169.233.194.175:8000/api/v1'  // Your computer's IP for Expo Go on physical device
  : 'https://your-production-url.com/api/v1';  // Production URL

// Token storage key
const AUTH_TOKEN_KEY = '@wildtrack:auth_token';

/**
 * Get the Auth0 token from storage
 * This will be set by your Auth0 integration
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Set the Auth0 token in storage
 * Call this after successful Auth0 login
 */
export async function setAuthToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (error) {
    console.error('Error setting auth token:', error);
  }
}

/**
 * Remove the Auth0 token from storage
 * Call this on logout
 */
export async function removeAuthToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (error) {
    console.error('Error removing auth token:', error);
  }
}

/**
 * Get headers with authentication token
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

// Helper function to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const error = await response.json();
      errorMessage = error.detail || error.message || JSON.stringify(error);
    } catch (e) {
      // If JSON parsing fails, try to get text
      try {
        const text = await response.text();
        errorMessage = text || errorMessage;
      } catch (e2) {
        // If that also fails, use the status code message
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

// Journal API calls
export const journalAPI = {
  // Get all journals with their logs (for authenticated user)
  async getAllJournals() {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/journals`, {
      headers,
    });
    return handleResponse(response);
  },

  // Create a new journal
  async createJournal(name: string) {
    console.log('Creating journal:', name, 'at', `${API_BASE_URL}/journals`);
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/journals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name }),
    });
    console.log('Response status:', response.status, response.statusText);
    return handleResponse(response);
  },

  // Update a journal
  async updateJournal(journalId: string, name: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/journals/${journalId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name }),
    });
    return handleResponse(response);
  },

  // Delete a journal
  async deleteJournal(journalId: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/journals/${journalId}`, {
      method: 'DELETE',
      headers,
    });
    return handleResponse(response);
  },
};

// Auth API calls
export const authAPI = {
  // Get current user info
  async getCurrentUser() {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers,
    });
    return handleResponse(response);
  },

  // Sync Auth0 user profile to backend
  // role: optional role to set for new profiles ('field_researcher' or 'public')
  async syncProfile(role?: 'field_researcher' | 'public') {
    try {
      const headers = await getAuthHeaders();
      const body: any = {};
      if (role) {
        body.role = role;
      }
      
      console.log('🔄 Syncing profile with role:', role || 'none');
      console.log('📡 API URL:', `${API_BASE_URL}/auth/sync-profile`);
      
      // Always send a body (even if empty) for POST requests
      const response = await fetch(`${API_BASE_URL}/auth/sync-profile`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      
      console.log('📥 Sync response status:', response.status, response.statusText);
      
      return handleResponse(response);
    } catch (error: any) {
      console.error('❌ Sync profile error details:', {
        message: error.message,
        url: `${API_BASE_URL}/auth/sync-profile`,
        role,
      });
      throw error;
    }
  },
};

// Helper function to sync user profile (convenience wrapper)
// role: optional role to set for new profiles ('field_researcher' or 'public')
export async function syncUserProfile(role?: 'field_researcher' | 'public') {
  try {
    const result = await authAPI.syncProfile(role);
    console.log('✅ Profile synced successfully:', result);
    return result;
  } catch (error: any) {
    console.error('❌ Error syncing profile:', error);
    // Re-throw with more context
    const errorMessage = error?.message || 'Unknown error occurred';
    throw new Error(`Profile sync failed: ${errorMessage}`);
  }
}

// Log API calls
export const logAPI = {
  // Create a new log in a journal
  async createLog(journalId: string, logData: {
    species: string;
    description?: string;
    photo_uri?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/journals/${journalId}/logs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        journal_id: journalId,
        species: logData.species,
        description: logData.description || null,
        photo_uri: logData.photo_uri || null,
        latitude: logData.latitude || null,
        longitude: logData.longitude || null,
      }),
    });
    return handleResponse(response);
  },

  // Update a log
  async updateLog(logId: string, logData: {
    species?: string;
    description?: string;
    photo_uri?: string | null;
  }) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/logs/${logId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(logData),
    });
    return handleResponse(response);
  },

  // Delete a log
  async deleteLog(logId: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/logs/${logId}`, {
      method: 'DELETE',
      headers,
    });
    return handleResponse(response);
  },
};
