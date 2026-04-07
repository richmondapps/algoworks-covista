import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FeedbackSummary } from './feedback-summary';

describe('FeedbackSummary', () => {
  let component: FeedbackSummary;
  let fixture: ComponentFixture<FeedbackSummary>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeedbackSummary]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FeedbackSummary);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
