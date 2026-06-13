import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, booleanAttribute, signal } from '@angular/core';
import { Subject, Subscription, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { ApiService, SymbolSearchResult } from '../services/api.service';
import { OandaPipe } from '../pipes/oanda.pipe';

@Component({
  selector: 'app-symbol-search',
  standalone: true,
  imports: [OandaPipe],
  template: `
    <div class="search-root">
      <input
        class="search-input"
        type="text"
        [placeholder]="placeholder"
        [value]="searchQuery()"
        [disabled]="disabled"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
      />
      @if (results().length > 0) {
        <ul class="dropdown" role="listbox">
          @for (r of results(); track r.symbol; let i = $index) {
            <li
              class="dropdown-item"
              [class.active]="i === activeIndex()"
              role="option"
              [attr.aria-selected]="i === activeIndex()"
              (click)="select(r.symbol)"
              (mouseenter)="activeIndex.set(i)"
            >
              <strong>{{ r.symbol | oanda }}</strong>
              <span class="description">{{ r.description }}</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .search-root { position: relative; }

    .search-input {
      width: 100%;
      padding: 0.4rem 0.6rem;
      box-sizing: border-box;
      border: 1px solid var(--pt-border);
      border-radius: 6px;
      background: var(--pt-bg-surface);
      color: var(--pt-text-primary);
      font-family: inherit;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.15s;
    }

    .search-input:focus { border-color: var(--pt-primary); }
    .search-input:disabled { opacity: 0.5; cursor: not-allowed; }

    .dropdown {
      position: absolute;
      left: 0; right: 0; top: calc(100% + 2px);
      background: var(--pt-bg-surface);
      border: 1px solid var(--pt-border);
      border-radius: 6px;
      list-style: none;
      margin: 0; padding: 0;
      z-index: 200;
      max-height: 280px;
      overflow-y: auto;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }

    .dropdown-item {
      padding: 0.4rem 0.6rem;
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.1s;
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
    }

    .dropdown-item:hover,
    .dropdown-item.active {
      background: color-mix(in srgb, var(--pt-primary) 8%, transparent);
    }

    .dropdown-item strong { color: var(--pt-text-primary); }
    .description { color: var(--pt-text-secondary); font-size: 0.8rem; }
  `],
})
export class SymbolSearchInputComponent implements OnInit, OnDestroy {
  @Input({ transform: booleanAttribute }) clearOnSelect = false;
  @Input() disabled = false;
  @Input() placeholder = 'Search symbol…';
  @Output() symbolSelected = new EventEmitter<string>();

  searchQuery = signal('');
  results = signal<SymbolSearchResult[]>([]);
  activeIndex = signal(-1);

  private search$ = new Subject<string>();
  private searchSub?: Subscription;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.searchSub = this.search$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(q => {
          if (!q.trim()) { this.results.set([]); return of<SymbolSearchResult[]>([]); }
          return this.api.searchSymbols(q.trim());
        }),
      )
      .subscribe({
        next: results => { this.results.set(results); this.activeIndex.set(-1); },
      });
  }

  ngOnDestroy() {
    this.searchSub?.unsubscribe();
  }

  onInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.searchQuery.set(v);
    this.search$.next(v.replace(/[\/_]+/g, ' '));
  }

  onKeydown(event: KeyboardEvent) {
    const r = this.results();
    if (event.key === 'Escape') {
      this.clear();
      return;
    }
    if (!r.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update(i => Math.min(i + 1, r.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update(i => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      const i = this.activeIndex();
      if (i >= 0 && i < r.length) this.select(r[i].symbol);
    }
  }

  select(symbol: string) {
    if (this.clearOnSelect) {
      this.clear();
    } else {
      const display = symbol.startsWith('OANDA:')
        ? symbol.slice(6).replace('_', '/')
        : symbol;
      this.searchQuery.set(display);
      this.results.set([]);
      this.activeIndex.set(-1);
    }
    this.symbolSelected.emit(symbol);
  }

  clear() {
    this.searchQuery.set('');
    this.results.set([]);
    this.activeIndex.set(-1);
  }
}
