import { Component, inject } from '@angular/core';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-home-student',
  imports: [],
  templateUrl: './home-student.html',
  styleUrl: './home-student.css'
})
export class HomeStudent {
  private authService : AuthService = inject(AuthService);

  logout() {
    this.authService.logout();
  }
  
}
