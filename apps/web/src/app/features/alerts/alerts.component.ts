import { Component, OnInit, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
  imports: [FormsModule, RouterLink, SymbolSearchInputComponent, OandaPipe],
  template: `
    <div style="padding: 2rem">
      <h1>Alerts</h1>
      <a routerLink="/dashboard">← Dashboard</a>

      <h2>Create Alert</h2>
      <form (ngSubmit)="createAlert()" style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <app-symbol-search (symbolSelected)="selectSymbol($event)" />
        <input [(ngModel)]="form.threshold_price" name="price" type="number" step="0.01" placeholder="Price" required />
        <select [(ngModel)]="form.direction" name="direction">
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
        <button type="submit">Add</button>
      </form>

      <h2>Active Alerts</h2>
      @if (loading()) {
        <p>Loading…</p>
      } @else if (alerts().length === 0) {
        <p>No alerts yet.</p>
      } @else {
        <table>
          <thead>
            <tr><th>Symbol</th><th>Direction</th><th>Price</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            @for (alert of alerts(); track alert.id) {
              <tr>
                <td>{{ alert.symbol | oanda }}</td>
                <td>{{ alert.direction }}</td>
                <td>{{ alert.threshold_price }}</td>
                <td>{{ alert.is_active ? 'Active' : 'Triggered' }}</td>
                <td><button (click)="deleteAlert(alert.id)">Delete</button></td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
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
