import { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking, RefreshControl, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { redditSightingsAPI, RedditSighting } from '../services/api';

// All endangered species for filtering
const ENDANGERED_SPECIES = [
  'Tiger', 'Elephant', 'Rhino', 'Gorilla', 'Orangutan', 'Panda',
  'Polar Bear', 'Jaguar', 'Leopard', 'Snow Leopard', 'Cheetah',
  'Whale', 'Dolphin', 'Manatee', 'Sea Turtle', 'Sea Otter', 'Wolf',
  'Bison', 'Bear', 'Lynx', 'Bobcat', 'Cougar', 'Mountain Lion',
  'Condor', 'Eagle', 'Vulture', 'Albatross', 'Penguin', 'Crane',
  'Whooping Crane', 'Bald Eagle', 'Harpy Eagle', 'Owl', 'Hawk',
  'Tortoise', 'Komodo Dragon', 'Alligator', 'Crocodile',
  'Shark', 'Sturgeon', 'Salmon', 'Tuna',
];

export default function Analytics() {
  const [posts, setPosts] = useState<RedditSighting[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<RedditSighting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [scraping, setScraping] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  useEffect(() => {
    // Filter posts by selected species
    if (selectedSpecies) {
      const filtered = posts.filter(post => 
        post.species && post.species.some(s => 
          s.toLowerCase() === selectedSpecies.toLowerCase()
        )
      );
      setFilteredPosts(filtered);
    } else {
      setFilteredPosts(posts);
    }
  }, [selectedSpecies, posts]);

  const loadPosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const sightings = await redditSightingsAPI.getSightings({
        limit: 100,
        days: 30,
      });
      console.log(`✅ Loaded ${sightings.length} Reddit sightings`);
      setPosts(sightings);
      setFilteredPosts(sightings);
      if (sightings.length === 0) {
        console.log('⚠️ No Reddit sightings found in database. Use "Scrape Reddit Data" button to fetch headlines.');
      }
    } catch (error: any) {
      console.error('Error loading posts:', error);
      setError(error.message || 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  };

  const openRedditPost = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Error opening Reddit link:', err));
  };

  const formatTimeAgo = (timestamp: string | null | undefined) => {
    if (!timestamp) return 'Date unknown';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
      return `${Math.floor(diffDays / 30)}mo ago`;
    } catch {
      return 'Date unknown';
    }
  };

  const getSpeciesCount = () => {
    const speciesMap = new Map<string, number>();
    posts.forEach(post => {
      if (post.species && Array.isArray(post.species)) {
        post.species.forEach(species => {
          if (species) {
            const count = speciesMap.get(species) || 0;
            speciesMap.set(species, count + 1);
          }
        });
      }
    });
    return Array.from(speciesMap.entries())
      .sort((a, b) => b[1] - a[1]);
  };

  const availableSpecies = useMemo(() => getSpeciesCount(), [posts]);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Wildlife Analytics</Text>
          <Text style={styles.headerSubtitle}>Headlines powered by Reddit</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            onPress={async () => {
              if (scraping) return;
              try {
                setScraping(true);
                setError(null);
                await redditSightingsAPI.triggerScrape();
                Alert.alert(
                  'Scraper Started',
                  'Reddit scraper is running in the background. This may take 1-2 minutes. Pull down to refresh when ready.',
                  [{ text: 'OK' }]
                );
                // Poll for new data every 10 seconds for up to 2 minutes
                let attempts = 0;
                const maxAttempts = 12;
                const pollInterval = setInterval(async () => {
                  attempts++;
                  try {
                    const newSightings = await redditSightingsAPI.getSightings({
                      limit: 100,
                      days: 30,
                    });
                    if (newSightings.length > 0) {
                      clearInterval(pollInterval);
                      setPosts(newSightings);
                      setFilteredPosts(newSightings);
                      setScraping(false);
                      Alert.alert('Success', `${newSightings.length} Reddit headlines loaded!`);
                    } else if (attempts >= maxAttempts) {
                      clearInterval(pollInterval);
                      setScraping(false);
                      Alert.alert(
                        'Scraping Complete',
                        'Scraper finished but no new headlines were found. Try again later.'
                      );
                    }
                  } catch (err) {
                    console.log('Polling error (will retry):', err);
                  }
                }, 10000);
              } catch (err: any) {
                setError(err.message || 'Failed to trigger scraper');
                setScraping(false);
              }
            }}
            style={[styles.scrapeHeaderButton, scraping && styles.scrapeHeaderButtonDisabled]}
            disabled={scraping}
          >
            {scraping ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Ionicons name="download" size={20} color="#007AFF" />
            )}
            <Text style={styles.scrapeHeaderButtonText}>
              {scraping ? 'Scraping...' : 'Scrape'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
            <Ionicons name="refresh" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Cards */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.statsContainer}
        contentContainerStyle={styles.statsContent}
      >
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{posts.length}</Text>
          <Text style={styles.statLabel}>Total Posts</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{availableSpecies.length}</Text>
          <Text style={styles.statLabel}>Species</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{availableSpecies[0]?.[1] || 0}</Text>
          <Text style={styles.statLabel}>Top: {availableSpecies[0]?.[0] || 'N/A'}</Text>
        </View>
      </ScrollView>

      {/* Species Dropdown Filter */}
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

      {/* Dropdown Modal */}
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
                  All Species ({posts.length})
                </Text>
                {!selectedSpecies && <Ionicons name="checkmark" size={20} color="#007AFF" />}
              </TouchableOpacity>
              {availableSpecies.map(([species, count]) => (
                <TouchableOpacity
                  key={species}
                  style={[styles.dropdownItem, selectedSpecies === species && styles.dropdownItemActive]}
                  onPress={() => {
                    setSelectedSpecies(species);
                    setDropdownVisible(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, selectedSpecies === species && styles.dropdownItemTextActive]}>
                    {species} ({count})
                  </Text>
                  {selectedSpecies === species && <Ionicons name="checkmark" size={20} color="#007AFF" />}
                </TouchableOpacity>
              ))}
              {availableSpecies.length === 0 && (
                <View style={styles.dropdownEmpty}>
                  <Text style={styles.dropdownEmptyText}>No species found in posts</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Posts List */}
      {loading && posts.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading headlines...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadPosts}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="newspaper-outline" size={64} color="#999" />
          <Text style={styles.emptyTitle}>No Reddit Headlines Available</Text>
          <Text style={styles.emptyText}>
            No wildlife sightings have been scraped from Reddit yet. Click the button below to scrape Reddit data.
          </Text>
          <TouchableOpacity 
            style={[styles.scrapeButton, scraping && styles.scrapeButtonDisabled]} 
            onPress={async () => {
              if (scraping) return;
              try {
                setScraping(true);
                setError(null);
                setLoading(true);
                await redditSightingsAPI.triggerScrape();
                // Show message that scraping has started
                Alert.alert(
                  'Scraper Started',
                  'Reddit scraper is running in the background. This may take 1-2 minutes. The page will automatically refresh when data is available.',
                  [{ text: 'OK' }]
                );
                // Poll for new data every 10 seconds for up to 2 minutes
                let attempts = 0;
                const maxAttempts = 12; // 12 * 10 seconds = 2 minutes
                const pollInterval = setInterval(async () => {
                  attempts++;
                  try {
                    const newSightings = await redditSightingsAPI.getSightings({
                      limit: 100,
                      days: 30,
                    });
                    if (newSightings.length > 0) {
                      clearInterval(pollInterval);
                      setPosts(newSightings);
                      setFilteredPosts(newSightings);
                      setLoading(false);
                      setScraping(false);
                      Alert.alert('Success', `${newSightings.length} Reddit headlines loaded!`);
                    } else if (attempts >= maxAttempts) {
                      clearInterval(pollInterval);
                      setLoading(false);
                      setScraping(false);
                      Alert.alert(
                        'Scraping Complete',
                        'Scraper finished but no new headlines were found. Try again later or check the backend logs.'
                      );
                    }
                  } catch (err) {
                    // Continue polling on error
                    console.log('Polling error (will retry):', err);
                  }
                }, 10000); // Poll every 10 seconds
              } catch (err: any) {
                setError(err.message || 'Failed to trigger scraper');
                setLoading(false);
                setScraping(false);
              }
            }}
            disabled={scraping}
          >
            {scraping ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.scrapeButtonText}>Scraping...</Text>
              </>
            ) : (
              <>
                <Ionicons name="refresh" size={20} color="#fff" />
                <Text style={styles.scrapeButtonText}>Scrape Reddit Data</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : filteredPosts.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="newspaper-outline" size={64} color="#999" />
          <Text style={styles.emptyTitle}>
            {selectedSpecies ? `No posts found for ${selectedSpecies}` : 'No posts found'}
          </Text>
          <Text style={styles.emptyText}>
            {selectedSpecies 
              ? 'Try selecting a different species or clear the filter'
              : 'No posts match your filter criteria.'}
          </Text>
          {selectedSpecies && (
            <TouchableOpacity 
              style={styles.clearFilterButton} 
              onPress={() => setSelectedSpecies(null)}
            >
              <Text style={styles.clearFilterText}>Clear Filter</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.postsContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {selectedSpecies && (
            <View style={styles.filterBanner}>
              <Text style={styles.filterBannerText}>
                Showing {filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''} about {selectedSpecies}
              </Text>
            </View>
          )}
          {filteredPosts.map((post) => (
            <TouchableOpacity
              key={post.id}
              style={styles.postCard}
              onPress={() => openRedditPost(post.reddit_url)}
              activeOpacity={0.7}
            >
              <View style={styles.postHeader}>
                <View style={styles.postHeaderLeft}>
                  <Text style={styles.postTitle} numberOfLines={2}>
                    {post.title || 'Untitled Post'}
                  </Text>
                  <View style={styles.postMeta}>
                    <Text style={styles.postTime}>
                      {formatTimeAgo(post.timestamp)}
                    </Text>
                    <Text style={styles.postSubreddit}>
                      r/{post.subreddit || 'unknown'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </View>

              {post.species && post.species.length > 0 && (
                <View style={styles.speciesContainer}>
                  {post.species.slice(0, 3).map((species, idx) => (
                    <View key={idx} style={styles.speciesTag}>
                      <Ionicons name="paw" size={12} color="#FF6B6B" />
                      <Text style={styles.speciesText}>{species}</Text>
                    </View>
                  ))}
                  {post.species.length > 3 && (
                    <Text style={styles.moreSpeciesText}>+{post.species.length - 3}</Text>
                  )}
                </View>
              )}

              {post.content && (
                <Text style={styles.postContent} numberOfLines={2}>
                  {post.content}
                </Text>
              )}

              <View style={styles.postFooter}>
                <View style={styles.postStats}>
                  <Ionicons name="arrow-up" size={16} color="#999" />
                  <Text style={styles.postStatText}>{post.score || 0}</Text>
                  <Ionicons name="chatbubble" size={16} color="#999" style={styles.postStatIcon} />
                  <Text style={styles.postStatText}>{post.num_comments || 0}</Text>
                </View>
                <View style={styles.redditLink}>
                  <Ionicons name="logo-reddit" size={16} color="#FF4500" />
                  <Text style={styles.redditLinkText}>View on Reddit</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 5,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginTop: 2,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scrapeHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  scrapeHeaderButtonDisabled: {
    opacity: 0.6,
  },
  scrapeHeaderButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  refreshButton: {
    padding: 8,
  },
  statsContainer: {
    maxHeight: 120,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  statsContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  filterContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  dropdownEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontSize: 14,
    color: '#999',
  },
  filterBanner: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  filterBannerText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  postsContainer: {
    flex: 1,
    paddingBottom: 20,
  },
  postCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  postHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  postMeta: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  postTime: {
    fontSize: 12,
    color: '#999',
  },
  postSubreddit: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  speciesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  speciesTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE5E5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  speciesText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  moreSpeciesText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  postContent: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  postStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postStatIcon: {
    marginLeft: 12,
  },
  postStatText: {
    fontSize: 12,
    color: '#999',
    marginLeft: 4,
  },
  redditLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  redditLinkText: {
    fontSize: 12,
    color: '#FF4500',
    fontWeight: '500',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FF6B6B',
    textAlign: 'center',
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
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  clearFilterButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  clearFilterText: {
    color: '#fff',
    fontWeight: '600',
  },
  scrapeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  scrapeButtonDisabled: {
    opacity: 0.6,
  },
  scrapeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
