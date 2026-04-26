import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiConfigService, AiPromptConfig } from '../../services/ai-config.service';
import { QuillModule } from 'ngx-quill';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-ai-config',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillModule],
  template: `
    <div class="config-container">
      <div class="header">
        <h1>AI Behavior Configuration</h1>
        <div style="display: flex; justify-content: space-between; align-items: start; gap: 20px;">
          <p>Manage generative instructions, NBA rules, and elective activities injected entirely into the AI pipelines seamlessly.</p>
          <div style="display: flex; gap: 12px; align-items: center;">
              <button *ngIf="auth.isSuperAdmin" class="primary-btn" style="display: flex; align-items: center; gap: 6px; background-color: #7b1fa2;" (click)="triggerMigration()">
                  <span class="material-icons">auto_fix_high</span> 
                  Run Names Migration
              </button>
              <button *ngIf="auth.isSuperAdmin" class="primary-btn" style="display: flex; align-items: center; gap: 6px;" (click)="syncBigQueryData()" [disabled]="isSyncingBq()">
                  <span class="material-icons" [style.animation]="isSyncingBq() ? 'spin 1s linear infinite' : 'none'">sync</span> 
                  {{ isSyncingBq() ? 'Syncing BQ Pipeline...' : 'Sync BQ (LIMIT 10)' }}
              </button>
          </div>
        </div>
        
        <div style="margin-top: 15px; display: flex; gap: 8px; align-items: center;">
          <input type="email" placeholder="Whitelist an admin email..." [(ngModel)]="newAdminEmail" style="padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; flex-grow: 1; max-width: 250px;">
          <button class="action-btn" style="background: var(--surface-card); color: var(--text-primary); border: 1px solid #ddd; padding: 6px 12px;" (click)="addAdmin()">+ Add Admin</button>
        </div>
      </div>

      <div class="tabs">
        <button [class.active]="activeTab() === 'Readiness Checklist'" (click)="activeTab.set('Readiness Checklist')">Readiness Checklist</button>
        <button [class.active]="activeTab() === 'EmailPattern'" (click)="activeTab.set('EmailPattern')">Email Patterns</button>
        <button [class.active]="activeTab() === 'ChecklistItem'" (click)="activeTab.set('ChecklistItem')">Email Checklist Items</button>
        <button [class.active]="activeTab() === 'Elective Activity'" (click)="activeTab.set('Elective Activity')">Suggested Activities (Electives)</button>
      </div>

      <div class="content-panel">
        <div class="action-bar">
          <h2>{{ activeTab() }} Configurations</h2>
          <button class="primary-btn" (click)="openEditor()">+ Add New {{ activeTab() }}</button>
        </div>

        <div class="grid">
          @for (item of filteredConfigs(); track item.id) {
            <div class="config-card glass-panel">
              <div class="card-header">
                <h3>{{ item.title }}</h3>
                <div class="meta-tags">
                  @if (item.priority) {
                    <span class="status-badge" [ngClass]="item.priority.toLowerCase()">{{ item.priority }}</span>
                  }
                  <span class="status-badge brand">{{ item.type }}</span>
                </div>
              </div>

              <div class="card-actions">
                <button class="action-btn edit" (click)="openEditor(item)"><span class="material-icons" style="font-size:14px; margin-right:4px;">edit</span> Edit</button>
                <button *ngIf="auth.isSuperAdmin" class="action-btn delete" (click)="deleteConfig(item.id!)"><span class="material-icons" style="font-size:14px; margin-right:4px;">delete</span> Delete</button>
              </div>
            </div>
          } @empty {
            <div class="empty-state">
              No configurations exist for this category. Click 'Add New' to begin.
            </div>
          }
        </div>
      </div>
      
      <!-- Custom Modal Editor -->
      @if (isEditorOpen()) {
        <div class="modal-backdrop">
          <div class="modal glass-panel">
            <div class="modal-header">
              <h2>{{ activeConfig().id ? 'Edit' : 'Create New' }} {{ activeTab() }}</h2>
              <button class="close-btn" (click)="closeEditor()"><span class="material-icons">close</span></button>
            </div>
            
            <div class="modal-body">
              <div class="form-group">
                <label>{{ activeTab() === 'Readiness Checklist' ? 'Checklist Item' : (activeTab() === 'ChecklistItem' || activeTab() === 'Elective Activity' ? 'Title / Task Name' : 'Title / Identifier') }}</label>
                <input type="text" [(ngModel)]="activeConfig().title" placeholder="e.g. {{ activeTab() === 'ChecklistItem' ? 'No Course Registration' : 'Initial Portal Login' }}">
              </div>

              @if (activeTab() === 'Readiness Checklist') {
                <div class="form-group">
                  <label>Item is Checked Off If... (Logic Guardrails)</label>
                  <textarea [(ngModel)]="activeConfig().guardrails" placeholder="e.g. Student is currently registered to at least one accredited course" rows="2" style="width:100%; border:1px solid #ddd; border-radius:4px; padding:8px;"></textarea>
                </div>
                
                <div class="form-group">
                  <label>Personalization</label>
                  <input type="text" [(ngModel)]="activeConfig().logicNotes" placeholder="e.g. Common for all students">
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                  <div class="form-group">
                    <label>Low Readiness</label>
                    <textarea [(ngModel)]="activeConfig().lowReadiness" placeholder="e.g. 3 Days from reserve" rows="2" style="width:100%; border:1px solid #ddd; border-radius:4px; padding:8px;"></textarea>
                  </div>
                  <div class="form-group">
                    <label>Medium Readiness</label>
                    <textarea [(ngModel)]="activeConfig().mediumReadiness" placeholder="e.g. 5 from reserve" rows="2" style="width:100%; border:1px solid #ddd; border-radius:4px; padding:8px;"></textarea>
                  </div>
                  <div class="form-group">
                    <label>High Readiness (Priority)</label>
                    <textarea [(ngModel)]="activeConfig().highReadiness" placeholder="e.g. 7+ from reserve" rows="2" style="width:100%; border:1px solid #ddd; border-radius:4px; padding:8px;"></textarea>
                  </div>
                </div>

                <div class="form-group">
                  <label>Happy Path</label>
                  <input type="text" [(ngModel)]="activeConfig().happyPath" placeholder="e.g. 24 hours">
                </div>

                <div class="form-group">
                  <label>Notes</label>
                  <textarea [(ngModel)]="activeConfig().checklistNotes" placeholder="Course Eligibility Rules..." rows="3" style="width:100%; border:1px solid #ddd; border-radius:4px; padding:8px;"></textarea>
                </div>
                
                <div class="form-group">
                  <label>Title & Language to display under Next Best Actions</label>
                  <quill-editor 
                    [(ngModel)]="activeConfig().nbaDisplay" 
                    [styles]="{height: '100px'}" 
                    placeholder="Log Into the Student Portal - Remind student to log into the portal...">
                  </quill-editor>
                </div>
              }

              @if (activeTab() === 'EmailPattern') {
                <div class="form-group">
                  <label>Template Identifier (e.g. EM-FAFSA-V1)</label>
                  <input type="text" [(ngModel)]="activeConfig().templateId" placeholder="Unique alphanumeric code">
                </div>
              }

              @if (activeTab() === 'ChecklistItem') {
                <div class="form-group">
                  <label>Logic Notes</label>
                  <textarea [(ngModel)]="activeConfig().logicNotes" placeholder="e.g. Before classes begin if timing allows..." rows="2" style="width:100%; border:1px solid #ddd; border-radius:4px; padding:8px;"></textarea>
                </div>
              }

              @if (activeTab() === 'Elective Activity') {
                <div class="form-group">
                  <label>Logic Guardrails</label>
                  <textarea [(ngModel)]="activeConfig().guardrails" placeholder="e.g. Set up Grammarly, before class begins if timing allows" rows="2" style="width:100%; border:1px solid #ddd; border-radius:4px; padding:8px;"></textarea>
                </div>
                
                <div class="form-group">
                  <label>Notes</label>
                  <textarea [(ngModel)]="activeConfig().logicNotes" placeholder="e.g. Free Grammarly Account, link (info is in the WOW)" rows="2" style="width:100%; border:1px solid #ddd; border-radius:4px; padding:8px;"></textarea>
                </div>
              }

              @if (activeTab() === 'Elective Activity') {
                <div class="form-group">
                  <label>Priority Level</label>
                  <select [(ngModel)]="activeConfig().priority">
                    <option value="High">High Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="Low">Low Priority</option>
                  </select>
                </div>
              }

              @if (activeTab() === 'Elective Activity') {
                <div class="form-group">
                  <label>Direct Link (If applicable)</label>
                  <input type="text" [(ngModel)]="activeConfig().directLink" placeholder="e.g. https://academicguides.waldenu.edu/">
                </div>
                
                <div class="form-group">
                  <label>Title & Language to display under Next Best Actions</label>
                  <quill-editor 
                    [(ngModel)]="activeConfig().nbaDisplay" 
                    [styles]="{height: '100px'}" 
                    placeholder="Set Up a Free Grammarly Account - Guide student to Grammarly...">
                  </quill-editor>
                </div>

                <div class="form-group">
                  <label>Talking Points for Suggested Action</label>
                  <textarea [(ngModel)]="activeConfig().talkingPoints" placeholder="Encourage students to set up their account..." rows="3" style="width:100%; border:1px solid #ddd; border-radius:4px; padding:8px;"></textarea>
                </div>
                
                <div class="form-group">
                  <label>Language for Email (Includes Value Prop)</label>
                  <quill-editor 
                    [(ngModel)]="activeConfig().emailLanguage" 
                    [styles]="{height: '150px'}" 
                    placeholder="Are you new to academic writing? Walden provides students...">
                  </quill-editor>
                </div>
              }

              @if (activeTab() === 'EmailPattern') {
                <div class="form-group">
                  <label>Condition / Moment Trigger</label>
                  <input type="text" [(ngModel)]="activeConfig().condition" placeholder="e.g. Brand-new Reserve; < 15 days to start">
                </div>
                <div class="form-group">
                  <label>Subject Line Constraint (Optional)</label>
                  <input type="text" [(ngModel)]="activeConfig().subject" placeholder="e.g. URGENT: Your March 23 Checklist – Action Required">
                </div>
              }

              @if (activeTab() !== 'Elective Activity' && activeTab() !== 'Readiness Checklist') {
                <div class="form-group">
                  <label>{{ activeTab() === 'ChecklistItem' ? 'Hard Rules (Injection Params)' : 'Content Payload (Rich Text)' }}</label>
                  <quill-editor 
                    [(ngModel)]="activeConfig().content" 
                    [styles]="{height: '300px'}" 
                    placeholder="Insert instructions, links, or patterns here...">
                  </quill-editor>
                </div>
              }
            </div>

            <div class="modal-footer">
              <button class="action-btn" (click)="closeEditor()">Cancel</button>
              <button class="primary-btn" (click)="saveConfig()">Save Configuration</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styleUrl: './ai-config.component.scss'
})
export class AiConfigComponent implements OnInit {
  newAdminEmail = '';

  async addAdmin() {
    if (this.newAdminEmail.trim()) {
      await this.auth.addWhitelistAdmin(this.newAdminEmail.trim());
      this.newAdminEmail = '';
    }
  }

  activeTab = signal<'Readiness Checklist' | 'EmailPattern' | 'Elective Activity' | 'ChecklistItem'>('Readiness Checklist');
  configService = inject(AiConfigService);
  
  configs = this.configService.configs;
  isEditorOpen = signal(false);
  activeConfig = signal<AiPromptConfig>({} as AiPromptConfig);

  ngOnInit() {
    // Configs are driven natively by the service signal
  }

  filteredConfigs() {
    if (this.activeTab() === 'Readiness Checklist') {
      return this.configs().filter(c => c.type === 'Readiness Checklist' || c.type === 'NBA' as any);
    }
    return this.configs().filter(c => c.type === this.activeTab());
  }

  openEditor(item?: AiPromptConfig) {
    if (item) {
      const copy = { ...item };
      if (copy.type === 'NBA' as any) {
        copy.type = 'Readiness Checklist';
      }
      this.activeConfig.set(copy);
    } else {
      this.activeConfig.set({
        type: this.activeTab(),
        title: '',
        content: '',
        priority: 'Medium'
      });
    }
    this.isEditorOpen.set(true);
  }

  closeEditor() {
    this.isEditorOpen.set(false);
  }

  async saveConfig() {
    // Rely on the current UI activeTab rather than the deeply nested object type to bypass content validation securely
    const isElective = this.activeTab() === 'Elective Activity';
    const isChecklist = this.activeTab() === 'Readiness Checklist';
    
    if (!this.activeConfig().title) {
      alert("Please provide the required Title payload.");
      return;
    }
    
    if (!isElective && !isChecklist && !this.activeConfig().content) {
      alert("Please provide the required Content payload for this specific configuration type.");
      return;
    }
    try {
      await this.configService.saveConfiguration(this.activeConfig());
      this.closeEditor();
    } catch (e: any) {
      console.error(e);
      alert("Failed to save: " + e.message);
    }
  }

  async deleteConfig(id: string) {
    if(confirm("Are you sure you want to permanently delete this AI constraint?")) {
      await this.configService.deleteConfiguration(id);
    }
  }
  isSyncingBq = signal(false);
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  auth = inject(AuthService);

  async syncBigQueryData() {
    if (this.isSyncingBq()) return;
    this.isSyncingBq.set(true);
    try {
      const triggerDoc = doc(this.firestore, 'system_config/bq_sync_trigger');
      await setDoc(triggerDoc, { timestamp: Date.now() }, { merge: true });
      alert('BigQuery Synchronization Dispatched! Running securely in the background (CORS bypassed). You may reload the page shortly.');
    } catch (err: any) {
      console.error('BigQuery Sync Failed:', err);
      alert('Sync failed - ensure your emulator is running and properly compiled.');
    } finally {
      this.isSyncingBq.set(false);
    }
  }

  async triggerMigration() {
    if (!confirm('Are you sure you want to run the global Firestore schema migration?')) return;
    try {
      const callable = httpsCallable(this.functions, 'runMigration');
      const result: any = await callable({});
      console.log('--- Migration Result ---', result.data);
      alert(`Migration completed successfully! Processed ${result.data?.count || 0} records.`);
    } catch (err: any) {
      console.error('Failed to run migration.', err);
      alert('Migration Failed:\n' + err.message);
    }
  }
}
