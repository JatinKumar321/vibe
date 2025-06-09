if (process.env.NODE_ENV === 'production') {
  import('./instrument');
}
import Express from 'express';
import Sentry from '@sentry/node';
import * as path from 'path';
import cors from 'cors'; // Import cors
import {loggingHandler} from 'shared/middleware/loggingHandler';
import {
  RoutingControllersOptions,
  useContainer,
  useExpressServer,
} from 'routing-controllers';
import {authModuleOptions} from './modules/auth';
import {coursesModuleOptions} from './modules/courses';
import {usersModuleOptions} from './modules/users';
import {activityModuleOptions} from './modules/activity';
import Container from 'typedi';
import {IDatabase} from 'shared/database';
import {MongoDatabase} from 'shared/database/providers/MongoDatabaseProvider';
import {dbConfig} from 'config/db';
import * as fs from 'fs/promises';

export const application = Express();

// Enable CORS with specific options for GCP storage
application.use(
  cors({
    origin: [
      'http://localhost:4001', // Your local backend
      'http://localhost:5173', // Your local frontend
      'https://storage.googleapis.com', // GCP Storage domain
      'https://*.storage.googleapis.com', // Any GCP Storage subdomain
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Access-Control-Allow-Origin',
      'Origin',
      'Accept',
      'X-Requested-With',
    ],
    exposedHeaders: ['ETag'],
    credentials: true,
    maxAge: 86400, // Cache preflight requests for 24 hours
  }),
);

// Create public_face_images directory if it doesn't exist
const publicFacesPath = path.join(__dirname, '..', 'public_face_images');
void (async () => {
  try {
    await fs.mkdir(publicFacesPath, {recursive: true});
    console.log('Ensured public_face_images directory exists');
  } catch (error) {
    console.error('Error creating public_face_images directory:', error);
  }
})();

// Serve static files from the public_face_images directory
application.use('/static/faces', Express.static(publicFacesPath));

export const ServiceFactory = (
  service: typeof application,
  options: RoutingControllersOptions,
): typeof application => {
  console.log('--------------------------------------------------------');
  console.log('Initializing service server');
  console.log('--------------------------------------------------------');

  service.use(Express.urlencoded({extended: true}));
  service.use(Express.json());

  console.log('--------------------------------------------------------');
  console.log('Logging and Configuration Setup');
  console.log('--------------------------------------------------------');

  service.use(loggingHandler);

  console.log('--------------------------------------------------------');
  console.log('Define Routing');
  console.log('--------------------------------------------------------');
  service.get('/main/healthcheck', (req, res) => {
    res.send('Hello World');
  });

  console.log('--------------------------------------------------------');
  console.log('Routes Handler');
  console.log('--------------------------------------------------------');
  //After Adding Routes
  if (process.env.NODE_ENV === 'production') {
    Sentry.setupExpressErrorHandler(service);
  }

  console.log('--------------------------------------------------------');
  console.log('Starting Server');
  console.log('--------------------------------------------------------');

  useExpressServer(service, options); // options should be the combined options

  return service;
};

// Create a main function where multiple services are created

useContainer(Container);

if (!Container.has('Database')) {
  Container.set<IDatabase>('Database', new MongoDatabase(dbConfig.url, 'vibe'));
}

const безопасныеКонтроллеры = (
  options: RoutingControllersOptions | undefined,
): Function[] => {
  if (!options || !options.controllers || !Array.isArray(options.controllers)) {
    return [];
  }
  // Filter for functions (controller classes), ignore strings (paths) for this combined setup
  return options.controllers.filter(c => typeof c === 'function') as Function[];
};

const безопасныеПромежуточныеОбработчики = (
  options: RoutingControllersOptions | undefined,
): any[] => {
  if (!options || !options.middlewares || !Array.isArray(options.middlewares)) {
    return [];
  }
  return options.middlewares; // Assuming middlewares are correctly typed in their modules
};

const allControllers: Function[] = [
  ...безопасныеКонтроллеры(authModuleOptions),
  ...безопасныеКонтроллеры(coursesModuleOptions),
  ...безопасныеКонтроллеры(usersModuleOptions),
  ...безопасныеКонтроллеры(activityModuleOptions),
];

const allMiddlewares: any[] = [
  ...безопасныеПромежуточныеОбработчики(authModuleOptions),
  ...безопасныеПромежуточныеОбработчики(coursesModuleOptions),
  ...безопасныеПромежуточныеОбработчики(usersModuleOptions),
  ...безопасныеПромежуточныеОбработчики(activityModuleOptions),
];

const combinedModuleOptions: RoutingControllersOptions = {
  controllers: allControllers,
  middlewares: allMiddlewares,
  authorizationChecker: authModuleOptions.authorizationChecker,
  currentUserChecker: authModuleOptions.currentUserChecker,
  validation: true,
  defaultErrorHandler: false,
  routePrefix: '/api',
};

export const main = () => {
  const service = ServiceFactory(application, combinedModuleOptions);
  service.listen(4001, () => {
    console.log('--------------------------------------------------------');
    console.log('Started Server at http://localhost:4001');
    console.log('--------------------------------------------------------');
  });
};

main();
