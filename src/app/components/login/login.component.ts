import { Component, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private authService = inject(AuthService);

  loginWithGoogle() {
    this.authService.loginWithGoogle();
  }

  magicLinkComingSoon() {
    alert("Magic Link authentication is coming soon! Please use Google login for now.");
  }
}
