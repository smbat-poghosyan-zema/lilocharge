import type {
  SupportedLanguageCode,
  UserProfileResponse,
  UpdateUserLanguageRequest,
  UpdateUserNotificationPreferencesRequest,
  UpdateUserProfileRequest,
} from '@lilocharge/shared-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Language, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const USER_NOT_FOUND_MESSAGE = 'User not found';
const PROFILE_UPDATE_REQUIRED_MESSAGE = 'At least one profile field must be provided';
const PROFILE_DISPLAY_NAME_EMPTY_MESSAGE = 'Display name cannot be empty';
const NOTIFICATION_UPDATE_REQUIRED_MESSAGE =
  'At least one notification preference field must be provided';

const USER_PROFILE_SELECT = {
  createdAt: true,
  displayName: true,
  email: true,
  id: true,
  language: true,
  marketingNotificationsEnabled: true,
  phone: true,
  pushNotificationsEnabled: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type UserProfileRecord = Prisma.UserGetPayload<{
  select: typeof USER_PROFILE_SELECT;
}>;

/** Service responsible for user profile CRUD and preference management flows. */
@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  /** Fetches a single user profile by id. */
  public async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: USER_PROFILE_SELECT,
    });

    if (user === null) {
      throw new NotFoundException(USER_NOT_FOUND_MESSAGE);
    }

    return mapUserRecordToProfileResponse(user);
  }

  /** Updates display name and/or phone on a user profile. */
  public async updateProfile(
    userId: string,
    request: UpdateUserProfileRequest,
  ): Promise<UserProfileResponse> {
    const data = buildProfileUpdateData(request);

    try {
      const user = await this.prismaService.user.update({
        where: { id: userId },
        data,
        select: USER_PROFILE_SELECT,
      });

      return mapUserRecordToProfileResponse(user);
    } catch (error: unknown) {
      throw mapUserMutationError(error, 'Phone number is already in use');
    }
  }

  /** Switches the preferred language for a user profile. */
  public async updateLanguage(
    userId: string,
    request: UpdateUserLanguageRequest,
  ): Promise<UserProfileResponse> {
    try {
      const user = await this.prismaService.user.update({
        where: { id: userId },
        data: {
          language: mapLanguageCodeToPrismaEnum(request.language),
        },
        select: USER_PROFILE_SELECT,
      });

      return mapUserRecordToProfileResponse(user);
    } catch (error: unknown) {
      throw mapUserMutationError(error);
    }
  }

  /** Updates notification preference flags for push and marketing messages. */
  public async updateNotificationPreferences(
    userId: string,
    request: UpdateUserNotificationPreferencesRequest,
  ): Promise<UserProfileResponse> {
    const data = buildNotificationPreferenceUpdateData(request);

    try {
      const user = await this.prismaService.user.update({
        where: { id: userId },
        data,
        select: USER_PROFILE_SELECT,
      });

      return mapUserRecordToProfileResponse(user);
    } catch (error: unknown) {
      throw mapUserMutationError(error);
    }
  }

  /** Deletes a user profile and all relationally cascading data. */
  public async deleteUser(userId: string): Promise<void> {
    try {
      await this.prismaService.user.delete({
        where: { id: userId },
      });
    } catch (error: unknown) {
      throw mapUserMutationError(error);
    }
  }
}

/** Maps Prisma language enum values to shared API language codes. */
function mapLanguageEnumToCode(language: Language): SupportedLanguageCode {
  switch (language) {
    case Language.RU:
      return 'ru';
    case Language.EN:
      return 'en';
    case Language.HY:
    default:
      return 'hy';
  }
}

/** Maps shared API language codes into Prisma's persisted language enum values. */
function mapLanguageCodeToPrismaEnum(languageCode: SupportedLanguageCode): Language {
  switch (languageCode) {
    case 'ru':
      return Language.RU;
    case 'en':
      return Language.EN;
    case 'hy':
    default:
      return Language.HY;
  }
}

/** Normalizes and validates profile update fields before persistence. */
function buildProfileUpdateData(request: UpdateUserProfileRequest): Prisma.UserUpdateInput {
  const data: Prisma.UserUpdateInput = {};

  if (request.displayName !== undefined) {
    const normalizedDisplayName = request.displayName.trim();
    if (normalizedDisplayName.length === 0) {
      throw new BadRequestException(PROFILE_DISPLAY_NAME_EMPTY_MESSAGE);
    }

    data.displayName = normalizedDisplayName;
  }

  if (request.phone !== undefined) {
    data.phone = request.phone.trim();
  }

  if (Object.keys(data).length === 0) {
    throw new BadRequestException(PROFILE_UPDATE_REQUIRED_MESSAGE);
  }

  return data;
}

/** Normalizes and validates notification preference update fields before persistence. */
function buildNotificationPreferenceUpdateData(
  request: UpdateUserNotificationPreferencesRequest,
): Prisma.UserUpdateInput {
  const data: Prisma.UserUpdateInput = {};

  if (request.pushNotificationsEnabled !== undefined) {
    data.pushNotificationsEnabled = request.pushNotificationsEnabled;
  }

  if (request.marketingNotificationsEnabled !== undefined) {
    data.marketingNotificationsEnabled = request.marketingNotificationsEnabled;
  }

  if (Object.keys(data).length === 0) {
    throw new BadRequestException(NOTIFICATION_UPDATE_REQUIRED_MESSAGE);
  }

  return data;
}

/** Maps selected user fields into the public API profile response payload. */
function mapUserRecordToProfileResponse(user: UserProfileRecord): UserProfileResponse {
  return {
    createdAt: user.createdAt.toISOString(),
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    language: mapLanguageEnumToCode(user.language),
    marketingNotificationsEnabled: user.marketingNotificationsEnabled,
    phone: user.phone,
    pushNotificationsEnabled: user.pushNotificationsEnabled,
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** Converts Prisma mutation errors into consistent HTTP exceptions. */
function mapUserMutationError(error: unknown, uniqueErrorMessage?: string): Error {
  if (isPrismaKnownRequestError(error, 'P2025')) {
    return new NotFoundException(USER_NOT_FOUND_MESSAGE);
  }

  if (isPrismaKnownRequestError(error, 'P2002') && uniqueErrorMessage !== undefined) {
    return new ConflictException(uniqueErrorMessage);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Unknown user mutation error');
}

/** Type guard for Prisma known request errors with a specific error code. */
function isPrismaKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}
