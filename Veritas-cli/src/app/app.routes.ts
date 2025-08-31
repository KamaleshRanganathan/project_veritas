import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Welcome } from './pages/welcome/welcome';
import { authGuard } from './guards/auth-guard';
import { HomeTeacher } from './pages/home-teacher/home-teacher';
import { HomeStudent } from './pages/home-student/home-student';
export const routes: Routes = [
    // If the user is logged in, the guard allows access to /home.
    // If not, the guard will redirect them to /login.

    {
        path:'',
        component:Welcome
    },
    {
        path:'home-student',
        component:HomeStudent,
        // canActivate:authGuard
    },
    {
        path:'home-teacher',
        component:HomeTeacher,
        // canActivate:authGuard
    },
    {
        path:'login',
        component:Login,
    },
    {
        path:'login-teacher',
        component:Login,
    },
    {
        path:'**',
        component:Welcome
    }
];
