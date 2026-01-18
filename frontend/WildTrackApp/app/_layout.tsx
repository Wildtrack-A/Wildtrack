import { Stack } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Platform, StatusBar, TextInput, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { searchAnimal } from '../services/api';

function MenuContent({ onClose, onSearchClick }: { onClose: () => void; onSearchClick: () => void }) {
  const router = useRouter();
  const pathname = usePathname();

  const menuItems = [
    { name: 'Login / Signup', route: '/login', icon: 'log-in-outline' as const },
    { name: 'Home', route: '/home', icon: 'home-outline' as const },
    { name: 'Map', route: '/map', icon: 'map-outline' as const },
    { name: 'Analytics', route: '/analytics', icon: 'stats-chart-outline' as const },
    { name: 'Debug Location', route: '/DebugLocation', icon: 'location-outline' as const },
    { name: 'Animal Encyclopedia', route: null, icon: 'book-outline' as const, action: 'search' },
  ];

  const handleNavigation = (item: any) => {
    if (item.action === 'search') {
      onSearchClick(); // This will close sidebar and open search modal
    } else if (item.route) {
      router.push(item.route as any);
      onClose();
    }
  };

  return (
    <>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.menuHeader}>
          <Text style={styles.menuTitle}>WildTrack</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <ScrollView 
        style={styles.menuContent} 
        contentContainerStyle={styles.menuContentContainer}
      >
        {menuItems.map((item, index) => {
          const isActive = pathname === item.route;
          return (
            <TouchableOpacity
              key={item.route || `menu-item-${index}`}
              style={[
                styles.menuItem,
                isActive && styles.menuItemActive,
              ]}
              onPress={() => handleNavigation(item)}
            >
              <Ionicons 
                name={item.icon} 
                size={24} 
                color={isActive ? '#007AFF' : '#000'} 
                style={styles.menuIcon}
              />
              <Text style={[
                styles.menuItemText,
                isActive && styles.menuItemTextActive,
              ]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </>
  );
}

function AnimalSearchModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [animalName, setAnimalName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ animal_name: string; information: string; source: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Helper function to clean and format markdown text
  const formatText = (text: string): string => {
    if (!text) return '';
    
    // Replace markdown bold (**text**) with cleaner formatting
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '$1');
    
    // Replace numbered lists with cleaner formatting
    formatted = formatted.replace(/^\d+\.\s+/gm, '• ');
    
    // Clean up extra whitespace
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    
    return formatted.trim();
  };

  const handleSearch = async () => {
    if (!animalName.trim()) {
      setError('Please enter an animal name');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await searchAnimal(animalName.trim());
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to search for animal information');
      console.error('Animal search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAnimalName('');
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.searchModalOverlay}
      >
        <TouchableOpacity
          style={styles.searchModalOverlay}
          activeOpacity={1}
          onPress={handleClose}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.searchModalContent}>
              <View style={styles.searchModalHeader}>
                <Text style={styles.searchModalTitle}>Animal Encyclopedia</Text>
                <TouchableOpacity onPress={handleClose}>
                  <Ionicons name="close" size={28} color="#333" />
                </TouchableOpacity>
              </View>

              <View style={styles.searchInputContainer}>
                <Ionicons name="paw-outline" size={20} color="#666" style={styles.searchInputIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search for an animal to learn more..."
                  placeholderTextColor="#999"
                  value={animalName}
                  onChangeText={setAnimalName}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.searchButton, loading && styles.searchButtonDisabled]}
                  onPress={handleSearch}
                  disabled={loading || !animalName.trim()}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="search" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>

              {error && (
                <View style={styles.searchErrorContainer}>
                  <Ionicons name="alert-circle-outline" size={20} color="#ff3b30" />
                  <Text style={styles.searchErrorText}>{error}</Text>
                </View>
              )}

              {loading && (
                <View style={styles.searchLoadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.searchLoadingText}>Loading information about {animalName.trim()}...</Text>
                  <Text style={styles.searchLoadingSubtext}>This may take a few seconds</Text>
                </View>
              )}

              {result && !loading && (
                <View style={styles.searchResultWrapper}>
                  <ScrollView 
                    style={styles.searchResultContainer}
                    contentContainerStyle={styles.searchResultContent}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                  >
                    <View style={styles.searchResultHeader}>
                      <View style={styles.searchResultIconContainer}>
                        <Ionicons name="paw" size={24} color="#007AFF" />
                      </View>
                      <Text style={styles.searchResultTitle}>{result.animal_name}</Text>
                    </View>
                    
                    <View style={styles.searchResultDivider} />
                    
                    <Text style={styles.searchResultText}>{formatText(result.information)}</Text>
                    
                    <View style={styles.searchResultFooter}>
                      <Ionicons name="information-circle-outline" size={14} color="#999" />
                      <Text style={styles.searchResultSource}>Powered by {result.source}</Text>
                    </View>
                  </ScrollView>
                </View>
              )}

              {!result && !loading && !error && (
                <View style={styles.searchPlaceholder}>
                  <Ionicons name="search-outline" size={48} color="#ccc" />
                  <Text style={styles.searchPlaceholderText}>
                    Search for any animal to learn about its characteristics, habitat, behavior, and more
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MenuButton() {
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuRenderKey, setMenuRenderKey] = useState(0);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const handleCloseMenu = () => {
    setMenuVisible(false);
  };

  const handleSearchClick = () => {
    setMenuVisible(false); // Close sidebar first
    // Use setTimeout to ensure sidebar closes before opening search modal
    setTimeout(() => {
      setShowSearchModal(true);
    }, 300); // Wait for sidebar animation to complete
  };

  return (
    <>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => {
          setMenuRenderKey(prev => prev + 1);
          setMenuVisible(true);
        }}
      >
        <Ionicons name="menu" size={28} color="#000" />
      </TouchableOpacity>
      
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseMenu}
      >
        <TouchableOpacity
          key={menuRenderKey}
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseMenu}
        >
          <View style={styles.menuContainer}>
            <MenuContent 
              key={menuRenderKey} 
              onClose={handleCloseMenu}
              onSearchClick={handleSearchClick}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Animal Search Modal - rendered at MenuButton level so it persists */}
      <AnimalSearchModal 
        visible={showSearchModal} 
        onClose={() => setShowSearchModal(false)} 
      />
    </>
  );
}

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLeft: () => <MenuButton />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'WildTrack',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="login"
        options={{
          title: 'Login',
        }}
      />
      <Stack.Screen
        name="home"
        options={{
          title: 'Home',
        }}
      />
      <Stack.Screen
        name="map"
        options={{
          title: 'Map',
        }}
      />
      <Stack.Screen
        name="analytics"
        options={{
          title: 'Analytics',
        }}
      />
      <Stack.Screen
        name="DebugLocation"
        options={{
          title: 'Debug Location',
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    marginLeft: 16,
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
  },
  menuContainer: {
    width: 280,
    height: '100%',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  safeArea: {
    backgroundColor: '#007AFF',
  },
  menuContent: {
    flex: 1,
  },
  menuContentContainer: {
    paddingTop: 8,
    paddingBottom: 20,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#007AFF',
  },
  menuTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingLeft: 20,
  },
  menuItemActive: {
    backgroundColor: '#E3F2FD',
  },
  menuIcon: {
    marginRight: 16,
  },
  menuItemText: {
    fontSize: 16,
    color: '#000',
  },
  menuItemTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  searchModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
  },
  searchModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    overflow: 'hidden',
  },
  searchModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  searchModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212529',
    letterSpacing: -0.5,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 52,
  },
  searchInputIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#212529',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  searchButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginLeft: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: '#adb5bd',
  },
  searchErrorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff3cd',
    padding: 14,
    borderRadius: 10,
    marginHorizontal: 20,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  searchErrorText: {
    color: '#856404',
    marginLeft: 10,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  searchResultWrapper: {
    flex: 1,
    marginTop: 8,
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  searchResultContainer: {
    flex: 1,
    maxHeight: 500,
  },
  searchResultContent: {
    padding: 20,
    paddingBottom: 24,
  },
  searchResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchResultIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e7f3ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  searchResultTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212529',
    flex: 1,
    letterSpacing: -0.5,
  },
  searchResultDivider: {
    height: 1,
    backgroundColor: '#dee2e6',
    marginBottom: 16,
  },
  searchResultText: {
    fontSize: 16,
    lineHeight: 26,
    color: '#495057',
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  searchResultFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    marginTop: 8,
  },
  searchResultSource: {
    fontSize: 12,
    color: '#6c757d',
    marginLeft: 6,
    fontWeight: '500',
  },
  searchLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
    marginTop: 20,
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    minHeight: 200,
  },
  searchLoadingText: {
    fontSize: 16,
    color: '#212529',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 24,
    fontWeight: '600',
  },
  searchLoadingSubtext: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    fontWeight: '400',
  },
  searchPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  searchPlaceholderText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 24,
    fontWeight: '500',
  },
});
