import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Symbol → last known price, kept in memory. Populated purely by listening
 * for `price.received` — the same event PricesGateway, LiveCandleCacheService,
 * and AlertsService already consume — so this class has no dependency on
 * FinnhubClient and doesn't know where the event comes from.
 */
@Injectable()
export class PriceCacheService {
  private readonly priceCache = new Map<string, { price: number; ts: number }>();

  @OnEvent('price.received')
  handlePriceReceived(payload: { symbol: string; price: number; ts: number }) {
    this.priceCache.set(payload.symbol.toUpperCase(), { price: payload.price, ts: payload.ts });
  }

  getLastKnownPrices(
    symbols: string[],
  ): Array<{ symbol: string; price: number | null; ts: number | null }> {
    return symbols.map(sym => {
      const cached = this.priceCache.get(sym.toUpperCase());
      return {
        symbol: sym.toUpperCase(),
        price: cached?.price ?? null,
        ts: cached?.ts ?? null,
      };
    });
  }
}
