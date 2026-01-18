import { Stack } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Platform, StatusBar } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

function MenuContent({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();

  const menuItems = [
    { name: 'Login / Signup', route: '/login', icon: 'log-in-outline' as const },
    { name: 'Home', route: '/home', icon: 'home-outline' as const },
    { name: 'Map', route: '/map', icon: 'map-outline' as const },
    { name: 'Analytics', route: '/analytics', icon: 'stats-chart-outline' as const },
    { name: 'Debug Location', route: '/DebugLocation', icon: 'location-outline' as const },
  ];

  const handleNavigation = (route: string) => {
    router.push(route as any);
    onClose();
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
        {menuItems.map((item) => {
          const isActive = pathname === item.route;
          return (
            <TouchableOpacity
              key={item.route}
              style={[
                styles.menuItem,
                isActive && styles.menuItemActive,
              ]}
              onPress={() => handleNavigation(item.route)}
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

function MenuButton() {
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuRenderKey, setMenuRenderKey] = useState(0);

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
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          key={menuRenderKey}
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <MenuContent key={menuRenderKey} onClose={() => setMenuVisible(false)} />
          </View>
        </TouchableOpacity>
      </Modal>
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
});
