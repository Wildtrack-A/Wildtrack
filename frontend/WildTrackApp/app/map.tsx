import { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { journalAPI, zonesAPI, ZonePoint, Zone, ZonesResponse } from '../services/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const insets = useSafeAreaInsets();
  const mapRef = useRef<any>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const [userLogs, setUserLogs] = useState<UserLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worldDataError, setWorldDataError] = useState<string | null>(null);
  const [showZoneWarningPopup, setShowZoneWarningPopup] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [topSpecies, setTopSpecies] = useState<Array<{ species: string; count: number; distance_km?: number }>>([]);
  const [mapReady, setMapReady] = useState(false);
  const [dataView, setDataView] = useState<'my-data' | 'world-data'>('my-data');
  const [zoneData, setZoneData] = useState<(ZonePoint & { species?: string })[]>([]);
  const [zones, setZones] = useState<Record<number, Zone>>({});
  const [loadingZones, setLoadingZones] = useState(false);
  const [userRole, setUserRole] = useState<'field_researcher' | 'public'>('public');
  const [selectedMarker, setSelectedMarker] = useState<{ point: any; species: string; count?: number; allPoints?: any[] } | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<{ center: { lat: number; lng: number }; species: string; count: number; points: any[] } | null>(null);

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

  // Load user's logs from all journals on initial mount
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

  // Clear errors when switching views
  useEffect(() => {
    if (dataView === 'my-data') {
      // Clear world data error when switching to "My Data"
      setWorldDataError(null);
    } else {
      // Clear my data error when switching to "World Data"
      setError(null);
    }
  }, [dataView]);

  // Load top 3 endangered species near user location (only for World Data)
  useEffect(() => {
    if (dataView === 'world-data' && userLocation) {
      const loadNearbyEndangered = async () => {
        try {
          console.log('📍 Loading nearby endangered species for location:', userLocation);
          const response = await zonesAPI.getNearbyEndangeredSpecies(
            userLocation.latitude,
            userLocation.longitude,
            50 // 50km radius
          );
          
          console.log('📥 Response:', response);
          
          if (response.top_species && response.top_species.length > 0) {
            const top = response.top_species.map(item => ({
              species: item.species,
              count: item.sighting_count,
              distance_km: item.distance_km
            }));
            
            console.log('✅ Loaded nearby endangered species:', top);
            setTopSpecies(top);
          } else {
            console.log('⚠️ No endangered species found nearby');
            setTopSpecies([]);
          }
        } catch (error: any) {
          // Better error handling
          let errorMessage = 'Unknown error';
          if (error?.message) {
            errorMessage = error.message;
          } else if (typeof error === 'string') {
            errorMessage = error;
          } else if (error?.toString) {
            errorMessage = error.toString();
          }
          
          console.error('❌ Error loading nearby endangered species:', errorMessage);
          console.error('Full error object:', JSON.stringify(error, null, 2));
          
          // Set empty list on error
          setTopSpecies([]);
        }
      };
      
      loadNearbyEndangered();
    } else if (dataView === 'my-data') {
      // For My Data, calculate from user's logs
      const speciesMap = new Map<string, number>();
      userLogs.forEach(log => {
        if (log.species) {
          const count = speciesMap.get(log.species) || 0;
          speciesMap.set(log.species, count + 1);
        }
      });
      const top = Array.from(speciesMap.entries())
        .map(([species, count]) => ({ species, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      setTopSpecies(top);
    } else {
      // Clear top species when not in world-data or my-data
      setTopSpecies([]);
    }
  }, [dataView, userLocation, zoneData, userLogs]);

  // Load zone data when "World Data" is selected
  useEffect(() => {
    if (dataView === 'world-data') {
      loadZoneData();
    } else {
      // Clear zone data and world data error when switching to "My Data"
      setZoneData([]);
      setZones({});
      setWorldDataError(null);
      setError(null); // Clear any general error
    }
  }, [dataView]);

  const loadZoneData = async () => {
    setLoadingZones(true);
    setWorldDataError(null);
    setError(null);
    try {
      console.log('🔄 Loading zone data...');
      // zonesAPI.getAllZones() already handles auth fallback internally
      const response = await zonesAPI.getAllZones();
      
      console.log('📥 Zone data response:', {
        total_zones: response.total_zones,
        unique_species: response.unique_species?.length || 0,
        zones_count: typeof response.zones === 'object' ? Object.keys(response.zones).length : 0,
        role: response.role
      });
      
      // Store user role
      setUserRole(response.role || 'public');
      
      // Extract all individual GPS points from zones with species info
      const allPoints: (ZonePoint & { species?: string })[] = [];
      const zonesMap: Record<number, Zone> = {};
      
      if (Array.isArray(response.zones)) {
        response.zones.forEach((zone: Zone) => {
          zonesMap[zone.zone_id] = zone;
          if (zone.individual_points && zone.individual_points.length > 0) {
            // Add species info to each point
            const pointsWithSpecies = zone.individual_points.map(point => ({
              ...point,
              species: zone.species,
            }));
            allPoints.push(...pointsWithSpecies);
          }
        });
      } else if (typeof response.zones === 'object' && response.zones !== null) {
        (Object.values(response.zones) as Zone[]).forEach((zone: Zone) => {
          zonesMap[zone.zone_id] = zone;
          if (zone.individual_points && zone.individual_points.length > 0) {
            // Add species info to each point
            const pointsWithSpecies = zone.individual_points.map(point => ({
              ...point,
              species: zone.species,
            }));
            allPoints.push(...pointsWithSpecies);
          }
        });
      }
      
      console.log(`✅ Loaded ${allPoints.length} GPS points from ${Object.keys(zonesMap).length} zones`);
      console.log(`👤 User role: ${response.role}`);
      
      if (allPoints.length === 0) {
        console.warn('⚠️ No GPS points found in zone data. Zones may only have boundaries.');
        // Still set the zones map even if no points, so boundaries can be displayed
        setZones(zonesMap);
        setZoneData([]);
        // Show dismissible popup instead of blocking error
        setShowZoneWarningPopup(true);
      } else {
        setZoneData(allPoints);
        setZones(zonesMap);
        setWorldDataError(null);
        setShowZoneWarningPopup(false);
      }
    } catch (error: any) {
      console.error('❌ Error loading zone data:', error);
      setWorldDataError(error.message || 'Failed to load zone data. Make sure the backend is running and has zone data.');
    } finally {
      setLoadingZones(false);
    }
  };

  // Get unique icon and color for each species
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
    } else if (speciesLower.includes('lion')) {
      return { name: 'flame', color: '#FF8C00' }; // Orange for lions
    } else if (speciesLower.includes('leopard') || speciesLower.includes('jaguar')) {
      return { name: 'diamond', color: '#FFD700' }; // Gold for big cats
    } else if (speciesLower.includes('cheetah')) {
      return { name: 'flash', color: '#FF4500' }; // Orange-red for cheetahs
    } else {
      // Default icon for other species - use hash of species name for consistent color
      const hash = speciesLower.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
      return { name: 'location', color: colors[hash % colors.length] };
    }
  };

  // Get species color (for clusters)
  const getSpeciesColor = (species: string): string => {
    return getSpeciesIcon(species).color;
  };

  // Group overlapping markers at the same location
  const groupOverlappingMarkers = (logs: UserLog[], overlapRadius: number = 0.0001): Array<{ coordinate: { latitude: number; longitude: number }; logs: UserLog[]; primarySpecies: string }> => {
    const groups: Array<{ coordinate: { latitude: number; longitude: number }; logs: UserLog[]; primarySpecies: string }> = [];
    const processed = new Set<number>();

    logs.forEach((log, index) => {
      if (processed.has(index) || !log.latitude || !log.longitude) return;

      const group: UserLog[] = [log];
      processed.add(index);
      const logLat = log.latitude;
      const logLng = log.longitude;

      // Find overlapping logs
      logs.forEach((otherLog, otherIndex) => {
        if (processed.has(otherIndex) || index === otherIndex || !otherLog.latitude || !otherLog.longitude) return;

        const latDiff = Math.abs(logLat - otherLog.latitude);
        const lngDiff = Math.abs(logLng - otherLog.longitude);

        if (latDiff < overlapRadius && lngDiff < overlapRadius) {
          group.push(otherLog);
          processed.add(otherIndex);
        }
      });

      // Determine primary species (most common in group)
      const speciesCount: Record<string, number> = {};
      group.forEach(l => {
        const species = l.species || 'Unknown';
        speciesCount[species] = (speciesCount[species] || 0) + 1;
      });
      const primarySpecies = Object.entries(speciesCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

      groups.push({
        coordinate: {
          latitude: log.latitude!,
          longitude: log.longitude!,
        },
        logs: group,
        primarySpecies,
      });
    });

    return groups;
  };

  // Simple clustering function for public users
  const clusterPoints = (points: (ZonePoint & { species?: string })[], clusterRadius: number = 0.01): Array<{ center: { lat: number; lng: number }; species: string; count: number; points: any[] }> => {
    const clusters: Array<{ center: { lat: number; lng: number }; species: string; count: number; points: any[] }> = [];
    const processed = new Set<number>();

    points.forEach((point, index) => {
      if (processed.has(index)) return;

      const cluster: any[] = [point];
      processed.add(index);

      // Find nearby points of the same species
      points.forEach((otherPoint, otherIndex) => {
        if (processed.has(otherIndex) || index === otherIndex) return;
        if (point.species !== otherPoint.species) return;

        const latDiff = Math.abs(point.latitude - otherPoint.latitude);
        const lngDiff = Math.abs(point.longitude - otherPoint.longitude);

        if (latDiff < clusterRadius && lngDiff < clusterRadius) {
          cluster.push(otherPoint);
          processed.add(otherIndex);
        }
      });

      // Calculate cluster center
      const avgLat = cluster.reduce((sum, p) => sum + p.latitude, 0) / cluster.length;
      const avgLng = cluster.reduce((sum, p) => sum + p.longitude, 0) / cluster.length;

      clusters.push({
        center: { lat: avgLat, lng: avgLng },
        species: point.species || 'Unknown',
        count: cluster.length,
        points: cluster
      });
    });

    return clusters;
  };

  // Get clusters for world data (all users can see clusters)
  const clusters = useMemo(() => {
    if (dataView !== 'world-data') {
      return [];
    }

    let points = zoneData;
    
    // Filter by selected species if applicable
    if (selectedSpecies) {
      points = zoneData.filter((point: any) => 
        point.species && point.species.toLowerCase() === selectedSpecies.toLowerCase()
      );
    } else if (topSpecies.length > 0) {
      const topSpeciesNames = topSpecies.map(s => s.species.toLowerCase());
      points = zoneData.filter((point: any) => 
        point.species && topSpeciesNames.includes(point.species.toLowerCase())
      );
    }

    // Only create clusters if we have points
    if (points.length === 0) {
      return [];
    }

    return clusterPoints(points, 0.01); // 0.01 degree ≈ 1km
  }, [zoneData, dataView, selectedSpecies, topSpecies]);

  // Get filtered logs or zone points based on data view
  const filteredLogs = useMemo(() => {
    if (dataView === 'world-data') {
      // For researchers: show individual points
      // For public: clusters are handled separately
      if (userRole === 'field_researcher') {
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
        // Public users see clusters, not individual points
        return [];
      }
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

  // Group markers for "My Data" view
  const groupedMyDataMarkers = useMemo(() => {
    if (dataView !== 'my-data') return [];
    return groupOverlappingMarkers(filteredLogs, 0.0001);
  }, [filteredLogs, dataView]);

  // Group markers for "World Data" view (researchers)
  const groupedWorldDataMarkers = useMemo(() => {
    if (dataView !== 'world-data' || userRole !== 'field_researcher') return [];
    return groupOverlappingMarkers(filteredLogs, 0.0001);
  }, [filteredLogs, dataView, userRole]);

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

          {/* Markers for world data - researchers see individual points (grouped if overlapping) */}
          {dataView === 'world-data' && userRole === 'field_researcher' && groupedWorldDataMarkers.map((group, index) => {
            const iconInfo = getSpeciesIcon(group.primarySpecies);
            const hasMultiple = group.logs.length > 1;
            
            return (
              <Marker
                key={`world-group-${index}-${group.coordinate.latitude}-${group.coordinate.longitude}`}
                coordinate={group.coordinate}
                onPress={() => {
                  setSelectedMarker({
                    point: group.logs[0], // Primary point
                    species: group.primarySpecies,
                    count: group.logs.length,
                    allPoints: group.logs,
                  });
                }}
              >
                <View style={styles.markerContainer}>
                  <View style={[styles.speciesMarker, { backgroundColor: `${iconInfo.color}20`, borderColor: iconInfo.color }]}>
                    <Ionicons name={iconInfo.name} size={28} color={iconInfo.color} />
                  </View>
                  {hasMultiple && (
                    <View style={styles.markerBadge}>
                      <Text style={styles.markerBadgeText}>{group.logs.length}</Text>
                    </View>
                  )}
                </View>
              </Marker>
            );
          })}

          {/* Clusters for world data - all users can see and interact with clusters */}
          {dataView === 'world-data' && clusters.length > 0 && clusters.map((cluster, index) => {
            const color = getSpeciesColor(cluster.species);
            const iconInfo = getSpeciesIcon(cluster.species);
            
            return (
              <Marker
                key={`cluster-${index}-${cluster.center.lat}-${cluster.center.lng}`}
                coordinate={{
                  latitude: cluster.center.lat,
                  longitude: cluster.center.lng,
                }}
                onPress={() => {
                  console.log('📍 Cluster clicked:', cluster);
                  setSelectedCluster(cluster);
                  setSelectedMarker(null); // Clear any selected marker
                }}
                tracksViewChanges={false}
              >
                <View style={styles.clusterContainer}>
                  <View style={[styles.clusterPulse, { backgroundColor: color }]} />
                  <View style={[styles.clusterMarker, { backgroundColor: color, borderColor: color }]}>
                    <Ionicons name={iconInfo.name} size={18} color="#fff" style={styles.clusterIcon} />
                    <Text style={styles.clusterText}>{cluster.count}</Text>
                  </View>
                </View>
              </Marker>
            );
          })}

          {/* Markers for user's logs (My Data) - grouped if overlapping */}
          {dataView === 'my-data' && groupedMyDataMarkers.map((group, index) => {
            const iconInfo = getSpeciesIcon(group.primarySpecies);
            const hasMultiple = group.logs.length > 1;
            
            return (
              <Marker
                key={`my-group-${index}-${group.coordinate.latitude}-${group.coordinate.longitude}`}
                coordinate={group.coordinate}
                onPress={() => {
                  setSelectedMarker({
                    point: group.logs[0], // Primary point
                    species: group.primarySpecies,
                    count: group.logs.length,
                    allPoints: group.logs,
                  });
                }}
              >
                <View style={styles.markerContainer}>
                  <View style={[styles.speciesMarker, { backgroundColor: `${iconInfo.color}20`, borderColor: iconInfo.color }]}>
                    <Ionicons name={iconInfo.name} size={28} color={iconInfo.color} />
                  </View>
                  {hasMultiple && (
                    <View style={styles.markerBadge}>
                      <Text style={styles.markerBadgeText}>{group.logs.length}</Text>
                    </View>
                  )}
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
        
        {/* Show errors only for the current view */}
        {dataView === 'my-data' && error && !loading && (
          <View style={styles.overlay}>
            <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Empty state - only show if no loading, no errors, and no data */}
        {!loading && !loadingZones && 
         !(dataView === 'my-data' && error) && 
         (dataView === 'world-data' 
           ? (userRole === 'public' ? clusters.length === 0 : filteredLogs.length === 0)
           : filteredLogs.length === 0) && (
          <View style={styles.overlay}>
            <Ionicons name="map-outline" size={48} color="#999" />
            <Text style={styles.emptyText}>
              {dataView === 'world-data' 
                ? selectedSpecies 
                  ? `No ${selectedSpecies} sightings found in zone data`
                  : clusters.length === 0 && zoneData.length === 0
                  ? 'No zone data available. Check backend connection.'
                  : clusters.length === 0 && zoneData.length > 0
                  ? 'Zone data loaded but no clusters found. Try selecting a species or adjusting filters.'
                  : 'No clusters found. Try selecting a species or check backend connection.'
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

        {/* My Data - Show all user logs */}
        {dataView === 'my-data' && (
          <View style={styles.headerSection}>
            <Text style={styles.headerTitle}>Your Logs</Text>
            
            {/* Species Filter Dropdown for My Data */}
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
            
            {filteredLogs.length > 0 ? (
              <View style={styles.logsListContainer}>
                {filteredLogs.map((log) => {
                  const iconInfo = getSpeciesIcon(log.species);
                  return (
                    <TouchableOpacity
                      key={log.id}
                      style={styles.logItem}
                      onPress={() => {
                        setSelectedMarker({
                          point: log,
                          species: log.species,
                        });
                      }}
                    >
                      <View style={[styles.logItemIcon, { backgroundColor: `${iconInfo.color}20`, borderColor: iconInfo.color }]}>
                        <Ionicons name={iconInfo.name} size={24} color={iconInfo.color} />
                      </View>
                      <View style={styles.logItemContent}>
                        <Text style={styles.logItemSpecies}>{log.species}</Text>
                        {log.description && (
                          <Text style={styles.logItemDescription} numberOfLines={2}>
                            {log.description}
                          </Text>
                        )}
                        <View style={styles.logItemMeta}>
                          {log.latitude && log.longitude && (
                            <Text style={styles.logItemMetaText}>
                              📍 {log.latitude.toFixed(4)}, {log.longitude.toFixed(4)}
                            </Text>
                          )}
                          <Text style={styles.logItemMetaText}>
                            🕐 {new Date(log.timestamp).toLocaleDateString()}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#999" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyLogsContainer}>
                <Ionicons name="document-outline" size={48} color="#999" />
                <Text style={styles.emptyLogsText}>
                  {userLogs.length === 0 
                    ? 'No logs yet. Create logs in the Home page to see them here.'
                    : 'No logs match the current filter.'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Header Section - Only show in World Data */}
        {dataView === 'world-data' && (
          <View style={styles.headerSection}>
            <Text style={styles.headerTitle}>Endangered Animals in Your Area</Text>
            
            {/* Top 3 Species List */}
            <View style={styles.topSpeciesContainer}>
              {topSpecies.length > 0 ? (
                topSpecies.map((item, index) => {
                  const iconInfo = getSpeciesIcon(item.species);
                  return (
                    <View key={item.species} style={styles.topSpeciesItem}>
                      <View style={styles.topSpeciesRank}>
                        <View style={[styles.topSpeciesIconContainer, { backgroundColor: `${iconInfo.color}20`, borderColor: iconInfo.color }]}>
                          <Ionicons name={iconInfo.name} size={20} color={iconInfo.color} />
                        </View>
                        <Text style={styles.topSpeciesRankText}>{index + 1}</Text>
                      </View>
                      <View style={styles.topSpeciesInfo}>
                        <Text style={styles.topSpeciesName}>{item.species}</Text>
                        <View style={styles.topSpeciesDetails}>
                          <Text style={styles.topSpeciesCount}>{item.count} sightings</Text>
                          {item.distance_km !== undefined && (
                            <Text style={styles.topSpeciesDistance}>
                              📍 {item.distance_km.toFixed(1)} km away
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.noDataText}>
                  {userLocation ? 'No endangered species found nearby' : 'Waiting for location...'}
                </Text>
              )}
            </View>
          </View>
        )}

          {/* Species Filter Dropdown - Only show in World Data */}
          {dataView === 'world-data' && (
            <>
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
            </>
          )}
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
              {/* Show available species based on current view */}
              {(dataView === 'my-data' ? availableSpecies : topSpecies).map(({ species, count }) => {
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

      {/* Zone Data Warning Popup */}
      <Modal
        visible={showZoneWarningPopup}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowZoneWarningPopup(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowZoneWarningPopup(false)}
        >
          <View style={styles.zoneWarningModal} onStartShouldSetResponder={() => true}>
            <View style={styles.zoneWarningHeader}>
              <Ionicons name="information-circle" size={28} color="#007AFF" />
              <Text style={styles.zoneWarningTitle}>Zone Data Information</Text>
              <TouchableOpacity onPress={() => setShowZoneWarningPopup(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.zoneWarningContent}>
              <Text style={styles.zoneWarningText}>
                {userRole === 'field_researcher' 
                  ? 'Zone data loaded but no individual GPS points are available. Zones may only contain boundaries. As a researcher, you typically need individual GPS points for detailed analysis. You can still navigate the map to view zone boundaries.'
                  : 'Zone data loaded but no individual GPS points are available. Zone boundaries are displayed on the map. You can navigate and explore the map normally.'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.zoneWarningButton}
              onPress={() => setShowZoneWarningPopup(false)}
            >
              <Text style={styles.zoneWarningButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Marker/Cluster Info Popup Modal */}
      <Modal
        visible={selectedMarker !== null || selectedCluster !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          // Only allow closing via X button, not back button or outside tap
          // This prevents accidental closes
        }}
      >
        <View style={styles.modalOverlay}>
          <View 
            style={[
              styles.infoModal, 
              { 
                height: (SCREEN_HEIGHT - insets.top - insets.bottom) * 0.5,
                marginBottom: insets.bottom + 8,
              }
            ]}
            onStartShouldSetResponder={() => true}
          >
            {selectedMarker && (
              <>
                <View style={styles.infoModalHeader}>
                  <Text style={styles.infoModalTitle}>Animal Sighting</Text>
                  <TouchableOpacity onPress={() => setSelectedMarker(null)}>
                    <Ionicons name="close" size={28} color="#000" />
                  </TouchableOpacity>
                </View>
                <ScrollView 
                  style={styles.infoModalContent}
                  contentContainerStyle={styles.infoModalContentContainer}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                  bounces={true}
                  scrollEnabled={true}
                  alwaysBounceVertical={true}
                  keyboardShouldPersistTaps="handled"
                >
                  {selectedMarker.count && selectedMarker.count > 1 && selectedMarker.allPoints ? (
                    <>
                      <View style={styles.infoCard}>
                        <View style={styles.infoCardHeader}>
                          <Ionicons name="layers" size={24} color="#007AFF" />
                          <Text style={styles.infoCardTitle}>Multiple Sightings</Text>
                        </View>
                        <Text style={styles.infoCardValue}>
                          {selectedMarker.count} sightings at this location
                        </Text>
                      </View>
                      
                      {selectedMarker.allPoints.map((point, index) => {
                        const iconInfo = getSpeciesIcon(point.species || 'Unknown');
                        return (
                          <View key={index} style={[styles.infoCard, styles.multiSightingCard]}>
                            <View style={styles.multiSightingHeader}>
                              <View style={[styles.multiSightingIcon, { backgroundColor: `${iconInfo.color}20`, borderColor: iconInfo.color }]}>
                                <Ionicons name={iconInfo.name} size={20} color={iconInfo.color} />
                              </View>
                              <Text style={styles.multiSightingSpecies}>{point.species || 'Unknown'}</Text>
                            </View>
                            
                            {point.latitude && point.longitude && (
                              <Text style={styles.multiSightingDetail}>
                                📍 {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                              </Text>
                            )}
                            
                            {point.timestamp && (
                              <Text style={styles.multiSightingDetail}>
                                🕐 {new Date(point.timestamp).toLocaleString()}
                              </Text>
                            )}
                            
                            {point.description && (
                              <Text style={styles.multiSightingDescription}>{point.description}</Text>
                            )}
                          </View>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <View style={styles.infoCard}>
                        <View style={styles.infoCardHeader}>
                          <Ionicons name="paw" size={24} color="#007AFF" />
                          <Text style={styles.infoCardTitle}>Species</Text>
                        </View>
                        <Text style={styles.infoCardValue}>{selectedMarker.species}</Text>
                      </View>
                      
                      {selectedMarker.point.latitude && selectedMarker.point.longitude && (
                        <View style={styles.infoCard}>
                          <View style={styles.infoCardHeader}>
                            <Ionicons name="location" size={24} color="#007AFF" />
                            <Text style={styles.infoCardTitle}>Location</Text>
                          </View>
                          <Text style={styles.infoCardValue}>
                            {selectedMarker.point.latitude.toFixed(4)}, {selectedMarker.point.longitude.toFixed(4)}
                          </Text>
                        </View>
                      )}
                      
                      {selectedMarker.point.timestamp && (
                        <View style={styles.infoCard}>
                          <View style={styles.infoCardHeader}>
                            <Ionicons name="time" size={24} color="#007AFF" />
                            <Text style={styles.infoCardTitle}>Time</Text>
                          </View>
                          <Text style={styles.infoCardValue}>
                            {new Date(selectedMarker.point.timestamp).toLocaleString()}
                          </Text>
                        </View>
                      )}
                      
                      {selectedMarker.point.description && (
                        <View style={styles.infoCard}>
                          <View style={styles.infoCardHeader}>
                            <Ionicons name="document-text" size={24} color="#007AFF" />
                            <Text style={styles.infoCardTitle}>Description</Text>
                          </View>
                          <Text style={styles.infoCardValue}>{selectedMarker.point.description}</Text>
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>
              </>
            )}
            {selectedCluster && (
              <>
                <View style={styles.infoModalHeader}>
                  <Text style={styles.infoModalTitle}>Animal Cluster</Text>
                  <TouchableOpacity onPress={() => setSelectedCluster(null)}>
                    <Ionicons name="close" size={28} color="#000" />
                  </TouchableOpacity>
                </View>
                <ScrollView 
                  style={styles.infoModalContent}
                  contentContainerStyle={styles.infoModalContentContainer}
                  showsVerticalScrollIndicator={true}
                  scrollEnabled={true}
                  bounces={true}
                  alwaysBounceVertical={true}
                  nestedScrollEnabled={true}
                >
                  <View style={styles.infoCard}>
                    <View style={styles.infoCardHeader}>
                      <Ionicons name="paw" size={24} color={getSpeciesColor(selectedCluster.species)} />
                      <Text style={styles.infoCardTitle}>Species</Text>
                    </View>
                    <Text style={[styles.infoCardValue, { color: getSpeciesColor(selectedCluster.species), fontWeight: '600' }]}>
                      {selectedCluster.species}
                    </Text>
                  </View>
                  
                  <View style={styles.infoCard}>
                    <View style={styles.infoCardHeader}>
                      <Ionicons name="location" size={24} color="#007AFF" />
                      <Text style={styles.infoCardTitle}>Sightings</Text>
                    </View>
                    <Text style={styles.infoCardValue}>{selectedCluster.count} animals in this area</Text>
                  </View>
                  
                  <View style={styles.infoCard}>
                    <View style={styles.infoCardHeader}>
                      <Ionicons name="map" size={24} color="#007AFF" />
                      <Text style={styles.infoCardTitle}>Location</Text>
                    </View>
                    <Text style={styles.infoCardValue}>
                      {selectedCluster.center.lat.toFixed(4)}, {selectedCluster.center.lng.toFixed(4)}
                    </Text>
                  </View>
                  
                  <View style={[styles.infoCard, styles.clusterInfoCard]}>
                    <View style={styles.infoCardHeader}>
                      <Ionicons name="information-circle" size={24} color="#666" />
                      <Text style={styles.infoCardTitle}>About This Cluster</Text>
                    </View>
                    <Text style={styles.clusterInfoText}>
                      This cluster represents {selectedCluster.count} {selectedCluster.species} sighting{selectedCluster.count !== 1 ? 's' : ''} within approximately 1km of this location.
                    </Text>
                    {selectedCluster.points && selectedCluster.points.length > 0 && (
                      <View style={styles.clusterPointsList}>
                        <Text style={styles.clusterPointsTitle}>Sample Points:</Text>
                        {selectedCluster.points.slice(0, 5).map((point: any, idx: number) => (
                          <Text key={idx} style={styles.clusterPointItem}>
                            • {point.latitude?.toFixed(4)}, {point.longitude?.toFixed(4)}
                            {point.timestamp && ` (${new Date(point.timestamp).toLocaleDateString()})`}
                          </Text>
                        ))}
                        {selectedCluster.points.length > 5 && (
                          <Text style={styles.clusterPointItem}>
                            ... and {selectedCluster.points.length - 5} more
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
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
  clusterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterMarker: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  clusterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 2,
  },
  clusterIcon: {
    marginBottom: 2,
  },
  clusterPulse: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    opacity: 0.3,
    zIndex: -1,
  },
  clusterPointsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  clusterPointsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clusterPointItem: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    lineHeight: 18,
  },
  infoModal: {
    backgroundColor: '#fff',
    borderRadius: 24,
    marginHorizontal: 16,
    position: 'absolute',
    bottom: 0,
    width: '92%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  infoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    flexShrink: 0,
  },
  infoModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  infoModalContent: {
    flex: 1,
    height: 0, // Force bounded height for ScrollView
  },
  infoModalContentContainer: {
    padding: 20,
    paddingBottom: 24,
  },
  infoCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  infoCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCardValue: {
    fontSize: 16,
    color: '#000',
    lineHeight: 22,
    fontWeight: '500',
  },
  clusterInfoCard: {
    backgroundColor: '#F0F7FF',
    borderColor: '#B3D9FF',
  },
  clusterInfoText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  multiSightingCard: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
    marginTop: 8,
  },
  multiSightingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  multiSightingIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  multiSightingSpecies: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  multiSightingDetail: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  multiSightingDescription: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  zoneWarningModal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    margin: 20,
    width: '90%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  zoneWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    gap: 12,
  },
  zoneWarningTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    flex: 1,
  },
  zoneWarningContent: {
    padding: 20,
  },
  zoneWarningText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  zoneWarningButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    margin: 20,
    marginTop: 0,
    borderRadius: 12,
    alignItems: 'center',
  },
  zoneWarningButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    gap: 8,
  },
  topSpeciesIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  topSpeciesRankText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
    minWidth: 20,
    textAlign: 'center',
  },
  topSpeciesInfo: {
    flex: 1,
  },
  topSpeciesName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  topSpeciesDetails: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  topSpeciesCount: {
    fontSize: 12,
    color: '#666',
  },
  topSpeciesDistance: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '500',
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
  logsListContainer: {
    marginTop: 12,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  logItemIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginRight: 12,
  },
  logItemContent: {
    flex: 1,
  },
  logItemSpecies: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  logItemDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    lineHeight: 18,
  },
  logItemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  logItemMetaText: {
    fontSize: 11,
    color: '#999',
  },
  emptyLogsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyLogsText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
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
