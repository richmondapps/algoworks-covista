import { Routes } from '@angular/router';
import { LayoutComponent } from './components/layout/layout.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { OpportunityDetailComponent } from './components/opportunity-detail/opportunity-detail.component';
import { UploadComponent } from './components/upload/upload.component';

export const routes: Routes = [
    { path: 'upload', component: UploadComponent },
    {
        path: '',
        component: LayoutComponent,
        children: [
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
            { path: 'dashboard', component: DashboardComponent },
            { path: 'opportunity/:id', component: OpportunityDetailComponent }
        ]
    },
    { path: '**', redirectTo: '' }
];
