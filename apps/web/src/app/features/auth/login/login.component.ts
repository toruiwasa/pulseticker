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
      padding: 1rem;
      box-sizing: border-box;
      background: radial-gradient(ellipse at 20% 50%, #1a0a2e 0%, #0a0a1a 60%, #001a2e 100%);
      font-family: 'Inter', system-ui, sans-serif;
    }

    .market-card {
      box-sizing: border-box;
      position: relative;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20px);
      border-radius: 16px;
      padding: 2rem;
      width: 100%;
      max-width: 980px;
      box-shadow:
        0 0 30px rgba(0, 255, 200, 0.35),
        0 0 60px rgba(0, 230, 120, 0.20),
        inset 0 0 40px rgba(255, 255, 255, 0.02);
    }

    .market-body {
      display: grid;
      grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
      gap: 1.5rem;
      align-items: stretch;
      margin-bottom: 1.25rem;
    }

    @media (max-width: 768px) {
      .market-card {
        padding: 1.25rem;
      }
      .market-body {
        grid-template-columns: 1fr;
      }
    }

    .card-footer {
      margin-top: 1rem;
      padding-top: 1.25rem;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
    }

    .market-card::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 16px;
      padding: 2px;
      background: linear-gradient(135deg, #00e6c8 0%, #00e676 100%);
      -webkit-mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
              mask-composite: exclude;
      pointer-events: none;
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
      white-space: nowrap;
    }

    .currency-unit {
      font-size: 0.65rem;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.45);
      margin-left: 2px;
      letter-spacing: 0.03em;
      vertical-align: middle;
    }

    .change {
      text-align: right;
      font-weight: 600;
      min-width: 80px;
    }

    .positive { color: var(--pt-up); }
    .negative { color: var(--pt-down); }
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

    .google-icon {
      width: 20px;
      height: 20px;
    }

    .login-divider {
      text-align: center;
      color: rgba(255, 255, 255, 0.35);
      font-size: 0.78rem;
      margin: 0.75rem 0;
    }
  `],
  template: `
    <div class="market-card">
      <h1>pulseticker</h1>

      @if (!marketOpen) {
        <span class="market-closed-badge">Market Closed</span>
      }

      <div class="market-body">
        <table>
          @for (p of prices(); track p.raw) {
            <tr>
              <td class="symbol">{{ p.symbol }}</td>
              <td class="price">
                @if (p.price != null) {
                  {{ p.price | number:(p.raw === 'OANDA:AUD_USD' ? '1.4-4' : '1.2-2') }}
                  <span class="currency-unit">{{ p.currency }}</span>
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

        <app-login-chart />
      </div>

      <p class="hint">
        Prices update every 10 seconds<br>
        Login for real-time updates
      </p>

      <div class="card-footer">
        <button type="button" class="login-btn" (click)="login()">
          <svg class="github-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
          </svg>
          Login with GitHub
        </button>
        <div class="login-divider">or</div>
        <button type="button" class="login-btn" (click)="loginWithGoogle()">
          <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Login with Google
        </button>
      </div>
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
      next: snapshot => this.prices.set(snapshot.prices),
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

  loginWithGoogle() {
    this.auth.signInWithGoogle();
  }

  changeClass(pct: number | null): string {
    if (pct == null) return 'neutral';
    if (pct > 0) return 'positive';
    if (pct < 0) return 'negative';
    return 'neutral';
  }

  formatChange(pct: number | null): string {
    if (pct == null) return '---';
    if (pct === 0) return '0.00%';
    const sign = pct > 0 ? '+' : '-';
    const arrow = pct > 0 ? '↑' : '↓';
    return `${sign}${Math.abs(pct).toFixed(2)}% ${arrow}`;
  }
}
