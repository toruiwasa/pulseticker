import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'oanda', standalone: true, pure: true })
export class OandaPipe implements PipeTransform {
  transform(symbol: string | null | undefined): string {
    if (!symbol) return symbol ?? '';
    if (!symbol.startsWith('OANDA:')) return symbol;
    return symbol.slice(6).replace('_', '/');
  }
}
