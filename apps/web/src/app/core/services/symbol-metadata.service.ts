import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SymbolMetadataService {
  private readonly api = inject(ApiService);

  readonly currencies = signal<Record<string, string>>({});
  private readonly pending = new Set<string>();

  ensureCurrency(symbol: string): void {
    if (this.currencies()[symbol] !== undefined || this.pending.has(symbol)) return;

    if (symbol.startsWith('OANDA:')) {
      const quoteCurrency = symbol.split(':')[1]?.split('_')[1] ?? 'USD';
      this.currencies.update(c => ({ ...c, [symbol]: quoteCurrency }));
      return;
    }

    this.pending.add(symbol);
    this.api.getCompanyProfile(symbol).subscribe({
      next: profile => {
        this.currencies.update(c => ({ ...c, [symbol]: profile.currency }));
        this.pending.delete(symbol);
      },
      error: () => {
        this.currencies.update(c => ({ ...c, [symbol]: 'USD' }));
        this.pending.delete(symbol);
      },
    });
  }
}
