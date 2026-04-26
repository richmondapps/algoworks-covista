import { Component, inject, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [],
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

  loginWithOkta() {
    this.authService.loginWithOkta();
  }


}
