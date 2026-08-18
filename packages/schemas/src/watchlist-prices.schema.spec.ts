import { describe, it, expect } from 'vitest';
import { WatchlistPriceItemSchema, WatchlistPricesResponseSchema } from './watchlist-prices.schema.js';

const UUID = '0b7f3f2e-1c4a-4b7d-9a2e-2f1c9d3e4a5b';

describe('WatchlistPriceItemSchema', () => {
  it('parses a fully populated item', () => {
    const item = { id: UUID, symbol: 'AAPL', price: 195.23, ts: 1709123456789 };
    expect(WatchlistPriceItemSchema.parse(item)).toEqual(item);
  });

  it('accepts price: null and ts: null (symbol not in the price cache)', () => {
    const item = { id: UUID, symbol: 'AAPL', price: null, ts: null };
    expect(WatchlistPriceItemSchema.parse(item)).toEqual(item);
  });

  it('rejects a missing id', () => {
    expect(() =>
      WatchlistPriceItemSchema.parse({ symbol: 'AAPL', price: 1, ts: 1 }),
    ).toThrow();
  });

  it('rejects an id that is not a uuid', () => {
    expect(() =>
      WatchlistPriceItemSchema.parse({ id: 'not-a-uuid', symbol: 'AAPL', price: 1, ts: 1 }),
    ).toThrow();
  });

  it('rejects price sent as a string', () => {
    expect(() =>
      WatchlistPriceItemSchema.parse({ id: UUID, symbol: 'AAPL', price: '195.23', ts: 1 }),
    ).toThrow();
  });

  it('rejects an omitted price rather than treating it as null', () => {
    expect(() =>
      WatchlistPriceItemSchema.parse({ id: UUID, symbol: 'AAPL', ts: 1 }),
    ).toThrow();
  });
});

describe('WatchlistPricesResponseSchema', () => {
  it('parses a warm-cache response', () => {
    const res = {
      cached: true,
      items: [
        { id: UUID, symbol: 'AAPL', price: 195.23, ts: 1709123456789 },
        { id: UUID, symbol: 'OANDA:AUD_USD', price: 0.6612, ts: 1709123456790 },
      ],
    };
    expect(WatchlistPricesResponseSchema.parse(res)).toEqual(res);
  });

  it('parses a cold-start response — cached: false with all prices null', () => {
    const res = {
      cached: false,
      items: [{ id: UUID, symbol: 'AAPL', price: null, ts: null }],
    };
    expect(WatchlistPricesResponseSchema.parse(res)).toEqual(res);
  });

  it('parses an empty watchlist', () => {
    expect(WatchlistPricesResponseSchema.parse({ cached: true, items: [] })).toEqual({
      cached: true,
      items: [],
    });
  });

  it('rejects a missing cached flag', () => {
    expect(() => WatchlistPricesResponseSchema.parse({ items: [] })).toThrow();
  });

  it('rejects a bare array — items must be wrapped', () => {
    expect(() => WatchlistPricesResponseSchema.parse([])).toThrow();
  });

  it('rejects the response when any single item is malformed', () => {
    expect(() =>
      WatchlistPricesResponseSchema.parse({
        cached: true,
        items: [
          { id: UUID, symbol: 'AAPL', price: 1, ts: 1 },
          { id: UUID, symbol: 'MSFT', price: 1 },
        ],
      }),
    ).toThrow();
  });
});
