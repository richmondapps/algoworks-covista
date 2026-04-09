import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SandboxSimulator } from './sandbox-simulator';

describe('SandboxSimulator', () => {
  let component: SandboxSimulator;
  let fixture: ComponentFixture<SandboxSimulator>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SandboxSimulator]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SandboxSimulator);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
