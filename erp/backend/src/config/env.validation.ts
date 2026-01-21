/**
 * Environment validation - fail fast on missing required config
 *
 * Call validateEnv() before bootstrapping the app to ensure all
 * required environment variables are present. This prevents cryptic
 * runtime errors from missing configuration.
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL connection string (e.g., postgresql://user:pass@host:5432/db)',
  },
  {
    name: 'PORT',
    required: false,
    description: 'Server port (default: 3000)',
  },
  {
    name: 'NODE_ENV',
    required: false,
    description: 'Environment: development, production, test',
  },
];

export interface EnvConfig {
  DATABASE_URL: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
}

export function validateEnv(): EnvConfig {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];

    if (envVar.required && !value) {
      missing.push(`  - ${envVar.name}: ${envVar.description}`);
    } else if (!envVar.required && !value) {
      warnings.push(`  - ${envVar.name}: ${envVar.description}`);
    }
  }

  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:\n');
    console.error(missing.join('\n'));
    console.error('\nPlease set these variables in your .env file or environment.\n');
    process.exit(1);
  }

  if (warnings.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn('\n⚠️  Optional environment variables not set (using defaults):\n');
    console.warn(warnings.join('\n'));
    console.warn('');
  }

  // Validate DATABASE_URL format
  const dbUrl = process.env.DATABASE_URL!;
  if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    console.error('\n❌ Invalid DATABASE_URL format');
    console.error('   Expected: postgresql://user:password@host:port/database\n');
    process.exit(1);
  }

  return {
    DATABASE_URL: dbUrl,
    PORT: parseInt(process.env.PORT || '3000', 10),
    NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
  };
}
