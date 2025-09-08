import { Component, inject } from '@angular/core';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sign-up-teacher',
  imports: [CommonModule, FormsModule],
  templateUrl: './sign-up-teacher.html',
  styleUrl: './sign-up-teacher.css'
})
export class SignUpTeacher {
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);
  async oncreateAccount(loginForm: NgForm) {
    if (loginForm.invalid) {
      alert("Invalid Username / Password");
      return;
    }
    const name = loginForm.value.name;
    const email = loginForm.value.email;
    const password1 = loginForm.value.password1;
    const password2 = loginForm.value.password2;
    if (password1 !== password2) {
      alert("Passwords do not match");
      return;
    }
    try {
      await this.authService.signUp(name, email, password1);
      alert('Account created successfully!');
      // Here you would typically navigate to the login page or the dashboard
      // e.g., this.router.navigate(['/login']);

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
}
