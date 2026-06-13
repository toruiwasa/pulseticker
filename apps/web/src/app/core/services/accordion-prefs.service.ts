import { Injectable } from '@angular/core';

const KEY = 'pulseticker:context-panel';

@Injectable({ providedIn: 'root' })
export class AccordionPrefsService {
  get(): boolean {
    return localStorage.getItem(KEY) === 'open';
  }

  set(open: boolean): void {
    localStorage.setItem(KEY, open ? 'open' : 'closed');
  }
}
