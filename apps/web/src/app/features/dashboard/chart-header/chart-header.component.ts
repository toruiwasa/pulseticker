import { Component, input, output } from '@angular/core';
import { OandaPipe } from '../../../core/pipes/oanda.pipe';
import { ChartRange } from '../../../core/services/api.service';

const RANGES: ChartRange[] = ['1D', '1Y'];

@Component({
  selector: 'app-chart-header',
  standalone: true,
  imports: [OandaPipe],
  template: `
    <div class="chart-header">
      <div class="symbol-info">
        @if (symbol()) {
          <span class="symbol-label">{{ symbol() | oanda }}</span>
        } @else {
          <span class="placeholder">Select a symbol to view chart</span>
        }
      </div>

      <div class="range-tabs" role="tablist" aria-label="Chart time range">
        @for (r of ranges; track r) {
          <button
            role="tab"
            class="range-tab"
            [class.active]="activeRange() === r"
            [attr.aria-selected]="activeRange() === r"
            (click)="rangeChange.emit(r)"
          >{{ r }}</button>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .chart-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem 0.5rem;
      border-bottom: 1px solid var(--pt-border);
      flex-shrink: 0;
    }

    .symbol-label {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--pt-text-primary);
    }

    .placeholder {
      font-size: 0.9rem;
      color: var(--pt-text-muted);
    }

    .range-tabs {
      display: flex;
      gap: 2px;
      background: var(--pt-bg-elevated);
      border-radius: 6px;
      padding: 2px;
    }

    .range-tab {
      padding: 0.25rem 0.6rem;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--pt-text-secondary);
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }

    .range-tab:hover { color: var(--pt-text-primary); }

    .range-tab.active {
      background: var(--pt-bg-surface);
      color: var(--pt-primary);
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .range-tab:focus-visible {
      outline: 2px solid var(--pt-primary);
      outline-offset: 2px;
    }
  `],
})
export class ChartHeaderComponent {
  readonly symbol = input<string | null>(null);
  readonly activeRange = input<ChartRange>('1D');
  readonly rangeChange = output<ChartRange>();

  protected readonly ranges = RANGES;
}
