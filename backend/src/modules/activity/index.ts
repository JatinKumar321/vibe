import 'reflect-metadata';
import {Container} from 'typedi';
import {useContainer, RoutingControllersOptions} from 'routing-controllers';
import {MongoDatabase} from 'shared/database/providers/mongo/MongoDatabase';
import {FaceRecognitionService} from './services/FaceRecognitionService';
import {FaceRecognitionController} from './controllers/FaceRecognitionController';
import {dbConfig} from '../../config/db';

// Set up TypeDI container
useContainer(Container);

// Initialize the database and register services
export function setupActivityModuleDependencies(): void {
  // Set up database connection if not already initialized
  if (!Container.has('Database')) {
    Container.set('Database', new MongoDatabase(dbConfig.url, 'vibe'));
  }

  // Register face recognition service
  if (!Container.has('FaceRecognitionService')) {
    Container.set('FaceRecognitionService', new FaceRecognitionService());
  }
}

// Run the dependency setup
setupActivityModuleDependencies();

// Export module configuration
export const activityModuleOptions: RoutingControllersOptions = {
  controllers: [FaceRecognitionController],
  middlewares: [],
  defaultErrorHandler: false,
  validation: true,
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  },
  classTransformer: true,
  defaults: {
    nullResultCode: 404,
    undefinedResultCode: 204,
    paramOptions: {
      required: true,
    },
  },
  authorizationChecker: async function () {
    return true; // Replace with actual auth logic if needed
  },
};

// Export service
export {FaceRecognitionService} from './services/FaceRecognitionService';

// Export controller
export {FaceRecognitionController} from './controllers/FaceRecognitionController';

// Export validators
export * from './classes/validators/FaceRecognitionValidators';
