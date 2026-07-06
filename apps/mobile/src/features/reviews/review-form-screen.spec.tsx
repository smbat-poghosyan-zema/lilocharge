import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import { ApiClientError } from '../../api';
import { ReviewFormScreen } from './review-form-screen';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const STATION_ID = '22222222-2222-2222-2222-222222222222';

const mockBack = jest.fn<void, []>();
const mockReplace = jest.fn<void, [string]>();

let mockParams: { id?: string };
let mockedSessionState: { userId: string | null };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
  }),
}));

jest.mock('../onboarding/onboarding-session', () => ({
  useOnboardingSession: () => ({
    state: mockedSessionState,
  }),
}));

const launchImageLibraryMock = ImagePicker.launchImageLibraryAsync as jest.Mock;

interface ReviewsApiClientMock {
  readonly createReview: jest.Mock;
  readonly createReviewPhotoUpload: jest.Mock;
}

function createReviewsApiClientMock(): ReviewsApiClientMock {
  return {
    createReview: jest.fn(() =>
      Promise.resolve({
        comment: null,
        createdAt: '2026-07-06T10:00:00.000Z',
        id: '33333333-3333-3333-3333-333333333333',
        photos: [],
        rating: 4,
        stationId: STATION_ID,
        updatedAt: '2026-07-06T10:00:00.000Z',
        userId: USER_ID,
      }),
    ),
    createReviewPhotoUpload: jest.fn(() =>
      Promise.resolve({
        expiresAt: '2026-07-06T12:00:00.000Z',
        key: 'review-photos/user/photo.jpeg',
        publicUrl: 'https://cdn.example.com/photo-1.jpeg',
        uploadUrl: 'https://storage.example.com/presigned-put',
      }),
    ),
  };
}

