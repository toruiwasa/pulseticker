import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { HealthController } from './health/health.controller.js';
import { SupabaseHealthIndicator } from './supabase.health.js';

@Module({
  imports: [TerminusModule, SupabaseModule],
  controllers: [HealthController],
  providers: [SupabaseHealthIndicator],
})
export class HealthModule {}
