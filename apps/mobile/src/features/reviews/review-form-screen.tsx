import type { ReviewPhotoContentType } from '@lilocharge/shared-types';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { ApiClientError } from '../../api';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { FormField } from '../../components/ui/form-field';
import { ScreenContainer } from '../../components/ui/screen-container';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { normalizeRouteParam } from '../../utils/route-params';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import {
  resolveReviewPhotoContentType,
  reviewsApi,
  uploadReviewPhoto,
  type ReviewsApi,
} from './reviews-api';

const MAX_PHOTOS = 5;
const MAX_COMMENT_LENGTH = 1000;
const RATING_VALUES: readonly number[] = [1, 2, 3, 4, 5];

const CENTERED_CONTAINER_CLASS =
  'flex-1 items-center justify-center gap-2.5 bg-background px-6';
const ERROR_TEXT_CLASS = 'text-sm font-semibold text-danger';
const MUTED_TEXT_CLASS = 'mt-1.5 text-center text-[13px] text-text-muted';
const SECTION_TITLE_CLASS = 'text-[15px] font-bold text-text';
const MULTILINE_INPUT_STYLE = { minHeight: 96, textAlignVertical: 'top' } as const;

/** One locally picked review photo pending upload. */
interface PendingReviewPhoto {
  readonly contentType: ReviewPhotoContentType;
  readonly localUri: string;
}

/** Uploads one local photo's bytes to a presigned PUT URL. */
type ReviewPhotoUploader = (
  localUri: string,
  uploadUrl: string,
  contentType: ReviewPhotoContentType,
) => Promise<void>;

interface ReviewFormScreenProps {
  readonly reviewsApiClient?: Pick<ReviewsApi, 'createReview' | 'createReviewPhotoUpload'>;
  readonly uploadPhotoFn?: ReviewPhotoUploader;
}

/**
 * Station review form: tappable 1-5 star rating, optional comment, and up to
 * five photos uploaded through presigned URLs before the review is submitted.
 */
