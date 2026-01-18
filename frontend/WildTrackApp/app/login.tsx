import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signUp, signIn } from '../services/supabase';

export default function Login() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [isFieldResearcher, setIsFieldResearcher] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    try {
      setLoading(true);
      await signIn(email.trim(), password);
      router.replace('/home');
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert('Login Error', error.message || 'Failed to sign in. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      const role = isFieldResearcher ? 'field_researcher' : 'public';
      await signUp(email.trim(), password, undefined, role);
      Alert.alert('Success', 'Account created successfully! Please sign in.');
      setIsLogin(true);
      setPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Signup error:', error);
      Alert.alert('Signup Error', error.message || 'Failed to create account. Please try again.');
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
            onPress={() => {
              setIsLogin(true);
              setPassword('');
              setConfirmPassword('');
            }}
          >
            <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>
              Login
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, !isLogin && styles.tabActive]}
            onPress={() => {
              setIsLogin(false);
              setPassword('');
              setConfirmPassword('');
            }}
          >
            <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>
              Sign Up
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.formContainer}>
          {/* Email Input */}
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={24} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={24} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons 
                name={showPassword ? "eye-outline" : "eye-off-outline"} 
                size={24} 
                color="#666" 
              />
            </TouchableOpacity>
          </View>

          {/* Confirm Password (Sign Up only) */}
          {!isLogin && (
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={24} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Ionicons 
                  name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} 
                  size={24} 
                  color="#666" 
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Account Type Selection (Sign Up only) */}
          {!isLogin && (
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
          )}

          {/* Submit Button */}
          {loading ? (
            <View style={[styles.primaryButton, styles.loadingButton]}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.primaryButtonText}>
                {isLogin ? 'Signing in...' : 'Creating account...'}
              </Text>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.primaryButton} 
              onPress={isLogin ? handleLogin : handleSignup}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>
                {isLogin ? 'Sign In' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
});
