import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { LoggerService } from '../../../core/services/logger.service';

@Component({ standalone: true, template: '<p>Signing in…</p>' })
export class CallbackComponent implements OnInit {
  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private logger: LoggerService,
  ) {}

  async ngOnInit() {
    const code  = this.route.snapshot.queryParamMap.get('code');
    const error = this.route.snapshot.queryParamMap.get('error');
    this.logger.debug('AUTH:CALLBACK', 'ngOnInit', { hasCode: !!code, hasError: !!error });

    if (error || !code) {
      this.logger.warn('AUTH:CALLBACK', 'missing code or OAuth error param');
      await this.router.navigate(['/'], { replaceUrl: true });
      return;
    }

    const session = await this.auth.exchangeCode(code);
    const dest = session ? '/dashboard' : '/';
    this.logger.info('AUTH:CALLBACK', `navigating to ${dest}`, { hasSession: !!session });
    await this.router.navigate([dest], { replaceUrl: true });
  }
}
