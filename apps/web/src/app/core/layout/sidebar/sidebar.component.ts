import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent, IconName } from '../../components/svg-icon.component';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  mobileOnly: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'chart-bar', mobileOnly: false },
  { path: '/watchlist', label: 'Watchlist', icon: 'list',      mobileOnly: true  },
  { path: '/alerts',    label: 'Alerts',    icon: 'bell',      mobileOnly: false },
  { path: '/settings',  label: 'Settings',  icon: 'settings',  mobileOnly: false },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav class="sidebar" aria-label="Main navigation">
      @for (item of navItems; track item.path) {
        <a
          [routerLink]="item.path"
          routerLinkActive="active"
          class="nav-item"
          [class.mobile-only]="item.mobileOnly"
          [attr.aria-label]="item.label"
          [title]="item.label"
        >
          <app-icon [name]="item.icon" size="20" />
        </a>
      }
    </nav>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar {
      flex: 1;
      background: var(--pt-bg-surface);
      border-right: 1px solid var(--pt-border);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.5rem 0;
      gap: 0.25rem;
      overflow: hidden;
    }

    .nav-item {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      color: var(--pt-text-secondary);
      text-decoration: none;
      transition: background 0.15s, color 0.15s;
    }

    .nav-item:hover {
      background: var(--pt-bg-elevated);
      color: var(--pt-primary);
    }

    .nav-item.active {
      color: var(--pt-primary);
      background: color-mix(in srgb, var(--pt-primary) 12%, transparent);
    }

    .nav-item:focus-visible {
      outline: 2px solid var(--pt-primary);
      outline-offset: 2px;
    }

    /* Watchlist tab only appears in the mobile bottom bar */
    .mobile-only { display: none; }

    /* Mobile: bottom tab bar */
    @media (max-width: 767px) {
      :host {
        flex-direction: row;
      }

      .sidebar {
        flex-direction: row;
        justify-content: space-around;
        width: 100%;
        height: 60px;
        border-right: none;
        border-top: 1px solid var(--pt-border);
        padding: 0;
      }

      .nav-item {
        flex: 1;
        height: 100%;
        border-radius: 0;
        flex-direction: column;
        gap: 2px;
        font-size: 0.7rem;
      }

      .mobile-only { display: flex; }
    }
  `],
})
export class SidebarComponent {
  protected readonly navItems = NAV_ITEMS;
}
