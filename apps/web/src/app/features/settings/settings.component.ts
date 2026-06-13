import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-settings',
  template: `
    <div class="stub-page">
      <h1>Settings</h1>
      <p>Coming soon.</p>
    </div>
  `,
  styles: [`
    .stub-page {
      padding: 2rem;
      color: var(--pt-text-primary);
    }
    h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
    p { color: var(--pt-text-secondary); }
  `],
})
export class SettingsComponent {}
