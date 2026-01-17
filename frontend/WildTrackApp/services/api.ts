/**
 * API service for communicating with the WildTrack backend
 * 
 * For development on physical device:
 * - Replace localhost with your computer's IP address (e.g., http://192.168.1.100:8000/api/v1)
 * - Find your IP: macOS/Linux: `ifconfig` or `ip addr`, Windows: `ipconfig`
 * - Make sure your phone and computer are on the same network
 */

// For Expo Go on physical device, use your computer's IP address instead of localhost
const API_BASE_URL = __DEV__ 
  ? 'http://169.233.183.248:8000/api/v1'  // Your computer's IP for Expo Go on physical device
  : 'https://your-production-url.com/api/v1';  // Production URL

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
  // Get all journals with their logs
  async getAllJournals() {
    const response = await fetch(`${API_BASE_URL}/journals`);
    return handleResponse(response);
  },

  // Create a new journal
  async createJournal(name: string) {
    console.log('Creating journal:', name, 'at', `${API_BASE_URL}/journals`);
    const response = await fetch(`${API_BASE_URL}/journals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    console.log('Response status:', response.status, response.statusText);
    return handleResponse(response);
  },

  // Update a journal
  async updateJournal(journalId: string, name: string) {
    const response = await fetch(`${API_BASE_URL}/journals/${journalId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    return handleResponse(response);
  },

  // Delete a journal
  async deleteJournal(journalId: string) {
    const response = await fetch(`${API_BASE_URL}/journals/${journalId}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },
};

// Log API calls
export const logAPI = {
  // Create a new log in a journal
  async createLog(journalId: string, logData: {
    species: string;
    description?: string;
    photo_uri?: string | null;
  }) {
    const response = await fetch(`${API_BASE_URL}/journals/${journalId}/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        journal_id: journalId,
        species: logData.species,
        description: logData.description || null,
        photo_uri: logData.photo_uri || null,
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
    const response = await fetch(`${API_BASE_URL}/logs/${logId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(logData),
    });
    return handleResponse(response);
  },

  // Delete a log
  async deleteLog(logId: string) {
    const response = await fetch(`${API_BASE_URL}/logs/${logId}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },
};
