import { Component, OnInit, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SymbolSearchInputComponent } from '../../core/components/symbol-search-input.component';
import { OandaPipe } from '../../core/pipes/oanda.pipe';

interface Alert {
  id: string;
  symbol: string;
  threshold_price: number;
  direction: 'above' | 'below';
  is_active: boolean;
  created_at: string;
}

@Component({
  standalone: true,
  imports: [FormsModule, SymbolSearchInputComponent, OandaPipe],
  template: `
    <div class="page">
      <h1>Alerts</h1>

      <h2>Create alert</h2>
      <form class="form-row" (ngSubmit)="createAlert()">
        <app-symbol-search
          class="symbol-search"
          (symbolSelected)="selectSymbol($event)"
        />
        <input
          [(ngModel)]="form.threshold_price"
          name="price"
          type="number"
          step="0.01"
          placeholder="Price"
          required
          class="price-input"
          aria-label="Price threshold"
        />
        <select
          [(ngModel)]="form.direction"
          name="direction"
          class="direction-select"
          aria-label="Alert direction"
        >
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
        <button type="submit" class="btn-primary">Add alert</button>
      </form>

      <h2>Active alerts</h2>
      @if (loading()) {
        <p class="empty-msg">Loading…</p>
      } @else if (alerts().length === 0) {
        <p class="empty-msg">No alerts yet. Use the form above to add one.</p>
      } @else {
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Direction</th>
              <th>Price</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (alert of alerts(); track alert.id) {
              <tr>
                <td class="col-symbol">{{ alert.symbol | oanda }}</td>
                <td>{{ alert.direction }}</td>
                <td class="col-price">{{ alert.threshold_price }}</td>
                <td>
                  <span [class]="alert.is_active ? 'status-active' : 'status-triggered'">
                    {{ alert.is_active ? 'Active' : 'Triggered' }}
                  </span>
                </td>
                <td>
                  <button
                    class="btn-delete"
                    type="button"
                    [attr.aria-label]="'Delete alert for ' + (alert.symbol | oanda)"
                    (click)="deleteAlert(alert.id)"
                  >Delete</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .page {
      padding: 2rem;
      color: var(--pt-text-primary);
      max-width: 900px;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 1.5rem;
      color: var(--pt-text-primary);
    }

    h2 {
      font-size: 1rem;
      font-weight: 600;
      margin: 1.5rem 0 0.75rem;
      color: var(--pt-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 0.75rem;
    }

    .form-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: flex-end;
      margin-bottom: 1rem;
    }

    .symbol-search { flex: 1; min-width: 160px; max-width: 240px; }

    .price-input, .direction-select {
      padding: 0.4rem 0.6rem;
      border: 1px solid var(--pt-border);
      border-radius: 6px;
      background: var(--pt-bg-surface);
      color: var(--pt-text-primary);
      font-family: inherit;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.15s;
    }

    .price-input { width: 120px; }
    .direction-select { cursor: pointer; }

    .price-input:focus,
    .direction-select:focus { border-color: var(--pt-primary); }

    .btn-primary {
      padding: 0.4rem 0.9rem;
      border: none;
      border-radius: 6px;
      background: var(--pt-primary);
      color: #fff;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.875rem;
      font-family: inherit;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .btn-primary:hover { background: var(--pt-primary-hover); }
    .btn-primary:focus-visible { outline: 2px solid var(--pt-primary); outline-offset: 2px; }

    .empty-msg {
      color: var(--pt-text-muted);
      font-size: 0.875rem;
      margin: 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    th {
      text-align: left;
      padding: 0.5rem 0.75rem;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--pt-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 2px solid var(--pt-border);
    }

    td {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--pt-border);
      color: var(--pt-text-primary);
    }

    .col-symbol { font-weight: 600; }
    .col-price { font-variant-numeric: tabular-nums; }

    .status-active    { color: var(--pt-up); font-weight: 600; }
    .status-triggered { color: var(--pt-neutral); }

    .btn-delete {
      background: transparent;
      border: 1px solid var(--pt-border);
      border-radius: 4px;
      padding: 0.2rem 0.5rem;
      color: var(--pt-text-secondary);
      cursor: pointer;
      font-size: 0.8rem;
      font-family: inherit;
      transition: border-color 0.15s, color 0.15s;
    }
    .btn-delete:hover { border-color: var(--pt-down); color: var(--pt-down); }
    .btn-delete:focus-visible { outline: 2px solid var(--pt-primary); outline-offset: 2px; }
  `],
})
export class AlertsComponent implements OnInit {
  @ViewChild(SymbolSearchInputComponent) private symbolSearch!: SymbolSearchInputComponent;

  loading = signal(true);
  alerts = signal<Alert[]>([]);
  form = { symbol: '', threshold_price: 0, direction: 'above' as 'above' | 'below' };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.get<Alert[]>('/alerts').subscribe({
      next: data => { this.alerts.set(data); this.loading.set(false); },
      error: e => { console.error('Failed to load alerts', e); this.loading.set(false); },
    });
  }

  selectSymbol(symbol: string) {
    this.form.symbol = symbol;
  }

  async createAlert() {
    try {
      const alert = await firstValueFrom(
        this.api.post<Alert>('/alerts', {
          symbol: this.form.symbol,
          threshold_price: this.form.threshold_price,
          direction: this.form.direction,
        }),
      );
      this.alerts.update(a => [alert, ...a]);
      this.form = { symbol: '', threshold_price: 0, direction: 'above' };
      this.symbolSearch.clear();
    } catch (e) {
      console.error('Failed to create alert', e);
    }
  }

  async deleteAlert(id: string) {
    try {
      await firstValueFrom(this.api.delete(`/alerts/${id}`));
      this.alerts.update(a => a.filter(x => x.id !== id));
    } catch (e) {
      console.error('Failed to delete alert', e);
    }
  }
}
