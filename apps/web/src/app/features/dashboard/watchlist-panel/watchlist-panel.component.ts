import {
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TuiButton } from '@taiga-ui/core';
import { OandaPipe } from '../../../core/pipes/oanda.pipe';
import { SymbolSearchInputComponent } from '../../../core/components/symbol-search-input.component';
import type { WatchlistItem } from '../../../core/services/watchlist-state.service';

export type { WatchlistItem };

@Component({
  selector: 'app-watchlist-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TuiButton, OandaPipe, SymbolSearchInputComponent],
  template: `
    <div class="panel">
      <div class="search-area">
        <app-symbol-search
          clearOnSelect
          placeholder="Search symbols…"
          [disabled]="atLimit()"
          (symbolSelected)="symbolAdded.emit($event)"
        />
        <span class="count">{{ watchlist().length }}/50</span>
      </div>

      <div class="ticker-list" role="list">
        @if (watchlist().length === 0) {
          <p class="empty-msg">Add symbols above to get started.</p>
        }
        @for (item of watchlist(); track item.id) {
          <div
            class="ticker-row"
            [class.active]="activeSymbol() === item.symbol"
            [class.flash-up]="flashUp()[item.symbol]"
            [class.flash-down]="flashDown()[item.symbol]"
            role="listitem"
            tabindex="0"
            (click)="symbolSelected.emit(item.symbol)"
            (keydown.enter)="symbolSelected.emit(item.symbol)"
            (keydown.space)="symbolSelected.emit(item.symbol); $event.preventDefault()"
          >
            <div class="ticker-left">
              <span class="symbol">{{ item.symbol | oanda }}</span>
              @if (timestamps()[item.symbol]) {
                <span class="timestamp">
                  @if (isLive()[item.symbol]) {
                    {{ timestamps()[item.symbol] | date:'HH:mm:ss' }}
                  } @else {
                    {{ timestamps()[item.symbol] | date:'MMM d, HH:mm' }}
                  }
                </span>
              }
            </div>
            <div class="ticker-right">
              @if (prices()[item.symbol]) {
                <span
                  class="price"
                  [class.color-up]="isLive()[item.symbol]"
                  [class.color-neutral]="!isLive()[item.symbol]"
                >
                  {{ prices()[item.symbol] | number:'1.2-5' }}
                </span>
              } @else {
                <span class="price color-neutral">—</span>
              }
              <button
                tuiButton
                type="button"
                appearance="outline"
                size="xs"
                class="btn-outline-destructive"
                [attr.aria-label]="'Remove ' + (item.symbol | oanda)"
                (click)="symbolRemoved.emit(item.symbol); $event.stopPropagation()"
              >
                <span class="btn-short" aria-hidden="true">×</span>
                <span class="btn-long">Delete</span>
              </button>
            </div>
          </div>
        }
      </div>

      @if (!atLimit()) {
        <div class="add-hint" aria-hidden="true">
          Search above to add a symbol
        </div>
      } @else {
        <div class="limit-msg">50-symbol limit reached</div>
      }
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .search-area {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      border-bottom: 1px solid var(--pt-border);
      flex-shrink: 0;
    }

    .search-area app-symbol-search { flex: 1; min-width: 0; }

    .count {
      font-size: 0.7rem;
      color: var(--pt-text-muted);
      white-space: nowrap;
    }

    .ticker-list {
      flex: 1;
      overflow-y: auto;
    }

    .empty-msg {
      padding: 1.5rem 1rem;
      color: var(--pt-text-muted);
      font-size: 0.85rem;
      text-align: center;
    }

    .ticker-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.6rem 0.75rem;
      cursor: pointer;
      border-left: 2px solid transparent;
      border-bottom: 1px solid var(--pt-border);
      transition: background 0.1s;
      outline: none;
    }

    .ticker-row:hover {
      background: var(--pt-bg-elevated);
    }

    .ticker-row.active {
      border-left-color: var(--pt-primary);
      background: color-mix(in srgb, var(--pt-primary) 8%, transparent);
    }

    .ticker-row:focus-visible {
      outline: 2px solid var(--pt-primary);
      outline-offset: -2px;
    }

    @keyframes flash-up {
      0%, 100% { background: transparent; }
      40% { background: color-mix(in srgb, var(--pt-up) 20%, transparent); }
    }

    @keyframes flash-down {
      0%, 100% { background: transparent; }
      40% { background: color-mix(in srgb, var(--pt-down) 20%, transparent); }
    }

    .ticker-row.flash-up { animation: flash-up 0.6s ease-out; }
    .ticker-row.flash-down { animation: flash-down 0.6s ease-out; }

    .ticker-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .symbol {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--pt-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .timestamp {
      font-size: 0.7rem;
      color: var(--pt-text-muted);
    }

    .ticker-right {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-shrink: 0;
    }

    .price {
      font-size: 0.85rem;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .color-up { color: var(--pt-up); }
    .color-neutral { color: var(--pt-neutral); }

    .btn-long { display: none; }

    .add-hint, .limit-msg {
      padding: 0.75rem;
      font-size: 0.75rem;
      color: var(--pt-text-muted);
      text-align: center;
      border-top: 1px dashed var(--pt-border);
      flex-shrink: 0;
    }

    @media (max-width: 767px) {
      .symbol { font-size: 0.9rem; }
      .price { font-size: 0.9rem; }
      .timestamp { font-size: 0.75rem; }

      .btn-short { display: none; }
      .btn-long  { display: inline; }
    }
  `],
})
export class WatchlistPanelComponent {
  readonly watchlist = input<WatchlistItem[]>([]);
  readonly prices = input<Record<string, number>>({});
  readonly timestamps = input<Record<string, Date>>({});
  readonly isLive = input<Record<string, boolean>>({});
  readonly activeSymbol = input<string | null>(null);
  readonly atLimit = input(false);

  readonly symbolSelected = output<string>();
  readonly symbolAdded = output<string>();
  readonly symbolRemoved = output<string>();

  protected flashUp = signal<Record<string, boolean>>({});
  protected flashDown = signal<Record<string, boolean>>({});

  private prevPrices: Record<string, number> = {};

  constructor() {
    effect(() => {
      const current = this.prices();
      const prev = this.prevPrices;
      const ups: Record<string, boolean> = {};
      const downs: Record<string, boolean> = {};

      for (const [sym, price] of Object.entries(current)) {
        if (prev[sym] !== undefined && price !== prev[sym]) {
          if (price > prev[sym]) ups[sym] = true;
          else downs[sym] = true;
        }
      }

      if (Object.keys(ups).length || Object.keys(downs).length) {
        this.flashUp.set(ups);
        this.flashDown.set(downs);
        setTimeout(() => {
          this.flashUp.set({});
          this.flashDown.set({});
        }, 700);
      }

      this.prevPrices = { ...current };
    });
  }
}