export function ReviewFormScreen({
  reviewsApiClient = reviewsApi,
  uploadPhotoFn = uploadReviewPhoto,
}: ReviewFormScreenProps = {}): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const stationId = normalizeRouteParam(params.id);
  const { state } = useOnboardingSession();
  const userId = state.userId;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<readonly PendingReviewPhoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPhotoNoticeVisible, setIsPhotoNoticeVisible] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  /**
   * Opens the system photo library and appends the picked image to the queue.
   */
  const handleAddPhoto = (): void => {
    if (photos.length >= MAX_PHOTOS) {
      return;
    }

    ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
      .then((pickResult: ImagePicker.ImagePickerResult): void => {
        if (pickResult.canceled) {
          return;
        }

        const pickedAsset = pickResult.assets?.[0];

        if (!pickedAsset) {
          return;
        }

        setFormError(null);
        setPhotos((previousPhotos) => {
          if (previousPhotos.length >= MAX_PHOTOS) {
            return previousPhotos;
          }

          return [
            ...previousPhotos,
            {
              contentType: resolveReviewPhotoContentType(pickedAsset.mimeType),
              localUri: pickedAsset.uri,
            },
          ];
        });
      })
      .catch((): void => {
        setFormError(t('reviews.form.errors.photoPickFailed'));
      });
  };

  /**
   * Removes one queued photo before submission.
   */
  const handleRemovePhoto = (photoIndex: number): void => {
    setPhotos((previousPhotos) => previousPhotos.filter((_, index) => index !== photoIndex));
  };

  /**
   * Uploads queued photos through presigned URLs and returns their public
   * URLs. Returns null (with the notice enabled) when server storage is
   * unconfigured (HTTP 503) so the review is submitted without photos.
   */
  const uploadQueuedPhotos = async (currentUserId: string): Promise<readonly string[] | null> => {
    const publicUrls: string[] = [];

    for (const photo of photos) {
      try {
        const presignedUpload = await reviewsApiClient.createReviewPhotoUpload(currentUserId, {
          contentType: photo.contentType,
        });

        await uploadPhotoFn(photo.localUri, presignedUpload.uploadUrl, photo.contentType);
        publicUrls.push(presignedUpload.publicUrl);
      } catch (error: unknown) {
        if (error instanceof ApiClientError && error.statusCode === 503) {
          return null;
        }

        throw error;
      }
    }

    return publicUrls;
  };

  /**
   * Validates the form, uploads photos, and submits the review.
   */
  const handleSubmit = (): void => {
    if (userId === null || stationId === null || isSubmitting) {
      return;
    }

    if (!RATING_VALUES.includes(rating)) {
      setFormError(t('reviews.form.errors.ratingRequired'));

      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const normalizedComment = comment.trim();

    uploadQueuedPhotos(userId)
      .then((photoUrls: readonly string[] | null): Promise<unknown> => {
        if (photoUrls === null) {
          setIsPhotoNoticeVisible(true);
        }

        const resolvedPhotoUrls = photoUrls ?? [];

        return reviewsApiClient.createReview(userId, {
          comment: normalizedComment.length > 0 ? normalizedComment : undefined,
          photos: resolvedPhotoUrls.length > 0 ? resolvedPhotoUrls : undefined,
          rating,
          stationId,
        });
      })
      .then((): void => {
        setIsSubmitting(false);
        setIsSubmitted(true);
      })
      .catch((): void => {
        setIsSubmitting(false);
        setFormError(t('reviews.form.errors.submitFailed'));
      });
  };

  if (stationId === null) {
    return (
      <View className={CENTERED_CONTAINER_CLASS}>
        <Text className={ERROR_TEXT_CLASS} testID="review-form-missing-station">
          {t('reviews.form.missingStation')}
        </Text>
      </View>
    );
  }

  if (userId === null) {
    return (
      <View className={CENTERED_CONTAINER_CLASS}>
        <Text className={MUTED_TEXT_CLASS} testID="review-form-signed-out">
          {t('reviews.form.signedOut.message')}
        </Text>
        <Button
          className="mt-3"
          onPress={(): void => {
            router.replace('/onboarding/login');
          }}
          testID="review-form-sign-in"
          title={t('reviews.form.signedOut.signIn')}
        />
      </View>
    );
  }

  if (isSubmitted) {
    return (
      <View className={CENTERED_CONTAINER_CLASS} testID="review-form-success">
        <Text className="text-xl font-bold text-primary-900">{t('reviews.form.success.title')}</Text>
        <Text className={MUTED_TEXT_CLASS}>{t('reviews.form.success.message')}</Text>
        {isPhotoNoticeVisible ? (
          <Text
            className="text-center text-[13px] font-semibold text-warning"
            testID="review-form-notice"
          >
            {t('reviews.form.photosUnavailable')}
          </Text>
        ) : null}
        <Button
          className="mt-3"
          onPress={(): void => {
            router.back();
          }}
          testID="review-form-done"
          title={t('reviews.form.success.done')}
        />
      </View>
    );
  }

  return (
    <ScreenContainer keyboardAvoiding scroll testID="review-form-screen">
      <View className="gap-3 p-4">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {t('reviews.form.title')}
        </Text>
        <Text className="text-[15px] text-neutral-700">{t('reviews.form.subtitle')}</Text>

        <Card>
          <Text className={SECTION_TITLE_CLASS}>{t('reviews.form.ratingLabel')}</Text>
          <View className="mt-2 flex-row gap-1">
            {RATING_VALUES.map((starValue) => {
              const isFilled = starValue <= rating;

              return (
                <Pressable
                  accessibilityLabel={t('reviews.form.starLabel', { value: starValue })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isFilled }}
                  key={starValue}
                  onPress={(): void => {
                    setRating(starValue);
                  }}
                  className="min-h-11 min-w-11 items-center justify-center p-1 active:opacity-75"
                  testID={`review-form-star-${starValue}`}
                >
                  <Text className={`text-3xl ${isFilled ? 'text-warning' : 'text-neutral-400'}`}>
                    {isFilled ? '★' : '☆'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <FormField
            accessibilityLabel={t('reviews.form.commentLabel')}
            label={t('reviews.form.commentLabel')}
            maxLength={MAX_COMMENT_LENGTH}
            multiline
            onChangeText={setComment}
            placeholder={t('reviews.form.commentPlaceholder')}
            style={MULTILINE_INPUT_STYLE}
            testID="review-form-comment-input"
            value={comment}
          />
        </Card>

        <Card>
          <Text className={SECTION_TITLE_CLASS}>
            {t('reviews.form.photosLabel', { count: photos.length })}
          </Text>
          {photos.map((photo, photoIndex) => (
            <View
              key={`${photo.localUri}-${photoIndex}`}
              className="mt-2.5 flex-row items-center gap-2.5"
              testID={`review-form-photo-${photoIndex}`}
            >
              <Image source={{ uri: photo.localUri }} className="h-14 w-14 rounded-[8px]" />
              <Pressable
                accessibilityLabel={t('reviews.form.removePhoto')}
                accessibilityRole="button"
                onPress={(): void => {
                  handleRemovePhoto(photoIndex);
                }}
                className="min-h-11 items-center justify-center rounded-full bg-danger-bg px-3.5 py-[7px] active:opacity-75"
                testID={`review-form-remove-photo-${photoIndex}`}
              >
                <Text className="text-[13px] font-bold text-danger dark:text-danger-100">
                  {t('reviews.form.removePhoto')}
                </Text>
              </Pressable>
            </View>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <Button
              className="mt-3 self-start"
              onPress={handleAddPhoto}
              testID="review-form-add-photo"
              title={t('reviews.form.addPhoto')}
              variant="secondary"
            />
          ) : null}
        </Card>

        {formError !== null ? (
          <Text className={ERROR_TEXT_CLASS} testID="review-form-error">
            {formError}
          </Text>
        ) : null}

        <Button
          className="mt-3"
          disabled={isSubmitting}
          onPress={handleSubmit}
          testID="review-form-submit"
          title={isSubmitting ? t('reviews.form.submitting') : t('reviews.form.submit')}
        />
      </View>
    </ScreenContainer>
  );
}
