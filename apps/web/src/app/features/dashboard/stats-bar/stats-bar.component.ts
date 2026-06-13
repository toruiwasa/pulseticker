import { DecimalPipe } from '@angular/common';
import { Component, OnChanges, inject, input, signal } from '@angular/core';
import { ApiService, QuoteResponse } from '../../../core/services/api.service';

@Component({
  selector: 'app-stats-bar',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    @if (quote()) {
      <div class="stats-bar">
        <div class="stat">
          <span class="stat-label">Prev close</span>
          <span class="stat-value">{{ quote()!.pc | number:'1.2-4' }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Change</span>
          <span
            class="stat-value"
            [class.color-up]="change() > 0"
            [class.color-down]="change() < 0"
          >
            {{ change() > 0 ? '+' : '' }}{{ change() | number:'1.2-4' }}
            ({{ changePct() | number:'1.2-2' }}%)
          </span>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .stats-bar {
      display: flex;
      gap: 1.5rem;
      padding: 0.5rem 1rem;
      border-top: 1px solid var(--pt-border);
      background: var(--pt-bg-surface);
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .stat-label {
      font-size: 0.7rem;
      color: var(--pt-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .stat-value {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--pt-text-primary);
      font-variant-numeric: tabular-nums;
    }

    .color-up { color: var(--pt-up); }
    .color-down { color: var(--pt-down); }

    @media (max-width: 767px) {
      .stat-value { font-size: 0.875rem; }
    }
  `],
})
export class StatsBarComponent implements OnChanges {
  readonly symbol = input<string | null>(null);
  readonly currentPrice = input<number | null>(null);

  private api = inject(ApiService);
  protected quote = signal<QuoteResponse | null>(null);

  protected change = () => {
    const q = this.quote();
    const p = this.currentPrice() ?? q?.c ?? null;
    if (!q || p === null) return 0;
    return p - q.pc;
  };

  protected changePct = () => {
    const q = this.quote();
    if (!q || q.pc === 0) return 0;
    return (this.change() / q.pc) * 100;
  };

  ngOnChanges() {
    const sym = this.symbol();
    if (!sym || sym.startsWith('OANDA:')) {
      this.quote.set(null);
      return;
    }
    this.api.getQuote(sym).subscribe({
      next: q => this.quote.set(q),
      error: () => this.quote.set(null),
    });
  }
}
