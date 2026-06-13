import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, interval, startWith } from 'rxjs';
import { TuiIcon } from '@taiga-ui/core';
import { isMarketOpen } from '@pulseticker/trading-utils';
import { ThemeService } from '../../services/theme.service';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [TuiIcon],
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
          class="icon-btn"
          (click)="theme.toggle()"
          [attr.aria-label]="themeButtonLabel()"
          [title]="themeButtonLabel()"
        >
          <tui-icon [icon]="themeIcon()" />
        </button>

        <button
          class="avatar-btn"
          (click)="auth.signOut()"
          aria-label="Sign out"
          title="Sign out"
        >
          {{ initials() }}
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
      font-size: 1rem;
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

    .icon-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--pt-text-secondary);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      padding: 0;
    }

    .icon-btn:hover {
      background: var(--pt-bg-elevated);
      color: var(--pt-primary);
    }

    .icon-btn:focus-visible {
      outline: 2px solid var(--pt-primary);
      outline-offset: 2px;
    }

    .avatar-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1.5px solid var(--pt-border);
      background: var(--pt-bg-elevated);
      color: var(--pt-text-primary);
      font-size: 0.7rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.15s;
    }

    .avatar-btn:hover { border-color: var(--pt-primary); }

    .avatar-btn:focus-visible {
      outline: 2px solid var(--pt-primary);
      outline-offset: 2px;
    }
  `],
})
export class HeaderComponent implements OnInit {
  protected theme = inject(ThemeService);
  protected auth = inject(AuthService);
  private socket = inject(SocketService);
  private destroyRef = inject(DestroyRef);

  protected marketOpen = signal(isMarketOpen());
  protected audUsd = signal<number | null>(null);
  protected audUsdDir = signal<'up' | 'down' | ''>('');
  protected initials = signal('');

  protected themeIcon = computed(() => {
    const p = this.theme.pref();
    return p === 'light' ? '@tui.sun' : p === 'dark' ? '@tui.moon' : '@tui.monitor';
  });

  protected themeButtonLabel = computed(() => {
    const p = this.theme.pref();
    return p === 'light' ? 'Switch to dark mode' :
           p === 'dark'  ? 'Follow system theme' : 'Switch to light mode';
  });

  ngOnInit() {
    this.auth.session$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(session => {
      const name = session?.user?.user_metadata?.['full_name'] || session?.user?.email || '';
      this.initials.set(
        name.split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join(''),
      );
    });

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
