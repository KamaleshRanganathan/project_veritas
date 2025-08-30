import { Injectable, inject } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut, authState, User} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth: Auth = inject(Auth);
  private router: Router = inject(Router);

  // Observable to get the current authentication state
  public readonly authState$: Observable<User | null> = authState(this.auth);

  constructor() { }

  // Login method
  async login(email: string, password: string): Promise<void> {
    try {
      const userCredentail = await signInWithEmailAndPassword(
        this.auth,
        email,
        password
      );
      if (userCredentail.user) {
        this.router.navigate(['/home']);
      }
    } catch (error) {
      console.error('Login Failed : ', error);
      alert('Invalid Username/Password');
    }
  }
  //Logout method
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Logout Failed : ', error);
    }
  }
}
