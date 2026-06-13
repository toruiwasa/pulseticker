import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TUI_DARK_MODE } from '@taiga-ui/core';

export type ThemePref = 'light' | 'dark' | 'system';
const DARK_CLASS = 'tui-theme-dark';
const TUI_KEY = 'tuiDark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private darkMode = inject(TUI_DARK_MODE);
  private doc = inject(DOCUMENT);

  private _explicitPref = signal<'light' | 'dark' | null>(this.resolveExplicitPref());

  readonly pref = computed<ThemePref>(() => this._explicitPref() ?? 'system');
  readonly isDark = this.darkMode.asReadonly();

  constructor() {
    effect(() => {
      this.doc.documentElement.classList.toggle(DARK_CLASS, this.darkMode());
    });
  }

  toggle() {
    const p = this.pref();
    if (p === 'system') {
      this.darkMode.set(false); this._explicitPref.set('light');
    } else if (p === 'light') {
      this.darkMode.set(true);  this._explicitPref.set('dark');
    } else {
      this.darkMode.reset();    this._explicitPref.set(null);
    }
  }

  private resolveExplicitPref(): 'light' | 'dark' | null {
    const v = localStorage.getItem(TUI_KEY);
    return v === null ? null : v === 'true' ? 'dark' : 'light';
  }
}
