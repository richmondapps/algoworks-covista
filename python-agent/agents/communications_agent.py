"""Communications Agent — drafts personalised outreach for Enrollment Specialists.

Domain responsibility: generate contextually appropriate email and SMS drafts
that the Enrollment Specialist can review and send to the student.  Drafts
incorporate the top recommended action from NBA context to ensure outreach is
directly relevant to the student's current situation.

No Firestore, Flask, or HTTP dependencies (Clean Architecture — domain layer).
"""

from __future__ import annotations

import json
from typing import Any

from agents.base import AccumulatedContext, BaseAgent


# Maximum character limit for SMS drafts (carrier constraint).
_SMS_MAX_CHARS: int = 140


_EMAIL_PATTERNS_RUBRIC = """
# EMAIL PATTERNS FRAMEWORK

## PATTERN: Brand-new Reserve; First-Time Outreach (Newly Accepted Reserve) < 15 days to start date
- **Condition/Moment**: 
- **Readiness Risk**: 
- **Engagement Risk**: 
- **Tone & Posture**: Urgent, direct | Welcoming/celebratory, directive, urgent tone, Clear guidance, Structured, ok to be longer form/explanatory
- **Structure Framework**:
  - Urgent welcome + time sensitivity
  - Clear statement of risk (start date proximity)
  - “Immediate Action Items” section (bulleted)
  - Step-by-step instructions (with time estimates)
  - “Why this matters now” explanation
  - Quick support links
  - Structured response CTA (multiple choice)
  - Strong support close
- **Hard Rules**: Include Readiness Roadmap (personalized checklist) for the start date, include links to each source and time to complete task

**EXAMPLE EMAIL OUTPUT (Follow this Voice)**:
Hi Maria, 

**Immediate Action Items: **. 

Welcome to Walden! With your start date of March 23 fast approaching, we need to move quickly to ensure you have classroom access on Day 1.   

- Log in to your Student Portal using your Walden polly.p@walden.edu email: (5–10 minutes) 
  - You should have received an email from "Walden IT" with your temporary credentials. Note: Your new password must be at least 15 characters. 
  - This ensures you’re ready to receive important updates as we get closer to day one. 
- **Submit your 2025-2026 FAFSA: (15-20 minutes)** 
  - Use school code 025042 
  - This is required now to ensure your funding is processed before classes begin. 
- **Submit your Official Transcript from UNH**
  - If sending electronically sent to: electronictranscripts@mail.waldenu.edu  
  - Or mailed to our Office of Admission at: Office of Admissions, 6100 Merriweather Dr, 8th Floor, Columbia, MD 21044 
- **Log into WOW Orientation (10-15 minutes)**
  - This is your required online orientation. It takes about 10–15 minutes and shows you how to navigate your specific classroom.  

**Why this matters now:** Completing these steps immediately prevents technical holds and ensures your financial aid is ready to disburse. 

**Quick Support Links:**
- [Student Portal] | [Walden Email] | [Technical Support]()
How are you feeling about the week ahead? Please reply with one of the following:  

**Where do you stand?** Please reply with a number: 

**1."I’m finished with all three!"**
**2."I’m working on them now and will be done today."**
**3."I’m stuck and need an immediate call."**

I’m standing by to help you cross the finish line! 
---

## PATTERN: Brand-new Reserve; First-Time Outreach (Newly Accepted Reserve) 15+ days to start date
- **Condition/Moment**: 
- **Readiness Risk**: 
- **Engagement Risk**: 
- **Tone & Posture**: Informative | Welcoming/celebratory, Clear guidance, Structured, ok to be longer form/explanatory
- **Structure Framework**:
  - Warm welcome
  - Framing (you have time / at your pace)
  - “Roadmap” section
  - Checklist with light guidance
  - “Why these steps matter”
  - Quick links
  - Feeling-based response CTA (confidence check)
  - Encouraging close
- **Hard Rules**: Include Readiness Roadmap (personalized checklist) for the start date, include links to each source and time to complete task

**EXAMPLE EMAIL OUTPUT (Follow this Voice)**:
Hi Maria, 

A huge welcome to Walden! We are thrilled to have you join our community. Since we have a few weeks before your March 23 start date, I’ve put together a guide to help you prepare at your own pace. 

**Your March 23 Roadmap**
- **Log in to your Student Portal using your Walden polly.p@walden.edu email: (5–10 minutes)** 
  - You should have received an email from "Walden IT" with your temporary credentials. Note: Your new password must be at least 15 characters. 
  - This ensures you’re ready to receive important updates as we get closer to day one. 
- **Submit your 2025-2026 FAFSA: (15-20 minutes)**
  - Use school code 025042 
  - This is required now to ensure your funding is processed before classes begin. 
- **Submit your Official Transcript from UNH**
  - If sending electronically sent to: electronictranscripts@mail.waldenu.edu  
  - Or mailed to our Office of Admission at: Office of Admissions, 6100 Merriweather Dr, 8th Floor, Columbia, MD 21044 
- **Log into WOW Orientation (10-15 minutes)**
  - This is your required online orientation. It takes about 10–15 minutes and shows you how to navigate your specific classroom. 

**Why these steps matter:** Taking a few minutes each day this week ensures you won't face any last-minute technical hurdles or access issues on your first day. My goal is for you to walk into your first class feeling prepared and focused on your learning!  

**Quick Support Links:**
Student Portal | Walden Email | Technical Support 
How are you feeling about the week ahead? Please reply with one of the following:  
**1. "I’m on track and feeling good!"**
**2. "I’m working through it but have a few questions."**
**3. "I’d like to jump on a quick call before my start date."**

I am here to help you get everything in place for a strong, confident start. Let’s do this!  

---

## PATTERN: Falling Behind + Lost engagement / Re-Engagement After Silence
- **Condition/Moment**: 
- **Readiness Risk**: Medium/ High
- **Engagement Risk**: High
- **Tone & Posture**: Urgent, direct | Direct, Action-oriented, Focused
- **Structure Framework**:
  - Direct check-in
  - Acknowledge silence
  - Re-anchor to start date
  - Simple question: “Has anything changed?”
  - Clear response options (decision-based)
  - Reassurance / flexibility close
- **Hard Rules**: • include "NEEDS ACTION:" in subject
• never suggest another start date

**EXAMPLE EMAIL OUTPUT (Follow this Voice)**:
Subject: Checking in: Is a March 23 start still in your plans?  
Hi Alexis,  
I wanted to check in since I haven’t heard from you recently and your March 23rd start date is coming up. 

Has anything changed since we last connected? 

Please reply with one of the options below so I can support you: 

**1. "I’m still planning to start on March 23"**
**2. "I’m still interested but need help"**
**3. "I’m no longer planning to start"**

If something has shifted, that’s completely okay—we can talk through your options together. 

I just want to make sure we update your plan and support you in the right way. 

---

## PATTERN: On Track but Lost engagement / Re-Engagement After Silence
- **Condition/Moment**: 
- **Readiness Risk**: Low
- **Engagement Risk**: High
- **Tone & Posture**: Supportive | Low pressure/light touch, supportive, curious, not accusatory
- **Structure Framework**:
  - Positive reinforcement
  - Acknowledge silence
  - Emotional check-in
  - Status-based response options
  - Low-pressure support close
- **Hard Rules**: • 

**EXAMPLE EMAIL OUTPUT (Follow this Voice)**:
Subject: Checking in for March 23  
Hi Alexis, 
Great job staying on track with your progress towards your March 23 start date! Since it’s been a bit quiet lately, I’m just checking in to see how you're feeling about your star and if there is anything you need.  
Which best describes where you are right now?  
**1. "I’m all set, ready to start March 23!"**
**2. "I’m on track but have a few questions."**
**3. "I’m reconsidering my timing—let's chat."**
No pressure at all—I’m simply here to support you and ensure you have everything you need.

---

## PATTERN: “Waiting on Us” (No Action Needed from Reserve)
- **Condition/Moment**: 
- **Readiness Risk**: Low
- **Engagement Risk**: Low/Medium
- **Tone & Posture**: Supportive, informative | Reassuring, Proactive communication
- **Structure Framework**:
  - Strong positive affirmation
  - Clear statement: no action needed
  - Optional enrichment suggestion
  - Emotional check-in
  - Light support close
- **Hard Rules**: • include ONE optional engagement recommendation link

**EXAMPLE EMAIL OUTPUT (Follow this Voice)**:
Subject: Thinking ahead to your March 23 start!  
Hi Marty, 
You have done a fantastic job staying on track with your enrollment—everything is looking great on our end! Since we are now simply waiting for your March 23 start date to arrive, there is no action needed from you at this time.  
In the meantime, if you’d like to get a head start on your first-day confidence, I recommend exploring our Library Resources. It is a great, low-pressure way to familiarize yourself with the tools you'll be using so you can feel fully prepared when classes begin.  
How are you feeling about the weeks ahead?  
**1. "I’m all set and feeling good!" **
**2. "I’m enjoying the downtime but might have a few questions soon." **
**3. "I’m getting excited to dive in!" **
I’m here if you need anything at all as we count down to Day 1!

---

## PATTERN: Recovery After Missed Momentum
- **Condition/Moment**: 
- **Readiness Risk**: Low/Medium
- **Engagement Risk**: Medium
- **Tone & Posture**: Supportive, encouraging | Empathetic, Re-engaging, Reset-focused
- **Structure Framework**:
  - Acknowledge past progress
  - Note drop-off
  - Re-anchor to goal (start date)
  - Single “next best step”
  - Reassurance of support
  - Status-based response options
- **Hard Rules**: • link to next best action

**EXAMPLE EMAIL OUTPUT (Follow this Voice)**:
Subject: Checking in: Let's get back on track for March 23  
Hi Joan, 
You have done a great job staying on track with your enrollment but I noticed it’s been a little while since we last connected, and I wanted to reach out and help you work towards your March 23 start date. 
This is is the next best step for you: 
 - Start WOW Online Orientation. It typically takes about 20–30 minutes and is a helpful, low-pressure way to get comfortable with the online campus before your first day.  
My goal is simply to support you and ensure you have everything you need to feel confident as you begin this journey. 
Has anything changed since the last time we spoke? Please reply with the option that best describes where you are: 
**1. "I’m still planning to start on March 23!" **
**2.. "I’m still interested, but I’m feeling a bit stuck on my next steps." **
I’m here to help you navigate whatever comes next!

---

## PATTERN: Overwhelmed Reserve
- **Condition/Moment**: 
- **Readiness Risk**: High
- **Engagement Risk**: Low
- **Tone & Posture**: Urgent, direct | Simplifying, Calming, Guided
- **Structure Framework**:
  - Personal connection / rapport
  - Acknowledge overwhelm
  - Reduce scope to ONE “quick win”
  - Provide key details for that step
  - Explain impact (why it matters now)
  - Progress-based response options
  - Motivational close
- **Hard Rules**: • include "NEEDS ACTION:" in subject

**EXAMPLE EMAIL OUTPUT (Follow this Voice)**:
Subject: Action Needed: Let’s simplify your March 23 start!  
Hi Peter, 
I’ve loved our regular check-ins, and I want to make sure we keep that momentum going as we approach your March 23 start date! To ensure everything stays on track, we have a few key items to check off your list.  
I know a to-do list can feel like a lot, so let's start with the most important "Quick Win" to secure your funding:  
- **Complete your 2025–2026 FAFSA:** This is the first step to unlocking your financial aid.  
- **Walden School Code:** 025042  
- **Next Steps:** Once submitted, it typically takes 3–5 business days for the results to reach us.  
Taking this step today ensures you won't face last-minute hurdles or access issues on your first day. I’m here to help you cross the finish line—how is the FAFSA coming along?  
**1. "I've submitted it today!" **
**2. "I'm working on it but have a question." **
**3. "I need a quick call to walk through this." **. 
We’ve got this!

---

## PATTERN: Reserve-Initiated Momentum (They Just Took Action)
- **Condition/Moment**: 
- **Readiness Risk**: 
- **Engagement Risk**: 
- **Tone & Posture**: Supportive | Positive reinforcement, Forward-moving suggesting next best action
- **Structure Framework**:
  - Celebrate completed action
  - Reinforce progress
  - Introduce next step (“roadmap”)
  - Provide instructions (light)
  - Emotional check-in
  - Encouraging close
- **Hard Rules**: 

**EXAMPLE EMAIL OUTPUT (Follow this Voice)**:
Subject: Great news! Your transcript is in for March 23 
Hi Kenny, 
I have some great news—we’ve officially received your transcript! This is a huge win and keeps everything moving forward perfectly for your March 23 start date. 
I know checking these items off the list can feel like a lot, but you are doing a fantastic job staying on top of your preparation. To keep this momentum going, here is your next "Success Roadmap" step: 
- **Log in to your Student Portal using your Walden kenny.g@walden.edu email: (5–10 minutes):** This ensures you’re ready to receive important updates as we get closer to day one. 
- **Pro-Tip:** Your password must be at least 15 characters long. 
How are you feeling as we check these items off? 
**1. "I’m feeling prepared and ready!" **
**2. "I’m moving through the list but have a few questions." **
**3. "I’d like to jump on a quick call to review my next steps." **
I’m here to support you every step of the way. Let’s keep it up!  
 
 
 
Missing 1 high risk checklist item 
Subject: Action Required: Your Student Portal Access 
Hi Robert, 
You are nearly "first-day ready" for your March 23 start! We just need to check off one final, essential step to ensure you have classroom access: 
- **Log in to your Student Portal (5-10 minutes) **
- **Your Walden Email: robert.r@walden.edu **
**Note on Credentials:** You should have received an email from "Walden IT" with your temporary login details. Please remember that your permanent password must be at least 15 characters long. 
Once you’ve logged in, please reply to this email so I can confirm your account is fully active and ready for Day 1. If you run into any technical snags, let me know and we can jump on a quick call to resolve it.

---

## PATTERN: Missing 1 high risk checklist item
- **Condition/Moment**: 
- **Readiness Risk**: High
- **Engagement Risk**: 
- **Tone & Posture**: direct, encouraging, urgent | Direct, Action-oriented, Focused
- **Structure Framework**:
  - Near-completion framing (“almost ready”)
  - Identify final blocker (with time estimates)
  - Provide exact instructions
  - Reinforce importance (Day 1 readiness)
  - Direct CTA (confirm completion)
  - Support fallback
- **Hard Rules**: 

---

## PATTERN: Missing multiple high risk checklist item
- **Condition/Moment**: 
- **Readiness Risk**: High
- **Engagement Risk**: 
- **Tone & Posture**: Urgent, direct | Direct, Action-oriented, Focused
- **Structure Framework**:
  - Progress framing (set context without discouraging)
  - Clear statement of multiple remaining items
  - Checklist section (scannable, prioritized)
  - “Why this matters” (tie to readiness/start date)
  - Clear prioritization (where to start)
  - Support + response CTA
- **Hard Rules**: focus on single next best action checklist item at a time
if we have more than one high-risk item pending, include checklist in the email for all pending high-priority items.

---

## PATTERN: Missing multiple high risk checklist item and start date is less than 7 days away
- **Condition/Moment**: 
- **Readiness Risk**: High
- **Engagement Risk**: 
- **Tone & Posture**: Urgent, direct | Direct, Action-oriented, Focused, Simplifying, Calming, Guided
- **Structure Framework**:
- **Hard Rules**: Include all missing checklist items in one email

---

"""


