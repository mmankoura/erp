import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  database: {
    connected: boolean;
    latency_ms?: number;
    error?: string;
  };
}

@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    // Check database connectivity
    const dbCheck = await this.checkDatabase();

    const status: HealthStatus = {
      status: dbCheck.connected ? 'healthy' : 'unhealthy',
      timestamp,
      uptime,
      database: dbCheck,
    };

    return status;
  }

  @Get('live')
  live(): { status: string } {
    // Liveness probe - is the process running?
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: string; database: boolean }> {
    // Readiness probe - is the app ready to serve traffic?
    const dbCheck = await this.checkDatabase();
    return {
      status: dbCheck.connected ? 'ok' : 'not_ready',
      database: dbCheck.connected,
    };
  }

  private async checkDatabase(): Promise<{
    connected: boolean;
    latency_ms?: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        connected: true,
        latency_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
