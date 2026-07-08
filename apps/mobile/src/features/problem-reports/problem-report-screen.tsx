import { ProblemType } from '@lilocharge/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { FormField } from '../../components/ui/form-field';
import { ScreenContainer } from '../../components/ui/screen-container';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { normalizeRouteParam } from '../../utils/route-params';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import { problemReportsApi, type ProblemReportsApi } from './problem-reports-api';

const PROBLEM_TYPES: readonly ProblemType[] = Object.values(ProblemType);

const CENTERED_CONTAINER_CLASS =
  'flex-1 items-center justify-center gap-2.5 bg-background px-6';
const ERROR_TEXT_CLASS = 'text-sm font-semibold text-danger';
const MUTED_TEXT_CLASS = 'mt-1.5 text-center text-[13px] text-text-muted';
const SECTION_TITLE_CLASS = 'text-[15px] font-bold text-text';
const OPTION_CLASS =
  'mt-2 rounded-sm border border-border bg-neutral-50 px-3 py-2.5 active:opacity-75';
const OPTION_SELECTED_CLASS = 'border-primary bg-primary-50';
const OPTION_TEXT_CLASS = 'text-sm font-semibold text-text';
const MULTILINE_INPUT_STYLE = { minHeight: 96, textAlignVertical: 'top' } as const;

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
      <View className={CENTERED_CONTAINER_CLASS}>
        <Text className={ERROR_TEXT_CLASS} testID="problem-report-missing-station">
          {t('problemReports.form.missingStation')}
        </Text>
      </View>
    );
  }

  if (userId === null) {
    return (
      <View className={CENTERED_CONTAINER_CLASS}>
        <Text className={MUTED_TEXT_CLASS} testID="problem-report-signed-out">
          {t('problemReports.form.signedOut.message')}
        </Text>
        <Button
          className="mt-3"
          onPress={(): void => {
            router.replace('/onboarding/login');
          }}
          testID="problem-report-sign-in"
          title={t('problemReports.form.signedOut.signIn')}
        />
      </View>
    );
  }

  if (isSubmitted) {
    return (
      <View className={CENTERED_CONTAINER_CLASS} testID="problem-report-success">
        <Text className="text-xl font-bold text-primary-900">
          {t('problemReports.form.success.title')}
        </Text>
        <Text className={MUTED_TEXT_CLASS}>{t('problemReports.form.success.message')}</Text>
        <Button
          className="mt-3"
          onPress={(): void => {
            router.back();
          }}
          testID="problem-report-done"
          title={t('problemReports.form.success.done')}
        />
      </View>
    );
  }

  return (
    <ScreenContainer keyboardAvoiding scroll testID="problem-report-screen">
      <View className="gap-3 p-4">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {t('problemReports.form.title')}
        </Text>
        <Text className="text-[15px] text-neutral-700">{t('problemReports.form.subtitle')}</Text>

        <Card>
          <Text className={SECTION_TITLE_CLASS}>{t('problemReports.form.typeLabel')}</Text>
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
                className={`${OPTION_CLASS} ${isSelected ? OPTION_SELECTED_CLASS : ''}`}
                testID={`problem-report-type-${problemTypeOption}`}
              >
                <Text className={`${OPTION_TEXT_CLASS} ${isSelected ? 'text-primary-900' : ''}`}>
                  {t(`problemReports.form.types.${problemTypeOption}`)}
                </Text>
              </Pressable>
            );
          })}
        </Card>

        <Card>
          <FormField
            accessibilityLabel={t('problemReports.form.descriptionLabel')}
            label={t('problemReports.form.descriptionLabel')}
            multiline
            onChangeText={setDescription}
            placeholder={t('problemReports.form.descriptionPlaceholder')}
            style={MULTILINE_INPUT_STYLE}
            testID="problem-report-description-input"
            value={description}
          />
        </Card>

        {formError !== null ? (
          <Text className={ERROR_TEXT_CLASS} testID="problem-report-error">
            {formError}
          </Text>
        ) : null}

        <Button
          className="mt-3"
          disabled={isSubmitting}
          onPress={handleSubmit}
          testID="problem-report-submit"
          title={isSubmitting ? t('problemReports.form.submitting') : t('problemReports.form.submit')}
        />
      </View>
    </ScreenContainer>
  );
}
