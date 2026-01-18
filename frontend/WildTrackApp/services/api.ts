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
// NOTE: Update this IP address if your computer's IP changes!
// To find your IP: Windows: ipconfig, Mac/Linux: ifconfig
const API_BASE_URL = __DEV__ 
  ? 'http://169.233.131.171:8000/api/v1'  // Your computer's IP for Expo Go on physical device
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
  } else {
    console.warn('⚠️ No auth token found. API requests may fail with 401 Unauthorized.');
    console.warn('💡 Please log in first to get an authentication token.');
  }
  
  return headers;
}

// Helper function to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`;
    let errorDetail: any = null;
    
    try {
      errorDetail = await response.json();
      errorMessage = errorDetail.detail || errorDetail.message || JSON.stringify(errorDetail);
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
    
    // Check if it's an invalid audience error - clear the token automatically
    if (response.status === 401 && errorMessage.toLowerCase().includes('audience')) {
      console.warn('⚠️ Invalid audience detected - clearing stored token');
      await removeAuthToken();
      
      // Create a more helpful error
      const helpfulError = new Error(
        'Your session token is outdated. Please sign out and sign in again to get a new token with the correct audience.'
      );
      (helpfulError as any).shouldSignOut = true;
      (helpfulError as any).originalError = errorMessage;
      throw helpfulError;
    }
    
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).detail = errorDetail;
    throw error;
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
      
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        // Always send a body (even if empty) for POST requests
        const response = await fetch(`${API_BASE_URL}/auth/sync-profile`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        console.log('📥 Sync response status:', response.status, response.statusText);
        
        return handleResponse(response);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        // Handle timeout specifically
        if (fetchError.name === 'AbortError') {
          throw new Error(
            `Network request timed out. Make sure:\n` +
            `1. Backend server is running on ${API_BASE_URL.replace('/api/v1', '')}\n` +
            `2. Backend is accessible from your device/emulator\n` +
            `3. Firewall allows connections on port 8000`
          );
        }
        
        // Handle other network errors
        if (fetchError.message && fetchError.message.includes('Network request failed')) {
          throw new Error(
            `Cannot connect to backend at ${API_BASE_URL.replace('/api/v1', '')}.\n` +
            `Make sure:\n` +
            `1. Backend server is running\n` +
            `2. Correct IP address in services/api.ts (currently: ${API_BASE_URL.replace('/api/v1', '')})\n` +
            `3. Device and computer are on the same network`
          );
        }
        
        throw fetchError;
      }
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

// Reddit Sightings API calls
export interface RedditSighting {
  id: string;
  reddit_id: string;
  title?: string;
  content?: string;
  species?: string[];
  location_name?: string;
  latitude?: number;
  longitude?: number;
  full_address?: string;
  timestamp?: string;
  reddit_url: string;
  subreddit?: string;
  score: number;
  num_comments: number;
  raw_data?: Record<string, any>;  // Flexible JSON data from Reddit
  metadata?: Record<string, any>;  // Processed metadata
}

export const redditSightingsAPI = {
  // Get Reddit-sourced wildlife sightings
  async getSightings(options?: {
    species?: string;
    limit?: number;
    days?: number;
  }) {
    const params = new URLSearchParams();
    if (options?.species) params.append('species', options.species);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.days) params.append('days', options.days.toString());
    
    const url = `${API_BASE_URL}/reddit-sightings${params.toString() ? '?' + params.toString() : ''}`;
    console.log('Fetching Reddit sightings from:', url);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // Check if response is ok before trying to parse
      if (!response.ok) {
        let errorDetail = '';
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorData.message || JSON.stringify(errorData);
        } catch (e) {
          errorDetail = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(`Backend error: ${errorDetail}`);
      }
      
      return handleResponse<RedditSighting[]>(response);
    } catch (error: any) {
      console.error('Network error details:', error);
      
      // Provide more specific error messages
      if (error.message && error.message.includes('Backend error')) {
        throw error; // Re-throw backend errors as-is
      } else if (error.message && error.message.includes('Network request failed')) {
        throw new Error(
          `Cannot connect to backend at ${API_BASE_URL}. ` +
          `Make sure the backend is running on port 8000. ` +
          `Check: 1) Backend is running, 2) Correct IP address, 3) Phone and computer on same network.`
        );
      } else {
        throw new Error(`Failed to fetch Reddit sightings: ${error.message || 'Unknown error'}`);
      }
    }
  },

  // Trigger Reddit scraper to fetch new sightings
  async triggerScrape(): Promise<{ message: string; status: string; note?: string }> {
    const url = `${API_BASE_URL}/reddit-sightings/scrape`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorDetail = '';
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail?.message || errorData.detail || JSON.stringify(errorData);
          
          // Handle rate limit specifically
          if (response.status === 429) {
            const retryAfter = errorData.detail?.retry_after_minutes;
            throw new Error(
              retryAfter 
                ? `Please wait ${retryAfter} more minutes before refreshing again.`
                : errorDetail
            );
          }
        } catch (e) {
          errorDetail = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorDetail);
      }

      return handleResponse<{ message: string; status: string; note?: string }>(response);
    } catch (error: any) {
      console.error('Error triggering scraper:', error);
      throw error;
    }
  },
};

