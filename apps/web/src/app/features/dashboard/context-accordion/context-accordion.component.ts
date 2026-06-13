import {
  Component,
  OnChanges,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ApiService,
  CompanyMetrics,
  CompanyProfile,
  NewsItem,
} from '../../../core/services/api.service';
import { AccordionPrefsService } from '../../../core/services/accordion-prefs.service';

@Component({
  selector: 'app-context-accordion',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `
    @if (symbol() && !isForex()) {
      <div class="accordion">
        <div class="accordion-item">
          <button
            class="accordion-trigger"
            [attr.aria-expanded]="profileOpen()"
            (click)="toggleProfile()"
          >
            <span>{{ profileLabel() }}</span>
            <span class="chevron" [class.open]="profileOpen()">▼</span>
          </button>

          @if (profileOpen()) {
            <div class="accordion-content" role="region">
              @if (profileLoading()) {
                <p class="loading-msg">Loading…</p>
              } @else if (profile()) {
                <dl class="profile-grid">
                  <dt>Market cap</dt>
                  <dd>{{ formatMarketCap(profile()!.marketCap) }}</dd>
                  @if (metrics()) {
                    <dt>P/E ratio</dt>
                    <dd>{{ metrics()!.pe !== null ? (metrics()!.pe! | number:'1.1-1') : '—' }}</dd>
                    <dt>52w high</dt>
                    <dd>{{ metrics()!.weekHigh52 | number:'1.2-2' }}</dd>
                    <dt>52w low</dt>
                    <dd>{{ metrics()!.weekLow52 | number:'1.2-2' }}</dd>
                    <dt>Dividend</dt>
                    <dd>{{ metrics()!.dividendYield !== null ? (metrics()!.dividendYield! | number:'1.2-2') + '%' : '—' }}</dd>
                    <dt>Beta</dt>
                    <dd>{{ metrics()!.beta !== null ? (metrics()!.beta! | number:'1.2-2') : '—' }}</dd>
                  }
                </dl>
              } @else {
                <p class="empty-msg">No company data available.</p>
              }
            </div>
          }
        </div>

        <div class="accordion-item">
          <button
            class="accordion-trigger"
            [attr.aria-expanded]="newsOpen()"
            (click)="toggleNews()"
          >
            <span>Recent news</span>
            <span class="chevron" [class.open]="newsOpen()">▼</span>
          </button>

          @if (newsOpen()) {
            <div class="accordion-content" role="region">
              @if (newsLoading()) {
                <p class="loading-msg">Loading…</p>
              } @else if (news().length > 0) {
                <ul class="news-list">
                  @for (item of news(); track item.url) {
                    <li class="news-item">
                      <a [href]="item.url" target="_blank" rel="noopener noreferrer" class="news-link">
                        {{ item.headline }}
                      </a>
                      <span class="news-meta">
                        {{ item.source }} · {{ item.datetime * 1000 | date:'MMM d' }}
                      </span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="empty-msg">No recent news.</p>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .accordion {
      border-top: 1px solid var(--pt-border);
      flex-shrink: 0;
    }

    .accordion-item {
      border-bottom: 1px solid var(--pt-border);
    }

    .accordion-trigger {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.6rem 1rem;
      background: var(--pt-bg-surface);
      border: none;
      cursor: pointer;
      color: var(--pt-text-primary);
      font-size: 0.8rem;
      font-weight: 600;
      text-align: left;
      transition: background 0.15s;
    }

    .accordion-trigger:hover { background: var(--pt-bg-elevated); }

    .accordion-trigger:focus-visible {
      outline: 2px solid var(--pt-primary);
      outline-offset: -2px;
    }

    .chevron {
      font-size: 0.7rem;
      color: var(--pt-text-muted);
      transition: transform 0.2s;
      display: inline-block;
    }

    .chevron.open { transform: rotate(180deg); }

    .accordion-content {
      padding: 0.75rem 1rem;
      background: var(--pt-bg-base);
    }

    .profile-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem 1rem;
      margin: 0;
      font-size: 0.85rem;
    }

    dt {
      color: var(--pt-text-muted);
      font-weight: 400;
    }

    dd {
      margin: 0;
      color: var(--pt-text-primary);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .loading-msg, .empty-msg {
      font-size: 0.8rem;
      color: var(--pt-text-muted);
      margin: 0;
    }

    .news-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .news-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .news-link {
      font-size: 0.8rem;
      color: var(--pt-primary);
      text-decoration: none;
      line-height: 1.3;
    }

    .news-link:hover { text-decoration: underline; }

    .news-meta {
      font-size: 0.75rem;
      color: var(--pt-text-muted);
    }
  `],
})
export class ContextAccordionComponent implements OnChanges {
  readonly symbol = input<string | null>(null);

  private api = inject(ApiService);
  private prefs = inject(AccordionPrefsService);

  protected profile = signal<CompanyProfile | null>(null);
  protected metrics = signal<CompanyMetrics | null>(null);
  protected news = signal<NewsItem[]>([]);
  protected profileLoading = signal(false);
  protected newsLoading = signal(false);
  protected profileOpen = signal(false);
  protected newsOpen = signal(false);

  protected isForex = () => this.symbol()?.startsWith('OANDA:') ?? true;

  protected profileLabel = () => {
    const sym = this.symbol();
    const name = this.profile()?.name;
    return name ? `${sym} — ${name}` : (sym ?? 'Company info');
  };

  ngOnChanges() {
    const sym = this.symbol();
    if (!sym || this.isForex()) return;

    const prefOpen = this.prefs.get();
    this.profileOpen.set(prefOpen);
    this.newsOpen.set(prefOpen);

    this.profile.set(null);
    this.metrics.set(null);
    this.news.set([]);

    if (prefOpen) {
      this.loadProfile(sym);
      this.loadNews(sym);
    }
  }

  protected toggleProfile() {
    const next = !this.profileOpen();
    this.profileOpen.set(next);
    this.prefs.set(next || this.newsOpen());
    const sym = this.symbol();
    if (next && sym && !this.profile() && !this.profileLoading()) {
      this.loadProfile(sym);
    }
  }

  protected toggleNews() {
    const next = !this.newsOpen();
    this.newsOpen.set(next);
    this.prefs.set(this.profileOpen() || next);
    const sym = this.symbol();
    if (next && sym && this.news().length === 0 && !this.newsLoading()) {
      this.loadNews(sym);
    }
  }

  private loadProfile(sym: string) {
    this.profileLoading.set(true);
    this.api.getCompanyProfile(sym).subscribe({
      next: p => { this.profile.set(p); this.profileLoading.set(false); },
      error: () => { this.profile.set(null); this.profileLoading.set(false); },
    });
    this.api.getCompanyMetrics(sym).subscribe({
      next: m => this.metrics.set(m),
      error: () => this.metrics.set(null),
    });
  }

  private loadNews(sym: string) {
    this.newsLoading.set(true);
    this.api.getCompanyNews(sym).subscribe({
      next: items => { this.news.set(items); this.newsLoading.set(false); },
      error: () => { this.news.set([]); this.newsLoading.set(false); },
    });
  }

  protected formatMarketCap(val: number): string {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}T`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}B`;
    return `$${val.toFixed(0)}M`;
  }
}
