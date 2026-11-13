import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export interface UploadOptions {
  allowPdf?: boolean;
  onProgress?: (percent: number) => void;
}

export function validateUploadFile(file: File, allowPdf = false): string | null {
  const allowed = allowPdf ? ALLOWED_RECEIPT_TYPES : ALLOWED_IMAGE_TYPES;
  if (!allowed.includes(file.type)) {
    return allowPdf
      ? 'Unsupported file type. Please upload a JPEG, PNG, WEBP image, or PDF receipt.'
      : 'Unsupported image format. Please upload a JPEG, PNG, or WEBP image.';
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return 'File size must be between 1 byte and 5 MB.';
  }
  return null;
}

export async function uploadFileToStorage(
  file: File,
  storagePath: string,
  options: UploadOptions = {}
): Promise<string> {
  const validationError = validateUploadFile(file, options.allowPdf);
  if (validationError) {
    throw new Error(validationError);
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fullPath = `${storagePath}/${Date.now()}_${sanitizedName}`;
  const storageRef = ref(storage, fullPath);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (options.onProgress && snapshot.totalBytes > 0) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          options.onProgress(pct);
        }
      },
      (error) => {
        if (error.code === 'storage/unauthorized') {
          reject(new Error('Permission denied uploading file. Ensure you are signed in with a verified email.'));
        } else if (error.code === 'storage/unknown' || error.message?.includes('bucket')) {
          reject(
            new Error(
              'Firebase Storage bucket is not yet initialized. Please enable Storage in your Firebase Console and deploy storage.rules.'
            )
          );
        } else {
          reject(new Error(error.message || 'File upload failed.'));
        }
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (err: any) {
          reject(new Error(err?.message || 'Could not retrieve uploaded file URL.'));
        }
      }
    );
  });
}
