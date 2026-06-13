import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TuiRoot } from '@taiga-ui/core';
import { ThemeService } from './core/services/theme.service';
import { environment } from '../environments/environment';

const KEEPALIVE_INTERVAL_MS = 14 * 60 * 1000;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TuiRoot],
  template: '<tui-root><router-outlet /></tui-root>',
})
export class App {
  // Injected eagerly so ThemeService constructs (and applies the correct class)
  // before any child component renders, preventing flash-of-wrong-theme.
  private _theme = inject(ThemeService);

  constructor() {
    setInterval(() => {
      fetch(`${environment.apiUrl}/health`).catch(() => {});
    }, KEEPALIVE_INTERVAL_MS);
  }
}
