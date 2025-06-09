import {Storage} from '@google-cloud/storage';
import {Request} from 'express';
import path from 'path';

const storage = new Storage();
const bucket = storage.bucket(process.env.GOOGLE_STORAGE_BUCKET || '');

// Map file extensions to MIME types
const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export const uploadToGCS = async (
  file: Express.Multer.File,
  folder: string,
) => {
  // Skip .keep files
  if (file.originalname === '.keep') {
    throw new Error('Cannot upload .keep files');
  }
  const fileName = `${folder}/${file.originalname}`;
  const blob = bucket.file(fileName);

  // Get file extension and determine content type
  const ext = path.extname(file.originalname).toLowerCase();
  const contentType =
    mimeTypes[ext] || file.mimetype || 'application/octet-stream';

  // Only allow image files
  if (!contentType.startsWith('image/')) {
    throw new Error('Only image files are allowed');
  }

  // Create write stream with comprehensive metadata
  const blobStream = blob.createWriteStream({
    metadata: {
      contentType: contentType,
      cacheControl: 'public, max-age=31536000', // Cache for 1 year
      contentDisposition: 'inline', // This helps browsers display the image directly
    },
    public: true, // Make the file publicly accessible
    resumable: false,
  });

  return new Promise((resolve, reject) => {
    blobStream.on('error', error => reject(error));
    blobStream.on('finish', async () => {
      try {
        // Set comprehensive metadata including CORS headers
        await blob.setMetadata({
          contentType: contentType,
          cacheControl: 'public, max-age=31536000',
          metadata: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, PUT',
            'Access-Control-Expose-Headers': '*',
            'Access-Control-Max-Age': '86400',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });

        // Get the public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

        // Verify the file is accessible
        try {
          const [metadata] = await blob.getMetadata();
          console.log(
            `Successfully uploaded ${fileName} with metadata:`,
            metadata,
          );
        } catch (error) {
          console.warn(
            `Warning: Metadata verification failed for ${fileName}:`,
            error,
          );
        }

        resolve(publicUrl);
      } catch (error) {
        console.error(`Error processing ${fileName}:`, error);
        reject(error);
      }
    });

    blobStream.end(file.buffer);
  });
};
