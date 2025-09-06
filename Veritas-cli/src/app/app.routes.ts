import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Welcome } from './pages/welcome/welcome';
import { authGuard } from './guards/auth-guard';
import { HomeTeacher } from './pages/home-teacher/home-teacher';
import { HomeStudent } from './pages/home-student/home-student';
import { LoginTeacher } from './pages/login-teacher/login-teacher';
import { PageNotFound } from './pages/page-not-found/page-not-found';
import { SignUp } from './pages/sign-up/sign-up';
import { SignUpTeacher } from './pages/sign-up-teacher/sign-up-teacher';
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
        path:'sign-up',
        component:SignUp,
    },
    {
        path:'sign-up-teacher',
        component:SignUpTeacher,
    },
    {
        path:'login-teacher',
        component:LoginTeacher,
    },
    {
        path:'**',
        component:PageNotFound
    }
];
