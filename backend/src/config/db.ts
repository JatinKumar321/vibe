import {env} from '../utils/env';

export const dbConfig = {
  url: env('DB_URL'),
  dbName: env('DB_NAME') || 'vibe',
};

console.log('DEBUG: DB_URL from env in db.ts:', dbConfig.url); // Added for debugging
console.log('DEBUG: DB_CONFIG in db.ts:', dbConfig); // Added for debugging
