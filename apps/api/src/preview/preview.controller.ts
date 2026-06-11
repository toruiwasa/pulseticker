import { Controller, Get, Sse } from '@nestjs/common';
import { Observable, merge, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { PreviewCacheService } from './preview-cache.service';

@Controller('preview')
export class PreviewController {
  constructor(private readonly cache: PreviewCacheService) {}

  @Get('prices')
  getPrices() {
    return this.cache.getPrices();
  }

  @Sse('prices/stream')
  stream(): Observable<MessageEvent> {
    return merge(
      of(this.cache.getPrices()),
      this.cache.prices$,
    ).pipe(
      map(prices => ({ data: prices }) as MessageEvent),
    );
  }
}
