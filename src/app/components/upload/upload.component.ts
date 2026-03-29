import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { StudentService } from '../../services/student.service';
import { Storage, ref, uploadBytesResumable, getDownloadURL } from '@angular/fire/storage';

@Component({
    selector: 'app-upload',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './upload.component.html',
    styleUrls: ['./upload.component.scss']
})
export class UploadComponent {
    private route = inject(ActivatedRoute);
    private studentService = inject(StudentService);
    private storage = inject(Storage);

    private queryParams = toSignal(this.route.queryParamMap);
    uid = computed(() => this.queryParams()?.get('uid') || null);

    student = computed(() => {
        const u = this.uid();
        if (!u) return undefined;

        // Attempt local resolution first from signals
        return this.studentService.students().find(s => s.studentUid === u);
    });

    isUploading = signal(false);
    uploadProgress = signal(0);
    uploadError = signal<string | null>(null);
    uploadSuccess = signal(false);

    async onFileSelected(event: any) {
        const file: File = event.target.files[0];
        if (!file) return;

        const studentRecord = this.student();
        if (!studentRecord) return;

        this.isUploading.set(true);
        this.uploadError.set(null);
        this.uploadSuccess.set(false);
        this.uploadProgress.set(0);

        const reqs = studentRecord.requirements as any; const missingKey = Object.keys(reqs).find(k => reqs[k] === false);
        const docName = missingKey ? missingKey : 'General Document';

        // Build the File Path directly mapping to the student UID natively in Firebase Storage
        const filePath = `uploads/${studentRecord.studentUid}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
        const storageRef = ref(this.storage, filePath);

        try {
            const uploadTask = uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    this.uploadProgress.set(Math.round(progress));
                },
                (error) => {
                    console.error('Upload Error:', error);
                    this.uploadError.set('Upload failed. Please try again.');
                    this.isUploading.set(false);
                },
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    console.log('File successfully uploaded, available at', downloadURL);

                    // Update Firestore student record requirements dictionary
                    const updatedRequirements = { ...studentRecord.requirements };
                    let updatedActionRequired = studentRecord.actionRequired;

                    const reqs = studentRecord.requirements as any;
                    const missingKey = Object.keys(reqs).find(k => reqs[k] === false);

                    if (missingKey) {
                        (updatedRequirements as any)[missingKey] = true;
                    }

                    // if no longer missing anything, remove risk automatically
                    const allComplete = Object.values(updatedRequirements).every(v => v === true);
                    if (allComplete) {
                        updatedActionRequired = false;
                    }

                    await this.studentService.updateStudent(studentRecord.id, {
                        requirements: updatedRequirements as any,
                        actionRequired: updatedActionRequired,
                        engagementLevel: 'High' // Implicitly boosting engagement by active tracking
                    });

                    this.isUploading.set(false);
                    this.uploadSuccess.set(true);
                }
            );
        } catch (e) {
            console.error(e);
            this.uploadError.set('Unexpected error starting upload.');
            this.isUploading.set(false);
        }
    }
}
