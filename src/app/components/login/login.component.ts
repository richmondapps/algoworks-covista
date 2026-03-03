import { Component, inject, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private authService = inject(AuthService);
  email = '';
  isSending = false;

  ngOnInit() {
    this.authService.confirmMagicLink(window.location.href);
  }

  loginWithGoogle() {
    this.authService.loginWithGoogle();
  }

  async sendMagicLink() {
    if (!this.email) {
      alert("Please enter your email address first");
      return;
    }
    this.isSending = true;
    await this.authService.sendMagicLink(this.email);
    this.isSending = false;
  }
}
