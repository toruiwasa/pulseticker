import { Component } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  standalone: true,
  template: `
    <h1>PulseTicker</h1>
    <button (click)="login()">Login with GitHub</button>
  `,
})
export class LoginComponent {
  constructor(private auth: AuthService) {}
  login() { this.auth.signInWithGitHub(); }
}
