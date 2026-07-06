import type { CreateReviewPhotoUploadResponse } from '@lilocharge/shared-types';

import type { CreateReviewPhotoUploadDto } from './dto/create-review-photo-upload.dto';
import type { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';

interface UploadsServiceMock {
  readonly createReviewPhotoUpload: jest.Mock<
    CreateReviewPhotoUploadResponse,
    [string, CreateReviewPhotoUploadDto]
  >;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';

describe('UploadsController', () => {
  it('delegates review-photo presign requests to the uploads service', () => {
    const response: CreateReviewPhotoUploadResponse = {
      expiresAt: '2026-07-06T12:15:00.000Z',
      key: `review-photos/${USER_ID}/44444444-4444-4444-4444-444444444444.jpg`,
      publicUrl: `https://cdn.lilocharge.am/uploads/review-photos/${USER_ID}/44444444-4444-4444-4444-444444444444.jpg`,
      uploadUrl: 'https://minio.internal:9000/lilocharge-uploads/presigned',
    };
    const uploadsServiceMock: UploadsServiceMock = {
      createReviewPhotoUpload: jest
        .fn<CreateReviewPhotoUploadResponse, [string, CreateReviewPhotoUploadDto]>()
        .mockReturnValue(response),
    };
    const controller = new UploadsController(uploadsServiceMock as unknown as UploadsService);

    const payload: CreateReviewPhotoUploadDto = { contentType: 'image/jpeg' };

    expect(controller.createReviewPhotoUpload(USER_ID, payload)).toEqual(response);
    expect(uploadsServiceMock.createReviewPhotoUpload).toHaveBeenCalledWith(USER_ID, payload);
  });
});
