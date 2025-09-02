import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-welcome',
  imports: [],
  templateUrl: './welcome.html',
  styleUrl: './welcome.css'
})
export class Welcome {
  private router : Router = inject(Router);
  
  loginStudent(){
    this.router.navigate(['/login']); 
  }

  loginTeacher(){
    this.router.navigate(['/login-teacher']); 
  }
}
