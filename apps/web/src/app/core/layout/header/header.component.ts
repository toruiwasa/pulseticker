import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, interval, startWith } from 'rxjs';
import { Router } from '@angular/router';
import { isMarketOpen } from '@pulseticker/trading-utils';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [],
  template: `
    <header class="header-bar">
      <span class="logo">pulseticker</span>

      <div class="header-center">
        @if (marketOpen()) {
          <span class="badge badge-live" role="status">
            <span class="dot dot-live" aria-hidden="true">●</span>
            Market open
          </span>
        } @else {
          <span class="badge badge-closed" role="status">
            <span class="dot" aria-hidden="true">○</span>
            Market closed
          </span>
        }

        @if (audUsd() !== null) {
          <span class="fx-rate" title="AUD/USD live rate">
            AUD/USD {{ audUsd()!.toFixed(5) }}
            <span [class]="audUsdDir() === 'up' ? 'dir-up' : audUsdDir() === 'down' ? 'dir-down' : ''"
                  [attr.aria-label]="audUsdDir()">
              {{ audUsdDir() === 'up' ? '▲' : audUsdDir() === 'down' ? '▼' : '' }}
            </span>
          </span>
        }
      </div>

      <div class="header-actions">
        <button
          class="logout-btn"
          (click)="logout()"
          aria-label="Log out"
        >
          Log out
        </button>
      </div>
    </header>
  `,
  styles: [`
    :host {
      display: block;
    }

    .header-bar {
      height: var(--pt-header-h);
      background: var(--pt-bg-surface);
      border-bottom: 1px solid var(--pt-border);
      display: flex;
      align-items: center;
      padding: 0 1rem;
      gap: 1rem;
      z-index: 100;
    }

    .logo {
      font-weight: 700;
      font-size: 1.0625rem;
      color: var(--pt-primary);
      letter-spacing: -0.02em;
      white-space: nowrap;
    }

    .header-center {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-left: auto;
    }

    .badge {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .badge-live { color: var(--pt-up); }
    .badge-closed { color: var(--pt-neutral); }

    .dot-live { animation: pulse 2s infinite; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .fx-rate {
      font-size: 0.8rem;
      color: var(--pt-text-secondary);
      white-space: nowrap;
    }

    .dir-up { color: var(--pt-up); }
    .dir-down { color: var(--pt-down); }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-left: 1rem;
    }

    .logout-btn {
      padding: 0.25rem 0.75rem;
      border-radius: 6px;
      border: 1px solid var(--pt-border);
      background: transparent;
      color: var(--pt-text-secondary);
      font-size: 0.8rem;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
      white-space: nowrap;
    }

    .logout-btn:hover {
      border-color: var(--pt-down);
      color: var(--pt-down);
    }

    .logout-btn:focus-visible {
      outline: 2px solid var(--pt-primary);
      outline-offset: 2px;
    }
  `],
})
export class HeaderComponent implements OnInit {
  protected auth = inject(AuthService);
  private socket = inject(SocketService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);

  protected marketOpen = signal(isMarketOpen());
  protected audUsd = signal<number | null>(null);
  protected audUsdDir = signal<'up' | 'down' | ''>('');

  protected async logout() {
    await this.auth.signOut();
    this.router.navigate(['/']);
  }

  ngOnInit() {
    interval(30_000)
      .pipe(startWith(0), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.marketOpen.set(isMarketOpen()));

    this.socket.price$
      .pipe(
        filter(t => t.symbol === 'OANDA:AUD_USD'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(tick => {
        const prev = this.audUsd();
        this.audUsdDir.set(prev === null ? '' : tick.price > prev ? 'up' : tick.price < prev ? 'down' : '');
        this.audUsd.set(tick.price);
      });
  }
}
