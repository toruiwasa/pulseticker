import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({ standalone: true, template: '<p>Signing in…</p>' })
export class CallbackComponent implements OnInit {
  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  async ngOnInit() {
    const error = this.route.snapshot.queryParamMap.get('error');
    if (error) {
      this.router.navigate(['/']);
      return;
    }
    const session = await this.auth.handleCallback();
    this.router.navigate([session ? '/dashboard' : '/']);
  }
}
