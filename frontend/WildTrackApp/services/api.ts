/**
 * API service for communicating with the WildTrack backend
 * 
 * For development on physical device:
 * - Replace localhost with your computer's IP address (e.g., http://192.168.1.100:8000/api/v1)
 * - Find your IP: macOS/Linux: `ifconfig` or `ip addr`, Windows: `ipconfig`
 * - Make sure your phone and computer are on the same network
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSessionToken } from './supabase';

// For Expo Go on physical device, use your computer's IP address instead of localhost
// NOTE: Update this IP address if your computer's IP changes!
// To find your IP: Windows: ipconfig, Mac/Linux: ifconfig
// Using localhost for iOS Simulator (works with local backend server)
// Teammate's shared backend: http://169.233.183.248:8000/api/v1 (not accessible from all networks)
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:8000/api/v1'  // localhost works in iOS Simulator with local backend
  : 'https://your-production-url.com/api/v1';  // Production URL

/**
 * Get headers for API requests with authentication token
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  const token = await getSessionToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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

// Auth API removed - no authentication required

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

// Animal Search API types
export interface AnimalPhysicalCharacteristics {
  size?: string;
  weight?: string;
  lifespan?: string;
  appearance?: string;
}

export interface AnimalHabitat {
  type?: string;
  geographic_distribution?: string;
  habitat_data?: {
    forest?: number;
    grassland?: number;
    desert?: number;
    aquatic?: number;
    mountain?: number;
    urban?: number;
  };
}

export interface AnimalDiet {
  type?: string;
  primary_food?: string;
  diet_data?: {
    carnivore?: number;
    herbivore?: number;
    omnivore?: number;
    insectivore?: number;
    piscivore?: number;
  };
}

export interface AnimalBehavior {
  social_structure?: string;
  activity_pattern?: string;
  notable_behaviors?: string[];
}

export interface AnimalConservation {
  status?: string;
  population_trend?: string;
  estimated_population?: string;
  threats?: string[];
}

export interface AnimalStatistics {
  speed_kmh?: number;
  height_cm?: number;
  weight_kg?: number;
  lifespan_years?: number;
}

export interface AnimalSearchResult {
  animal_name: string;
  scientific_name?: string;
  icon_emoji?: string;
  description?: string;
  physical_characteristics?: AnimalPhysicalCharacteristics;
  habitat?: AnimalHabitat;
  diet?: AnimalDiet;
  behavior?: AnimalBehavior;
  conservation?: AnimalConservation;
  statistics?: AnimalStatistics;
  interesting_facts?: string[];
  source: string;
  // Fallback for old format
  information?: string;
}

// Animal Search API calls
export const searchAPI = {
  // Search for animal information using Gemini
  async searchAnimal(animalName: string): Promise<AnimalSearchResult> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/search-animal?animal_name=${encodeURIComponent(animalName)}`, {
      method: 'GET',
      headers,
    });
    return handleResponse(response);
  },
};

// Alias for convenience
export async function searchAnimal(animalName: string) {
  return searchAPI.searchAnimal(animalName);
}

// Animal Detection API types
export interface AnimalDetectionResult {
  species: string;
  confidence: string;
  notes?: string;
  source: string;
}

// Animal Detection API calls
export const detectionAPI = {
  // Detect animal from image using Gemini Vision
  async detectAnimalFromImage(imageUri: string): Promise<AnimalDetectionResult> {
    const headers = await getAuthHeaders();
    
    // Convert image URI to FormData for upload
    const formData = new FormData();
    
    // Extract filename from URI
    const filename = imageUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';
    
    // @ts-ignore - FormData.append expects different types
    formData.append('file', {
      uri: imageUri,
      name: filename,
      type: type,
    } as any);
    
    // Remove Content-Type header - React Native will set it automatically with boundary
    const { 'Content-Type': _, ...headersWithoutContentType } = headers;
    
    const response = await fetch(`${API_BASE_URL}/detect-animal-from-image`, {
      method: 'POST',
      headers: headersWithoutContentType,
      body: formData,
    });
    
    return handleResponse(response);
  },
};

// Alias for convenience
export async function detectAnimalFromImage(imageUri: string) {
  return detectionAPI.detectAnimalFromImage(imageUri);
}

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
  // Get all zones (with fallback to researcher endpoint to get GPS points)
  async getAllZones(): Promise<ZonesResponse> {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/zones/all`, {
        headers,
      });
      
      if (!response.ok) {
        // If auth fails or any error, try researcher test endpoint to get GPS points
        console.log('Main endpoint failed, trying researcher test endpoint to get GPS points');
        const researcherResponse = await fetch(`${API_BASE_URL}/zones/all/test-researcher`, {
          headers: { 'Content-Type': 'application/json' },
        });
        if (researcherResponse.ok) {
          return handleResponse<ZonesResponse>(researcherResponse);
        }
        // If researcher endpoint also fails, throw original error
        return handleResponse<ZonesResponse>(response);
      }
      
      return handleResponse<ZonesResponse>(response);
    } catch (error: any) {
      // If request fails, try researcher endpoint as fallback to get GPS points
      console.log('Request failed, trying researcher test endpoint as fallback');
      try {
        const researcherResponse = await fetch(`${API_BASE_URL}/zones/all/test-researcher`, {
          headers: { 'Content-Type': 'application/json' },
        });
        if (researcherResponse.ok) {
          return handleResponse<ZonesResponse>(researcherResponse);
        }
      } catch (fallbackError) {
        console.error('Researcher endpoint also failed:', fallbackError);
      }
      throw error; // Throw original error if all fallbacks fail
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

  // Get clusters from database (no auth required)
  async getClusters() {
    const response = await fetch(`${API_BASE_URL}/zones/clusters`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return handleResponse<{
      clusters: Array<{
        cluster_id: number;
        species: string;
        center: { latitude: number; longitude: number };
        points: Array<{ latitude: number; longitude: number; timestamp: string | null }>;
        count: number;
      }>;
      total_points: number;
    }>(response);
  },

  // Get top 3 endangered species near user location (no auth required)
  async getNearbyEndangeredSpecies(latitude: number, longitude: number, radiusKm: number = 50) {
    const params = `?latitude=${latitude}&longitude=${longitude}&radius_km=${radiusKm}`;
    const response = await fetch(`${API_BASE_URL}/zones/nearby-endangered${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return handleResponse<{
      user_location: { latitude: number; longitude: number };
      radius_km: number;
      top_species: Array<{
        species: string;
        sighting_count: number;
        distance_km: number;
      }>;
    }>(response);
  },
};
