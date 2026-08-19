/**
 * The `public` schema, as the API sees it.
 *
 * Hand-derived from supabase/migrations rather than generated, because
 * `supabase gen types` needs live project credentials and would make the build
 * depend on network access to reproduce a four-table schema. The trade-off is
 * that this file does not update itself: **a migration that changes a column
 * must change this file in the same commit.**
 *
 * Sources:
 *   20260609000001_init_tables.sql — watchlist_items, alerts, alert_history
 *   20260609000003_user_profiles.sql — user_profiles
 *
 * Columns with a DEFAULT are optional on Insert; NOT NULL columns without a
 * default are required. NUMERIC arrives from PostgREST as a string, not a
 * number — threshold_price and price_at_trigger are typed accordingly.
 */
export interface Database {
  public: {
    Tables: {
      watchlist_items: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          symbol: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          symbol?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          user_id: string;
          seeded_at: string;
        };
        Insert: {
          user_id: string;
          seeded_at?: string;
        };
        Update: {
          user_id?: string;
          seeded_at?: string;
        };
        Relationships: [];
      };
      alerts: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          /** NUMERIC(12,4) — PostgREST returns it as a string. */
          threshold_price: string;
          direction: 'above' | 'below';
          is_active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          symbol: string;
          threshold_price: number | string;
          direction: 'above' | 'below';
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          symbol?: string;
          threshold_price?: number | string;
          direction?: 'above' | 'below';
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      alert_history: {
        Row: {
          id: string;
          user_id: string;
          alert_id: string | null;
          symbol: string;
          triggered_at: string | null;
          /** NUMERIC(12,4) — PostgREST returns it as a string. */
          price_at_trigger: string;
          message: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          alert_id?: string | null;
          symbol: string;
          triggered_at?: string | null;
          price_at_trigger: number | string;
          message?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          alert_id?: string | null;
          symbol?: string;
          triggered_at?: string | null;
          price_at_trigger?: number | string;
          message?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
