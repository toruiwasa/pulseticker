import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';

const KEEPALIVE_INTERVAL_MS = 14 * 60 * 1000;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  constructor() {
    setInterval(() => {
      fetch(`${environment.apiUrl}/health`).catch(() => {});
    }, KEEPALIVE_INTERVAL_MS);
  }
}
