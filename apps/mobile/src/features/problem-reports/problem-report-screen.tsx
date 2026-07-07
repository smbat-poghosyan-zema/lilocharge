import { ProblemType } from '@lilocharge/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';
import { normalizeRouteParam } from '../../utils/route-params';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import { problemReportsApi, type ProblemReportsApi } from './problem-reports-api';

const PROBLEM_TYPES: readonly ProblemType[] = Object.values(ProblemType);

interface ProblemReportScreenProps {
  readonly problemReportsApiClient?: ProblemReportsApi;
}

/**
 * Station problem-report form: problem-type picker over the shared enum, a
 * required description, and a success state after submission.
 */
export function ProblemReportScreen({
  problemReportsApiClient = problemReportsApi,
}: ProblemReportScreenProps = {}): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const stationId = normalizeRouteParam(params.id);
  const { state } = useOnboardingSession();
  const userId = state.userId;
  const [problemType, setProblemType] = useState<ProblemType>(ProblemType.OFFLINE);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  /**
   * Validates and submits the problem report.
   */
  const handleSubmit = (): void => {
    if (userId === null || stationId === null || isSubmitting) {
      return;
    }

    const normalizedDescription = description.trim();

    if (normalizedDescription.length === 0) {
      setFormError(t('problemReports.form.errors.descriptionRequired'));

      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    problemReportsApiClient
      .createProblemReport(userId, {
        description: normalizedDescription,
        problemType,
        stationId,
      })
      .then((): void => {
        setIsSubmitting(false);
        setIsSubmitted(true);
      })
      .catch((): void => {
        setIsSubmitting(false);
        setFormError(t('problemReports.form.errors.submitFailed'));
      });
  };

  if (stationId === null) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText} testID="problem-report-missing-station">
          {t('problemReports.form.missingStation')}
        </Text>
      </View>
    );
  }

  if (userId === null) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.mutedText} testID="problem-report-signed-out">
          {t('problemReports.form.signedOut.message')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.replace('/onboarding/login');
          }}
          style={({ pressed }) => {
            return [styles.primaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="problem-report-sign-in"
        >
          <Text style={styles.primaryButtonText}>{t('problemReports.form.signedOut.signIn')}</Text>
        </Pressable>
      </View>
    );
  }

  if (isSubmitted) {
    return (
      <View style={styles.centeredContainer} testID="problem-report-success">
        <Text style={styles.successTitle}>{t('problemReports.form.success.title')}</Text>
        <Text style={styles.mutedText}>{t('problemReports.form.success.message')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.back();
          }}
          style={({ pressed }) => {
            return [styles.primaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="problem-report-done"
        >
          <Text style={styles.primaryButtonText}>{t('problemReports.form.success.done')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      style={styles.container}
      testID="problem-report-screen"
    >
      <Text accessibilityRole="header" style={styles.title}>
        {t('problemReports.form.title')}
      </Text>
      <Text style={styles.subtitle}>{t('problemReports.form.subtitle')}</Text>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('problemReports.form.typeLabel')}</Text>
        {PROBLEM_TYPES.map((problemTypeOption) => {
          const isSelected = problemType === problemTypeOption;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              key={problemTypeOption}
              onPress={(): void => {
                setProblemType(problemTypeOption);
              }}
              style={({ pressed }) => {
                return [
                  styles.typeOption,
                  isSelected ? styles.typeOptionSelected : null,
                  pressed ? styles.buttonPressed : null,
                ];
              }}
              testID={`problem-report-type-${problemTypeOption}`}
            >
              <Text
                style={[
                  styles.typeOptionText,
                  isSelected ? styles.typeOptionTextSelected : null,
                ]}
              >
                {t(`problemReports.form.types.${problemTypeOption}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('problemReports.form.descriptionLabel')}</Text>
        <TextInput
          multiline
          onChangeText={setDescription}
          placeholder={t('problemReports.form.descriptionPlaceholder')}
          style={styles.descriptionInput}
          testID="problem-report-description-input"
          value={description}
        />
      </View>

      {formError !== null ? (
        <Text style={styles.errorText} testID="problem-report-error">
          {formError}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={isSubmitting}
        onPress={handleSubmit}
        style={({ pressed }) => {
          return [styles.primaryButton, pressed ? styles.buttonPressed : null];
        }}
        testID="problem-report-submit"
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting
            ? t('problemReports.form.submitting')
            : t('problemReports.form.submit')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  buttonPressed: {
    opacity: 0.75,
  },
  centeredContainer: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  container: {
    backgroundColor: '#F3F4F6',
    flex: 1,
  },
  descriptionInput: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 10,
    borderWidth: 1,
    color: '#111827',
    fontSize: 14,
    marginTop: 8,
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '600',
  },
  mutedText: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 12,
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  scrollContent: {
    gap: 12,
    padding: 16,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: '#374151',
    fontSize: 15,
  },
  successTitle: {
    color: '#065F46',
    fontSize: 20,
    fontWeight: '700',
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
  typeOption: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typeOptionSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#0F766E',
  },
  typeOptionText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  typeOptionTextSelected: {
    color: '#065F46',
  },
});
