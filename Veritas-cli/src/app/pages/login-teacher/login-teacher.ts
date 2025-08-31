import { Component , inject} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule , NgForm } from '@angular/forms';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login-teacher',
  imports: [CommonModule, FormsModule],
  templateUrl: './login-teacher.html',
  styleUrl: './login-teacher.css'
})
export class LoginTeacher {
  private authService: AuthService = inject(AuthService);

  onLogin(loginForm: NgForm) {
    if (loginForm.invalid) {
      return;
    }
    const email = loginForm.value.email;
    const password = loginForm.value.password;
    this.authService.loginAsTeacher(email, password);
  }
}
