import { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { redditSightingsAPI, RedditSighting, zonesAPI, ZonesResponse, Zone } from '../services/api';

// Generate a color for each species (consistent colors)
const getSpeciesColor = (species: string, index: number): string => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  return colors[index % colors.length];
};

function MapScreen() {
  const mapRef = useRef<any>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const [redditSightings, setRedditSightings] = useState<RedditSighting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [topSpecies, setTopSpecies] = useState<Array<{ species: string; count: number }>>([]);
  const [mapReady, setMapReady] = useState(false);
  const [dataView, setDataView] = useState<'my-data' | 'world-data'>('world-data');

  // Zones state
  const [zonesData, setZonesData] = useState<ZonesResponse | null>(null);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zonesError, setZonesError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'field_researcher' | 'public' | null>(null);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [zonePopupVisible, setZonePopupVisible] = useState(false);

  // Track user location continuously
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Location permission denied');
          return;
        }

        // Get initial location
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        if (isMounted) {
          setUserLocation({
            latitude: initialLocation.coords.latitude,
            longitude: initialLocation.coords.longitude,
          });
        }

        // Watch for location updates
        locationSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000, // Update every 5 seconds
            distanceInterval: 10, // Update every 10 meters
          },
          (location) => {
            if (isMounted) {
              setUserLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              });
            }
          }
        );
      } catch (error) {
        console.error('Error setting up location tracking:', error);
        if (isMounted) {
          setError('Failed to get location');
        }
      }
    })();

    return () => {
      isMounted = false;
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
      }
    };
  }, []);

  // Load Reddit sightings once
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sightings = await redditSightingsAPI.getSightings({
          limit: 100,
          days: 30,
        });
        setRedditSightings(sightings);
      } catch (error: any) {
        console.error('Error loading Reddit sightings:', error);
        setError(error.message || 'Failed to load sightings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load zones data (requires authentication)
  useEffect(() => {
    (async () => {
      setZonesLoading(true);
      setZonesError(null);
      try {
        const zones = await zonesAPI.getAllZones();
        setZonesData(zones);
        setUserRole(zones.role);
        console.log(`Loaded ${zones.total_zones} zones as ${zones.role}`);
      } catch (error: any) {
        console.error('Error loading zones:', error);
        setZonesError(error.message || 'Failed to load zones');
      } finally {
        setZonesLoading(false);
      }
    })();
  }, []);

  // Calculate top species when sightings change
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

  // Get filtered sightings (memoized to prevent re-renders)
  const filteredSightings = useMemo(() => {
    if (!selectedSpecies) {
      return redditSightings.filter(s => s.latitude && s.longitude);
    }
    return redditSightings.filter(sighting =>
      sighting.species && sighting.species.some(s =>
        s.toLowerCase() === selectedSpecies.toLowerCase()
      ) && sighting.latitude && sighting.longitude
    );
  }, [selectedSpecies, redditSightings]);

  // Get available species for dropdown (memoized)
  const availableSpecies = useMemo(() => {
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
  }, [redditSightings]);

  // Memoize initial region to prevent re-renders
  const initialRegion = useMemo(() => {
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
    }
    return {
      latitude: 37.78825,
      longitude: -122.4324,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
    };
  }, [userLocation]);

  const openRedditPost = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Error opening Reddit link:', err));
  };

  const formatTimeAgo = (timestamp: string | undefined) => {
    if (!timestamp) return 'Date unknown';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      return `${Math.floor(diffDays / 30)} months ago`;
    } catch {
      return 'Date unknown';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Map Section - Top */}
      <View style={styles.mapContainer}>
        <MapView 
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={initialRegion}
          scrollEnabled={true}
          zoomEnabled={true}
          pitchEnabled={true}
          rotateEnabled={true}
          onMapReady={() => setMapReady(true)}
          showsUserLocation={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
        >
          {/* User Location Marker */}
          {userLocation && (
            <Marker
              coordinate={{
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.userLocationMarker}>
                <View style={styles.userLocationPulse} />
                <Ionicons name="location" size={24} color="#007AFF" />
              </View>
            </Marker>
          )}

          {/* Markers for filtered sightings - only show when World Data is selected */}
          {dataView === 'world-data' && filteredSightings.map((sighting) => {
            if (!sighting.latitude || !sighting.longitude) return null;

            return (
              <Marker
                key={sighting.id}
                coordinate={{
                  latitude: sighting.latitude,
                  longitude: sighting.longitude,
                }}
                onPress={() => openRedditPost(sighting.reddit_url)}
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

          {/* Zone Boundaries (Polygons) - shown on World Data view */}
          {dataView === 'world-data' && zonesData && Object.values(zonesData.zones).map((zone, index) => {
            // Filter by selected species if one is selected
            if (selectedSpecies && zone.species !== selectedSpecies) return null;

            const color = getSpeciesColor(zone.species, index);

            return (
              <Polygon
                key={`zone-boundary-${zone.zone_id}`}
                coordinates={zone.boundary}
                strokeColor={color}
                fillColor={`${color}33`}  // 20% opacity
                strokeWidth={2}
                tappable={true}
                onPress={() => {
                  setSelectedZone(zone);
                  setZonePopupVisible(true);
                }}
              />
            );
          })}

          {/* Individual GPS Points - only for field researchers on World Data view */}
          {dataView === 'world-data' && zonesData && userRole === 'field_researcher' &&
            Object.values(zonesData.zones).map((zone, zoneIndex) => {
              // Filter by selected species if one is selected
              if (selectedSpecies && zone.species !== selectedSpecies) return null;
              if (!zone.individual_points) return null;

              const color = getSpeciesColor(zone.species, zoneIndex);

              return zone.individual_points.map((point, pointIndex) => (
                <Marker
                  key={`zone-${zone.zone_id}-point-${pointIndex}`}
                  coordinate={{
                    latitude: point.latitude,
                    longitude: point.longitude,
                  }}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={[styles.zonePointMarker, { backgroundColor: color }]} />
                </Marker>
              ));
            })
          }

          {/* Zone Centers - only for field researchers on World Data view */}
          {dataView === 'world-data' && zonesData && userRole === 'field_researcher' &&
            Object.values(zonesData.zones).map((zone, index) => {
              if (selectedSpecies && zone.species !== selectedSpecies) return null;
              if (!zone.center) return null;

              const color = getSpeciesColor(zone.species, index);

              return (
                <Marker
                  key={`zone-center-${zone.zone_id}`}
                  coordinate={{
                    latitude: zone.center.latitude,
                    longitude: zone.center.longitude,
                  }}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={[styles.zoneCenterMarker, { borderColor: color }]}>
                    <Text style={[styles.zoneCenterText, { color }]}>
                      {zone.point_count || '?'}
                    </Text>
                  </View>
                </Marker>
              );
            })
          }
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
          </View>
        )}

        {!loading && !error && dataView === 'world-data' && filteredSightings.length === 0 && !zonesData && !zonesLoading && (
          <View style={styles.overlay}>
            <Ionicons name="map-outline" size={48} color="#999" />
            <Text style={styles.emptyText}>
              {selectedSpecies
                ? `No ${selectedSpecies} sightings with locations found`
                : 'No sightings with locations found'}
            </Text>
          </View>
        )}

        {/* Zones Loading - show on World Data view too */}
        {dataView === 'world-data' && zonesLoading && (
          <View style={[styles.overlay, { backgroundColor: 'rgba(255, 255, 255, 0.7)' }]}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.overlayText}>Loading zones...</Text>
          </View>
        )}

        {/* Zones Loading/Error - for My Data view */}
        {dataView === 'my-data' && zonesLoading && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.overlayText}>Loading zones...</Text>
          </View>
        )}

        {dataView === 'my-data' && zonesError && !zonesLoading && (
          <View style={styles.overlay}>
            <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
            <Text style={styles.errorText}>{zonesError}</Text>
            <Text style={styles.emptyText}>Please login to view zones</Text>
          </View>
        )}

        {dataView === 'my-data' && !zonesLoading && !zonesError && !zonesData && (
          <View style={styles.overlay}>
            <Ionicons name="map-outline" size={48} color="#999" />
            <Text style={styles.emptyText}>No zone data available</Text>
          </View>
        )}
      </View>

      {/* Information Section - Bottom (Scrollable) */}
      <ScrollView 
        style={styles.infoSection}
        contentContainerStyle={styles.infoContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Data View Toggle Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.dataButton,
              dataView === 'my-data' && styles.dataButtonActive
            ]}
            onPress={() => setDataView('my-data')}
          >
            <Ionicons 
              name="person" 
              size={18} 
              color={dataView === 'my-data' ? '#fff' : '#007AFF'} 
            />
            <Text style={[
              styles.dataButtonText,
              dataView === 'my-data' && styles.dataButtonTextActive
            ]}>
              My Data
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.dataButton,
              dataView === 'world-data' && styles.dataButtonActive
            ]}
            onPress={() => setDataView('world-data')}
          >
            <Ionicons 
              name="globe" 
              size={18} 
              color={dataView === 'world-data' ? '#fff' : '#007AFF'} 
            />
            <Text style={[
              styles.dataButtonText,
              dataView === 'world-data' && styles.dataButtonTextActive
            ]}>
              World Data
            </Text>
          </TouchableOpacity>
        </View>

        {/* Header Section */}
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
                  All Species ({filteredSightings.length})
                </Text>
                {!selectedSpecies && <Ionicons name="checkmark" size={20} color="#007AFF" />}
              </TouchableOpacity>
              {topSpecies.map(({ species, count }) => {
                const locationCount = redditSightings.filter(s =>
                  s.species?.some(sp => sp.toLowerCase() === species.toLowerCase()) &&
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

      {/* Zone Info Popup Modal */}
      <Modal
        visible={zonePopupVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setZonePopupVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setZonePopupVisible(false)}
        >
          <View style={styles.zonePopup} onStartShouldSetResponder={() => true}>
            {selectedZone && (
              <>
                <View style={styles.zonePopupHeader}>
                  <Ionicons name="paw" size={28} color="#FF6B6B" />
                  <Text style={styles.zonePopupTitle}>{selectedZone.species}</Text>
                  <TouchableOpacity onPress={() => setZonePopupVisible(false)}>
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                </View>
                <View style={styles.zonePopupContent}>
                  <View style={styles.zonePopupRow}>
                    <Ionicons name="eye-outline" size={20} color="#666" />
                    <Text style={styles.zonePopupLabel}>Sightings in zone:</Text>
                    <Text style={styles.zonePopupValue}>
                      {selectedZone.point_count || selectedZone.boundary?.length || 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.zonePopupRow}>
                    <Ionicons name="navigate-outline" size={20} color="#666" />
                    <Text style={styles.zonePopupLabel}>Zone ID:</Text>
                    <Text style={styles.zonePopupValue}>#{selectedZone.zone_id}</Text>
                  </View>
                  {selectedZone.center && (
                    <View style={styles.zonePopupRow}>
                      <Ionicons name="location-outline" size={20} color="#666" />
                      <Text style={styles.zonePopupLabel}>Center:</Text>
                      <Text style={styles.zonePopupValue}>
                        {selectedZone.center.latitude.toFixed(4)}, {selectedZone.center.longitude.toFixed(4)}
                      </Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.zonePopupButton}
                  onPress={() => setZonePopupVisible(false)}
                >
                  <Text style={styles.zonePopupButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  mapContainer: {
    height: '48%',
    borderRadius: 0,
    overflow: 'hidden',
    borderBottomWidth: 2,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#fff',
    marginTop: 0,
    paddingTop: 0,
  },
  map: {
    width: '100%',
    height: '100%',
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
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  userLocationMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
  userLocationPulse: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    opacity: 0.3,
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
  infoSection: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  infoContent: {
    paddingBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  dataButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 8,
  },
  dataButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  dataButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  dataButtonTextActive: {
    color: '#fff',
  },
  headerSection: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  topSpeciesContainer: {
    marginBottom: 12,
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
    marginBottom: 8,
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
    marginTop: 8,
  },
  filterBannerText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
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
  // Zone marker styles
  zonePointMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fff',
  },
  zoneCenterMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  zoneCenterText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Zone popup styles
  zonePopup: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  zonePopupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#F8F9FA',
    gap: 12,
  },
  zonePopupTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  zonePopupContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  zonePopupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  zonePopupLabel: {
    flex: 1,
    fontSize: 14,
    color: '#666',
  },
  zonePopupValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  zonePopupButton: {
    backgroundColor: '#007AFF',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  zonePopupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MapScreen;
