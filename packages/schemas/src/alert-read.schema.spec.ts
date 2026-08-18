import { describe, it, expect } from 'vitest';
import { AlertReadSchema, AlertsResponseSchema } from './alert-read.schema.js';

const UUID = '0b7f3f2e-1c4a-4b7d-9a2e-2f1c9d3e4a5b';

/** Shaped like a real `GET /alerts` row: select('*') on the alerts table. */
const pending = {
  id:              UUID,
  symbol:          'AAPL',
  threshold_price: 200,
  direction:       'above' as const,
  is_active:       true,
  created_at:      '2026-06-09T12:34:56.789+00:00',
};

describe('AlertReadSchema', () => {
  it('parses a pending alert', () => {
    expect(AlertReadSchema.parse(pending)).toEqual(pending);
  });

  it('parses a triggered alert (is_active: false)', () => {
    const triggered = { ...pending, is_active: false };
    expect(AlertReadSchema.parse(triggered)).toEqual(triggered);
  });

  it("parses direction 'below'", () => {
    expect(AlertReadSchema.parse({ ...pending, direction: 'below' }).direction).toBe('below');
  });

  it('strips user_id, which select(*) returns but the client must not carry', () => {
    const parsed = AlertReadSchema.parse({ ...pending, user_id: 'a-user-uuid' });
    expect(parsed).toEqual(pending);
    expect(parsed).not.toHaveProperty('user_id');
  });

  it('accepts the +00:00 offset form PostgREST returns for timestamptz', () => {
    // z.iso.datetime() would reject this without { offset: true } — hence z.string().
    expect(AlertReadSchema.parse(pending).created_at).toBe('2026-06-09T12:34:56.789+00:00');
  });

  it('rejects an unknown direction', () => {
    expect(() => AlertReadSchema.parse({ ...pending, direction: 'sideways' })).toThrow();
  });

  it('rejects threshold_price sent as a string', () => {
    // Guards the NUMERIC(12,4) contract: PostgREST serialises numeric as a JSON
    // number, so a string here means the API started casting to text.
    expect(() => AlertReadSchema.parse({ ...pending, threshold_price: '200' })).toThrow();
  });

  it('rejects is_active: null rather than letting it read as triggered', () => {
    expect(() => AlertReadSchema.parse({ ...pending, is_active: null })).toThrow();
  });

  it('rejects a row missing is_active', () => {
    const { is_active: _omitted, ...withoutStatus } = pending;
    expect(() => AlertReadSchema.parse(withoutStatus)).toThrow();
  });

  it('rejects an id that is not a uuid', () => {
    expect(() => AlertReadSchema.parse({ ...pending, id: '123' })).toThrow();
  });
});

describe('AlertsResponseSchema', () => {
  it('parses a list of alerts', () => {
    const rows = [pending, { ...pending, symbol: 'MSFT', is_active: false }];
    expect(AlertsResponseSchema.parse(rows)).toEqual(rows);
  });

  it('parses an empty list', () => {
    expect(AlertsResponseSchema.parse([])).toEqual([]);
  });

  it('rejects the list when any single row is malformed', () => {
    expect(() =>
      AlertsResponseSchema.parse([pending, { ...pending, direction: 'sideways' }]),
    ).toThrow();
  });
});
