import type { UserProfileResponse } from '@lilocharge/shared-types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdorGuard } from '../auth/guards/idor.guard';
import { UpdateUserLanguageDto } from './dto/update-user-language.dto';
import { UpdateUserNotificationPreferencesDto } from './dto/update-user-notification-preferences.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UsersService } from './users.service';

/** Controller exposing user profile CRUD and preference management endpoints. */
@ApiTags('users')
@Controller('users')
@UseGuards(IdorGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Returns the profile for the requested user id. */
  @Get(':id')
  public async getProfile(
    @Param('id', ParseUUIDPipe) userId: string,
  ): Promise<UserProfileResponse> {
    return this.usersService.getProfile(userId);
  }

  /** Updates profile fields such as display name and phone number. */
  @Patch(':id/profile')
  public async updateProfile(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserProfileDto,
  ): Promise<UserProfileResponse> {
    return this.usersService.updateProfile(userId, dto);
  }

  /** Switches the preferred app language for the user. */
  @Patch(':id/language')
  public async switchLanguage(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserLanguageDto,
  ): Promise<UserProfileResponse> {
    return this.usersService.updateLanguage(userId, dto);
  }

  /** Updates user notification preference flags. */
  @Patch(':id/preferences/notifications')
  public async updateNotificationPreferences(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserNotificationPreferencesDto,
  ): Promise<UserProfileResponse> {
    return this.usersService.updateNotificationPreferences(userId, dto);
  }

  /** Deletes the user account and associated relational data. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deleteUser(@Param('id', ParseUUIDPipe) userId: string): Promise<void> {
    await this.usersService.deleteUser(userId);
  }
}