class CommunicationsAgent(BaseAgent):
    """Generates personalised email and SMS drafts addressed to the student.

    Distinct from ReadinessAgent and RiskAgent in that its output is
    addressed directly TO the student, not to the Enrollment Specialist.
    The ES reviews the drafts before sending.

    When accumulated context includes NBA output, the top recommended
    action is injected into the prompt so drafts are aligned with the
    current priority.

    Input keys used from state:
        student_name: Used for personalisation.
        enrollment_specialist_name: Attributed in the email body.
        notes (optional): Recent interaction notes that shape tone.
        Any other fields that provide context for personalisation.

    Input keys used from ctx:
        nba (optional): NBAAgent output; top action used to align drafts.

    Output keys (communications domain):
        emailDraft: bodyText (no greeting) and bullets list.
        smsDraft: String ≤ 140 characters, addressed to the student.
    """

    name: str = "Communications Agent"
    action: str = "Generate Outreach Drafts"
    context_key: str = "communications"

    def build_prompt(
        self,
        state: dict[str, Any],
        ctx: AccumulatedContext | None = None,
    ) -> str:
        """Build the LLM prompt from the current student state.

        Includes the top recommended action from accumulated NBA context
        when available, so the email and SMS are explicitly aligned with
        the ES's highest-priority recommendation.

        Args:
            state: Full Firestore document for the student, including
                any notes or prior interaction context that should
                influence tone.
            ctx: Accumulated context; 'nba' key used when present to
                surface the top recommended action in the draft.

        Returns:
            Prompt string instructing the model to produce a
            communications JSON object with email and SMS drafts.
        """
        nba_actions: list[dict[str, Any]] = state.get("nbaPayload", [])
        top_action_section: str = ""
        if nba_actions:
            top_action_section = (
                f"\nRecommended action(s) to reference in your drafts:\n"
                f"{json.dumps(nba_actions[:3])}\n"
            )
            
        slim_state = dict(state)
        if "recentActivityLogs" in slim_state and isinstance(slim_state["recentActivityLogs"], list):
            slim_state["recentActivityLogs"] = slim_state["recentActivityLogs"][:5]

        # Process CMS Templates dynamically
        cms_templates = state.get("cmsTemplates", [])
        dynamic_email_rubric = ""
        dynamic_checklists = ""

        if cms_templates:
            email_patterns = [c for c in cms_templates if c.get("type") == "EmailPattern"]
            checklists = [c for c in cms_templates if c.get("type") == "ChecklistItem"]

            if email_patterns:
                dynamic_email_rubric += "\n# CMS DYNAMIC EMAIL PATTERNS (HIGH PRIORITY)\n"
                for p in email_patterns:
                    pid = p.get("templateId", p.get("title", ""))
                    cond = p.get("condition", "No condition specified")
                    subj = p.get("subject", "Determine naturally")
                    content = p.get("content", "")
                    dynamic_email_rubric += f"\n## PATTERN: {pid}\n- **Condition/Moment**: {cond}\n- **Subject Line Constraint**: {subj}\n- **Master Prose / Content Template**:\n{content}\n"
                
                dynamic_email_rubric += "\nCRITICAL SMART INJECTION RULE: When using the Master Prose above, do NOT just append the NBAs. You must intelligently weave ALL the recommended actions (up to 3) into the Master Prose so it reads naturally.\n"
                dynamic_email_rubric += "CRITICAL METRIC RULE: You MUST append the ID of the template you selected to the very bottom of the emailDraft surrounded by brackets, e.g. '[Template ID: EM1]'.\n"
                dynamic_email_rubric += "CRITICAL FORMATTING RULE: Do NOT inject empty lines or double line-breaks between list items (bullets or numbers). Persist the exact dense, single-spaced structural layout established in the Master Prose.\n"

            if checklists:
                dynamic_checklists += "\n# CMS CHECKLIST / NBA HARD RULES\n"
                for c in checklists:
                    title = c.get("title", "")
                    content = c.get("content", "")
                    dynamic_checklists += f"- {title}: {content}\n"
            
        return f"""
You are an expert academic advisor AI (Communications Agent). \
Given the raw student data context, generate personalised outreach \
drafts TO THE STUDENT.
CRITICAL: Ensure your drafts reflect recent 'notes' sentiment \
(e.g., extremely empathetic if health/death, excited if normal).
CRITICAL: The smsDraft must be under {_SMS_MAX_CHARS} characters.

CRITICAL INSTRUCTION: Analyze the student's Readiness Risk, Engagement Risk, timeSinceReserveDays, activityLogs and missing checklist items.
Select the SINGLE most appropriate Email Pattern. If a CMS DYNAMIC EMAIL PATTERN matches their condition, YOU MUST USE IT PREFERENTIALLY over the legacy rubric.
You MUST strictly adhere to your selected pattern's Tone, Length, Posture, Hard Rules, and specific Structure.

{dynamic_email_rubric}

# LEGACY PATTERNS FRAMEWORK (Fallback if no dynamic pattern matches)
{_EMAIL_PATTERNS_RUBRIC}


When drafting emails about specific tasks, you MUST incorporate the specific links and estimates defined below:
{dynamic_checklists}

# LEGACY CHECKLIST RULES (Fallback if not defined above)
- Initial portal login: Link to student portal, mention reserving email, link "How to Log into Your Student Portal: https://youtu.be/ClgP0GtP2uQ", estimate 5 min.
- FAFSA Submission: Walden Federal School Code 025042, link https://studentaid.gov/h/apply-for-aid/fafsa, specify Academic Year, link "How to Apply for Financial Aid: https://youtu.be/pimitLbiBoE", estimate 30 min.
- FAFSA Awaiting Award: Link to check status, note process can take several days.
- No Course Registration: Link to register, suggest a course, link to schedule appointment with ES.
- WOW Orientation: Link to WOW orientation login, estimate 10 min.
- Not logged into course / class participation: Link to Canvas course, link "How to Access Your Walden Orientation: https://youtu.be/67vGaf0uMEQ".
- Official Transcript Contingency: Include prior school name, link to school transcript request, link for Walden TRF request, estimate 10 min.
- Nursing License Contingency: Instruction where to submit license, estimate 5 min.

{top_action_section}
Reply ONLY in strictly valid JSON formatted exactly like this:
{{
  "emailDraft": {{
    "subject": "An appropriate, engaging subject line mapped to your selected pattern",
    "salutation": "The formal greeting addressing the student by their first name (e.g., 'Hello Maria,')",
    "bodyText": "A friendly, customised body text matching the selected pattern. DO NOT include any greeting or salutation here, jump straight into the core message.",
    "bullets": ["Specific actionable task 1", "Specific actionable task 2 with the required links and estimates"],
    "closingText": "The conclusion of the email matching the selected pattern. This goes after the bulleted list and MUST include the explicit 'How are you feeling...' multiple choice engagement questions and final outro signature."
  }},
  "smsDraft": "Short, friendly text STRICTLY addressed directly TO THE STUDENT. Under {_SMS_MAX_CHARS} chars."
}}

STUDENT DATA:
{json.dumps(slim_state)}
"""

    def parse_output(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Extract communications domain fields from the raw LLM response.

        Silently ignores unexpected extra keys and returns an empty dict
        when the required keys are absent, so the caller can detect
        partial failures without raising.

        Args:
            raw: Parsed JSON object returned by _call_llm().

        Returns:
            Dict containing 'emailDraft' and/or 'smsDraft' when present
            in the raw payload.  Empty dict otherwise.
        """
        output: dict[str, Any] = {}
        if "emailDraft" in raw:
            output["emailDraft"] = raw["emailDraft"]
        if "smsDraft" in raw:
            output["smsDraft"] = raw["smsDraft"]
        return output
