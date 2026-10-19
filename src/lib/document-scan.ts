// Shared "take a photo, pick a photo, or choose a file" picker -- used by
// the AI quick-add scan in transactions.tsx and by the bill-split receipt
// scan. Returns inline base64 + mime type, ready for parseFinancialDocument.
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type ScannedDocument = { base64Data: string; mimeType: string };

export async function pickFromCamera(): Promise<ScannedDocument | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera access is off for Tabby. Enable it in Settings to scan a receipt.');
  }
  const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset?.base64) return null;
  return { base64Data: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' };
}

export async function pickFromLibrary(): Promise<ScannedDocument | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo access is off for Tabby. Enable it in Settings to scan a receipt.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset?.base64) return null;
  return { base64Data: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' };
}

export async function pickFile(): Promise<ScannedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const base64Data = await FileSystemLegacy.readAsStringAsync(asset.uri, { encoding: 'base64' });
  return { base64Data, mimeType: asset.mimeType ?? 'application/pdf' };
}

// Presents the Take Photo / Choose Photo / Choose File action sheet and
// resolves with whichever one the user picked, or null if they cancelled
// at the sheet itself. A per-source error (permission denied, etc.) is
// thrown so callers can surface it the same way as any other error.
export function presentScanSheet(): Promise<ScannedDocument | null> {
  const sources: (() => Promise<ScannedDocument | null>)[] = [pickFromCamera, pickFromLibrary, pickFile];
  const options = ['Take Photo', 'Choose Photo', 'Choose File (PDF)', 'Cancel'];

  return new Promise((resolve, reject) => {
    const run = (index: number | undefined) => {
      const source = index === undefined ? undefined : sources[index];
      if (!source) {
        resolve(null);
        return;
      }
      source().then(resolve, reject);
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1 }, run);
    } else {
      Alert.alert('Scan a receipt or statement', undefined, [
        ...options.slice(0, -1).map((label, i) => ({ text: label, onPress: () => run(i) })),
        { text: 'Cancel', style: 'cancel' as const, onPress: () => run(undefined) },
      ]);
    }
  });
}
