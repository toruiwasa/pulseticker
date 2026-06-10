import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, booleanAttribute, signal } from '@angular/core';
import { Subject, Subscription, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { ApiService, SymbolSearchResult } from '../services/api.service';
import { OandaPipe } from '../pipes/oanda.pipe';

@Component({
  selector: 'app-symbol-search',
  standalone: true,
  imports: [OandaPipe],
  template: `
    <div style="position:relative">
      <input
        type="text"
        [placeholder]="placeholder"
        [value]="searchQuery()"
        [disabled]="disabled"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        style="padding:0.4rem 0.6rem;width:200px;box-sizing:border-box"
      />
      @if (results().length > 0) {
        <ul style="position:absolute;left:0;right:0;top:100%;background:#fff;border:1px solid #ccc;list-style:none;margin:0;padding:0;z-index:10;max-height:280px;overflow-y:auto">
          @for (r of results(); track r.symbol; let i = $index) {
            <li
              [style.background]="i === activeIndex() ? '#eef2ff' : 'transparent'"
              style="padding:0.4rem 0.6rem;cursor:pointer"
              (click)="select(r.symbol)"
              (mouseenter)="activeIndex.set(i)"
            >
              <strong>{{ r.symbol | oanda }}</strong>
              <span style="color:#666;margin-left:0.5rem">{{ r.description }}</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
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
