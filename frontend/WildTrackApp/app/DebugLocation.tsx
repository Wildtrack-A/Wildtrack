import { useEffect } from 'react';
import * as Location from 'expo-location';
import { Alert } from 'react-native';

export default function DebugLocation() {
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      console.log('Location:', loc);
    })();
  }, []);

  return null;
}
