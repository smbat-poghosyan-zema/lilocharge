import type { ReviewPhotoContentType } from '@lilocharge/shared-types';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiClientError } from '../../api';
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
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText} testID="review-form-missing-station">
          {t('reviews.form.missingStation')}
        </Text>
      </View>
    );
  }

  if (userId === null) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.mutedText} testID="review-form-signed-out">
          {t('reviews.form.signedOut.message')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.replace('/onboarding/login');
          }}
          style={({ pressed }) => {
            return [styles.primaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="review-form-sign-in"
        >
          <Text style={styles.primaryButtonText}>{t('reviews.form.signedOut.signIn')}</Text>
        </Pressable>
      </View>
    );
  }

  if (isSubmitted) {
    return (
      <View style={styles.centeredContainer} testID="review-form-success">
        <Text style={styles.successTitle}>{t('reviews.form.success.title')}</Text>
        <Text style={styles.mutedText}>{t('reviews.form.success.message')}</Text>
        {isPhotoNoticeVisible ? (
          <Text style={styles.noticeText} testID="review-form-notice">
            {t('reviews.form.photosUnavailable')}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.back();
          }}
          style={({ pressed }) => {
            return [styles.primaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="review-form-done"
        >
          <Text style={styles.primaryButtonText}>{t('reviews.form.success.done')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      style={styles.container}
      testID="review-form-screen"
    >
      <Text accessibilityRole="header" style={styles.title}>
        {t('reviews.form.title')}
      </Text>
      <Text style={styles.subtitle}>{t('reviews.form.subtitle')}</Text>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('reviews.form.ratingLabel')}</Text>
        <View style={styles.starRow}>
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
                style={({ pressed }) => {
                  return [styles.starButton, pressed ? styles.buttonPressed : null];
                }}
                testID={`review-form-star-${starValue}`}
              >
                <Text style={[styles.starText, isFilled ? styles.starTextFilled : null]}>
                  {isFilled ? '★' : '☆'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('reviews.form.commentLabel')}</Text>
        <TextInput
          maxLength={MAX_COMMENT_LENGTH}
          multiline
          onChangeText={setComment}
          placeholder={t('reviews.form.commentPlaceholder')}
          style={[styles.textInput, styles.commentInput]}
          testID="review-form-comment-input"
          value={comment}
        />
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          {t('reviews.form.photosLabel', { count: photos.length })}
        </Text>
        {photos.map((photo, photoIndex) => (
          <View
            key={`${photo.localUri}-${photoIndex}`}
            style={styles.photoRow}
            testID={`review-form-photo-${photoIndex}`}
          >
            <Image source={{ uri: photo.localUri }} style={styles.photoThumbnail} />
            <Pressable
              accessibilityRole="button"
              onPress={(): void => {
                handleRemovePhoto(photoIndex);
              }}
              style={({ pressed }) => {
                return [styles.removePhotoButton, pressed ? styles.buttonPressed : null];
              }}
              testID={`review-form-remove-photo-${photoIndex}`}
            >
              <Text style={styles.removePhotoButtonText}>{t('reviews.form.removePhoto')}</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleAddPhoto}
            style={({ pressed }) => {
              return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
            }}
            testID="review-form-add-photo"
          >
            <Text style={styles.secondaryButtonText}>{t('reviews.form.addPhoto')}</Text>
          </Pressable>
        ) : null}
      </View>

      {formError !== null ? (
        <Text style={styles.errorText} testID="review-form-error">
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
        testID="review-form-submit"
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting ? t('reviews.form.submitting') : t('reviews.form.submit')}
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
  commentInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  container: {
    backgroundColor: '#F3F4F6',
    flex: 1,
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
  noticeText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  photoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  photoThumbnail: {
    borderRadius: 8,
    height: 56,
    width: 56,
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
  removePhotoButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  removePhotoButtonText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    gap: 12,
    padding: 16,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#0F766E',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: '#0F766E',
    fontSize: 14,
    fontWeight: '700',
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
  starButton: {
    padding: 4,
  },
  starRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
  },
  starText: {
    color: '#9CA3AF',
    fontSize: 30,
  },
  starTextFilled: {
    color: '#D97706',
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
  textInput: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 10,
    borderWidth: 1,
    color: '#111827',
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
});
