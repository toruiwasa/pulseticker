import { Component, inject } from '@angular/core';
import { ThemeService, ThemePref } from '../../core/services/theme.service';
import { IconComponent } from '../../core/components/svg-icon.component';

interface ThemeOption {
  value: ThemePref;
  label: string;
  icon: 'monitor' | 'sun' | 'moon';
}

@Component({
  standalone: true,
  selector: 'app-settings',
  imports: [IconComponent],
  template: `
    <div class="settings-page">
      <section class="section">
        <h2 class="section-title">Appearance</h2>
        <div class="theme-group" role="group" aria-label="Theme preference">
          @for (opt of themeOptions; track opt.value) {
            <button
              class="theme-btn"
              [class.active]="theme.pref() === opt.value"
              [attr.aria-pressed]="theme.pref() === opt.value"
              (click)="theme.set(opt.value)"
            >
              <app-icon [name]="opt.icon" size="16" />
              {{ opt.label }}
            </button>
          }
        </div>
        <p class="hint">
          @if (theme.pref() === 'system') {
            Following your system preference (currently {{ theme.isDark() ? 'dark' : 'light' }})
          } @else {
            Theme locked to {{ theme.pref() }} mode
          }
        </p>
      </section>
    </div>
  `,
  styles: [`
    .settings-page {
      padding: 1.5rem;
      max-width: 480px;
      color: var(--pt-text-primary);
    }

    .section-title {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--pt-text-muted);
      margin: 0 0 0.75rem;
    }

    .theme-group {
      display: flex;
      gap: 0.5rem;
    }

    .theme-btn {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.45rem 0.9rem;
      border-radius: 6px;
      border: 1px solid var(--pt-border);
      background: var(--pt-bg-elevated);
      color: var(--pt-text-secondary);
      font-size: 0.85rem;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s, background 0.15s;
    }

    .theme-btn:hover {
      border-color: var(--pt-primary);
      color: var(--pt-primary);
    }

    .theme-btn.active {
      border-color: var(--pt-primary);
      background: color-mix(in srgb, var(--pt-primary) 12%, transparent);
      color: var(--pt-primary);
      font-weight: 600;
    }

    .theme-btn:focus-visible {
      outline: 2px solid var(--pt-primary);
      outline-offset: 2px;
    }

    .hint {
      margin: 0.6rem 0 0;
      font-size: 0.78rem;
      color: var(--pt-text-muted);
    }
  `],
})
export class SettingsComponent {
  protected theme = inject(ThemeService);

  protected readonly themeOptions: ThemeOption[] = [
    { value: 'system', label: 'System', icon: 'monitor' },
    { value: 'light',  label: 'Light',  icon: 'sun'     },
    { value: 'dark',   label: 'Dark',   icon: 'moon'    },
  ];
}
