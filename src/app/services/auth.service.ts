import { Injectable, inject, signal } from '@angular/core';
import { Auth, authState, signInWithPopup, GoogleAuthProvider, signOut, User, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from '@angular/fire/auth';
import { Firestore, collection, addDoc, serverTimestamp } from '@angular/fire/firestore';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);

  currentUser = signal<User | null | undefined>(undefined);

  constructor() {
    authState(this.auth).subscribe((user) => {
      this.currentUser.set(user);
    });
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(this.auth, provider);
      await this.trackLogin(result.user);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      alert('Failed to sign in with Google');
    }
  }

  async sendMagicLink(email: string) {
    const actionCodeSettings = {
      url: window.location.origin + '/login',
      handleCodeInApp: true,
    };
    try {
      await sendSignInLinkToEmail(this.auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      alert('Verification link sent! Check your email.');
    } catch (error: any) {
      console.error('Error sending magic link:', error);
      alert('Failed to send magic link: ' + error.message);
    }
  }

  async confirmMagicLink(url: string) {
    if (isSignInWithEmailLink(this.auth, url)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Please provide your email for confirmation');
      }
      if (email) {
        try {
          const result = await signInWithEmailLink(this.auth, email, url);
          window.localStorage.removeItem('emailForSignIn');
          await this.trackLogin(result.user);
          this.router.navigate(['/dashboard']);
        } catch (error: any) {
          console.error('Error verifying magic link', error);
          alert('Error signing in: ' + error.message);
        }
      }
    }
  }

  async logout() {
    await signOut(this.auth);
    this.router.navigate(['/login']);
  }

  private async trackLogin(user: User) {
    try {
      const loginsRef = collection(this.firestore, 'logins');
      await addDoc(loginsRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        timestamp: serverTimestamp()
      });
      console.log('Login tracked in firestore.');
    } catch (error) {
      console.error('Failed to log login event', error);
    }
  }
}
