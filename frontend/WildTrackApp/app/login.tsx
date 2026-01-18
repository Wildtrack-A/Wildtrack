import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginWithAuth0 } from '../services/auth0';
import { syncUserProfile } from '../services/api';

const PENDING_ACCOUNT_TYPE_KEY = '@wildtrack:pending_account_type';

export default function Login() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [isFieldResearcher, setIsFieldResearcher] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
      
      // Use Auth0 Universal Login (redirects to browser) - explicitly show login screen
      const token = await loginWithAuth0('login');
      
      if (token) {
        // Sync user profile with backend
        try {
          await syncUserProfile();
        } catch (error) {
          console.warn('Profile sync failed, continuing anyway:', error);
        }
        
        // Navigate to home
        router.replace('/home');
      } else {
        Alert.alert('Login Failed', 'Could not complete authentication. Please try again.');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert('Login Error', error.message || 'An error occurred during login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    // Auth0 handles signup through Universal Login
    // The login and signup both use the same Auth0 flow
    // Auth0's Universal Login page has a "Sign Up" link
    
    try {
      setLoading(true);
      
      // Store the account type selection before redirecting to Auth0
      // This will be retrieved after successful Auth0 authentication
      const accountRole = isFieldResearcher ? 'field_researcher' : 'public';
      console.log('📝 Storing account type for signup:', accountRole);
      await AsyncStorage.setItem(PENDING_ACCOUNT_TYPE_KEY, accountRole);
      
      // Use Auth0 Universal Login - explicitly show signup screen
      const token = await loginWithAuth0('signup');
      
      if (token) {
        // Retrieve the stored account type and sync profile
        try {
          const storedRole = await AsyncStorage.getItem(PENDING_ACCOUNT_TYPE_KEY);
          const role = (storedRole === 'field_researcher' || storedRole === 'public') 
            ? storedRole as 'field_researcher' | 'public' 
            : undefined;
          
          console.log('📝 Retrieved account type from storage:', storedRole, '→ Using role:', role);
          
          // Clear the pending account type after use
          await AsyncStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);
          
          // Sync user profile with the selected role
          await syncUserProfile(role);
        } catch (error) {
          console.warn('Profile sync failed, continuing anyway:', error);
          // Clear pending account type even if sync fails
          await AsyncStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);
        }
        
        // Navigate to home
        router.replace('/home');
      } else {
        // Clear pending account type if login failed
        await AsyncStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);
        Alert.alert('Signup Failed', 'Could not complete registration. Please try again.');
      }
    } catch (error: any) {
      // Clear pending account type on error
      await AsyncStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);
      console.error('Signup error:', error);
      Alert.alert('Signup Error', error.message || 'An error occurred during signup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>WildTrack</Text>
          <Text style={styles.subtitle}>
            {isLogin ? 'Welcome back!' : 'Create your account'}
          </Text>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, isLogin && styles.tabActive]}
            onPress={() => setIsLogin(true)}
          >
            <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>
              Login
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, !isLogin && styles.tabActive]}
            onPress={() => setIsLogin(false)}
          >
            <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>
              Sign Up
            </Text>
          </TouchableOpacity>
        </View>

        {/* Login Form */}
        {isLogin ? (
          <View style={styles.formContainer}>
            {/* Auth0 Universal Login - no username/password needed */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={24} color="#007AFF" style={styles.infoIcon} />
              <Text style={styles.infoText}>
                Click the button below to securely sign in with Auth0. You'll be redirected to a secure login page.
              </Text>
            </View>

            {loading ? (
              <View style={[styles.primaryButton, styles.loadingButton]}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.primaryButtonText}>Authenticating...</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
                <Text style={styles.primaryButtonText}>Continue with Auth0</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.helperText}>
              You'll be redirected to Auth0 to sign in securely
            </Text>
          </View>
        ) : (
          /* Sign Up Form */
          <View style={styles.formContainer}>
            {/* Auth0 handles username/password - no form fields needed */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={24} color="#007AFF" style={styles.infoIcon} />
              <Text style={styles.infoText}>
                Select your account type below, then click "Continue with Auth0" to create your account. Auth0 will handle your email and password securely.
              </Text>
            </View>

            {/* Account Type Selection */}
            <View style={styles.accountTypeContainer}>
              <Text style={styles.accountTypeTitle}>Account Type</Text>
              <Text style={styles.accountTypeSubtitle}>
                Select the option that best describes your use case
              </Text>
              
              {/* Personal User Option */}
              <TouchableOpacity 
                style={[
                  styles.accountTypeOption,
                  !isFieldResearcher && styles.accountTypeOptionSelected
                ]}
                onPress={() => setIsFieldResearcher(false)}
                activeOpacity={0.7}
              >
                <View style={[styles.radioButton, !isFieldResearcher && styles.radioButtonSelected]}>
                  {!isFieldResearcher && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
                <View style={styles.accountTypeContent}>
                  <Text style={[
                    styles.accountTypeLabel,
                    !isFieldResearcher && styles.accountTypeLabelSelected
                  ]}>
                    Personal Use
                  </Text>
                  <Text style={styles.accountTypeDescription}>
                    For individual tracking and personal wildlife observation
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Field Researcher Option */}
              <TouchableOpacity 
                style={[
                  styles.accountTypeOption,
                  isFieldResearcher && styles.accountTypeOptionSelected
                ]}
                onPress={() => setIsFieldResearcher(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.radioButton, isFieldResearcher && styles.radioButtonSelected]}>
                  {isFieldResearcher && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
                <View style={styles.accountTypeContent}>
                  <Text style={[
                    styles.accountTypeLabel,
                    isFieldResearcher && styles.accountTypeLabelSelected
                  ]}>
                    Field Researcher
                  </Text>
                  <Text style={styles.accountTypeDescription}>
                    For professional research, data collection, and scientific studies
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={[styles.primaryButton, styles.loadingButton]}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.primaryButtonText}>Authenticating...</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.primaryButton} onPress={handleSignup} disabled={loading}>
                <Text style={styles.primaryButtonText}>Continue with Auth0</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.helperText}>
              You'll be redirected to Auth0 to create your account
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  formContainer: {
    width: '100%',
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
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  eyeIcon: {
    padding: 4,
  },
  accountTypeContainer: {
    marginTop: 8,
    marginBottom: 20,
  },
  accountTypeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  accountTypeSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  accountTypeOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  accountTypeOptionSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  radioButtonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#fff',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  accountTypeContent: {
    flex: 1,
  },
  accountTypeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  accountTypeLabelSelected: {
    color: '#007AFF',
  },
  accountTypeDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loadingButton: {
    flexDirection: 'row',
    gap: 8,
    opacity: 0.8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  infoIcon: {
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 20,
  },
});
