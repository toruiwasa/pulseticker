import { Injectable, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SupabaseService } from '../../supabase/supabase/supabase.service.js';
import { QueueService } from '../../queue/queue.service.js';
import { SecureLogger } from '../../common/logger/secure-logger.js';

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
  private readonly logger = new SecureLogger(AlertsService.name);
  private cache = new Map<string, CachedAlert[]>();

  constructor(
    private supabase: SupabaseService,
    private queueService: QueueService,
  ) {}

  async onModuleInit() {
    await this.reloadCache();
  }

  private async reloadCache() {
    const { data, error } = await this.supabase.client
      .from('alerts')
      .select('id, symbol, user_id, threshold_price, direction')
      .eq('is_active', true);

    if (error) {
      this.logger.errorData('Failed to load alerts cache', { code: error.code });
      throw error;
    }

    if (!data) {
      this.logger.warn('Alerts cache query returned null data with no error — starting with empty cache');
      return;
    }

    this.cache.clear();
    let totalCount = 0;
    for (const row of data as AlertRow[]) {
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
      totalCount++;
    }
    this.logger.log(`Alerts cache loaded: ${totalCount} active alerts across ${this.cache.size} symbols`);
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
    if (error) {
      this.logger.errorData('Supabase query failed', { code: error.code, op: 'getAlerts' });
      throw error;
    }
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
    if (res.error) {
      this.logger.errorData('Supabase query failed', { code: res.error.code, op: 'createAlert' });
      throw res.error;
    }

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
    if (error) {
      this.logger.errorData('Supabase query failed', { code: error.code, op: 'deleteAlert' });
      throw error;
    }

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
      this.logger.logData('Alert queued', {
        alertId: alert.id,
        symbol: alert.symbol,
        userId: alert.userId,
      });
      await this.queueService.addAlertCheckJob({
        alertId: alert.id,
        symbol: alert.symbol,
        price,
        userId: alert.userId,
      });
    }
  }

  @OnEvent('price.received')
  async handlePriceReceived(payload: { symbol: string; price: number }) {
    try {
      await this.checkAlerts(payload.symbol, payload.price);
    } catch (err) {
      this.logger.error('checkAlerts failed on price event', (err as Error).stack);
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
