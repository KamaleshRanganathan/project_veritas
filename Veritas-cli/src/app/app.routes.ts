import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Login } from './pages/login/login';
import { Welcome } from './pages/welcome/welcome';
import { authGuard } from './guards/auth-guard';
export const routes: Routes = [
    // If the user is logged in, the guard allows access to /home.
    // If not, the guard will redirect them to /login.

    {
        path:'',
        component:Welcome
    },
    {
        path:'home',
        component:Home,
        // canActivate:authGuard
    },
    {
        path:'login',
        component:Login,
    },
];
