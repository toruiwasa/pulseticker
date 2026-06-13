import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, SidebarComponent],
  template: `
    <div class="shell-layout">
      <app-header class="shell-header" />
      <app-sidebar class="shell-sidebar" />
      <main class="shell-main">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .shell-layout {
      display: grid;
      grid-template-areas:
        "header header"
        "sidebar main";
      grid-template-rows: var(--pt-header-h) 1fr;
      grid-template-columns: var(--pt-sidebar-w) 1fr;
      height: 100dvh;
      overflow: hidden;
      background: var(--pt-bg-base);
      color: var(--pt-text-primary);
    }

    .shell-header { grid-area: header; }
    .shell-sidebar { grid-area: sidebar; }

    .shell-main {
      grid-area: main;
      overflow-y: auto;
      overflow-x: hidden;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    @media (max-width: 767px) {
      .shell-layout {
        grid-template-areas:
          "header"
          "main"
          "sidebar";
        grid-template-rows: var(--pt-header-h) 1fr 60px;
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class ShellComponent {}
