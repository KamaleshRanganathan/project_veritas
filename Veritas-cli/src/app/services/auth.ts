import { Injectable, inject } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut, authState, User , createUserWithEmailAndPassword} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { doc, getDoc, Firestore } from '@angular/fire/firestore';

// Define the possible user roles
export type UserRole = 'student' | 'teacher' | null;

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);
  private router: Router = inject(Router);
  private firestore: Firestore = inject(Firestore); // <-- Inject Firestore

  // Observable to get the current authentication state from Firebase
  public readonly authState$: Observable<User | null> = authState(this.auth);

  // BehaviorSubject to store and observe the user's role
  // It's private to control writes, and exposed as a public observable
  private role$ = new BehaviorSubject<UserRole>(null);
  
  // Public observable for components and guards to read the current role
  public readonly currentRole$: Observable<UserRole> = this.role$.asObservable();

  constructor() {
    // When auth state changes, if user logs out, clear the role
    this.authState$.subscribe(user => {
      if (!user) {
        this.setRole(null);
      }
    });
  }

  // Method to set the user's role after a successful login
  setRole(role: UserRole) {
    this.role$.next(role);
  }
  
  // Generic login method
  async login( email: string,password: string): Promise<void>{
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      if (userCredential.user) {
      // 2. Check Firestore for teacher role verification 
        const teacherDocRef = doc(this.firestore, `login/student-login/details/${email}`);
        const docSnap = await getDoc(teacherDocRef);

        // 3. If document exists, they are a teacher
        if (docSnap.exists()) {
          this.setRole('student');
          this.router.navigate(['/home-student']);
        }
        else{
          // 4. If not, they are not a registered teacher. Log them out immediately.
          console.warn("Access Denied: User is not a registered student.", email);
          alert("Access Denied: Your email is not registered as a student.");
          await this.logout(); // Log out to prevent partial access          
        }
      }
    } catch (error) {
      console.error("Login failed:", error);
      alert("Invalid email or password!");
    }
  }


  async signUp(name:string,email:string,password:string) : Promise<void>{
    // Implement sign-up logic here, e.g., using Firebase Auth's createUserWithEmailAndPassword
    // and then storing additional user details in Firestore if needed.

    try{
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;
      console.log('User created in Firebase:', user.uid);


    }catch(error){
      console.error("Sign-up failed:", error);
      throw error; 
    }
  }

  // New method specifically for teacher login with Firestore verification
  async loginAsTeacher(email: string, password: string): Promise<void> {
    // 1. Authenticate with Firebase Auth first

    try{
    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
    
    if (userCredential.user) {
      // 2. Check Firestore for teacher role verification
    const teacherDocRef = doc(this.firestore, `login/teacher-login/details/${email}`);
    const docSnap = await getDoc(teacherDocRef);

    // 3. If document exists, they are a teacher
    if (docSnap.exists()) {
      this.setRole('teacher');
      this.router.navigate(['/home-teacher']);
    }
    else{
      // 4. If not, they are not a registered teacher. Log them out immediately.
      console.warn("Access Denied: User is not a registered teacher.", email);
      await this.logout(); // Log out to prevent partial access
      alert("Access Denied: Your email is not registered as a teacher.");
    }
  }
    }catch(error){
      console.error("Login failed:", error);
      alert("Invalid email or password!");
    }
  }

  // Logout method now also clears the role
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      this.setRole(null); // Clear the role
      this.router.navigate(['/']); // Redirect to the main welcome page
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }
}

