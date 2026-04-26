import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Strict string bypass check specific to Admin's email constraint
  const isAdmin = authService.isAdmin;

  if (isAdmin) {
    return true;
  }

  alert(
    'Unauthorized Access: You do not have permission to view the AI Configuration Settings.',
  );
  return router.parseUrl('/dashboard');
};
