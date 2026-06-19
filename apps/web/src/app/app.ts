import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TuiRoot } from '@taiga-ui/core';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TuiRoot],
  template: '<tui-root><router-outlet /></tui-root>',
})
export class App {
  // Injected eagerly so ThemeService constructs (and applies the correct class)
  // before any child component renders, preventing flash-of-wrong-theme.
  private _theme = inject(ThemeService);
}
