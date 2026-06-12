import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { PreviewService, PreviewPrice, PREVIEW_SYMBOLS_INITIAL } from '../../../core/services/preview.service';
import { isMarketOpen } from '../../../core/constants/market-holidays';
import { LoginChartComponent } from './login-chart.component';

@Component({
  standalone: true,
  imports: [DecimalPipe, LoginChartComponent],
  styles: [`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: radial-gradient(ellipse at 20% 50%, #1a0a2e 0%, #0a0a1a 60%, #001a2e 100%);
      font-family: 'Inter', system-ui, sans-serif;
    }

    .login-top {
      display: grid;
      grid-template-columns: 340px minmax(0, 600px);
      gap: 1.5rem;
      align-items: stretch;
    }

    @media (max-width: 768px) {
      .login-top {
        grid-template-columns: 1fr;
      }
    }

    .market-card {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(0, 255, 200, 0.3);
      border-radius: 16px;
      padding: 2rem;
      width: 340px;
      box-shadow:
        0 0 40px rgba(0, 255, 200, 0.1),
        0 0 80px rgba(100, 0, 255, 0.05),
        inset 0 0 40px rgba(255, 255, 255, 0.02);
    }

    h1 {
      color: #fff;
      font-size: 1.4rem;
      font-weight: 700;
      margin: 0 0 1.25rem;
      letter-spacing: 0.02em;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1.25rem;
    }

    tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    }

    tr:last-child {
      border-bottom: none;
    }

    td {
      padding: 0.6rem 0.25rem;
      font-size: 0.95rem;
    }

    .symbol {
      color: #fff;
      font-weight: 600;
      letter-spacing: 0.03em;
    }

    .price {
      color: rgba(255, 255, 255, 0.85);
      text-align: right;
    }

    .change {
      text-align: right;
      font-weight: 600;
      min-width: 80px;
    }

    .positive { color: #00e676; }
    .negative { color: #ff5252; }
    .neutral  { color: rgba(255, 255, 255, 0.5); }

    .market-closed-badge {
      display: inline-block;
      background: rgba(255, 152, 0, 0.15);
      border: 1px solid rgba(255, 152, 0, 0.4);
      color: #ffb74d;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.6rem;
      border-radius: 4px;
      margin-bottom: 1rem;
      letter-spacing: 0.04em;
    }

    .hint {
      color: rgba(255, 255, 255, 0.45);
      font-size: 0.78rem;
      text-align: center;
      margin: 0 0 1.25rem;
      line-height: 1.6;
    }

    .login-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      width: 100%;
      padding: 0.75rem 1rem;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(0, 255, 200, 0.35);
      border-radius: 8px;
      color: #fff;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
      letter-spacing: 0.02em;
    }

    .login-btn:hover {
      background: rgba(0, 255, 200, 0.1);
      border-color: rgba(0, 255, 200, 0.6);
      box-shadow: 0 0 16px rgba(0, 255, 200, 0.15);
    }

    .github-icon {
      width: 20px;
      height: 20px;
      fill: #fff;
    }
  `],
  template: `
    <div class="login-top">
    <div class="market-card">
      <h1>pulseticker</h1>

      @if (!marketOpen) {
        <span class="market-closed-badge">Market Closed</span>
      }

      <table>
        @for (p of prices(); track p.raw) {
          <tr>
            <td class="symbol">{{ p.symbol }}</td>
            <td class="price">
              @if (p.price != null) {
                {{ p.price | number:(p.raw === 'OANDA:AUD_USD' ? '1.4-4' : '1.2-2') }}
              } @else {
                ---
              }
            </td>
            <td class="change" [class]="changeClass(p.percentChange)">
              {{ formatChange(p.percentChange) }}
            </td>
          </tr>
        }
      </table>

      <p class="hint">
        Prices update every 10 seconds<br>
        Login for real-time updates
      </p>

      <button class="login-btn" (click)="login()">
        <svg class="github-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
        </svg>
        Login with GitHub
      </button>
    </div>

    <app-login-chart />
    </div>
  `,
})
export class LoginComponent implements OnInit, OnDestroy {
  prices = signal<PreviewPrice[]>(PREVIEW_SYMBOLS_INITIAL);
  marketOpen = isMarketOpen();

  private sub: Subscription | undefined;
  private marketTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private auth: AuthService,
    private preview: PreviewService,
  ) {}

  ngOnInit() {
    this.sub = this.preview.getPriceStream().subscribe({
      next: prices => this.prices.set(prices),
    });

    this.marketTimer = setInterval(() => {
      this.marketOpen = isMarketOpen();
    }, 60_000);
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    clearInterval(this.marketTimer);
  }

  login() {
    this.auth.signInWithGitHub();
  }

  changeClass(pct: number | null): string {
    if (pct == null) return 'neutral';
    if (pct > 0) return 'positive';
    if (pct < 0) return 'negative';
    return 'neutral';
  }

  formatChange(pct: number | null): string {
    if (pct == null) return '---';
    const arrow = pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : '— ';
    return `${arrow}${Math.abs(pct).toFixed(2)}%`;
  }
}
