import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { StorageService, UploadedFile } from './storage.service';

@Injectable()
export class CloudinaryStorageService
  extends StorageService
  implements OnModuleInit
{
  constructor(private readonly config: ConfigService) {
    super();
  }

  onModuleInit() {
    cloudinary.config({
      cloud_name: this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  upload(file: UploadedFile): Promise<string> {
    const isImage = file.mimetype.startsWith('image/');

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'pocket-circle/receipts',
          resource_type: 'auto',
          ...(isImage && {
            transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
          }),
        },
        (error, result?: UploadApiResponse) => {
          if (error || !result) {
            reject(
              error instanceof Error
                ? error
                : new Error('Cloudinary upload failed'),
            );
            return;
          }

          if (result.resource_type === 'image') {
            resolve(
              cloudinary.url(result.public_id, {
                secure: true,
                quality: 'auto',
                fetch_format: 'auto',
              }),
            );
            return;
          }

          resolve(result.secure_url);
        },
      );

      stream.end(file.buffer);
    });
  }
}