// Image Verification API
export const imageVerificationAPI = {
  /**
   * Verify if an uploaded image is real or AI-generated.
   * @param imageUri - Local file URI (e.g., from ImagePicker)
   * @returns Promise with verification result
   */
  async verifyImage(imageUri: string): Promise<{ is_real: boolean; confidence: number; message: string }> {
    try {
      // Create FormData for React Native
      const formData = new FormData();
      
      // Extract filename from URI or use default
      const filename = imageUri.split('/').pop() || 'image.jpg';
      const fileExtension = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = fileExtension === 'png' ? 'image/png' : 'image/jpeg';
      
      // Append file in React Native format
      formData.append('file', {
        uri: imageUri,
        type: mimeType,
        name: filename,
      } as any);
      
      // Send to backend
      const verifyResponse = await fetch(`${API_BASE_URL}/verify-image`, {
        method: 'POST',
        body: formData,
        headers: {
          // Don't set Content-Type - let fetch set it with boundary for FormData
        },
      });
      
      if (!verifyResponse.ok) {
        const error = await verifyResponse.json().catch(() => ({ detail: 'Failed to verify image' }));
        throw new Error(error.detail || 'Failed to verify image');
      }
      
      return await verifyResponse.json();
    } catch (error: any) {
      console.error('Error verifying image:', error);
      throw new Error(error.message || 'Failed to verify image');
    }
  },
};

// Zone Types (from zone-integration branch)
export interface ZoneBoundaryPoint {
  latitude: number;
  longitude: number;
}

export interface ZonePoint {
  latitude: number;
  longitude: number;
  timestamp?: string;
}

export interface Zone {
  zone_id: number;
  species: string;
  boundary: ZoneBoundaryPoint[];
  center?: { latitude: number; longitude: number };  // Only for researchers
  individual_points?: ZonePoint[];  // Only for researchers
  point_count?: number;  // Only for researchers
}

export interface ZonesResponse {
  role: 'field_researcher' | 'public';
  total_zones: number;
  unique_species: string[];
  zones: Record<string, Zone>;
}

// Zones API calls (from zone-integration branch)
export const zonesAPI = {
  // Get all zones (returns different data based on user role)
  // Falls back to public test endpoint if not authenticated
  async getAllZones(): Promise<ZonesResponse> {
    const token = await getAuthToken();

    if (token) {
      // User is logged in - use authenticated endpoint
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/zones/all`, {
        headers,
      });
      return handleResponse<ZonesResponse>(response);
    } else {
      // Not logged in - use public test endpoint
      console.log('No auth token, using public zones endpoint');
      const response = await fetch(`${API_BASE_URL}/zones/all/test-public`, {
        headers: { 'Content-Type': 'application/json' },
      });
      return handleResponse<ZonesResponse>(response);
    }
  },

  // Get zones for a specific species
  async getZonesBySpecies(speciesName: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/zones/species/${encodeURIComponent(speciesName)}`, {
      headers,
    });
    return handleResponse(response);
  },

  // Get a specific zone by ID
  async getZoneById(zoneId: number) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/zones/${zoneId}`, {
      headers,
    });
    return handleResponse(response);
  },

  // Get zones summary
  async getZonesSummary(speciesFilter?: string) {
    const headers = await getAuthHeaders();
    const params = speciesFilter ? `?species_filter=${encodeURIComponent(speciesFilter)}` : '';
    const response = await fetch(`${API_BASE_URL}/zones/summary${params}`, {
      headers,
    });
    return handleResponse(response);
  },
};
