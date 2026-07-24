export type UploadedFile = {
  mimetype: string;
  buffer: Buffer;
};

export abstract class StorageService {
  abstract upload(file: UploadedFile): Promise<string>;
}
