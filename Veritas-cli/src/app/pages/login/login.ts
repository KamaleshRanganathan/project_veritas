import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';
@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);
  onLogin(loginForm: NgForm) {
    if (loginForm.invalid) {
      return;
    }
    const email = loginForm.value.email;
    const password = loginForm.value.password;
    this.authService.login(email, password);
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
