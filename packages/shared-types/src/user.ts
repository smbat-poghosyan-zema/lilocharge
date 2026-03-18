import type { SupportedLanguageCode } from './auth';

/** User profile payload returned by profile management endpoints. */
export interface UserProfileResponse {
  readonly id: string;
  readonly email: string;
  readonly phone: string | null;
  readonly displayName: string;
  readonly language: SupportedLanguageCode;
  readonly pushNotificationsEnabled: boolean;
  readonly marketingNotificationsEnabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Request payload for updating editable user profile fields. */
export interface UpdateUserProfileRequest {
  readonly displayName?: string;
  readonly phone?: string;
}

/** Request payload for switching active UI language preference. */
export interface UpdateUserLanguageRequest {
  readonly language: SupportedLanguageCode;
}

/** Request payload for updating user notification preference flags. */
export interface UpdateUserNotificationPreferencesRequest {
  readonly pushNotificationsEnabled?: boolean;
  readonly marketingNotificationsEnabled?: boolean;
}
