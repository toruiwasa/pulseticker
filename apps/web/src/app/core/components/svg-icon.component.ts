import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'chart-bar' | 'list' | 'bell' | 'compass' | 'settings'
  | 'sun' | 'moon' | 'monitor';

interface IconPath {
  d: string;
}

const ICONS: Record<IconName, IconPath[]> = {
  'chart-bar': [
    { d: 'M3 3v16a2 2 0 0 0 2 2h16' },
    { d: 'M7 16h8' },
    { d: 'M7 11h12' },
    { d: 'M7 6h3' },
  ],
  'list': [
    { d: 'M9 6h11' },
    { d: 'M9 12h11' },
    { d: 'M9 18h11' },
    { d: 'M5 6h.01' },
    { d: 'M5 12h.01' },
    { d: 'M5 18h.01' },
  ],
  'bell': [
    { d: 'M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6' },
    { d: 'M9 17v1a3 3 0 0 0 6 0v-1' },
  ],
  'compass': [
    { d: 'M8 16l2-6 6-2-2 6z' },
    { d: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z' },
  ],
  'settings': [
    { d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065z' },
    { d: 'M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0' },
  ],
  'sun': [
    { d: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z' },
    { d: 'M3 12h1' },
    { d: 'M12 3v1' },
    { d: 'M20 12h1' },
    { d: 'M12 20v1' },
    { d: 'M5.6 5.6l.7.7' },
    { d: 'M18.4 5.6l-.7.7' },
    { d: 'M17.7 17.7l.7.7' },
    { d: 'M6.3 17.7l-.7.7' },
  ],
  'moon': [
    { d: 'M12 3h.393a7.5 7.5 0 0 0 7.92 12.446A9 9 0 1 1 12 2.992z' },
  ],
  'monitor': [
    { d: 'M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z' },
    { d: 'M7 20h10' },
    { d: 'M9 16v4' },
    { d: 'M15 16v4' },
  ],
};

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @for (p of paths(); track $index) {
        <path [attr.d]="p.d" />
      }
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; line-height: 0; }
    svg { display: block; }
  `],
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input<string | number>('1em');
  protected paths = () => ICONS[this.name()];
}
