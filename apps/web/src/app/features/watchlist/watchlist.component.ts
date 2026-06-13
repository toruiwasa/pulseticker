import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { filter, take } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { WatchlistStateService } from '../../core/services/watchlist-state.service';
import { WatchlistPanelComponent } from '../dashboard/watchlist-panel/watchlist-panel.component';

@Component({
  standalone: true,
  selector: 'app-watchlist-page',
  imports: [WatchlistPanelComponent],
  template: `
    @if (wl.loading()) {
      <div class="loading-state">Loading…</div>
    } @else {
      <app-watchlist-panel
        [watchlist]="wl.watchlist()"
        [prices]="wl.prices()"
        [timestamps]="wl.timestamps()"
        [isLive]="wl.isLive()"
        [activeSymbol]="null"
        [atLimit]="wl.atLimit()"
        (symbolSelected)="openChart($event)"
        (symbolAdded)="wl.addSymbol($event)"
        (symbolRemoved)="wl.removeSymbol($event)"
      />
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; background: var(--pt-bg-surface); }

    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--pt-text-muted);
      font-size: 0.9rem;
    }
  `],
})
export class WatchlistPageComponent implements OnInit {
  protected wl = inject(WatchlistStateService);
  private auth = inject(AuthService);
  private router = inject(Router);

  ngOnInit() {
    this.auth.session$.pipe(filter(Boolean), take(1)).subscribe(session => {
      this.wl.load(session);
    });
  }

  protected openChart(symbol: string) {
    this.router.navigate(['/dashboard'], { queryParams: { symbol } });
  }
}
