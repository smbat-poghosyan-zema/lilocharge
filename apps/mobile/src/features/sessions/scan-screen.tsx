import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { ScreenContainer } from '../../components/ui/screen-container';
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
    <ScreenContainer keyboardAvoiding testID="scan-screen">
      <View className="border-b border-border bg-neutral-0 px-[18px] pb-3.5 pt-[22px]">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {t('sessions.scan.title')}
        </Text>
        <Text className="mt-1.5 text-sm text-neutral-500">{t('sessions.scan.subtitle')}</Text>
      </View>

      <View className="m-4 flex-1 overflow-hidden rounded-xl bg-neutral-900">
        {permission?.granted === true ? (
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }): void => {
              handleRawPayload(data);
            }}
            style={{ flex: 1 }}
            testID="scan-camera"
          />
        ) : (
          <View className="flex-1 items-center justify-center px-6" testID="scan-permission">
            <Text className="text-center text-[17px] font-bold text-neutral-0">
              {t('sessions.scan.permission.title')}
            </Text>
            <Text className="mt-2 text-center text-sm text-neutral-200">
              {t('sessions.scan.permission.message')}
            </Text>
            <Button
              className="mt-4"
              onPress={(): void => {
                void requestPermission();
              }}
              testID="scan-permission-grant"
              title={t('sessions.scan.permission.grant')}
            />
          </View>
        )}
      </View>

      <Card className="mx-4 mb-4 p-3.5">
        <Text className="text-sm font-semibold text-neutral-700">
          {t('sessions.scan.manual.label')}
        </Text>
        <TextInput
          accessibilityLabel={t('sessions.scan.manual.label')}
          autoCapitalize="none"
          autoCorrect={false}
          className="mt-2 rounded-sm border border-border bg-neutral-50 px-3 py-2.5 text-sm text-text"
          onChangeText={(value: string): void => {
            setManualValue(value);
            setHasInvalidPayload(false);
          }}
          placeholder={t('sessions.scan.manual.placeholder')}
          testID="scan-manual-input"
          value={manualValue}
        />
        {hasInvalidPayload ? (
          <Text className="mt-2 text-[13px] text-danger" testID="scan-error">
            {t('sessions.scan.errors.invalidCode')}
          </Text>
        ) : null}
        <Button
          className="mt-3"
          onPress={(): void => {
            handleRawPayload(manualValue);
          }}
          testID="scan-manual-submit"
          title={t('sessions.scan.manual.submit')}
        />
      </Card>
    </ScreenContainer>
  );
}
