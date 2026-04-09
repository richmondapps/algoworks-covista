import { Component, inject, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private authService = inject(AuthService);

  ngOnInit() {
  }

  loginWithGoogle() {
    this.authService.loginWithGoogle();
  }
}
