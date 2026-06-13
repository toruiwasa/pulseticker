import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-discover',
  template: `
    <div class="stub-page">
      <h1>Discover</h1>
      <p>Coming soon — REQ-14.</p>
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
export class DiscoverComponent {}
