import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-page-not-found',
  imports: [],
  templateUrl: './page-not-found.html',
  styleUrl: './page-not-found.css'
})
export class PageNotFound {
  private router : Router = inject(Router)
  goHome(){
    this.router.navigate(['/']);
  }
}
