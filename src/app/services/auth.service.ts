import { Injectable, inject, signal } from '@angular/core';
import {
  Auth,
  authState,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  User,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from '@angular/fire/auth';
import {
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  onSnapshot,
  arrayUnion,
  updateDoc
} from '@angular/fire/firestore';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);

  currentUser = signal<User | null | undefined>(undefined);
  adminWhitelist = signal<string[]>([]);

  constructor() {
    authState(this.auth).subscribe((user) => {
      this.currentUser.set(user);
    });

    onSnapshot(doc(this.firestore, 'system_config', 'admin_whitelist'), (snapshot) => {
      if (snapshot.exists()) {
        this.adminWhitelist.set(snapshot.data()['emails'] || []);
      }
    }, (error) => {
      console.warn("Could not sync admin whitelist", error);
    });
  }

  get isSuperAdmin(): boolean {
    const email = this.currentUser()?.email?.toLowerCase() || '';
    return email.includes('jake') || email.includes('garland') || email.includes('d51029069');
  }

  get isAdmin(): boolean {
    const email = this.currentUser()?.email?.toLowerCase() || '';
    if (this.isSuperAdmin) return true;
    return this.adminWhitelist().some(whitelisted => email.includes(whitelisted.toLowerCase()));
  }

  async addWhitelistAdmin(email: string) {
    if (!this.isAdmin) return; // Note: they requested Bryan (an admin) can also add emails
    if (!email) return;
    try {
      const currentList = this.adminWhitelist();
      if (!currentList.includes(email)) {
        await updateDoc(doc(this.firestore, 'system_config', 'admin_whitelist'), {
          emails: arrayUnion(email)
        });
        alert(`${email} successfully added to the Admin Whitelist!`);
      } else {
        alert(`${email} is already verified.`);
      }
    } catch (e: any) {
      console.error(e);
      alert('Failed to add admin: ' + e.message);
    }
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

  async loginWithOkta() {
    const provider = new OAuthProvider('oidc.okta');
    try {
      const result = await signInWithPopup(this.auth, provider);
      await this.trackLogin(result.user);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Okta Sign-In Error:', error);
      alert('Failed to sign in with Okta');
    }
  }

  async loginWithEmail(email: string, pass: string) {
    if (!email || !pass) {
      alert('Please provide both email and password.');
      return;
    }

    const validDomains = ['@adtalem.com', '@covista.com'];
    const isDomainApproved = validDomains.some((d) =>
      email.toLowerCase().endsWith(d),
    );
    if (!isDomainApproved) {
      alert(
        'Unauthorized domain. Only Adtalem and Covista domains are officially permitted.',
      );
      return;
    }

    try {
      const result = await signInWithEmailAndPassword(this.auth, email, pass);
      await this.trackLogin(result.user);
      this.router.navigate(['/dashboard']);
    } catch (error: any) {
      if (
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/user-not-found'
      ) {
        // Trigger seamless Auto-Registration if it's a new approved domain user
        try {
          const result = await createUserWithEmailAndPassword(
            this.auth,
            email,
            pass,
          );
          await this.trackLogin(result.user);
          this.router.navigate(['/dashboard']);
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
            alert('Incorrect password. Please try again.');
          } else {
            console.error('Email Sign-Up Error:', err);
            alert('Failed to register account: ' + err.message);
          }
        }
      } else {
        console.error('Email Sign-In Error:', error);
        alert('Failed to sign in with Email: ' + error.message);
      }
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
        timestamp: serverTimestamp(),
      });
      console.log('Login tracked in firestore.');
    } catch (error) {
      console.error('Failed to log login event', error);
    }
  }
}
