import { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  TextInput, 
  ScrollView, 
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { journalAPI, logAPI, imageVerificationAPI } from '../services/api';

interface AnimalLog {
  id: string;
  animalName: string;
  species: string;
  location: string;
  notes: string;
  description: string;
  photoUri: string | null;
  latitude: number | null;
  longitude: number | null;
  timestamp: Date;
  journalId: string;
}

interface Journal {
  id: string;
  name: string;
  logs: AnimalLog[];
  createdAt: Date;
}

export default function Home() {
  const router = useRouter();
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [showLogDetailModal, setShowLogDetailModal] = useState(false);
  const [isEditingLog, setIsEditingLog] = useState(false);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AnimalLog | null>(null);
  const [newJournalName, setNewJournalName] = useState('');
  
  // Log form state
  const [species, setSpecies] = useState('');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [imageVerified, setImageVerified] = useState<boolean | null>(null); // null = not checked, true = verified, false = fake
  const [verifyingImage, setVerifyingImage] = useState(false);
  
  // Edit log state
  const [editSpecies, setEditSpecies] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Helper function to convert backend format to frontend format
  const convertBackendToFrontend = (backendJournal: any): Journal => {
    return {
      id: backendJournal.id,
      name: backendJournal.name,
      createdAt: new Date(backendJournal.created_at),
      logs: backendJournal.logs.map((log: any) => ({
        id: log.id,
        animalName: log.species, // Use species as animalName
        species: log.species,
        location: '',
        notes: '',
        description: log.description || '',
        photoUri: log.photo_uri,
        latitude: log.latitude || null,
        longitude: log.longitude || null,
        timestamp: new Date(log.timestamp),
        journalId: log.journal_id,
      })),
    };
  };

  // Load journals from backend with timeout
  const loadJournals = async () => {
    try {
      setLoading(true);
      
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout: Backend may be unavailable')), 10000); // 10 second timeout
      });
      
      const journalsPromise = journalAPI.getAllJournals();
      const backendJournals = await Promise.race([journalsPromise, timeoutPromise]) as any[];
      
      const convertedJournals = backendJournals.map(convertBackendToFrontend);
      setJournals(convertedJournals);
      console.log('✅ Successfully loaded journals:', convertedJournals.length);
    } catch (error: any) {
      console.error('❌ Error loading journals:', error);
      
      // Show user-friendly error message
      const errorMessage = error.message || 'Unknown error';
      Alert.alert(
        'Failed to Load Journals',
        `${errorMessage}\n\nPlease check:\n• Backend server is running\n• You're connected to the network\n• Backend URL is correct`,
        [
          { text: 'Retry', onPress: () => loadJournals() },
          { text: 'Continue Offline', onPress: () => setLoading(false) }
        ]
      );
      
      // Set empty journals array so user can still use the app
      setJournals([]);
    } finally {
      setLoading(false);
    }
  };

  // Load journals on mount
  useEffect(() => {
    loadJournals();
  }, []);

  const requestLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Location Permission Needed',
        'Location permission is required to record where you spotted the animal. This helps with wildlife tracking.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const getCurrentLocation = async () => {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    setLocationLoading(true);
    try {
      // Use GPS only (no cellular required)
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // Good balance between accuracy and speed
        mayShowUserSettingsDialog: true,
      });
      
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error: any) {
      console.error('Error getting location:', error);
      Alert.alert('Location Error', 'Could not get your location. Log will be saved without location data.');
      return null;
    } finally {
      setLocationLoading(false);
    }
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to take photos.');
      return false;
    }
    return true;
  };

  const takePicture = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setImageVerified(null); // Reset verification status when new image is uploaded
    }
  };

  const analyzeImageWithAI = async () => {
    if (!photoUri) {
      Alert.alert('Error', 'No image to analyze');
      return;
    }

    setVerifyingImage(true);
    try {
      const verification = await imageVerificationAPI.verifyImage(photoUri);
      setImageVerified(verification.is_real);
      
      if (verification.is_real) {
        Alert.alert(
          'Image Verified',
          `Image is verified as real (confidence: ${(verification.confidence * 100).toFixed(1)}%)`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Image Not Verified',
          `This image appears to be AI-generated or fake (confidence: ${(verification.confidence * 100).toFixed(1)}%). Please upload a real image.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('Error verifying image:', error);
      Alert.alert(
        'Verification Error',
        'Could not verify image. Please try again.',
        [{ text: 'OK' }]
      );
      setImageVerified(null);
    } finally {
      setVerifyingImage(false);
    }
  };

  const createJournal = async () => {
    if (!newJournalName.trim()) {
      Alert.alert('Error', 'Please enter a journal name');
      return;
    }

    const journalName = newJournalName.trim();
    setNewJournalName('');
    setShowJournalModal(false);

    // Optimistic UI update - show journal immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticJournal: Journal = {
      id: tempId,
      name: journalName,
      createdAt: new Date(),
      logs: [],
    };
    setJournals(prev => [...prev, optimisticJournal]);

    try {
      const backendJournal = await journalAPI.createJournal(journalName);
      const convertedJournal = convertBackendToFrontend(backendJournal);
      // Replace optimistic journal with real one using functional update
      setJournals(prev => prev.map(j => j.id === tempId ? convertedJournal : j));
      // Don't show alert - journal already visible
    } catch (error: any) {
      // Check if it's an audience error that requires re-authentication
      if (error.shouldSignOut || (error.message && error.message.toLowerCase().includes('audience'))) {
        // Remove optimistic journal on error using functional update
        setJournals(prev => prev.filter(j => j.id !== tempId));
        Alert.alert(
          'Session Expired',
          'Your session token is outdated. Please sign in again to continue.',
          [
            {
              text: 'Sign In',
              onPress: () => {
                router.replace('/login');
              }
            }
          ]
        );
      } else {
        // Remove optimistic journal on error using functional update
        setJournals(prev => prev.filter(j => j.id !== tempId));
        Alert.alert('Error', `Failed to create journal: ${error.message}`);
        console.error('Error creating journal:', error);
        setShowJournalModal(true); // Reopen modal so user can try again
        setNewJournalName(journalName);
      }
    }
  };

  const saveLog = async () => {
    if (!species.trim()) {
      Alert.alert('Error', 'Please enter a species name');
      return;
    }

    if (!selectedJournalId) {
      Alert.alert('Error', 'Please select a journal first');
      return;
    }

    // Validate journal ID is not a temp ID
    if (selectedJournalId.startsWith('temp-')) {
      Alert.alert(
        'Journal Not Ready',
        'The journal is still being created. Please wait a moment and try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Verify journal exists in local state
    const journalExists = journals.some(j => j.id === selectedJournalId);
    if (!journalExists) {
      Alert.alert(
        'Journal Not Found',
        'The selected journal could not be found. Please select a different journal or refresh the page.',
        [{ text: 'OK' }]
      );
      // Try to reload journals
      loadJournals();
      return;
    }

    // Check if image needs to be verified
    if (photoUri) {
      if (imageVerified === null) {
        Alert.alert(
          'Image Not Analyzed',
          'Please analyze the image with AI before saving the log.',
          [{ text: 'OK' }]
        );
        return;
      }
      if (imageVerified === false) {
        Alert.alert(
          'Invalid Image',
          'The image was detected as fake or AI-generated. Please upload a real image.',
          [{ text: 'OK' }]
        );
        return;
      }
    }

    // Use current location if available, otherwise try to get fresh location
    let location = currentLocation;
    if (!location) {
      location = await getCurrentLocation();
    }

    try {
      const backendLog = await logAPI.createLog(selectedJournalId, {
        species,
        description: description || undefined,
        photo_uri: photoUri,
        latitude: location?.latitude,
        longitude: location?.longitude,
      });

      // Convert backend log to frontend format
      const newLog: AnimalLog = {
        id: backendLog.id,
        animalName: backendLog.species,
        species: backendLog.species,
        location: '',
        notes: '',
        description: backendLog.description || '',
        photoUri: backendLog.photo_uri,
        latitude: backendLog.latitude || null,
        longitude: backendLog.longitude || null,
        timestamp: new Date(backendLog.timestamp),
        journalId: backendLog.journal_id,
      };

      // Update local state
      setJournals(journals.map(journal => 
        journal.id === selectedJournalId
          ? { ...journal, logs: [...journal.logs, newLog] }
          : journal
      ));

      // Reset form
      setSpecies('');
      setDescription('');
      setPhotoUri(null);
      setCurrentLocation(null);
      setImageVerified(null);
      setShowLogModal(false);
      Alert.alert('Success', 'Log entry saved!');
    } catch (error: any) {
      console.error('Error saving log:', error);
      
      // Provide more helpful error messages
      let errorMessage = 'Failed to save log entry.';
      
      if (error.message) {
        if (error.message.includes('Journal not found')) {
          errorMessage = 'The journal could not be found. It may have been deleted. Please select a different journal.';
          // Reload journals to sync state
          loadJournals();
        } else if (error.message.includes('permission')) {
          errorMessage = 'You don\'t have permission to add logs to this journal.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = error.message;
        }
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      Alert.alert('Error', errorMessage);
    }
  };

  const deleteJournal = (journalId: string) => {
    Alert.alert(
      'Delete Journal',
      'Are you sure you want to delete this journal? All logs in this journal will also be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic UI update - remove journal immediately
            const deletedJournal = journals.find(j => j.id === journalId);
            setJournals(prev => prev.filter(j => j.id !== journalId));
            if (selectedJournalId === journalId) {
              setSelectedJournalId(null);
            }

            try {
              await journalAPI.deleteJournal(journalId);
              // Success - journal already removed from UI, no alert needed
            } catch (error: any) {
              const errorMessage = error?.message || 'Unknown error';
              // If journal not found, it's already deleted - don't revert
              if (errorMessage.toLowerCase().includes('not found')) {
                // Journal was already deleted - this is fine, keep it removed from UI
                console.log('Journal already deleted, keeping UI state');
                return;
              }
              // For other errors, revert - add journal back
              if (deletedJournal) {
                setJournals(prev => [...prev, deletedJournal].sort((a, b) => 
                  b.createdAt.getTime() - a.createdAt.getTime()
                ));
              }
              Alert.alert('Error', `Failed to delete journal: ${errorMessage}`);
              console.error('Error deleting journal:', error);
            }
          },
        },
      ]
    );
  };

  const deleteLog = (logId: string, journalId: string) => {
    Alert.alert(
      'Delete Log',
      'Are you sure you want to delete this log entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic UI update - remove log immediately
            let deletedLog: AnimalLog | null = null;
            setJournals(prev => prev.map(journal => {
              if (journal.id === journalId) {
                deletedLog = journal.logs.find(log => log.id === logId) || null;
                return { ...journal, logs: journal.logs.filter(log => log.id !== logId) };
              }
              return journal;
            }));

            try {
              await logAPI.deleteLog(logId);
              // Success - log already removed from UI, no alert needed
            } catch (error: any) {
              // Revert on error - add log back
              if (deletedLog) {
                setJournals(prev => prev.map(journal => 
                  journal.id === journalId
                    ? { ...journal, logs: [...journal.logs, deletedLog!].sort((a, b) => 
                        b.timestamp.getTime() - a.timestamp.getTime()
                      ) }
                    : journal
                ));
              }
              Alert.alert('Error', `Failed to delete log: ${error.message}`);
              console.error('Error deleting log:', error);
            }
          },
        },
      ]
    );
  };

  const startEditingLog = () => {
    if (selectedLog) {
      setEditSpecies(selectedLog.species || '');
      setEditDescription(selectedLog.description || '');
      setIsEditingLog(true);
    }
  };

  const cancelEditingLog = () => {
    setIsEditingLog(false);
    setEditSpecies('');
    setEditDescription('');
  };

  const saveEditedLog = async () => {
    if (!selectedLog) return;

    if (!editSpecies.trim()) {
      Alert.alert('Error', 'Please enter a species name');
      return;
    }

    try {
      const backendLog = await logAPI.updateLog(selectedLog.id, {
        species: editSpecies,
        description: editDescription || undefined,
        photo_uri: selectedLog.photoUri,
      });

      // Convert backend log to frontend format
      const updatedLog: AnimalLog = {
        id: backendLog.id,
        animalName: backendLog.species,
        species: backendLog.species,
        location: '',
        notes: '',
        description: backendLog.description || '',
        photoUri: backendLog.photo_uri,
        latitude: backendLog.latitude || null,
        longitude: backendLog.longitude || null,
        timestamp: new Date(backendLog.timestamp),
        journalId: backendLog.journal_id,
      };

      setJournals(journals.map(journal => 
        journal.id === selectedLog.journalId
          ? { 
              ...journal, 
              logs: journal.logs.map(log => 
                log.id === selectedLog.id ? updatedLog : log
              )
            }
          : journal
      ));

      setSelectedLog(updatedLog);
      setIsEditingLog(false);
      Alert.alert('Success', 'Log updated!');
    } catch (error: any) {
      Alert.alert('Error', `Failed to update log: ${error.message}`);
      console.error('Error updating log:', error);
    }
  };

  const openLogModal = async () => {
    // Ensure a journal is selected
    if (!selectedJournalId) {
      Alert.alert(
        'No Journal Selected',
        'Please select a journal first before adding a log entry.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Check if selected journal is a temp ID (still being created)
    if (selectedJournalId.startsWith('temp-')) {
      Alert.alert(
        'Journal Not Ready',
        'Please wait for the journal to finish creating before adding log entries.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Verify journal exists in local state
    const journalExists = journals.some(j => j.id === selectedJournalId);
    if (!journalExists) {
      Alert.alert(
        'Journal Not Found',
        'The selected journal could not be found. Please select a different journal or try refreshing.',
        [
          { text: 'OK' },
          { text: 'Refresh', onPress: () => loadJournals() }
        ]
      );
      return;
    }
    
    if (journals.length === 0) {
      Alert.alert(
        'No Journals',
        'Please create a journal first to save your logs.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create Journal', onPress: () => setShowJournalModal(true) }
        ]
      );
      return;
    }
    // Reset log form state when opening modal
    setSpecies('');
    setDescription('');
    setPhotoUri(null);
    setCurrentLocation(null);
    
    // Get location when opening modal
    await getCurrentLocation();
    
    setShowLogModal(true);
  };

  const selectedJournal = journals.find(j => j.id === selectedJournalId);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading journals...</Text>
        <Text style={styles.loadingSubtext}>This should only take a few seconds</Text>
        <Text style={styles.loadingSubtext}>If this takes too long, check your backend connection</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>My Journals</Text>
          <TouchableOpacity 
            style={styles.newJournalButton}
            onPress={() => setShowJournalModal(true)}
          >
            <Ionicons name="add-circle-outline" size={24} color="#007AFF" />
            <Text style={styles.newJournalButtonText}>New Journal</Text>
          </TouchableOpacity>
        </View>

        {/* Journals List */}
        {journals.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="journal-outline" size={64} color="#ccc" />
            <Text style={styles.emptyStateText}>No journals yet</Text>
            <Text style={styles.emptyStateSubtext}>Create a journal to start logging animals</Text>
          </View>
        ) : (
          journals.map((journal) => (
            <TouchableOpacity
              key={journal.id}
              style={[
                styles.journalCard,
                selectedJournalId === journal.id && styles.journalCardSelected
              ]}
              onPress={() => setSelectedJournalId(journal.id)}
            >
              <View style={styles.journalHeader}>
                <View style={styles.journalInfo}>
                  <Ionicons 
                    name={selectedJournalId === journal.id ? "radio-button-on" : "radio-button-off"} 
                    size={20} 
                    color={selectedJournalId === journal.id ? "#007AFF" : "#999"} 
                  />
                  <Text style={styles.journalName}>{journal.name}</Text>
                </View>
                <View style={styles.journalHeaderRight}>
                  <Text style={styles.logCount}>{journal.logs.length} logs</Text>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      deleteJournal(journal.id);
                    }}
                    style={styles.deleteJournalButton}
                  >
                    <Ionicons name="trash-outline" size={22} color="#ff3b30" />
                  </TouchableOpacity>
                </View>
              </View>
              {journal.logs.length > 0 && (
                <View style={styles.recentLogs}>
                  {journal.logs.slice(0, 3).map((log) => (
                    <TouchableOpacity
                      key={log.id}
                      style={styles.logPreview}
                      onPress={() => {
                        setSelectedLog(log);
                        setShowLogDetailModal(true);
                      }}
                    >
                      {log.photoUri && (
                        <Image source={{ uri: log.photoUri }} style={styles.logPreviewImage} />
                      )}
                      <View style={styles.logPreviewInfo}>
                        <Text style={styles.logPreviewName}>{log.animalName}</Text>
                        <Text style={styles.logPreviewSpecies}>{log.species || 'Unknown species'}</Text>
                        {/* Location and Timestamp */}
                        <View style={styles.logPreviewMeta}>
                          {log.latitude && log.longitude && (
                            <View style={styles.logPreviewMetaItem}>
                              <Ionicons name="location" size={12} color="#666" />
                              <Text style={styles.logPreviewMetaText}>
                                {log.latitude.toFixed(4)}, {log.longitude.toFixed(4)}
                              </Text>
                            </View>
                          )}
                          <View style={styles.logPreviewMetaItem}>
                            <Ionicons name="time-outline" size={12} color="#666" />
                            <Text style={styles.logPreviewMetaText}>
                              {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          deleteLog(log.id, journal.id);
                        }}
                        style={styles.deleteLogButton}
                      >
                        <Ionicons name="trash-outline" size={18} color="#ff3b30" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {selectedJournalId === journal.id && (
                <TouchableOpacity 
                  style={styles.addLogButton}
                  onPress={openLogModal}
                >
                  <Ionicons name="add-circle" size={20} color="#007AFF" />
                  <Text style={styles.addLogButtonText}>Add Log Entry</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Journal Creation Modal - Top Positioned */}
      <Modal
        visible={showJournalModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowJournalModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowJournalModal(false)}
          >
            <View style={styles.topModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Create New Journal</Text>
                <TouchableOpacity onPress={() => setShowJournalModal(false)}>
                  <Ionicons name="close" size={28} color="#333" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter journal name..."
                placeholderTextColor="#999"
                value={newJournalName}
                onChangeText={setNewJournalName}
                autoFocus
                onSubmitEditing={createJournal}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.modalButton} onPress={createJournal}>
                <Text style={styles.modalButtonText}>Create Journal</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Log Entry Modal */}
      <Modal
        visible={showLogModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLogModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowLogModal(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Log New Animal</Text>
                  <TouchableOpacity onPress={() => setShowLogModal(false)}>
                    <Ionicons name="close" size={28} color="#333" />
                  </TouchableOpacity>
                </View>

                <ScrollView 
                  style={styles.logForm}
                  contentContainerStyle={styles.logFormContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* Selected Journal Display */}
                  {selectedJournal && (
                    <View style={styles.selectedJournalDisplay}>
                      <Ionicons name="journal" size={20} color="#007AFF" />
                      <Text style={styles.selectedJournalText}>{selectedJournal.name}</Text>
                    </View>
                  )}

                  {/* Photo Section */}
                  <TouchableOpacity style={styles.photoButton} onPress={takePicture}>
                    {photoUri ? (
                      <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Ionicons name="camera" size={48} color="#007AFF" />
                        <Text style={styles.photoPlaceholderText}>Take Photo</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Analyze with AI Button - only show if image is uploaded */}
                  {photoUri && (
                    <TouchableOpacity
                      style={[
                        styles.analyzeButton,
                        imageVerified === true && styles.analyzeButtonVerified,
                        imageVerified === false && styles.analyzeButtonFailed,
                        verifyingImage && styles.analyzeButtonLoading
                      ]}
                      onPress={analyzeImageWithAI}
                      disabled={verifyingImage}
                    >
                      {verifyingImage ? (
                        <>
                          <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                          <Text style={styles.analyzeButtonText}>Analyzing...</Text>
                        </>
                      ) : imageVerified === true ? (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                          <Text style={styles.analyzeButtonText}>Image Verified ✓</Text>
                        </>
                      ) : imageVerified === false ? (
                        <>
                          <Ionicons name="close-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                          <Text style={styles.analyzeButtonText}>Image Not Verified - Retry</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="sparkles" size={20} color="#fff" style={{ marginRight: 8 }} />
                          <Text style={styles.analyzeButtonText}>Analyze with AI</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* FIELD 1: Species Name */}
                  <View style={styles.inputContainer}>
                    <Ionicons name="paw-outline" size={20} color="#666" style={styles.inputIcon} />
                    <TextInput
                      key="species-input"
                      style={styles.inputField}
                      placeholder="enter species name"
                      placeholderTextColor="#999"
                      value={species}
                      onChangeText={setSpecies}
                      autoCapitalize="none"
                      autoCorrect={false}
                      blurOnSubmit={true}
                      returnKeyType="next"
                    />
                  </View>
                  
                  {/* FIELD 2: Description */}
                  <View style={[styles.inputContainer, styles.descriptionContainer]}>
                    <Ionicons name="document-text-outline" size={20} color="#666" style={styles.inputIcon} />
                    <TextInput
                      key="description-input"
                      style={[styles.inputField, styles.descriptionInputField]}
                      placeholder="Description [250 ch limit]..."
                      placeholderTextColor="#999"
                      value={description}
                      onChangeText={(text) => {
                        if (text.length <= 250) {
                          setDescription(text);
                        }
                      }}
                      multiline
                      textAlignVertical="top"
                      maxLength={250}
                      blurOnSubmit={true}
                      returnKeyType="done"
                    />
                  </View>
                  <Text style={styles.characterCount}>
                    {250 - description.length} characters remaining
                  </Text>

                  {/* Location Display */}
                  <View style={styles.locationDisplay}>
                    <Ionicons name="location-outline" size={20} color="#007AFF" style={styles.locationIcon} />
                    <View style={styles.locationInfo}>
                      {locationLoading ? (
                        <View style={styles.locationLoading}>
                          <ActivityIndicator size="small" color="#007AFF" />
                          <Text style={styles.locationText}>Getting location...</Text>
                        </View>
                      ) : currentLocation ? (
                        <View>
                          <Text style={styles.locationText}>
                            {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                          </Text>
                          <Text style={styles.locationLabel}>GPS Location</Text>
                        </View>
                      ) : (
                        <Text style={styles.locationTextUnavailable}>Location unavailable</Text>
                      )}
                    </View>
                    <TouchableOpacity 
                      onPress={getCurrentLocation}
                      style={styles.refreshLocationButton}
                      disabled={locationLoading}
                    >
                      <Ionicons 
                        name="refresh" 
                        size={20} 
                        color={locationLoading ? "#999" : "#007AFF"} 
                      />
                    </TouchableOpacity>
                  </View>
                </ScrollView>

                <TouchableOpacity style={styles.modalButton} onPress={saveLog}>
                  <Text style={styles.modalButtonText}>Save Log</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Log Detail Modal */}
      <Modal
        visible={showLogDetailModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLogDetailModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowLogDetailModal(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <View style={styles.logDetailModalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Log Details</Text>
                  <View style={styles.modalHeaderRight}>
                    {!isEditingLog ? (
                      <>
                        <TouchableOpacity 
                          onPress={startEditingLog}
                          style={styles.editButton}
                        >
                          <Ionicons name="create-outline" size={24} color="#007AFF" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => {
                          setShowLogDetailModal(false);
                          setIsEditingLog(false);
                        }}>
                          <Ionicons name="close" size={28} color="#333" />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity onPress={() => {
                        setShowLogDetailModal(false);
                        cancelEditingLog();
                      }}>
                        <Ionicons name="close" size={28} color="#333" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <ScrollView 
                  style={styles.logDetailScrollView}
                  contentContainerStyle={styles.logDetailScrollContent}
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                  scrollEnabled={true}
                  nestedScrollEnabled={true}
                  alwaysBounceVertical={true}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Image */}
                  {selectedLog?.photoUri && (
                    <View style={styles.logDetailImageContainer}>
                      <Image 
                        source={{ uri: selectedLog.photoUri }} 
                        style={styles.logDetailImage} 
                      />
                    </View>
                  )}

                  {/* Species Name */}
                  <View style={styles.logDetailSection}>
                    <Text style={styles.logDetailLabel}>Species Name</Text>
                    {isEditingLog ? (
                      <View style={styles.inputContainer}>
                        <Ionicons name="paw-outline" size={20} color="#666" style={styles.inputIcon} />
                        <TextInput
                          style={styles.inputField}
                          placeholder="enter species name"
                          placeholderTextColor="#999"
                          value={editSpecies}
                          onChangeText={setEditSpecies}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                    ) : (
                      <View style={styles.logDetailValueContainer}>
                        <Text style={styles.logDetailValue}>
                          {selectedLog?.species || 'Not specified'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Description */}
                  <View style={styles.logDetailSection}>
                    <Text style={styles.logDetailLabel}>Description</Text>
                    {isEditingLog ? (
                      <View style={[styles.inputContainer, styles.descriptionContainer]}>
                        <Ionicons name="document-text-outline" size={20} color="#666" style={styles.inputIcon} />
                        <TextInput
                          style={[styles.inputField, styles.descriptionInputField]}
                          placeholder="Description [250 ch limit]..."
                          placeholderTextColor="#999"
                          value={editDescription}
                          onChangeText={(text) => {
                            if (text.length <= 250) {
                              setEditDescription(text);
                            }
                          }}
                          multiline
                          textAlignVertical="top"
                          maxLength={250}
                        />
                      </View>
                    ) : (
                      <View style={styles.logDetailValueContainer}>
                        <Text style={styles.logDetailValue}>
                          {selectedLog?.description || 'No description provided'}
                        </Text>
                      </View>
                    )}
                    {isEditingLog && (
                      <Text style={styles.characterCount}>
                        {250 - editDescription.length} characters remaining
                      </Text>
                    )}
                  </View>

                  {/* Location */}
                  {selectedLog && (selectedLog.latitude || selectedLog.longitude) && (
                    <View style={styles.logDetailSection}>
                      <Text style={styles.logDetailLabel}>Location</Text>
                      <View style={styles.logDetailValueContainer}>
                        <View style={styles.locationDisplayRow}>
                          <Ionicons name="location" size={20} color="#007AFF" />
                          <Text style={styles.logDetailValue}>
                            {selectedLog.latitude?.toFixed(6)}, {selectedLog.longitude?.toFixed(6)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Timestamp */}
                  {selectedLog && (
                    <View style={styles.logDetailSection}>
                      <Text style={styles.logDetailLabel}>Date & Time</Text>
                      <View style={styles.logDetailValueContainer}>
                        <View style={styles.locationDisplayRow}>
                          <Ionicons name="time-outline" size={20} color="#007AFF" />
                          <Text style={styles.logDetailValue}>
                            {new Date(selectedLog.timestamp).toLocaleString([], {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}
                </ScrollView>

                {isEditingLog && (
                  <View style={styles.editButtonsContainer}>
                    <TouchableOpacity 
                      style={[styles.editActionButton, styles.cancelButton]} 
                      onPress={cancelEditingLog}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.editActionButton, styles.saveButton]} 
                      onPress={saveEditedLog}
                    >
                      <Text style={styles.saveButtonText}>Save Changes</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  newJournalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 20,
  },
  newJournalButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    marginLeft: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  journalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  journalCardSelected: {
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  journalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  journalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  journalName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 12,
  },
  journalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logCount: {
    fontSize: 14,
    color: '#666',
  },
  deleteJournalButton: {
    padding: 4,
  },
  recentLogs: {
    marginTop: 12,
  },
  logPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  logPreviewImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  logPreviewInfo: {
    flex: 1,
  },
  logPreviewName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  logPreviewSpecies: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  logPreviewMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 12,
  },
  logPreviewMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  logPreviewMetaText: {
    fontSize: 11,
    color: '#666',
  },
  deleteLogButton: {
    padding: 8,
    marginLeft: 8,
  },
  addLogButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  addLogButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  topModalContent: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    padding: 20,
    paddingTop: 60,
    marginTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    maxHeight: '90%',
    marginTop: 'auto',
  },
  logDetailModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    height: '85%',
    width: '90%',
    marginTop: 'auto',
    marginBottom: 'auto',
    marginHorizontal: '5%',
    display: 'flex',
    flexDirection: 'column',
  },
  logDetailScrollView: {
    flex: 1,
    height: 0, // Force bounded height for ScrollView
  },
  logDetailScrollContent: {
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  logForm: {
    flexGrow: 1,
  },
  logFormContent: {
    paddingBottom: 20,
  },
  selectedJournalDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  selectedJournalText: {
    marginLeft: 8,
    color: '#007AFF',
    fontWeight: '600',
  },
  photoButton: {
    marginBottom: 16,
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  photoPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  photoPlaceholderText: {
    marginTop: 8,
    color: '#007AFF',
    fontWeight: '600',
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  analyzeButtonVerified: {
    backgroundColor: '#34C759',
    shadowColor: '#34C759',
  },
  analyzeButtonFailed: {
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
  },
  analyzeButtonLoading: {
    opacity: 0.7,
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  descriptionContainer: {
    alignItems: 'flex-start',
    height: 140,
    paddingTop: 16,
    paddingBottom: 16,
  },
  inputIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  inputField: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    padding: 0,
  },
  descriptionInputField: {
    height: 120,
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: -12,
    marginBottom: 16,
  },
  locationDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  locationIcon: {
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  locationLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  locationTextUnavailable: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  refreshLocationButton: {
    padding: 8,
  },
  locationDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  logDetailImageContainer: {
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  logDetailImage: {
    width: '100%',
    height: 300,
    resizeMode: 'cover',
  },
  logDetailSection: {
    marginBottom: 20,
  },
  logDetailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logDetailValueContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
  },
  logDetailValue: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  editButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  editActionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
