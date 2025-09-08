import { Component , inject} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule , NgForm } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login-teacher',
  imports: [CommonModule, FormsModule],
  templateUrl: './login-teacher.html',
  styleUrl: './login-teacher.css'
})
export class LoginTeacher {
  private authService: AuthService = inject(AuthService);
  private router : Router = inject(Router);
  onLogin(loginForm: NgForm) {
    if (loginForm.invalid) {
      alert("Invalid Username / Password");
      return;
    }
    const email = loginForm.value.email;
    const password = loginForm.value.password;
    this.authService.loginAsTeacher(email, password);
  }

  goBack(){
    this.router.navigate(['/']);
  }

  goToSignup() {
    this.router.navigate(['/sign-up-teacher']);
  }
}
