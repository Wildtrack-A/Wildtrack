import { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { journalAPI, zonesAPI, ZonePoint, Zone, ZonesResponse } from '../services/api';

interface UserLog {
  id: string;
  species: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  timestamp: Date;
  journal_id: string;
}

function MapScreen() {
  const mapRef = useRef<any>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const [userLogs, setUserLogs] = useState<UserLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [topSpecies, setTopSpecies] = useState<Array<{ species: string; count: number }>>([]);
  const [mapReady, setMapReady] = useState(false);
  const [dataView, setDataView] = useState<'my-data' | 'world-data'>('my-data');
  const [zoneData, setZoneData] = useState<(ZonePoint & { species?: string })[]>([]);
  const [zones, setZones] = useState<Record<number, Zone>>({});
  const [loadingZones, setLoadingZones] = useState(false);

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

  // Load user's logs from all journals
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const journals = await journalAPI.getAllJournals() as any[];
        
        // Extract all logs from all journals
        const allLogs: UserLog[] = [];
        journals.forEach((journal: any) => {
          if (journal.logs) {
            journal.logs.forEach((log: any) => {
              allLogs.push({
                id: log.id,
                species: log.species,
                description: log.description || null,
                latitude: log.latitude || null,
                longitude: log.longitude || null,
                timestamp: new Date(log.timestamp),
                journal_id: log.journal_id,
              });
            });
          }
        });
        
        setUserLogs(allLogs);
        
        // Debug: Log how many logs have locations
        const withLocations = allLogs.filter(log => log.latitude && log.longitude);
        console.log(`Loaded ${allLogs.length} user logs, ${withLocations.length} with locations`);
      } catch (error: any) {
        console.error('Error loading user logs:', error);
        setError(error.message || 'Failed to load your logs');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Calculate top species from user's logs or zone data
  useEffect(() => {
    const speciesMap = new Map<string, number>();
    
    if (dataView === 'my-data') {
      // Count from user's logs
      userLogs.forEach(log => {
        if (log.species) {
          const count = speciesMap.get(log.species) || 0;
          speciesMap.set(log.species, count + 1);
        }
      });
    } else {
      // Count from zone data (world data) - species is already attached to points
      zoneData.forEach((point: any) => {
        if (point.species) {
          const count = speciesMap.get(point.species) || 0;
          speciesMap.set(point.species, count + 1);
        }
      });
    }
    
    const top = Array.from(speciesMap.entries())
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    setTopSpecies(top);
  }, [userLogs, zoneData, dataView]);

  // Load zone data when "World Data" is selected
  useEffect(() => {
    if (dataView === 'world-data') {
      loadZoneData();
    } else {
      // Clear zone data when switching to "My Data"
      setZoneData([]);
      setZones({});
    }
  }, [dataView]);

  const loadZoneData = async () => {
    setLoadingZones(true);
    setError(null);
    try {
      // zonesAPI.getAllZones() already handles auth fallback internally
      const response = await zonesAPI.getAllZones();
      
      // Extract all individual GPS points from zones with species info
      const allPoints: (ZonePoint & { species?: string })[] = [];
      const zonesMap: Record<number, Zone> = {};
      
      if (Array.isArray(response.zones)) {
        response.zones.forEach((zone: Zone) => {
          zonesMap[zone.zone_id] = zone;
          if (zone.individual_points) {
            // Add species info to each point
            const pointsWithSpecies = zone.individual_points.map(point => ({
              ...point,
              species: zone.species,
            }));
            allPoints.push(...pointsWithSpecies);
          }
        });
      } else if (typeof response.zones === 'object') {
        (Object.values(response.zones) as Zone[]).forEach((zone: Zone) => {
          zonesMap[zone.zone_id] = zone;
          if (zone.individual_points) {
            // Add species info to each point
            const pointsWithSpecies = zone.individual_points.map(point => ({
              ...point,
              species: zone.species,
            }));
            allPoints.push(...pointsWithSpecies);
          }
        });
      }
      
      setZoneData(allPoints);
      setZones(zonesMap);
      
      console.log(`Loaded ${allPoints.length} GPS points from ${Object.keys(zonesMap).length} zones`);
    } catch (error: any) {
      console.error('Error loading zone data:', error);
      setError(error.message || 'Failed to load zone data');
    } finally {
      setLoadingZones(false);
    }
  };

  // Get unique icon for each top species
  const getSpeciesIcon = (species: string): { name: any; color: string } => {
    const speciesLower = species.toLowerCase();
    // Map species to unique icons with distinct colors
    if (speciesLower.includes('tiger')) {
      return { name: 'paw', color: '#FF6B6B' }; // Red for tigers
    } else if (speciesLower.includes('elephant')) {
      return { name: 'ellipse', color: '#4ECDC4' }; // Teal for elephants
    } else if (speciesLower.includes('panda') || speciesLower.includes('bear')) {
      return { name: 'radio-button-on', color: '#000000' }; // Black for pandas/bears
    } else if (speciesLower.includes('rhino') || speciesLower.includes('rhinoceros')) {
      return { name: 'triangle', color: '#8B4513' }; // Brown for rhinos
    } else if (speciesLower.includes('gorilla') || speciesLower.includes('ape')) {
      return { name: 'person', color: '#654321' }; // Dark brown for gorillas
    } else if (speciesLower.includes('whale') || speciesLower.includes('dolphin')) {
      return { name: 'water', color: '#1E90FF' }; // Blue for marine animals
    } else if (speciesLower.includes('eagle') || speciesLower.includes('bird')) {
      return { name: 'airplane', color: '#9370DB' }; // Purple for birds
    } else if (speciesLower.includes('turtle') || speciesLower.includes('tortoise')) {
      return { name: 'disc', color: '#228B22' }; // Green for turtles
    } else {
      // Default icon for other species
      return { name: 'location', color: '#FF6B6B' };
    }
  };

  // Get filtered logs or zone points based on data view
  const filteredLogs = useMemo(() => {
    if (dataView === 'world-data') {
      // Filter zone data points
      let points = zoneData;
      
      // If a specific species is selected, filter by that
      if (selectedSpecies) {
        points = zoneData.filter((point: any) => 
          point.species && point.species.toLowerCase() === selectedSpecies.toLowerCase()
        );
      } else if (topSpecies.length > 0) {
        // Filter to top 3 species
        const topSpeciesNames = topSpecies.map(s => s.species.toLowerCase());
        points = zoneData.filter((point: any) => 
          point.species && topSpeciesNames.includes(point.species.toLowerCase())
        );
      }
      
      // Convert zone points to log-like format for rendering
      return points.map((point: any, index) => {
        // Species is already attached to point from loadZoneData
        const species = point.species || 'Unknown';
        
        return {
          id: `zone-${index}-${point.latitude}-${point.longitude}`,
          species,
          description: null,
          latitude: point.latitude,
          longitude: point.longitude,
          timestamp: point.timestamp ? new Date(point.timestamp) : new Date(),
          journal_id: '',
        };
      });
    } else {
      // Filter user's logs
      const logsWithLocations = userLogs.filter(log =>
        log.latitude && log.longitude
      );
      
      // If a specific species is selected, filter by that
      if (selectedSpecies) {
        return logsWithLocations.filter(log =>
          log.species && log.species.toLowerCase() === selectedSpecies.toLowerCase()
        );
      }
      
      // If we have top species, prioritize showing those, but also show others
      if (topSpecies.length > 0) {
        const topSpeciesNames = topSpecies.map(s => s.species.toLowerCase());
        
        // Get logs that match top 3 species
        const topSpeciesLogs = logsWithLocations.filter(log =>
          log.species && topSpeciesNames.includes(log.species.toLowerCase())
        );
        
        // If we found matches, return them; otherwise show all logs
        return topSpeciesLogs.length > 0 ? topSpeciesLogs : logsWithLocations;
      }
      
      // If no top species calculated yet, show all logs with locations
      return logsWithLocations;
    }
  }, [selectedSpecies, userLogs, topSpecies, dataView, zoneData, zones]);

  // Get available species for dropdown (memoized)
  const availableSpecies = useMemo(() => {
    const speciesMap = new Map<string, number>();
    userLogs.forEach(log => {
      if (log.species) {
        const count = speciesMap.get(log.species) || 0;
        speciesMap.set(log.species, count + 1);
      }
    });
    return Array.from(speciesMap.entries())
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => b.count - a.count);
  }, [userLogs]);

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

  const formatTimeAgo = (timestamp: Date) => {
    if (!timestamp) return 'Date unknown';
    try {
      const now = new Date();
      const diffMs = now.getTime() - timestamp.getTime();
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

          {/* Markers for user's logs */}
          {filteredLogs.map((log) => {
            if (!log.latitude || !log.longitude) return null;
            
            // Get unique icon for this species
            const iconInfo = getSpeciesIcon(log.species);
            
            return (
              <Marker
                key={log.id}
                coordinate={{
                  latitude: log.latitude,
                  longitude: log.longitude,
                }}
              >
                <View style={styles.markerContainer}>
                  <View style={[styles.speciesMarker, { backgroundColor: `${iconInfo.color}20` }]}>
                    <Ionicons name={iconInfo.name} size={28} color={iconInfo.color} />
                  </View>
                </View>
              </Marker>
            );
          })}
        </MapView>

        {/* Loading/Error Overlay */}
        {(loading || loadingZones) && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.overlayText}>
              {dataView === 'world-data' ? 'Loading zone data...' : 'Loading logs...'}
            </Text>
          </View>
        )}
        
        {error && !loading && !loadingZones && (
          <View style={styles.overlay}>
            <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !loadingZones && !error && filteredLogs.length === 0 && (
          <View style={styles.overlay}>
            <Ionicons name="map-outline" size={48} color="#999" />
            <Text style={styles.emptyText}>
              {dataView === 'world-data' 
                ? selectedSpecies 
                  ? `No ${selectedSpecies} sightings found in zone data`
                  : 'No zone data available. Check backend connection.'
                : selectedSpecies 
                  ? `No ${selectedSpecies} logs with locations found`
                  : userLogs.length === 0
                  ? 'No logs found. Create a log in the Home page to see it on the map.'
                  : userLogs.filter(log => log.latitude && log.longitude).length === 0
                  ? 'You have logs but none have location coordinates. Logs created with GPS will appear here.'
                  : 'No logs match the current filter'}
            </Text>
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
                Showing {filteredLogs.length} {selectedSpecies} log{filteredLogs.length !== 1 ? 's' : ''} on map
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
                  All Species ({filteredLogs.length})
                </Text>
                {!selectedSpecies && <Ionicons name="checkmark" size={20} color="#007AFF" />}
              </TouchableOpacity>
              {topSpecies.map(({ species, count }) => {
                const locationCount = userLogs.filter(log =>
                  log.species && log.species.toLowerCase() === species.toLowerCase() &&
                  log.latitude && log.longitude
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
    position: 'relative',
  },
  speciesMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
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
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: '#fff',
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
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MapScreen;
