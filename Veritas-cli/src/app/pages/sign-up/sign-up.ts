import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api';
import { Router } from '@angular/router';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-sign-up',
  imports: [CommonModule, FormsModule],
  templateUrl: './sign-up.html',
  styleUrl: './sign-up.css'
})
export class SignUp {
  private authService: AuthService = inject(AuthService);
  private apiService: ApiService = inject(ApiService);
  private router: Router = inject(Router);
  private firestore: Firestore = inject(Firestore);

  async oncreateAccount(loginForm: NgForm) {
    if (loginForm.invalid) {
      alert("Invalid Username / Password");
      return;
    }
    const name = loginForm.value.name;
    const email = loginForm.value.email;
    const password = loginForm.value.password1;
    const password2 = loginForm.value.password2;
    if (password !== password2) {
      alert("Passwords do not match");
      return;
    }
    try {
      const user = await this.authService.signUp(name, email, password);
      if (user) {
        // Add user's name to Firestore
        const studentDocRef = doc(this.firestore, `login/student-login/details/${email}`);
        await setDoc(studentDocRef, { name: name, email: email });

        // Create student in MongoDB
        this.apiService.createStudent(user.uid, name).subscribe(
          (response) => {
            console.log('Student created in MongoDB:', response);
            alert('Account created successfully!');
            this.router.navigate(['/login']);
          },
          (error) => {
            console.error('Failed to create student in MongoDB:', error);
            alert('Account created, but failed to register as a student. Please contact support.');
          }
        );
      }

    } catch (error: any) { // 3. Catch the error from the service
      // 4. Check the specific error code from Firebase
      if (error.code === 'auth/email-already-in-use') {
        alert('This email is already taken. Please use a different one.');
      } else if (error.code === 'auth/weak-password') {
        alert('The password is too weak. It must be at least 6 characters long.');
      } else {
        // Generic fallback for any other errors
        console.error("Sign-up failed in component:", error);
        alert('Failed to create account. Please try again.');
      }
    }
  }

  goBack() {
    this.router.navigate(['/']);
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
