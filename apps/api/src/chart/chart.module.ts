import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { ChartController } from './chart.controller';
import { ChartService } from './chart.service';

@Module({
  imports: [AuthModule, FinnhubModule],
  controllers: [ChartController],
  providers: [ChartService],
})
export class ChartModule {}
