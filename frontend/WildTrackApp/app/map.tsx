import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator, Modal, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { redditSightingsAPI, RedditSighting } from '../services/api';

export default function Map() {
  const mapRef = useRef<MapView>(null);
  const [redditSightings, setRedditSightings] = useState<RedditSighting[]>([]);
  const [filteredSightings, setFilteredSightings] = useState<RedditSighting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSighting, setSelectedSighting] = useState<RedditSighting | null>(null);
  const [showSightingModal, setShowSightingModal] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [topSpecies, setTopSpecies] = useState<Array<{ species: string; count: number }>>([]);

  // Get user location
  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Load Reddit sightings
  useEffect(() => {
    loadRedditSightings();
  }, []);

  // Update filtered sightings when species filter changes
  useEffect(() => {
    if (selectedSpecies) {
      const filtered = redditSightings.filter(sighting =>
        sighting.species && sighting.species.some(s =>
          s.toLowerCase() === selectedSpecies.toLowerCase()
        ) && sighting.latitude && sighting.longitude
      );
      setFilteredSightings(filtered);
      if (filtered.length > 0) {
        fitMapToMarkers(filtered);
      }
    } else {
      const withCoords = redditSightings.filter(s => s.latitude && s.longitude);
      setFilteredSightings(withCoords);
      if (withCoords.length > 0) {
        fitMapToMarkers(withCoords);
      }
    }
  }, [selectedSpecies, redditSightings]);

  // Calculate top species
  useEffect(() => {
    const speciesMap = new Map<string, number>();
    redditSightings.forEach(sighting => {
      sighting.species?.forEach(species => {
        const count = speciesMap.get(species) || 0;
        speciesMap.set(species, count + 1);
      });
    });
    const top = Array.from(speciesMap.entries())
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    setTopSpecies(top);
  }, [redditSightings]);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const loadRedditSightings = async () => {
    setLoading(true);
    setError(null);
    try {
      const sightings = await redditSightingsAPI.getSightings({
        limit: 100,
        days: 30,
      });
      setRedditSightings(sightings);
      
      const withCoords = sightings.filter(s => s.latitude && s.longitude);
      setFilteredSightings(withCoords);
      
      if (withCoords.length > 0) {
        setTimeout(() => {
          fitMapToMarkers(withCoords);
        }, 500);
      }
    } catch (error: any) {
      console.error('Error loading Reddit sightings:', error);
      setError(error.message || 'Failed to load sightings');
    } finally {
      setLoading(false);
    }
  };

  const fitMapToMarkers = (sightings: RedditSighting[]) => {
    const validSightings = sightings.filter(s => s.latitude && s.longitude);
    if (validSightings.length === 0 || !mapRef.current) return;

    const coordinates = validSightings.map(s => ({
      latitude: s.latitude!,
      longitude: s.longitude!,
    }));

    const latitudes = coordinates.map(c => c.latitude);
    const longitudes = coordinates.map(c => c.longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latDelta = Math.max((maxLat - minLat) * 1.5, 0.1);
    const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.1);

    const region: Region = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };

    mapRef.current.animateToRegion(region, 1000);
  };

  const formatTimeAgo = (timestamp: string | null | undefined) => {
    if (!timestamp) return 'Date unknown';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
      return `${Math.floor(diffDays / 30)}mo ago`;
    } catch {
      return 'Date unknown';
    }
  };

  const openRedditPost = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Error opening Reddit link:', err));
  };

  const getAvailableSpecies = () => {
    const speciesMap = new Map<string, number>();
    redditSightings.forEach(sighting => {
      sighting.species?.forEach(species => {
        const count = speciesMap.get(species) || 0;
        speciesMap.set(species, count + 1);
      });
    });
    return Array.from(speciesMap.entries())
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => b.count - a.count);
  };

  const availableSpecies = getAvailableSpecies();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header Section - Top 3 Endangered Animals */}
      <View style={styles.headerSection}>
        <Text style={styles.headerTitle}>Endangered Animals in Your Area</Text>
        
        {/* Top 3 Species List */}
        <View style={styles.topSpeciesContainer}>
          {topSpecies.length > 0 ? (
            topSpecies.map((item, index) => (
              <View key={item.species} style={styles.topSpeciesItem}>
                <View style={styles.topSpeciesRank}>
                  <Text style={styles.topSpeciesRankText}>{index + 1}</Text>
                </View>
                <View style={styles.topSpeciesInfo}>
                  <Text style={styles.topSpeciesName}>{item.species}</Text>
                  <Text style={styles.topSpeciesCount}>{item.count} sightings</Text>
                </View>
                <Ionicons name="paw" size={20} color="#FF6B6B" />
              </View>
            ))
          ) : (
            <Text style={styles.noDataText}>No species data available</Text>
          )}
        </View>

        {/* Species Filter Dropdown */}
        <View style={styles.filterContainer}>
          <Text style={styles.filterLabel}>Filter by Species:</Text>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => setDropdownVisible(true)}
          >
            <Text style={[styles.dropdownButtonText, !selectedSpecies && styles.dropdownButtonTextPlaceholder]}>
              {selectedSpecies ? selectedSpecies : 'All Species'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#666" />
          </TouchableOpacity>
          {selectedSpecies && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setSelectedSpecies(null)}
            >
              <Ionicons name="close-circle" size={20} color="#FF6B6B" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Status */}
        {selectedSpecies && (
          <View style={styles.filterBanner}>
            <Text style={styles.filterBannerText}>
              Showing {filteredSightings.length} {selectedSpecies} sighting{filteredSightings.length !== 1 ? 's' : ''} on map
            </Text>
          </View>
        )}
      </View>

      {/* Scrollable Map Section */}
      <ScrollView 
        style={styles.mapScrollView}
        contentContainerStyle={styles.mapScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mapContainer}>
          <MapView 
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={userLocation ? {
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            } : {
              latitude: 37.78825,
              longitude: -122.4324,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }}
            scrollEnabled={true}
            zoomEnabled={true}
          >
            {/* Filtered Sightings Markers */}
            {filteredSightings.map((sighting) => {
              if (!sighting.latitude || !sighting.longitude) return null;
              
              return (
                <Marker
                  key={sighting.id}
                  coordinate={{
                    latitude: sighting.latitude,
                    longitude: sighting.longitude,
                  }}
                  onPress={() => {
                    setSelectedSighting(sighting);
                    setShowSightingModal(true);
                  }}
                >
                  <View style={styles.markerContainer}>
                    <Ionicons name="location" size={32} color="#FF6B6B" />
                    {sighting.species && sighting.species.length > 0 && (
                      <View style={styles.markerBadge}>
                        <Text style={styles.markerBadgeText}>
                          {sighting.species.length}
                        </Text>
                      </View>
                    )}
                  </View>
                </Marker>
              );
            })}
          </MapView>

          {/* Loading/Error Overlay */}
          {loading && (
            <View style={styles.overlay}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.overlayText}>Loading sightings...</Text>
            </View>
          )}
          
          {error && !loading && (
            <View style={styles.overlay}>
              <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadRedditSightings}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && filteredSightings.length === 0 && (
            <View style={styles.overlay}>
              <Ionicons name="map-outline" size={48} color="#999" />
              <Text style={styles.emptyText}>
                {selectedSpecies 
                  ? `No ${selectedSpecies} sightings with locations found`
                  : 'No sightings with locations found'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Species Dropdown Modal */}
      <Modal
        visible={dropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDropdownVisible(false)}
        >
          <View style={styles.dropdownModal} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Select Species</Text>
              <TouchableOpacity onPress={() => setDropdownVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.dropdownList}>
              <TouchableOpacity
                style={[styles.dropdownItem, !selectedSpecies && styles.dropdownItemActive]}
                onPress={() => {
                  setSelectedSpecies(null);
                  setDropdownVisible(false);
                }}
              >
                <Text style={[styles.dropdownItemText, !selectedSpecies && styles.dropdownItemTextActive]}>
                  All Species ({redditSightings.filter(s => s.latitude && s.longitude).length})
                </Text>
                {!selectedSpecies && <Ionicons name="checkmark" size={20} color="#007AFF" />}
              </TouchableOpacity>
              {availableSpecies.map(({ species, count }) => {
                const hasLocation = redditSightings.some(s => 
                  s.species?.some(s => s.toLowerCase() === species.toLowerCase()) &&
                  s.latitude && s.longitude
                );
                const locationCount = redditSightings.filter(s =>
                  s.species?.some(s => s.toLowerCase() === species.toLowerCase()) &&
                  s.latitude && s.longitude
                ).length;
                
                return (
                  <TouchableOpacity
                    key={species}
                    style={[styles.dropdownItem, selectedSpecies === species && styles.dropdownItemActive]}
                    onPress={() => {
                      setSelectedSpecies(species);
                      setDropdownVisible(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, selectedSpecies === species && styles.dropdownItemTextActive]}>
                      {species} ({locationCount} on map)
                    </Text>
                    {selectedSpecies === species && <Ionicons name="checkmark" size={20} color="#007AFF" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sighting Detail Modal */}
      <Modal
        visible={showSightingModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSightingModal(false)}
      >
        <View style={styles.sightingModalOverlay}>
          <View style={styles.sightingModalContent}>
            {selectedSighting && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Wildlife Sighting</Text>
                  <TouchableOpacity onPress={() => setShowSightingModal(false)}>
                    <Ionicons name="close" size={28} color="#333" />
                  </TouchableOpacity>
                </View>
                
                <ScrollView style={styles.modalScrollView}>
                  {selectedSighting.species && selectedSighting.species.length > 0 && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>Species</Text>
                      <View style={styles.speciesContainer}>
                        {selectedSighting.species.map((species, idx) => (
                          <View key={idx} style={styles.speciesTag}>
                            <Ionicons name="paw" size={14} color="#FF6B6B" />
                            <Text style={styles.speciesText}>{species}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  
                  {selectedSighting.location_name && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>Location</Text>
                      <View style={styles.locationRow}>
                        <Ionicons name="location" size={20} color="#007AFF" />
                        <Text style={styles.modalValue}>{selectedSighting.location_name}</Text>
                      </View>
                    </View>
                  )}
                  
                  {selectedSighting.timestamp && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>Reported</Text>
                      <Text style={styles.modalValue}>
                        {formatTimeAgo(selectedSighting.timestamp)}
                      </Text>
                    </View>
                  )}
                  
                  {selectedSighting.title && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>Post Title</Text>
                      <Text style={styles.modalValue}>{selectedSighting.title}</Text>
                    </View>
                  )}
                  
                  <TouchableOpacity
                    style={styles.redditButton}
                    onPress={() => openRedditPost(selectedSighting.reddit_url)}
                  >
                    <Ionicons name="logo-reddit" size={20} color="#FF4500" />
                    <Text style={styles.redditButtonText}>View on Reddit</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  headerSection: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  topSpeciesContainer: {
    marginBottom: 16,
  },
  topSpeciesItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  topSpeciesRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  topSpeciesRankText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  topSpeciesInfo: {
    flex: 1,
  },
  topSpeciesName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  topSpeciesCount: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  noDataText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  dropdownButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  dropdownButtonTextPlaceholder: {
    color: '#999',
  },
  clearButton: {
    padding: 8,
  },
  filterBanner: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  filterBannerText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  mapScrollView: {
    flex: 1,
  },
  mapScrollContent: {
    flexGrow: 1,
  },
  mapContainer: {
    height: 400,
    borderRadius: 16,
    overflow: 'hidden',
    margin: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  map: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  overlayText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#FF6B6B',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  markerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '85%',
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  dropdownTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  dropdownList: {
    maxHeight: 400,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemActive: {
    backgroundColor: '#E3F2FD',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#333',
  },
  dropdownItemTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  sightingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sightingModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  modalScrollView: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalSection: {
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  speciesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  speciesTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE5E5',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
  },
  speciesText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  redditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE5E5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 20,
    gap: 8,
  },
  redditButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF4500',
  },
});