describe('ReviewFormScreen', () => {
  beforeEach(() => {
    mockParams = { id: STATION_ID };
    mockedSessionState = { userId: USER_ID };
    launchImageLibraryMock.mockResolvedValue({ assets: null, canceled: true });
  });

  it('submits a review with rating and trimmed comment without photos', async () => {
    const reviewsApiClient = createReviewsApiClientMock();

    render(<ReviewFormScreen reviewsApiClient={reviewsApiClient} />);

    fireEvent.press(screen.getByTestId('review-form-star-4'));
    fireEvent.changeText(screen.getByTestId('review-form-comment-input'), '  Great station  ');
    fireEvent.press(screen.getByTestId('review-form-submit'));

    await waitFor(() => {
      expect(reviewsApiClient.createReview).toHaveBeenCalledWith(USER_ID, {
        comment: 'Great station',
        photos: undefined,
        rating: 4,
        stationId: STATION_ID,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('review-form-success')).toBeTruthy();
    });

    expect(reviewsApiClient.createReviewPhotoUpload).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('review-form-done'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('requires a star rating before submitting', () => {
    const reviewsApiClient = createReviewsApiClientMock();

    render(<ReviewFormScreen reviewsApiClient={reviewsApiClient} />);

    fireEvent.press(screen.getByTestId('review-form-submit'));

    expect(screen.getByTestId('review-form-error')).toBeTruthy();
    expect(reviewsApiClient.createReview).not.toHaveBeenCalled();
  });

  it('uploads picked photos through presigned URLs and submits their public URLs', async () => {
    const reviewsApiClient = createReviewsApiClientMock();
    const uploadPhotoFn = jest.fn(() => Promise.resolve());

    launchImageLibraryMock.mockResolvedValue({
      assets: [{ mimeType: 'image/png', uri: 'file:///photo-1.png' }],
      canceled: false,
    });

    render(
      <ReviewFormScreen reviewsApiClient={reviewsApiClient} uploadPhotoFn={uploadPhotoFn} />,
    );

    fireEvent.press(screen.getByTestId('review-form-add-photo'));

    await waitFor(() => {
      expect(screen.getByTestId('review-form-photo-0')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('review-form-star-5'));
    fireEvent.press(screen.getByTestId('review-form-submit'));

    await waitFor(() => {
      expect(reviewsApiClient.createReview).toHaveBeenCalledWith(USER_ID, {
        comment: undefined,
        photos: ['https://cdn.example.com/photo-1.jpeg'],
        rating: 5,
        stationId: STATION_ID,
      });
    });

    expect(reviewsApiClient.createReviewPhotoUpload).toHaveBeenCalledWith(USER_ID, {
      contentType: 'image/png',
    });
    expect(uploadPhotoFn).toHaveBeenCalledWith(
      'file:///photo-1.png',
      'https://storage.example.com/presigned-put',
      'image/png',
    );
  });

  it('removes a queued photo before submission', async () => {
    launchImageLibraryMock.mockResolvedValue({
      assets: [{ mimeType: 'image/jpeg', uri: 'file:///photo-1.jpeg' }],
      canceled: false,
    });

    render(<ReviewFormScreen reviewsApiClient={createReviewsApiClientMock()} />);

    fireEvent.press(screen.getByTestId('review-form-add-photo'));

    await waitFor(() => {
      expect(screen.getByTestId('review-form-photo-0')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('review-form-remove-photo-0'));

    expect(screen.queryByTestId('review-form-photo-0')).toBeNull();
  });

  it('submits without photos and shows a notice when presigning returns 503', async () => {
    const reviewsApiClient = createReviewsApiClientMock();
    const uploadPhotoFn = jest.fn(() => Promise.resolve());

    reviewsApiClient.createReviewPhotoUpload.mockRejectedValue(
      new ApiClientError('Storage unavailable', {
        code: 'HTTP_ERROR',
        path: `/users/${USER_ID}/uploads/review-photos`,
        statusCode: 503,
      }),
    );
    launchImageLibraryMock.mockResolvedValue({
      assets: [{ mimeType: 'image/jpeg', uri: 'file:///photo-1.jpeg' }],
      canceled: false,
    });

    render(
      <ReviewFormScreen reviewsApiClient={reviewsApiClient} uploadPhotoFn={uploadPhotoFn} />,
    );

    fireEvent.press(screen.getByTestId('review-form-add-photo'));

    await waitFor(() => {
      expect(screen.getByTestId('review-form-photo-0')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('review-form-star-3'));
    fireEvent.press(screen.getByTestId('review-form-submit'));

    await waitFor(() => {
      expect(reviewsApiClient.createReview).toHaveBeenCalledWith(USER_ID, {
        comment: undefined,
        photos: undefined,
        rating: 3,
        stationId: STATION_ID,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('review-form-notice')).toBeTruthy();
    });

    expect(uploadPhotoFn).not.toHaveBeenCalled();
  });

  it('shows an error when the review submission fails', async () => {
    const reviewsApiClient = createReviewsApiClientMock();

    reviewsApiClient.createReview.mockRejectedValue(new Error('network down'));

    render(<ReviewFormScreen reviewsApiClient={reviewsApiClient} />);

    fireEvent.press(screen.getByTestId('review-form-star-2'));
    fireEvent.press(screen.getByTestId('review-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('review-form-error')).toBeTruthy();
    });

    expect(screen.getByTestId('review-form-screen')).toBeTruthy();
  });

  it('shows a missing-station message when the route param is absent', () => {
    mockParams = {};

    render(<ReviewFormScreen reviewsApiClient={createReviewsApiClientMock()} />);

    expect(screen.getByTestId('review-form-missing-station')).toBeTruthy();
  });

  it('shows a sign-in prompt when signed out', () => {
    mockedSessionState = { userId: null };

    const reviewsApiClient = createReviewsApiClientMock();

    render(<ReviewFormScreen reviewsApiClient={reviewsApiClient} />);

    expect(screen.getByTestId('review-form-signed-out')).toBeTruthy();

    fireEvent.press(screen.getByTestId('review-form-sign-in'));

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/login');
  });
});
