import { Routes } from '@angular/router';
import { LayoutComponent } from './components/layout/layout.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { OpportunityDetailComponent } from './components/opportunity-detail/opportunity-detail.component';
import { UploadComponent } from './components/upload/upload.component';
import { LoginComponent } from './components/login/login.component';
import { authGuard } from './guards/auth.guard';
import { AdminSimulatorComponent } from './components/admin-simulator/admin-simulator.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'upload', component: UploadComponent },
  { path: 'sf-simulator', component: AdminSimulatorComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'opportunity/:id', component: OpportunityDetailComponent },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
