import { EventEmitter2 } from '@nestjs/event-emitter';
import { SupabaseService } from '../../supabase/supabase/supabase.service';

interface Payload {
  alertId: string;
  symbol: string;
  price: number;
  userId: string;
}

export function makeCheckPriceAlertTask(supabase: SupabaseService, eventEmitter: EventEmitter2) {
  return async (payload: Payload) => {
    const { data: alert } = await supabase.client
      .from('alerts')
      .select('*')
      .eq('id', payload.alertId)
      .eq('is_active', true)
      .single();

    if (!alert) return;

    const triggered =
      (alert.direction === 'above' && payload.price >= Number(alert.threshold_price)) ||
      (alert.direction === 'below' && payload.price <= Number(alert.threshold_price));

    if (!triggered) return;

    await supabase.client
      .from('alerts')
      .update({ is_active: false })
      .eq('id', payload.alertId);

    const message = `${alert.symbol} hit ${payload.price} (${alert.direction} ${alert.threshold_price})`;

    await supabase.client.from('alert_history').insert({
      user_id: alert.user_id,
      alert_id: payload.alertId,
      symbol: alert.symbol,
      price_at_trigger: payload.price,
      message,
    });

    eventEmitter.emit('alert.triggered', {
      alertId: payload.alertId,
      userId: alert.user_id,
      symbol: alert.symbol,
      price: payload.price,
      threshold: alert.threshold_price,
      direction: alert.direction,
      message,
    });
  };
}
