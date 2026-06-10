import { Injectable, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SupabaseService } from '../../supabase/supabase/supabase.service';
import { QueueService } from '../../queue/queue.service';

interface CachedAlert {
  id: string;
  symbol: string;
  userId: string;
  thresholdPrice: number;
  direction: 'above' | 'below';
}

interface AlertRow {
  id: string;
  symbol: string;
  user_id: string;
  threshold_price: string;
  direction: 'above' | 'below';
}

@Injectable()
export class AlertsService implements OnModuleInit {
  private cache = new Map<string, CachedAlert[]>();

  constructor(
    private supabase: SupabaseService,
    private queueService: QueueService,
  ) {}

  async onModuleInit() {
    await this.reloadCache();
  }

  private async reloadCache() {
    const { data } = await this.supabase.client
      .from('alerts')
      .select('id, symbol, user_id, threshold_price, direction')
      .eq('is_active', true);

    this.cache.clear();
    for (const row of (data ?? []) as AlertRow[]) {
      const key = row.symbol.toUpperCase();
      const list = this.cache.get(key) ?? [];
      list.push({
        id: row.id,
        symbol: row.symbol,
        userId: row.user_id,
        thresholdPrice: Number(row.threshold_price),
        direction: row.direction,
      });
      this.cache.set(key, list);
    }
  }

  private sym(s: string) {
    return s.toUpperCase();
  }

  async getAlerts(userId: string) {
    const { data, error } = await this.supabase.client
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as unknown[];
  }

  async createAlert(
    userId: string,
    symbol: string,
    thresholdPrice: number,
    direction: 'above' | 'below',
  ) {
    const res = await this.supabase.client
      .from('alerts')
      .insert({
        user_id: userId,
        symbol: this.sym(symbol),
        threshold_price: thresholdPrice,
        direction,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;

    const row = res.data as AlertRow;
    const key = row.symbol.toUpperCase();
    const list = this.cache.get(key) ?? [];
    list.push({
      id: row.id,
      symbol: row.symbol,
      userId: row.user_id,
      thresholdPrice: Number(row.threshold_price),
      direction: row.direction,
    });
    this.cache.set(key, list);

    return res.data as unknown;
  }

  async deleteAlert(userId: string, alertId: string) {
    const { error } = await this.supabase.client
      .from('alerts')
      .delete()
      .eq('id', alertId)
      .eq('user_id', userId);
    if (error) throw error;

    for (const [sym, alerts] of this.cache) {
      this.cache.set(
        sym,
        alerts.filter((a) => a.id !== alertId),
      );
    }
  }

  async checkAlerts(symbol: string, price: number) {
    const alerts = this.cache.get(symbol.toUpperCase()) ?? [];
    for (const alert of alerts) {
      const triggered =
        (alert.direction === 'above' && price >= alert.thresholdPrice) ||
        (alert.direction === 'below' && price <= alert.thresholdPrice);
      if (!triggered) continue;
      await this.queueService.addAlertCheckJob({
        alertId: alert.id,
        symbol: alert.symbol,
        price,
        userId: alert.userId,
      });
    }
  }

  @OnEvent('alert.triggered')
  handleAlertTriggered(payload: { alertId: string }) {
    for (const [sym, alerts] of this.cache) {
      this.cache.set(
        sym,
        alerts.filter((a) => a.id !== payload.alertId),
      );
    }
  }
}
