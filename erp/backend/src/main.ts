import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import passport from 'passport';
import pgSession from 'connect-pg-simple';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
  // Validate environment variables before starting (fail fast)
  const config = validateEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable CORS for frontend with credentials support
  app.enableCors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  });

  // Configure session store with PostgreSQL
  const PgStore = pgSession(session);
  app.use(
    session({
      store: new PgStore({
        conString: config.DATABASE_URL,
        tableName: 'session',
        createTableIfMissing: false, // We create it via migration
      }),
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
      },
    }),
  );

  // Initialize Passport for authentication
  app.use(passport.initialize());
  app.use(passport.session());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  await app.listen(config.PORT);
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`Environment: ${config.NODE_ENV}`);
}
bootstrap();
