import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';
import { parseChargeQrPayload, type ChargeQrPayload } from './charge-qr';

/**
 * QR scanning entry point of the two-tap charging flow.
 *
 * Scans charger QR codes with the device camera and offers a manual-entry
 * fallback so the flow stays usable without camera access.
 */
export function ScanScreen(): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [manualValue, setManualValue] = useState('');
  const [hasInvalidPayload, setHasInvalidPayload] = useState(false);
  const hasHandledPayloadRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      hasHandledPayloadRef.current = false;
    }, []),
  );

  /**
   * Navigates to the charge confirmation screen exactly once per focus.
   */
  const openConfirmScreen = (payload: ChargeQrPayload): void => {
    if (hasHandledPayloadRef.current) {
      return;
    }

    hasHandledPayloadRef.current = true;
    setHasInvalidPayload(false);

    const stationQuery = payload.stationId === undefined ? '' : `&stationId=${payload.stationId}`;

    router.push(`/charge/confirm?connectorId=${payload.connectorId}${stationQuery}`);
  };

  /**
   * Handles one scanned or manually entered raw QR payload.
   */
  const handleRawPayload = (rawValue: string): void => {
    const payload = parseChargeQrPayload(rawValue);

    if (payload === null) {
      setHasInvalidPayload(true);

      return;
    }

    openConfirmScreen(payload);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('sessions.scan.title')}
        </Text>
        <Text style={styles.subtitle}>{t('sessions.scan.subtitle')}</Text>
      </View>

      <View style={styles.cameraContainer}>
        {permission?.granted === true ? (
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }): void => {
              handleRawPayload(data);
            }}
            style={styles.camera}
            testID="scan-camera"
          />
        ) : (
          <View style={styles.permissionContainer} testID="scan-permission">
            <Text style={styles.permissionTitle}>{t('sessions.scan.permission.title')}</Text>
            <Text style={styles.permissionMessage}>{t('sessions.scan.permission.message')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={(): void => {
                void requestPermission();
              }}
              style={({ pressed }) => {
                return [styles.permissionButton, pressed ? styles.buttonPressed : null];
              }}
              testID="scan-permission-grant"
            >
              <Text style={styles.permissionButtonText}>{t('sessions.scan.permission.grant')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.manualContainer}>
        <Text style={styles.manualLabel}>{t('sessions.scan.manual.label')}</Text>
        <TextInput
          accessibilityLabel={t('sessions.scan.manual.label')}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value: string): void => {
            setManualValue(value);
            setHasInvalidPayload(false);
          }}
          placeholder={t('sessions.scan.manual.placeholder')}
          style={styles.manualInput}
          testID="scan-manual-input"
          value={manualValue}
        />
        {hasInvalidPayload ? (
          <Text style={styles.errorText} testID="scan-error">
            {t('sessions.scan.errors.invalidCode')}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            handleRawPayload(manualValue);
          }}
          style={({ pressed }) => {
            return [styles.manualButton, pressed ? styles.buttonPressed : null];
          }}
          testID="scan-manual-submit"
        >
          <Text style={styles.manualButtonText}>{t('sessions.scan.manual.submit')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonPressed: {
    opacity: 0.75,
  },
  camera: {
    flex: 1,
  },
  cameraContainer: {
    backgroundColor: '#111827',
    borderRadius: 18,
    flex: 1,
    margin: 16,
    overflow: 'hidden',
  },
  container: {
    backgroundColor: '#F3F4F6',
    flex: 1,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    marginTop: 8,
  },
  headerContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: 1,
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  manualButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 12,
    marginTop: 12,
    paddingVertical: 12,
  },
  manualButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  manualContainer: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 14,
    borderWidth: 1,
    margin: 16,
    marginTop: 0,
    padding: 14,
  },
  manualInput: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    borderRadius: 10,
    borderWidth: 1,
    color: '#111827',
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  manualLabel: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  permissionButton: {
    backgroundColor: '#0F766E',
    borderRadius: 999,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  permissionContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permissionMessage: {
    color: '#D1D5DB',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 14,
    marginTop: 6,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
});
