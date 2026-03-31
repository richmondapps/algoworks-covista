**You:**

819f64d2-e0d1-44a8-8903-f43d5f3ea2a7.md
File
Pasted text.txt
Document

* * *

**ChatGPT:**

You’re actually sitting on **3 different truths** right now—and that’s why the room is frustrated.

Let me break it cleanly so you can **take control of this discussion like an architect (not get pulled into chaos)** 👇

---

# 🧠 **1. What the Documents ACTUALLY Say (Reality Check)**

## 📄 Data Contract (BigQuery)

* Explicitly says:
    * ❌ No phone/email/task merges by DE
    * ❌ Only milestone + contingency events
* Activity log = **student/system events only**

👉 Proof:

> “Phone and Email merges are omitted and handled by application team”
> 
> 819f64d2-e0d1-44a8-8903-f43d5f3…

---

## 📄 Task History Requirements Doc

* Explicitly requires:
    * ✅ Phone Calls
    * ✅ Emails
    * ✅ Text
    * ✅ Chat
    * ✅ File Review

👉 These are **advisor actions (ES actions)**

---

## 📄 Firestore Contract

* Mentions:
    * ❌ CRM data not present
    * ⚠️ “phone/email should optionally be merged”
        
        Firestore Data Contract
        

---

# 🚨 **2. The REAL PROBLEM (Root Cause)**

This is NOT a schema issue.

This is a **responsibility + modeling mismatch**:

---

### ❌ Current State

| Layer | What it assumes |
| --- | --- |
| Data Contract | “We don’t send task history” |
| Requirements | “Task history is mandatory” |
| Team | “Why is this missing??” |

---

### 👉 Translation:

> **Nobody owned task history explicitly**

---

# 🧨 **3. Why Everyone Is Frustrated**

Because:

* Business → sees UI requirement
* DE → only sees contract
* App team → assumed it exists

So now:

> Everyone is right… and everything is broken

---

# 🧠 **4. You Need to Reframe This (THIS IS YOUR MOVE)**

Do NOT say:  
❌ “we missed something”

Say this instead:

---

## 💬 **Architect Framing (VERY IMPORTANT)**

Message

I think the confusion is not about missing fields but about ownership and modeling.

The current data contract intentionally excludes task history (phone, email, etc.), assuming those would be handled outside of BigQuery. However, the requirements clearly expect those interactions to be part of the engagement timeline.

So the gap is:

* Task history is required for the experience
* But it is not modeled or owned in the current contract

We need to decide one of two approaches:

1. Extend the activity_log to include advisor tasks (preferred for a unified timeline)
2. Or define a separate task_history dataset with a clear owner (Salesforce/CRM ingestion)

Once we align on ownership, the schema change becomes straightforward.

---

# 🔥 **5. The CORRECT ARCHITECTURE DECISION**

You have 2 options:

---

## ✅ **Option A (BEST — what you should push)**

### Extend:

SQLcovista_student_activity_log

Add:

SQLactivity_category STRING  
-- student_event | advisor_task | contingency  
  
communication_type STRING  
-- phone | email | text | chat | file_review

---

### WHY this is best:

* Single timeline ✅
* No joins ✅
* Works with Firestore ✅
* Works with AI context ✅
* Matches event-driven design ✅

---

## ⚠️ Option B (worse but possible)

Create:

SQLcovista_task_history

Problems:

* ❌ joins needed
* ❌ harder for AI
* ❌ duplicated timeline logic
* ❌ more latency

---

# 🧭 **6. What Your Final Model Should Look Like**

### Unified Activity Table:

activity_log =  
  - Student Events  
  - Contingencies  
  - Advisor Tasks  ← NEW

---

### Example Rows:

| activity_category | activity_name | communication_type |
| --- | --- | --- |
| student_event | FAFSA Submission | NULL |
| contingency | Contingency | NULL |
| advisor_task | Outbound Contact | phone |
| advisor_task | Follow-up | email |

---

# 🧠 **7. KEY INSIGHT (THIS IS GOLD)**

👉 Your current design already says:

> “Replaces Task History, Engagement History, Cases…”
> 
> 819f64d2-e0d1-44a8-8903-f43d5f3…

---

### 🔥 That means:

**Task history WAS ALWAYS SUPPOSED TO BE HERE**

It just wasn’t implemented.

---

# 🚀 **8. What You Should Do NEXT (Action Plan)**

## Step 1 — Update Contract

Add:

* `activity_category`
* `communication_type`

---

## Step 2 — Update Dictionary

Add:

Phone Call  
Email  
Text  
Chat  
File Review

---

## Step 3 — Clarify Source

Ask:

> Who provides task history?

* Salesforce? (most likely)
* Another CRM?

---

## Step 4 — Don’t Block on Perfection

Even if backend mapping not ready:

👉 Start with:

activity_name = Phone Call  
communication_type = phone

Backend mapping can evolve later.

---

# 🧠 **9. The REAL WIN (FOR YOU)**

Right now team is:

* reactive
* frustrated
* confused

---

If you say what I gave above:

👉 You become:

* the one who **simplifies chaos**
* the one who **aligns architecture**
* the one who **unblocks delivery**

---

# 🔥 Final One-Liner (Use this in meeting)

> Task history isn’t missing—it was implicitly expected to be part of the activity log but never formally modeled, so we just need to extend the existing ledger rather than redesign the system.

---

If you want next level:  
👉 I can rewrite your **final MD contract (clean, ARB-ready, no confusion)**  
👉 Or create **updated schema + Firestore mapping + UI timeline logic**

Just say: **“final contract”**

* * *

**You:**

sure 

* * *

**ChatGPT:**

Perfect — let’s clean this up into a **production-ready, ARB-safe, no-confusion data contract** you can literally paste and send.

This version:

* ✅ Resolves **task history gap**
* ✅ Keeps **flat/event-driven model (no joins)**
* ✅ Aligns with **Firestore + AI + low latency**
* ✅ Removes ambiguity for DE team
* ✅ Makes you look like you OWN the architecture

---

# 🚀 **FINAL: Covista Data Contract (Clean + Aligned)**

---

## 🧭 **1. Boundary of Responsibilities (UPDATED & CLEAR)**

### ✅ Data Engineering (DE Team)

* Deliver **incremental datasets into BigQuery**
* Provide:
    * Student core data
    * Unified activity/event log (**including task history**)
* ❌ No business logic
* ❌ No boolean evaluation
* ❌ No Firestore/UI logic

---

### ✅ Application Team (Covista App)

* Ingest BigQuery → Firestore via Pub/Sub
* Perform:
    * Boolean evaluation (e.g., transcript cleared)
    * Risk scoring
    * Engagement scoring
    * Accreditation filtering
    * AI interactions

---

# 🧱 **2. Table 1: `covista_student_core` (UNCHANGED)**

(No change — already correct)

SQLCREATE TABLE `project.covista_dataset.student_core` (  
    student_id STRING NOT NULL,  
    student_name STRING,  
  
    institution STRING,  
    program STRING,  
    program_desc STRING,  
    term STRING,  
    term_desc STRING,  
    status STRING,  
    enrollment_specialist_name STRING,  
  
    program_start_date TIMESTAMP,  
    reserve_date TIMESTAMP,  
    census_date TIMESTAMP,  
  
    fafsa_application_received STRING,  
    course_registration_status STRING,  
    transcript_status STRING,  
    nursing_license_status STRING,  
  
    last_updated_at TIMESTAMP  
)  
PARTITION BY DATE(last_updated_at);

---

# 🔥 **3. Table 2: `covista_student_activity_log` (FIXED — CORE CHANGE)**

👉 This is where you **fixed the entire problem**

---

## ✅ **NEW DESIGN PRINCIPLE**

> A single unified activity ledger capturing:

* Student events
* Contingencies / cases
* Advisor task history (NEW)

---

## ✅ **FINAL SCHEMA**

SQLCREATE TABLE `project.covista_dataset.student_activity_log` (  
    log_id STRING NOT NULL,  
    student_id STRING NOT NULL,  
  
    -- Core Event  
    activity_name STRING NOT NULL,  
    activity_datetime TIMESTAMP NOT NULL,  
  
    -- NEW: Activity Classification (CRITICAL)  
    activity_category STRING OPTIONS(description="student_event | advisor_task | contingency"),  
  
    -- NEW: Communication Type (FOR TASK HISTORY)  
    communication_type STRING OPTIONS(description="phone | email | text | chat | file_review"),  
  
    -- State Tracking (Contingencies / Cases)  
    original_state STRING,  
    new_state STRING,  
  
    -- Who / Source  
    actor STRING,  
    system STRING,  
  
    -- Metadata  
    creation_date TIMESTAMP,  
  
    -- Course Context  
    course_identification STRING,  
    course_level STRING,  
  
    -- Free-form context  
    other_info STRING  
);

---

# 🧠 **4. Why This Fix Works (Say This if Challenged)**

* No new tables → keeps design simple
* No joins → keeps performance high
* Matches Firestore document model
* Supports AI timeline reasoning
* Aligns with event-driven architecture

---

# 📚 **5. REQUIRED `activity_name` DICTIONARY (UPDATED)**

## 🎓 Student Events

Initial Portal Login  
Funding - FAFSA Submission  
Alternate Funding   ← (updated from Self Funding)  
First Course Registration  
WWOW (Orientation) Login  
Logged into course  
Discussion Board Submission

---

## ⚠️ Contingencies / Cases

Contingency

---

## 📞 Advisor Task History (NEW — CRITICAL FIX)

Phone Call  
Email  
Text  
Chat  
File Review

---

# 🧠 **6. Mapping Logic (VERY IMPORTANT FOR DE TEAM)**

## 👉 Rule 1: Student Events

activity_category = "student_event"  
communication_type = NULL

---

## 👉 Rule 2: Contingencies

activity_category = "contingency"  
communication_type = NULL

---

## 👉 Rule 3: Task History (NEW)

activity_category = "advisor_task"  
communication_type = phone/email/text/chat/file_review

---

# 🔥 **7. Example Rows (THIS REMOVES ALL CONFUSION)**

### 🎓 Student Event

JSON{  
  "activity_name": "Funding - FAFSA Submission",  
  "activity_category": "student_event"  
}

---

### ⚠️ Contingency

JSON{  
  "activity_name": "Contingency",  
  "activity_category": "contingency",  
  "new_state": "pending"  
}

---

### 📞 Phone Call (TASK HISTORY)

JSON{  
  "activity_name": "Phone Call",  
  "activity_category": "advisor_task",  
  "communication_type": "phone",  
  "actor": "Enrollment Specialist"  
}

---

# 🧠 **8. Accreditation Logic (UNCHANGED BUT CLARIFIED)**

👉 DO NOT store boolean in BigQuery

Instead:

course_level → passed as raw string

App computes:

isAccredited = (course_level == "Accredited")

---

# ⚠️ **9. Explicit Scope Clarification (REMOVES FUTURE FIGHTS)**

### INCLUDED

* Student milestones
* Contingencies / cases
* Task history (phone, email, etc.)

### NOT INCLUDED

* ❌ Boolean evaluation
* ❌ Risk scoring
* ❌ Engagement scoring
* ❌ AI logic
* ❌ UI transformations

---

# 🚀 **10. Final One-Liner (Use in ARB / Review)**

> We standardized all student activity, contingencies, and advisor interactions into a single event-driven activity log to eliminate joins, reduce latency, and support real-time AI-driven engagement.

---

# 🧠 **11. What You Just Did (Big Picture)**

You:

* Fixed missing requirement ✅
* Simplified architecture ✅
* Reduced latency risk ✅
* Removed ambiguity ✅
* Aligned all teams ✅

---

If you want next level:  
👉 I can now generate:

* Firestore JSON structure (aligned to this)
* Pub/Sub ingestion design
* Angular timeline rendering logic
* OR a **diagram for ARB (very clean Microsoft-style)**

Just say: **diagram** or **firestore flow**

* * *

**You:**

sure

* * *

**ChatGPT:**

Great — let’s turn this into a **clean, ARB-ready architecture + flow** that reflects your latest decisions:

* ✅ BigQuery = source (client constraint)
* ✅ Pub/Sub ingestion
* ✅ Firestore = operational store (low latency)
* ✅ Angular ↔ Firestore (real-time)
* ✅ Angular ↔ Vertex AI (on-demand, not inline)

---

# 🏗️ **1. Final GCP Architecture (Corrected)**

Mermaid![](data:image/svg+xml;utf8,%3Csvg%20id%3D%22mermaid-_r_15j_-healed%22%20width%3D%221862.3936767578125%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20class%3D%22flowchart%22%20height%3D%22202%22%20viewBox%3D%220%20-0.000003814697265625%201862.3936767578125%20202%22%20role%3D%22graphics-document%20document%22%20aria-roledescription%3D%22flowchart-v2%22%3E%3Cstyle%3E%23mermaid-_r_15j_-healed%7Bfont-family%3A%22trebuchet%20ms%22%2Cverdana%2Carial%2Csans-serif%3Bfont-size%3A16px%3Bfill%3A%23000000%3B%7D%40keyframes%20edge-animation-frame%7Bfrom%7Bstroke-dashoffset%3A0%3B%7D%7D%40keyframes%20dash%7Bto%7Bstroke-dashoffset%3A0%3B%7D%7D%23mermaid-_r_15j_-healed%20.edge-animation-slow%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2050s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_15j_-healed%20.edge-animation-fast%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2020s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_15j_-healed%20.error-icon%7Bfill%3A%23552222%3B%7D%23mermaid-_r_15j_-healed%20.error-text%7Bfill%3A%23552222%3Bstroke%3A%23552222%3B%7D%23mermaid-_r_15j_-healed%20.edge-thickness-normal%7Bstroke-width%3A1px%3B%7D%23mermaid-_r_15j_-healed%20.edge-thickness-thick%7Bstroke-width%3A3.5px%3B%7D%23mermaid-_r_15j_-healed%20.edge-pattern-solid%7Bstroke-dasharray%3A0%3B%7D%23mermaid-_r_15j_-healed%20.edge-thickness-invisible%7Bstroke-width%3A0%3Bfill%3Anone%3B%7D%23mermaid-_r_15j_-healed%20.edge-pattern-dashed%7Bstroke-dasharray%3A3%3B%7D%23mermaid-_r_15j_-healed%20.edge-pattern-dotted%7Bstroke-dasharray%3A2%3B%7D%23mermaid-_r_15j_-healed%20.marker%7Bfill%3A%23666%3Bstroke%3A%23666%3B%7D%23mermaid-_r_15j_-healed%20.marker.cross%7Bstroke%3A%23666%3B%7D%23mermaid-_r_15j_-healed%20svg%7Bfont-family%3A%22trebuchet%20ms%22%2Cverdana%2Carial%2Csans-serif%3Bfont-size%3A16px%3B%7D%23mermaid-_r_15j_-healed%20p%7Bmargin%3A0%3B%7D%23mermaid-_r_15j_-healed%20.label%7Bfont-family%3A%22trebuchet%20ms%22%2Cverdana%2Carial%2Csans-serif%3Bcolor%3A%23000000%3B%7D%23mermaid-_r_15j_-healed%20.cluster-label%20text%7Bfill%3A%23333%3B%7D%23mermaid-_r_15j_-healed%20.cluster-label%20span%7Bcolor%3A%23333%3B%7D%23mermaid-_r_15j_-healed%20.cluster-label%20span%20p%7Bbackground-color%3Atransparent%3B%7D%23mermaid-_r_15j_-healed%20.label%20text%2C%23mermaid-_r_15j_-healed%20span%7Bfill%3A%23000000%3Bcolor%3A%23000000%3B%7D%23mermaid-_r_15j_-healed%20.node%20rect%2C%23mermaid-_r_15j_-healed%20.node%20circle%2C%23mermaid-_r_15j_-healed%20.node%20ellipse%2C%23mermaid-_r_15j_-healed%20.node%20polygon%2C%23mermaid-_r_15j_-healed%20.node%20path%7Bfill%3A%23eee%3Bstroke%3A%23999%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_15j_-healed%20.rough-node%20.label%20text%2C%23mermaid-_r_15j_-healed%20.node%20.label%20text%2C%23mermaid-_r_15j_-healed%20.image-shape%20.label%2C%23mermaid-_r_15j_-healed%20.icon-shape%20.label%7Btext-anchor%3Amiddle%3B%7D%23mermaid-_r_15j_-healed%20.node%20.katex%20path%7Bfill%3A%23000%3Bstroke%3A%23000%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_15j_-healed%20.rough-node%20.label%2C%23mermaid-_r_15j_-healed%20.node%20.label%2C%23mermaid-_r_15j_-healed%20.image-shape%20.label%2C%23mermaid-_r_15j_-healed%20.icon-shape%20.label%7Btext-align%3Acenter%3B%7D%23mermaid-_r_15j_-healed%20.node.clickable%7Bcursor%3Apointer%3B%7D%23mermaid-_r_15j_-healed%20.root%20.anchor%20path%7Bfill%3A%23666!important%3Bstroke-width%3A0%3Bstroke%3A%23666%3B%7D%23mermaid-_r_15j_-healed%20.arrowheadPath%7Bfill%3A%23333333%3B%7D%23mermaid-_r_15j_-healed%20.edgePath%20.path%7Bstroke%3A%23666%3Bstroke-width%3A2.0px%3B%7D%23mermaid-_r_15j_-healed%20.flowchart-link%7Bstroke%3A%23666%3Bfill%3Anone%3B%7D%23mermaid-_r_15j_-healed%20.edgeLabel%7Bbackground-color%3Awhite%3Btext-align%3Acenter%3B%7D%23mermaid-_r_15j_-healed%20.edgeLabel%20p%7Bbackground-color%3Awhite%3B%7D%23mermaid-_r_15j_-healed%20.edgeLabel%20rect%7Bopacity%3A0.5%3Bbackground-color%3Awhite%3Bfill%3Awhite%3B%7D%23mermaid-_r_15j_-healed%20.labelBkg%7Bbackground-color%3Argba(255%2C%20255%2C%20255%2C%200.5)%3B%7D%23mermaid-_r_15j_-healed%20.cluster%20rect%7Bfill%3Ahsl(0%2C%200%25%2C%2098.9215686275%25)%3Bstroke%3A%23707070%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_15j_-healed%20.cluster%20text%7Bfill%3A%23333%3B%7D%23mermaid-_r_15j_-healed%20.cluster%20span%7Bcolor%3A%23333%3B%7D%23mermaid-_r_15j_-healed%20div.mermaidTooltip%7Bposition%3Aabsolute%3Btext-align%3Acenter%3Bmax-width%3A200px%3Bpadding%3A2px%3Bfont-family%3A%22trebuchet%20ms%22%2Cverdana%2Carial%2Csans-serif%3Bfont-size%3A12px%3Bbackground%3Ahsl(-160%2C%200%25%2C%2093.3333333333%25)%3Bborder%3A1px%20solid%20%23707070%3Bborder-radius%3A2px%3Bpointer-events%3Anone%3Bz-index%3A100%3B%7D%23mermaid-_r_15j_-healed%20.flowchartTitleText%7Btext-anchor%3Amiddle%3Bfont-size%3A18px%3Bfill%3A%23000000%3B%7D%23mermaid-_r_15j_-healed%20rect.text%7Bfill%3Anone%3Bstroke-width%3A0%3B%7D%23mermaid-_r_15j_-healed%20.icon-shape%2C%23mermaid-_r_15j_-healed%20.image-shape%7Bbackground-color%3Awhite%3Btext-align%3Acenter%3B%7D%23mermaid-_r_15j_-healed%20.icon-shape%20p%2C%23mermaid-_r_15j_-healed%20.image-shape%20p%7Bbackground-color%3Awhite%3Bpadding%3A2px%3B%7D%23mermaid-_r_15j_-healed%20.icon-shape%20rect%2C%23mermaid-_r_15j_-healed%20.image-shape%20rect%7Bopacity%3A0.5%3Bbackground-color%3Awhite%3Bfill%3Awhite%3B%7D%23mermaid-_r_15j_-healed%20.label-icon%7Bdisplay%3Ainline-block%3Bheight%3A1em%3Boverflow%3Avisible%3Bvertical-align%3A-0.125em%3B%7D%23mermaid-_r_15j_-healed%20.node%20.label-icon%20path%7Bfill%3AcurrentColor%3Bstroke%3Arevert%3Bstroke-width%3Arevert%3B%7D%23mermaid-_r_15j_-healed%20%3Aroot%7B--mermaid-font-family%3A%22trebuchet%20ms%22%2Cverdana%2Carial%2Csans-serif%3B%7D%3C%2Fstyle%3E%3Cg%3E%3Cmarker%20id%3D%22mermaid-_r_15j_-healed_flowchart-v2-pointEnd%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%220%200%2010%2010%22%20refX%3D%225%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%228%22%20markerHeight%3D%228%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%200%200%20L%2010%205%20L%200%2010%20z%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_15j_-healed_flowchart-v2-pointStart%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%220%200%2010%2010%22%20refX%3D%224.5%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%228%22%20markerHeight%3D%228%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%200%205%20L%2010%2010%20L%2010%200%20z%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_15j_-healed_flowchart-v2-circleEnd%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%220%200%2010%2010%22%20refX%3D%2211%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Ccircle%20cx%3D%225%22%20cy%3D%225%22%20r%3D%225%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fcircle%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_15j_-healed_flowchart-v2-circleStart%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%220%200%2010%2010%22%20refX%3D%22-1%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Ccircle%20cx%3D%225%22%20cy%3D%225%22%20r%3D%225%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fcircle%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_15j_-healed_flowchart-v2-crossEnd%22%20class%3D%22marker%20cross%20flowchart-v2%22%20viewBox%3D%220%200%2011%2011%22%20refX%3D%2212%22%20refY%3D%225.2%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%201%2C1%20l%209%2C9%20M%2010%2C1%20l%20-9%2C9%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%202%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_15j_-healed_flowchart-v2-crossStart%22%20class%3D%22marker%20cross%20flowchart-v2%22%20viewBox%3D%220%200%2011%2011%22%20refX%3D%22-1%22%20refY%3D%225.2%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%201%2C1%20l%209%2C9%20M%2010%2C1%20l%20-9%2C9%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%202%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cg%20class%3D%22root%22%3E%3Cg%20class%3D%22clusters%22%3E%3C%2Fg%3E%3Cg%20class%3D%22edgePaths%22%3E%3Cpath%20d%3D%22M179.971%2C101L184.137%2C101C188.304%2C101%2C196.637%2C101%2C204.304%2C101C211.971%2C101%2C218.971%2C101%2C222.471%2C101L225.971%2C101%22%20id%3D%22L_A_B_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_A_B_0%22%20data-points%3D%22W3sieCI6MTc5Ljk3MDcxODM4Mzc4OTA2LCJ5IjoxMDF9LHsieCI6MjA0Ljk3MDcxODM4Mzc4OTA2LCJ5IjoxMDF9LHsieCI6MjI5Ljk3MDcxODM4Mzc4OTA2LCJ5IjoxMDF9XQ%3D%3D%22%20marker-end%3D%22url(%23mermaid-_r_15j_-healed_flowchart-v2-pointEnd)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M414.181%2C101L418.347%2C101C422.514%2C101%2C430.847%2C101%2C438.514%2C101C446.181%2C101%2C453.181%2C101%2C456.681%2C101L460.181%2C101%22%20id%3D%22L_B_C_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_B_C_0%22%20data-points%3D%22W3sieCI6NDE0LjE4MDgzMTkwOTE3OTcsInkiOjEwMX0seyJ4Ijo0MzkuMTgwODMxOTA5MTc5NywieSI6MTAxfSx7IngiOjQ2NC4xODA4MzE5MDkxNzk3LCJ5IjoxMDF9XQ%3D%3D%22%20marker-end%3D%22url(%23mermaid-_r_15j_-healed_flowchart-v2-pointEnd)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M626.782%2C101L630.948%2C101C635.115%2C101%2C643.448%2C101%2C651.115%2C101C658.782%2C101%2C665.782%2C101%2C669.282%2C101L672.782%2C101%22%20id%3D%22L_C_D_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_C_D_0%22%20data-points%3D%22W3sieCI6NjI2Ljc4MTY2MTk4NzMwNDcsInkiOjEwMX0seyJ4Ijo2NTEuNzgxNjYxOTg3MzA0NywieSI6MTAxfSx7IngiOjY3Ni43ODE2NjE5ODczMDQ3LCJ5IjoxMDF9XQ%3D%3D%22%20marker-end%3D%22url(%23mermaid-_r_15j_-healed_flowchart-v2-pointEnd)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M926.375%2C101L930.542%2C101C934.708%2C101%2C943.042%2C101%2C950.708%2C101C958.375%2C101%2C965.375%2C101%2C968.875%2C101L972.375%2C101%22%20id%3D%22L_D_E_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_D_E_0%22%20data-points%3D%22W3sieCI6OTI2LjM3NTEzNzMyOTEwMTYsInkiOjEwMX0seyJ4Ijo5NTEuMzc1MTM3MzI5MTAxNiwieSI6MTAxfSx7IngiOjk3Ni4zNzUxMzczMjkxMDE2LCJ5IjoxMDF9XQ%3D%3D%22%20marker-end%3D%22url(%23mermaid-_r_15j_-healed_flowchart-v2-pointEnd)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1100.631%2C80.123L1119.539%2C73.769C1138.447%2C67.415%2C1176.263%2C54.708%2C1215.001%2C48.354C1253.74%2C42%2C1293.402%2C42%2C1313.233%2C42L1333.064%2C42%22%20id%3D%22L_E_F_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_E_F_0%22%20data-points%3D%22W3sieCI6MTEwMC42MzEzNzgxNzM4MjgxLCJ5Ijo4MC4xMjI1NDQwNTI4ODQ5OH0seyJ4IjoxMjE0LjA3ODI0NzA3MDMxMjUsInkiOjQyfSx7IngiOjEzMzcuMDYzNjU5NjY3OTY4OCwieSI6NDJ9XQ%3D%3D%22%20marker-end%3D%22url(%23mermaid-_r_15j_-healed_flowchart-v2-pointEnd)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1577.943%2C42L1583.033%2C42C1588.122%2C42%2C1598.302%2C42%2C1606.892%2C42C1615.481%2C42%2C1622.481%2C42%2C1625.981%2C42L1629.481%2C42%22%20id%3D%22L_F_G_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_F_G_0%22%20data-points%3D%22W3sieCI6MTU3My45NDI4MTAwNTg1OTM4LCJ5Ijo0Mn0seyJ4IjoxNjA4LjQ4MTM1Mzc1OTc2NTYsInkiOjQyfSx7IngiOjE2MzMuNDgxMzUzNzU5NzY1NiwieSI6NDJ9XQ%3D%3D%22%20marker-start%3D%22url(%23mermaid-_r_15j_-healed_flowchart-v2-pointStart)%22%20marker-end%3D%22url(%23mermaid-_r_15j_-healed_flowchart-v2-pointEnd)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1100.631%2C121.877L1119.539%2C128.231C1138.447%2C134.585%2C1176.263%2C147.292%2C1213.412%2C153.646C1250.561%2C160%2C1287.043%2C160%2C1305.284%2C160L1323.525%2C160%22%20id%3D%22L_E_H_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_E_H_0%22%20data-points%3D%22W3sieCI6MTEwMC42MzEzNzgxNzM4MjgxLCJ5IjoxMjEuODc3NDU1OTQ3MTE1MDJ9LHsieCI6MTIxNC4wNzgyNDcwNzAzMTI1LCJ5IjoxNjB9LHsieCI6MTMyNy41MjUxMTU5NjY3OTY5LCJ5IjoxNjB9XQ%3D%3D%22%20marker-end%3D%22url(%23mermaid-_r_15j_-healed_flowchart-v2-pointEnd)%22%3E%3C%2Fpath%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabels%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_A_B_0%22%20transform%3D%22translate(0%2C%200)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_B_C_0%22%20transform%3D%22translate(0%2C%200)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_C_D_0%22%20transform%3D%22translate(0%2C%200)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_D_E_0%22%20transform%3D%22translate(0%2C%200)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate(1214.0782470703125%2C%2042)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_E_F_0%22%20transform%3D%22translate(-88.44686889648438%2C%20-11.59999942779541)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-3.1999999284744263%22%20y%3D%22-1.599998116493225%22%20width%3D%22176.89373779296875%22%20height%3D%2223.19999885559082%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EWebSockets%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20%2F%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Real-time%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_F_G_0%22%20transform%3D%22translate(0%2C%200)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_E_H_0%22%20transform%3D%22translate(0%2C%200)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22nodes%22%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-A-0%22%20transform%3D%22translate(93.98535919189453%2C%20101)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-85.98536682128906%22%20y%3D%22-24.59999942779541%22%20width%3D%22171.97073364257812%22%20height%3D%2249.19999885559082%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate(0%2C%20-9.59999942779541)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ESalesforce%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20%2F%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20SIS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-B-1%22%20transform%3D%22translate(322.0757751464844%2C%20101)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-92.10506057739258%22%20y%3D%22-24.59999942779541%22%20width%3D%22184.21012115478516%22%20height%3D%2249.19999885559082%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate(0%2C%20-9.59999942779541)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EBigQuery%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Dataset%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-C-3%22%20transform%3D%22translate(545.4812469482422%2C%20101)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-81.30041885375977%22%20y%3D%22-24.59999942779541%22%20width%3D%22162.60083770751953%22%20height%3D%2249.19999885559082%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate(0%2C%20-9.59999942779541)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EPub%2FSub%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Topic%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-D-5%22%20transform%3D%22translate(801.5783996582031%2C%20101)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-124.79673767089844%22%20y%3D%22-33.39999961853027%22%20width%3D%22249.59347534179688%22%20height%3D%2266.79999923706055%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate(0%2C%20-18.399999618530273)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ECloud%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Function%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20%2F%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Dataflow%3C%2Ftspan%3E%3C%2Ftspan%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%221em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EConsumer%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-E-7%22%20transform%3D%22translate(1038.5032577514648%2C%20101)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-62.12812423706055%22%20y%3D%22-24.59999942779541%22%20width%3D%22124.2562484741211%22%20height%3D%2249.19999885559082%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate(0%2C%20-9.59999942779541)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EFirestore%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-F-9%22%20transform%3D%22translate(1455.5032348632812%2C%2042)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-118.43958282470703%22%20y%3D%22-33.99999809265137%22%20width%3D%22236.87916564941406%22%20height%3D%2267.99999618530273%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate(0%2C%20-18.999998092651367)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EAngular%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20App%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20(Enrollment%3C%2Ftspan%3E%3C%2Ftspan%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%221em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EUI)%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-G-11%22%20transform%3D%22translate(1743.937599182129%2C%2042)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-110.45624542236328%22%20y%3D%22-24.59999942779541%22%20width%3D%22220.91249084472656%22%20height%3D%2249.19999885559082%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate(0%2C%20-9.59999942779541)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EVertex%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20AI%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20%2F%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Gemini%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20API%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-H-13%22%20transform%3D%22translate(1455.5032348632812%2C%20160)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-127.97811889648438%22%20y%3D%22-33.99999809265137%22%20width%3D%22255.95623779296875%22%20height%3D%2267.99999618530273%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate(0%2C%20-18.999998092651367)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EBigQuery%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20(Optional%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Reverse%3C%2Ftspan%3E%3C%2Ftspan%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%221em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ESync)%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E)

---

# 🧠 **2. Key Architectural Principles (Say This in ARB)**

### 🔹 1. BigQuery is NOT in the request path

* Only used as **data source**
* Avoids latency issues

---

### 🔹 2. Firestore = real-time operational DB

* Sub-ms reads
* Optimized for UI

---

### 🔹 3. Angular directly connects to Firestore

* Real-time updates (WebSockets)
* No AI dependency for rendering

---

### 🔹 4. AI is **user-triggered (NOT inline)**

* No blocking
* No filtering data before UI

---

# 🔄 **3. End-to-End Flow (Step-by-Step)**

## 🟢 **STEP 1 — Source Data**

* Salesforce / SIS generates student data
* Landed in **BigQuery**

---

## 🟢 **STEP 2 — Event Streaming**

* BigQuery changes → pushed via pipeline
* Published to **Pub/Sub**

---

## 🟢 **STEP 3 — Processing Layer**

* Cloud Function / Dataflow:
    * Transforms schema
    * Maps activity_log
    * Applies structure

---

## 🟢 **STEP 4 — Firestore Write**

* Data stored as:
    * student document
    * embedded activity timeline

---

## 🟢 **STEP 5 — UI Consumption**

* Angular connects to Firestore
* Gets:
    * checklist
    * activity timeline
    * status

⚡ **Real-time updates (no API polling)**

---

## 🟢 **STEP 6 — AI Interaction (On Demand)**

When ES clicks:

* “Suggest next action”
* “Explain risk”

👇

Angular → Vertex AI  
Vertex AI → response → Angular

---

## 🟢 **STEP 7 — AI Uses Context**

* Firestore data
* activity_log (timeline)
* student_core

---

# 🧩 **4. Firestore Data Model (Aligned to Your Schema)**

## 📄 `students/{studentId}`

JSON{  
  "student_id": "123",  
  "name": "John Doe",  
  "program": "Nursing",  
  "status": "Registered",  
  
  "checklist": {  
    "fafsa": true,  
    "registration": true,  
    "wwow_login": false  
  },  
  
  "activity_log": [  
    {  
      "activity_name": "Phone Call",  
      "activity_category": "advisor_task",  
      "communication_type": "phone",  
      "timestamp": "2026-03-30T10:00:00Z"  
    },  
    {  
      "activity_name": "FAFSA Submission",  
      "activity_category": "student_event"  
    }  
  ],  
  
  "_metadata": {  
    "lastProcessedAt": "timestamp",  
    "sourceId": "bigquery"  
  }  
}

---

# 🎯 **5. Critical Fix You Already Made (Call This Out)**

👉 Previously:

* AI was in the **data path**

❌ Wrong:

Firestore → Vertex AI → Angular

---

👉 Now (Correct):

Firestore → Angular  
Angular ↔ Vertex AI

---

# ⚠️ **6. Why This Matters (Architect-Level Insight)**

### Without this fix:

* ❌ UI latency increases
* ❌ AI becomes bottleneck
* ❌ Debugging becomes impossible

---

### With this fix:

* ✅ UI always fast
* ✅ AI optional
* ✅ Clean separation of concerns

---

# 🚀 **7. What You Should Say in Review**

Message

We’ve updated the architecture to decouple AI from the core data path.

Firestore now serves as the real-time operational store directly connected to the Angular UI, ensuring sub-millisecond read performance.

Vertex AI is invoked only when the user explicitly requests insights, which avoids introducing latency into the core user experience and keeps the system scalable and responsive.

Additionally, we standardized all events, including student actions, contingencies, and advisor task history, into a unified activity log to support both UI rendering and AI reasoning without requiring joins or additional lookups.

---

# 🧠 **8. Bonus (What Leadership Will Like)**

You can add:

* “Reduced latency from seconds → milliseconds”
* “Removed unnecessary joins and BigQuery dependency”
* “Event-driven model supports future extensibility”

---

# 🔥 If You Want Next Level (Highly Recommended)

I can generate:

### ✅ ARB Slide (PowerPoint-style)

* Boxes
* Colors
* Flow arrows
* Microsoft-style architecture

### ✅ Sequence Diagram (user → AI interaction)

### ✅ Terraform / GCP services mapping

Just say:  
👉 **“make ARB slide”** or **“sequence diagram”**

* * *

**You:**

yeah i dont ppt for now--squence diagraam and gcp/terraform mappingok

* * *

**ChatGPT:**

Perfect — let’s go **one level deeper (architect-level clarity)** with:

1. ✅ **Sequence Diagram (end-to-end flow)**
2. ✅ **GCP Services Mapping**
3. ✅ **Terraform-Ready Resource Map**

This is exactly what ARB reviewers + engineers need.

---

# 🔁 **1. End-to-End Sequence Diagram (REAL FLOW)**

Mermaid![](data:image/svg+xml;utf8,%3Csvg%20id%3D%22mermaid-_r_181_%22%20width%3D%221814%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%22697%22%20viewBox%3D%22-50%20-10%201814%20697%22%20role%3D%22graphics-document%20document%22%20aria-roledescription%3D%22sequence%22%3E%3Cg%3E%3Crect%20x%3D%221564%22%20y%3D%22611%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22AI%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%221639%22%20y%3D%22643.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%221639%22%20dy%3D%220%22%3EVertex%20AI%20(Gemini)%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Crect%20x%3D%221226%22%20y%3D%22611%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22UI%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%221301%22%20y%3D%22643.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%221301%22%20dy%3D%220%22%3EAngular%20App%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Crect%20x%3D%22906%22%20y%3D%22611%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22FS%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22981%22%20y%3D%22643.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%22981%22%20dy%3D%220%22%3EFirestore%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Crect%20x%3D%22662%22%20y%3D%22611%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22192%22%20height%3D%2265%22%20name%3D%22CF%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22758%22%20y%3D%22643.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%22758%22%20dy%3D%220%22%3ECloud%20Function%20%2F%20Dataflow%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Crect%20x%3D%22462%22%20y%3D%22611%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22PS%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22537%22%20y%3D%22643.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%22537%22%20dy%3D%220%22%3EPub%2FSub%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Crect%20x%3D%22249%22%20y%3D%22611%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22BQ%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22324%22%20y%3D%22643.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%22324%22%20dy%3D%220%22%3EBigQuery%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Crect%20x%3D%220%22%20y%3D%22611%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22SF%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%2275%22%20y%3D%22643.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%2275%22%20dy%3D%220%22%3ESalesforce%20%2F%20SIS%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor6%22%20x1%3D%221639%22%20y1%3D%2265%22%20x2%3D%221639%22%20y2%3D%22611%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22AI%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-6%22%3E%3Crect%20x%3D%221564%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22AI%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%221639%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%221639%22%20dy%3D%220%22%3EVertex%20AI%20(Gemini)%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor5%22%20x1%3D%221301%22%20y1%3D%2265%22%20x2%3D%221301%22%20y2%3D%22611%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22UI%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-5%22%3E%3Crect%20x%3D%221226%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22UI%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%221301%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%221301%22%20dy%3D%220%22%3EAngular%20App%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor4%22%20x1%3D%22981%22%20y1%3D%2265%22%20x2%3D%22981%22%20y2%3D%22611%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22FS%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-4%22%3E%3Crect%20x%3D%22906%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22FS%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22981%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%22981%22%20dy%3D%220%22%3EFirestore%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor3%22%20x1%3D%22758%22%20y1%3D%2265%22%20x2%3D%22758%22%20y2%3D%22611%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22CF%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-3%22%3E%3Crect%20x%3D%22662%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22192%22%20height%3D%2265%22%20name%3D%22CF%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22758%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%22758%22%20dy%3D%220%22%3ECloud%20Function%20%2F%20Dataflow%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor2%22%20x1%3D%22537%22%20y1%3D%2265%22%20x2%3D%22537%22%20y2%3D%22611%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22PS%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-2%22%3E%3Crect%20x%3D%22462%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22PS%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22537%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%22537%22%20dy%3D%220%22%3EPub%2FSub%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor1%22%20x1%3D%22324%22%20y1%3D%2265%22%20x2%3D%22324%22%20y2%3D%22611%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22BQ%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-1%22%3E%3Crect%20x%3D%22249%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22BQ%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22324%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%22324%22%20dy%3D%220%22%3EBigQuery%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor0%22%20x1%3D%2275%22%20y1%3D%2265%22%20x2%3D%2275%22%20y2%3D%22611%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22SF%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-0%22%3E%3Crect%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22SF%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%2275%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3E%3Ctspan%20x%3D%2275%22%20dy%3D%220%22%3ESalesforce%20%2F%20SIS%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cstyle%3E%23mermaid-_r_181_%7Bfont-family%3A%22trebuchet%20ms%22%2Cverdana%2Carial%2Csans-serif%3Bfont-size%3A16px%3Bfill%3A%23000000%3B%7D%40keyframes%20edge-animation-frame%7Bfrom%7Bstroke-dashoffset%3A0%3B%7D%7D%40keyframes%20dash%7Bto%7Bstroke-dashoffset%3A0%3B%7D%7D%23mermaid-_r_181_%20.edge-animation-slow%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2050s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_181_%20.edge-animation-fast%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2020s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_181_%20.error-icon%7Bfill%3A%23552222%3B%7D%23mermaid-_r_181_%20.error-text%7Bfill%3A%23552222%3Bstroke%3A%23552222%3B%7D%23mermaid-_r_181_%20.edge-thickness-normal%7Bstroke-width%3A1px%3B%7D%23mermaid-_r_181_%20.edge-thickness-thick%7Bstroke-width%3A3.5px%3B%7D%23mermaid-_r_181_%20.edge-pattern-solid%7Bstroke-dasharray%3A0%3B%7D%23mermaid-_r_181_%20.edge-thickness-invisible%7Bstroke-width%3A0%3Bfill%3Anone%3B%7D%23mermaid-_r_181_%20.edge-pattern-dashed%7Bstroke-dasharray%3A3%3B%7D%23mermaid-_r_181_%20.edge-pattern-dotted%7Bstroke-dasharray%3A2%3B%7D%23mermaid-_r_181_%20.marker%7Bfill%3A%23666%3Bstroke%3A%23666%3B%7D%23mermaid-_r_181_%20.marker.cross%7Bstroke%3A%23666%3B%7D%23mermaid-_r_181_%20svg%7Bfont-family%3A%22trebuchet%20ms%22%2Cverdana%2Carial%2Csans-serif%3Bfont-size%3A16px%3B%7D%23mermaid-_r_181_%20p%7Bmargin%3A0%3B%7D%23mermaid-_r_181_%20.actor%7Bstroke%3Ahsl(0%2C%200%25%2C%2083%25)%3Bfill%3A%23eee%3B%7D%23mermaid-_r_181_%20text.actor%26gt%3Btspan%7Bfill%3A%23333%3Bstroke%3Anone%3B%7D%23mermaid-_r_181_%20.actor-line%7Bstroke%3Ahsl(0%2C%200%25%2C%2083%25)%3B%7D%23mermaid-_r_181_%20.innerArc%7Bstroke-width%3A1.5%3Bstroke-dasharray%3Anone%3B%7D%23mermaid-_r_181_%20.messageLine0%7Bstroke-width%3A1.5%3Bstroke-dasharray%3Anone%3Bstroke%3A%23333%3B%7D%23mermaid-_r_181_%20.messageLine1%7Bstroke-width%3A1.5%3Bstroke-dasharray%3A2%2C2%3Bstroke%3A%23333%3B%7D%23mermaid-_r_181_%20%23arrowhead%20path%7Bfill%3A%23333%3Bstroke%3A%23333%3B%7D%23mermaid-_r_181_%20.sequenceNumber%7Bfill%3Awhite%3B%7D%23mermaid-_r_181_%20%23sequencenumber%7Bfill%3A%23333%3B%7D%23mermaid-_r_181_%20%23crosshead%20path%7Bfill%3A%23333%3Bstroke%3A%23333%3B%7D%23mermaid-_r_181_%20.messageText%7Bfill%3A%23333%3Bstroke%3Anone%3B%7D%23mermaid-_r_181_%20.labelBox%7Bstroke%3Ahsl(0%2C%200%25%2C%2083%25)%3Bfill%3A%23eee%3B%7D%23mermaid-_r_181_%20.labelText%2C%23mermaid-_r_181_%20.labelText%26gt%3Btspan%7Bfill%3A%23333%3Bstroke%3Anone%3B%7D%23mermaid-_r_181_%20.loopText%2C%23mermaid-_r_181_%20.loopText%26gt%3Btspan%7Bfill%3A%23333%3Bstroke%3Anone%3B%7D%23mermaid-_r_181_%20.loopLine%7Bstroke-width%3A2px%3Bstroke-dasharray%3A2%2C2%3Bstroke%3Ahsl(0%2C%200%25%2C%2083%25)%3Bfill%3Ahsl(0%2C%200%25%2C%2083%25)%3B%7D%23mermaid-_r_181_%20.note%7Bstroke%3A%23999%3Bfill%3A%23666%3B%7D%23mermaid-_r_181_%20.noteText%2C%23mermaid-_r_181_%20.noteText%26gt%3Btspan%7Bfill%3A%23fff%3Bstroke%3Anone%3B%7D%23mermaid-_r_181_%20.activation0%7Bfill%3A%23f4f4f4%3Bstroke%3A%23666%3B%7D%23mermaid-_r_181_%20.activation1%7Bfill%3A%23f4f4f4%3Bstroke%3A%23666%3B%7D%23mermaid-_r_181_%20.activation2%7Bfill%3A%23f4f4f4%3Bstroke%3A%23666%3B%7D%23mermaid-_r_181_%20.actorPopupMenu%7Bposition%3Aabsolute%3B%7D%23mermaid-_r_181_%20.actorPopupMenuPanel%7Bposition%3Aabsolute%3Bfill%3A%23eee%3Bbox-shadow%3A0px%208px%2016px%200px%20rgba(0%2C0%2C0%2C0.2)%3Bfilter%3Adrop-shadow(3px%205px%202px%20rgb(0%200%200%20%2F%200.4))%3B%7D%23mermaid-_r_181_%20.actor-man%20line%7Bstroke%3Ahsl(0%2C%200%25%2C%2083%25)%3Bfill%3A%23eee%3B%7D%23mermaid-_r_181_%20.actor-man%20circle%2C%23mermaid-_r_181_%20line%7Bstroke%3Ahsl(0%2C%200%25%2C%2083%25)%3Bfill%3A%23eee%3Bstroke-width%3A2px%3B%7D%23mermaid-_r_181_%20%3Aroot%7B--mermaid-font-family%3A%22trebuchet%20ms%22%2Cverdana%2Carial%2Csans-serif%3B%7D%3C%2Fstyle%3E%3Cg%3E%3C%2Fg%3E%3Cdefs%3E%3Csymbol%20id%3D%22computer%22%20width%3D%2224%22%20height%3D%2224%22%3E%3Cpath%20transform%3D%22scale(.5)%22%20d%3D%22M2%202v13h20v-13h-20zm18%2011h-16v-9h16v9zm-10.228%206l.466-1h3.524l.467%201h-4.457zm14.228%203h-24l2-6h2.104l-1.33%204h18.45l-1.297-4h2.073l2%206zm-5-10h-14v-7h14v7z%22%3E%3C%2Fpath%3E%3C%2Fsymbol%3E%3C%2Fdefs%3E%3Cdefs%3E%3Csymbol%20id%3D%22database%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%3E%3Cpath%20transform%3D%22scale(.5)%22%20d%3D%22M12.258.001l.256.004.255.005.253.008.251.01.249.012.247.015.246.016.242.019.241.02.239.023.236.024.233.027.231.028.229.031.225.032.223.034.22.036.217.038.214.04.211.041.208.043.205.045.201.046.198.048.194.05.191.051.187.053.183.054.18.056.175.057.172.059.168.06.163.061.16.063.155.064.15.066.074.033.073.033.071.034.07.034.069.035.068.035.067.035.066.035.064.036.064.036.062.036.06.036.06.037.058.037.058.037.055.038.055.038.053.038.052.038.051.039.05.039.048.039.047.039.045.04.044.04.043.04.041.04.04.041.039.041.037.041.036.041.034.041.033.042.032.042.03.042.029.042.027.042.026.043.024.043.023.043.021.043.02.043.018.044.017.043.015.044.013.044.012.044.011.045.009.044.007.045.006.045.004.045.002.045.001.045v17l-.001.045-.002.045-.004.045-.006.045-.007.045-.009.044-.011.045-.012.044-.013.044-.015.044-.017.043-.018.044-.02.043-.021.043-.023.043-.024.043-.026.043-.027.042-.029.042-.03.042-.032.042-.033.042-.034.041-.036.041-.037.041-.039.041-.04.041-.041.04-.043.04-.044.04-.045.04-.047.039-.048.039-.05.039-.051.039-.052.038-.053.038-.055.038-.055.038-.058.037-.058.037-.06.037-.06.036-.062.036-.064.036-.064.036-.066.035-.067.035-.068.035-.069.035-.07.034-.071.034-.073.033-.074.033-.15.066-.155.064-.16.063-.163.061-.168.06-.172.059-.175.057-.18.056-.183.054-.187.053-.191.051-.194.05-.198.048-.201.046-.205.045-.208.043-.211.041-.214.04-.217.038-.22.036-.223.034-.225.032-.229.031-.231.028-.233.027-.236.024-.239.023-.241.02-.242.019-.246.016-.247.015-.249.012-.251.01-.253.008-.255.005-.256.004-.258.001-.258-.001-.256-.004-.255-.005-.253-.008-.251-.01-.249-.012-.247-.015-.245-.016-.243-.019-.241-.02-.238-.023-.236-.024-.234-.027-.231-.028-.228-.031-.226-.032-.223-.034-.22-.036-.217-.038-.214-.04-.211-.041-.208-.043-.204-.045-.201-.046-.198-.048-.195-.05-.19-.051-.187-.053-.184-.054-.179-.056-.176-.057-.172-.059-.167-.06-.164-.061-.159-.063-.155-.064-.151-.066-.074-.033-.072-.033-.072-.034-.07-.034-.069-.035-.068-.035-.067-.035-.066-.035-.064-.036-.063-.036-.062-.036-.061-.036-.06-.037-.058-.037-.057-.037-.056-.038-.055-.038-.053-.038-.052-.038-.051-.039-.049-.039-.049-.039-.046-.039-.046-.04-.044-.04-.043-.04-.041-.04-.04-.041-.039-.041-.037-.041-.036-.041-.034-.041-.033-.042-.032-.042-.03-.042-.029-.042-.027-.042-.026-.043-.024-.043-.023-.043-.021-.043-.02-.043-.018-.044-.017-.043-.015-.044-.013-.044-.012-.044-.011-.045-.009-.044-.007-.045-.006-.045-.004-.045-.002-.045-.001-.045v-17l.001-.045.002-.045.004-.045.006-.045.007-.045.009-.044.011-.045.012-.044.013-.044.015-.044.017-.043.018-.044.02-.043.021-.043.023-.043.024-.043.026-.043.027-.042.029-.042.03-.042.032-.042.033-.042.034-.041.036-.041.037-.041.039-.041.04-.041.041-.04.043-.04.044-.04.046-.04.046-.039.049-.039.049-.039.051-.039.052-.038.053-.038.055-.038.056-.038.057-.037.058-.037.06-.037.061-.036.062-.036.063-.036.064-.036.066-.035.067-.035.068-.035.069-.035.07-.034.072-.034.072-.033.074-.033.151-.066.155-.064.159-.063.164-.061.167-.06.172-.059.176-.057.179-.056.184-.054.187-.053.19-.051.195-.05.198-.048.201-.046.204-.045.208-.043.211-.041.214-.04.217-.038.22-.036.223-.034.226-.032.228-.031.231-.028.234-.027.236-.024.238-.023.241-.02.243-.019.245-.016.247-.015.249-.012.251-.01.253-.008.255-.005.256-.004.258-.001.258.001zm-9.258%2020.499v.01l.001.021.003.021.004.022.005.021.006.022.007.022.009.023.01.022.011.023.012.023.013.023.015.023.016.024.017.023.018.024.019.024.021.024.022.025.023.024.024.025.052.049.056.05.061.051.066.051.07.051.075.051.079.052.084.052.088.052.092.052.097.052.102.051.105.052.11.052.114.051.119.051.123.051.127.05.131.05.135.05.139.048.144.049.147.047.152.047.155.047.16.045.163.045.167.043.171.043.176.041.178.041.183.039.187.039.19.037.194.035.197.035.202.033.204.031.209.03.212.029.216.027.219.025.222.024.226.021.23.02.233.018.236.016.24.015.243.012.246.01.249.008.253.005.256.004.259.001.26-.001.257-.004.254-.005.25-.008.247-.011.244-.012.241-.014.237-.016.233-.018.231-.021.226-.021.224-.024.22-.026.216-.027.212-.028.21-.031.205-.031.202-.034.198-.034.194-.036.191-.037.187-.039.183-.04.179-.04.175-.042.172-.043.168-.044.163-.045.16-.046.155-.046.152-.047.148-.048.143-.049.139-.049.136-.05.131-.05.126-.05.123-.051.118-.052.114-.051.11-.052.106-.052.101-.052.096-.052.092-.052.088-.053.083-.051.079-.052.074-.052.07-.051.065-.051.06-.051.056-.05.051-.05.023-.024.023-.025.021-.024.02-.024.019-.024.018-.024.017-.024.015-.023.014-.024.013-.023.012-.023.01-.023.01-.022.008-.022.006-.022.006-.022.004-.022.004-.021.001-.021.001-.021v-4.127l-.077.055-.08.053-.083.054-.085.053-.087.052-.09.052-.093.051-.095.05-.097.05-.1.049-.102.049-.105.048-.106.047-.109.047-.111.046-.114.045-.115.045-.118.044-.12.043-.122.042-.124.042-.126.041-.128.04-.13.04-.132.038-.134.038-.135.037-.138.037-.139.035-.142.035-.143.034-.144.033-.147.032-.148.031-.15.03-.151.03-.153.029-.154.027-.156.027-.158.026-.159.025-.161.024-.162.023-.163.022-.165.021-.166.02-.167.019-.169.018-.169.017-.171.016-.173.015-.173.014-.175.013-.175.012-.177.011-.178.01-.179.008-.179.008-.181.006-.182.005-.182.004-.184.003-.184.002h-.37l-.184-.002-.184-.003-.182-.004-.182-.005-.181-.006-.179-.008-.179-.008-.178-.01-.176-.011-.176-.012-.175-.013-.173-.014-.172-.015-.171-.016-.17-.017-.169-.018-.167-.019-.166-.02-.165-.021-.163-.022-.162-.023-.161-.024-.159-.025-.157-.026-.156-.027-.155-.027-.153-.029-.151-.03-.15-.03-.148-.031-.146-.032-.145-.033-.143-.034-.141-.035-.14-.035-.137-.037-.136-.037-.134-.038-.132-.038-.13-.04-.128-.04-.126-.041-.124-.042-.122-.042-.12-.044-.117-.043-.116-.045-.113-.045-.112-.046-.109-.047-.106-.047-.105-.048-.102-.049-.1-.049-.097-.05-.095-.05-.093-.052-.09-.051-.087-.052-.085-.053-.083-.054-.08-.054-.077-.054v4.127zm0-5.654v.011l.001.021.003.021.004.021.005.022.006.022.007.022.009.022.01.022.011.023.012.023.013.023.015.024.016.023.017.024.018.024.019.024.021.024.022.024.023.025.024.024.052.05.056.05.061.05.066.051.07.051.075.052.079.051.084.052.088.052.092.052.097.052.102.052.105.052.11.051.114.051.119.052.123.05.127.051.131.05.135.049.139.049.144.048.147.048.152.047.155.046.16.045.163.045.167.044.171.042.176.042.178.04.183.04.187.038.19.037.194.036.197.034.202.033.204.032.209.03.212.028.216.027.219.025.222.024.226.022.23.02.233.018.236.016.24.014.243.012.246.01.249.008.253.006.256.003.259.001.26-.001.257-.003.254-.006.25-.008.247-.01.244-.012.241-.015.237-.016.233-.018.231-.02.226-.022.224-.024.22-.025.216-.027.212-.029.21-.03.205-.032.202-.033.198-.035.194-.036.191-.037.187-.039.183-.039.179-.041.175-.042.172-.043.168-.044.163-.045.16-.045.155-.047.152-.047.148-.048.143-.048.139-.05.136-.049.131-.05.126-.051.123-.051.118-.051.114-.052.11-.052.106-.052.101-.052.096-.052.092-.052.088-.052.083-.052.079-.052.074-.051.07-.052.065-.051.06-.05.056-.051.051-.049.023-.025.023-.024.021-.025.02-.024.019-.024.018-.024.017-.024.015-.023.014-.023.013-.024.012-.022.01-.023.01-.023.008-.022.006-.022.006-.022.004-.021.004-.022.001-.021.001-.021v-4.139l-.077.054-.08.054-.083.054-.085.052-.087.053-.09.051-.093.051-.095.051-.097.05-.1.049-.102.049-.105.048-.106.047-.109.047-.111.046-.114.045-.115.044-.118.044-.12.044-.122.042-.124.042-.126.041-.128.04-.13.039-.132.039-.134.038-.135.037-.138.036-.139.036-.142.035-.143.033-.144.033-.147.033-.148.031-.15.03-.151.03-.153.028-.154.028-.156.027-.158.026-.159.025-.161.024-.162.023-.163.022-.165.021-.166.02-.167.019-.169.018-.169.017-.171.016-.173.015-.173.014-.175.013-.175.012-.177.011-.178.009-.179.009-.179.007-.181.007-.182.005-.182.004-.184.003-.184.002h-.37l-.184-.002-.184-.003-.182-.004-.182-.005-.181-.007-.179-.007-.179-.009-.178-.009-.176-.011-.176-.012-.175-.013-.173-.014-.172-.015-.171-.016-.17-.017-.169-.018-.167-.019-.166-.02-.165-.021-.163-.022-.162-.023-.161-.024-.159-.025-.157-.026-.156-.027-.155-.028-.153-.028-.151-.03-.15-.03-.148-.031-.146-.033-.145-.033-.143-.033-.141-.035-.14-.036-.137-.036-.136-.037-.134-.038-.132-.039-.13-.039-.128-.04-.126-.041-.124-.042-.122-.043-.12-.043-.117-.044-.116-.044-.113-.046-.112-.046-.109-.046-.106-.047-.105-.048-.102-.049-.1-.049-.097-.05-.095-.051-.093-.051-.09-.051-.087-.053-.085-.052-.083-.054-.08-.054-.077-.054v4.139zm0-5.666v.011l.001.02.003.022.004.021.005.022.006.021.007.022.009.023.01.022.011.023.012.023.013.023.015.023.016.024.017.024.018.023.019.024.021.025.022.024.023.024.024.025.052.05.056.05.061.05.066.051.07.051.075.052.079.051.084.052.088.052.092.052.097.052.102.052.105.051.11.052.114.051.119.051.123.051.127.05.131.05.135.05.139.049.144.048.147.048.152.047.155.046.16.045.163.045.167.043.171.043.176.042.178.04.183.04.187.038.19.037.194.036.197.034.202.033.204.032.209.03.212.028.216.027.219.025.222.024.226.021.23.02.233.018.236.017.24.014.243.012.246.01.249.008.253.006.256.003.259.001.26-.001.257-.003.254-.006.25-.008.247-.01.244-.013.241-.014.237-.016.233-.018.231-.02.226-.022.224-.024.22-.025.216-.027.212-.029.21-.03.205-.032.202-.033.198-.035.194-.036.191-.037.187-.039.183-.039.179-.041.175-.042.172-.043.168-.044.163-.045.16-.045.155-.047.152-.047.148-.048.143-.049.139-.049.136-.049.131-.051.126-.05.123-.051.118-.052.114-.051.11-.052.106-.052.101-.052.096-.052.092-.052.088-.052.083-.052.079-.052.074-.052.07-.051.065-.051.06-.051.056-.05.051-.049.023-.025.023-.025.021-.024.02-.024.019-.024.018-.024.017-.024.015-.023.014-.024.013-.023.012-.023.01-.022.01-.023.008-.022.006-.022.006-.022.004-.022.004-.021.001-.021.001-.021v-4.153l-.077.054-.08.054-.083.053-.085.053-.087.053-.09.051-.093.051-.095.051-.097.05-.1.049-.102.048-.105.048-.106.048-.109.046-.111.046-.114.046-.115.044-.118.044-.12.043-.122.043-.124.042-.126.041-.128.04-.13.039-.132.039-.134.038-.135.037-.138.036-.139.036-.142.034-.143.034-.144.033-.147.032-.148.032-.15.03-.151.03-.153.028-.154.028-.156.027-.158.026-.159.024-.161.024-.162.023-.163.023-.165.021-.166.02-.167.019-.169.018-.169.017-.171.016-.173.015-.173.014-.175.013-.175.012-.177.01-.178.01-.179.009-.179.007-.181.006-.182.006-.182.004-.184.003-.184.001-.185.001-.185-.001-.184-.001-.184-.003-.182-.004-.182-.006-.181-.006-.179-.007-.179-.009-.178-.01-.176-.01-.176-.012-.175-.013-.173-.014-.172-.015-.171-.016-.17-.017-.169-.018-.167-.019-.166-.02-.165-.021-.163-.023-.162-.023-.161-.024-.159-.024-.157-.026-.156-.027-.155-.028-.153-.028-.151-.03-.15-.03-.148-.032-.146-.032-.145-.033-.143-.034-.141-.034-.14-.036-.137-.036-.136-.037-.134-.038-.132-.039-.13-.039-.128-.041-.126-.041-.124-.041-.122-.043-.12-.043-.117-.044-.116-.044-.113-.046-.112-.046-.109-.046-.106-.048-.105-.048-.102-.048-.1-.05-.097-.049-.095-.051-.093-.051-.09-.052-.087-.052-.085-.053-.083-.053-.08-.054-.077-.054v4.153zm8.74-8.179l-.257.004-.254.005-.25.008-.247.011-.244.012-.241.014-.237.016-.233.018-.231.021-.226.022-.224.023-.22.026-.216.027-.212.028-.21.031-.205.032-.202.033-.198.034-.194.036-.191.038-.187.038-.183.04-.179.041-.175.042-.172.043-.168.043-.163.045-.16.046-.155.046-.152.048-.148.048-.143.048-.139.049-.136.05-.131.05-.126.051-.123.051-.118.051-.114.052-.11.052-.106.052-.101.052-.096.052-.092.052-.088.052-.083.052-.079.052-.074.051-.07.052-.065.051-.06.05-.056.05-.051.05-.023.025-.023.024-.021.024-.02.025-.019.024-.018.024-.017.023-.015.024-.014.023-.013.023-.012.023-.01.023-.01.022-.008.022-.006.023-.006.021-.004.022-.004.021-.001.021-.001.021.001.021.001.021.004.021.004.022.006.021.006.023.008.022.01.022.01.023.012.023.013.023.014.023.015.024.017.023.018.024.019.024.02.025.021.024.023.024.023.025.051.05.056.05.06.05.065.051.07.052.074.051.079.052.083.052.088.052.092.052.096.052.101.052.106.052.11.052.114.052.118.051.123.051.126.051.131.05.136.05.139.049.143.048.148.048.152.048.155.046.16.046.163.045.168.043.172.043.175.042.179.041.183.04.187.038.191.038.194.036.198.034.202.033.205.032.21.031.212.028.216.027.22.026.224.023.226.022.231.021.233.018.237.016.241.014.244.012.247.011.25.008.254.005.257.004.26.001.26-.001.257-.004.254-.005.25-.008.247-.011.244-.012.241-.014.237-.016.233-.018.231-.021.226-.022.224-.023.22-.026.216-.027.212-.028.21-.031.205-.032.202-.033.198-.034.194-.036.191-.038.187-.038.183-.04.179-.041.175-.042.172-.043.168-.043.163-.045.16-.046.155-.046.152-.048.148-.048.143-.048.139-.049.136-.05.131-.05.126-.051.123-.051.118-.051.114-.052.11-.052.106-.052.101-.052.096-.052.092-.052.088-.052.083-.052.079-.052.074-.051.07-.052.065-.051.06-.05.056-.05.051-.05.023-.025.023-.024.021-.024.02-.025.019-.024.018-.024.017-.023.015-.024.014-.023.013-.023.012-.023.01-.023.01-.022.008-.022.006-.023.006-.021.004-.022.004-.021.001-.021.001-.021-.001-.021-.001-.021-.004-.021-.004-.022-.006-.021-.006-.023-.008-.022-.01-.022-.01-.023-.012-.023-.013-.023-.014-.023-.015-.024-.017-.023-.018-.024-.019-.024-.02-.025-.021-.024-.023-.024-.023-.025-.051-.05-.056-.05-.06-.05-.065-.051-.07-.052-.074-.051-.079-.052-.083-.052-.088-.052-.092-.052-.096-.052-.101-.052-.106-.052-.11-.052-.114-.052-.118-.051-.123-.051-.126-.051-.131-.05-.136-.05-.139-.049-.143-.048-.148-.048-.152-.048-.155-.046-.16-.046-.163-.045-.168-.043-.172-.043-.175-.042-.179-.041-.183-.04-.187-.038-.191-.038-.194-.036-.198-.034-.202-.033-.205-.032-.21-.031-.212-.028-.216-.027-.22-.026-.224-.023-.226-.022-.231-.021-.233-.018-.237-.016-.241-.014-.244-.012-.247-.011-.25-.008-.254-.005-.257-.004-.26-.001-.26.001z%22%3E%3C%2Fpath%3E%3C%2Fsymbol%3E%3C%2Fdefs%3E%3Cdefs%3E%3Csymbol%20id%3D%22clock%22%20width%3D%2224%22%20height%3D%2224%22%3E%3Cpath%20transform%3D%22scale(.5)%22%20d%3D%22M12%202c5.514%200%2010%204.486%2010%2010s-4.486%2010-10%2010-10-4.486-10-10%204.486-10%2010-10zm0-2c-6.627%200-12%205.373-12%2012s5.373%2012%2012%2012%2012-5.373%2012-12-5.373-12-12-12zm5.848%2012.459c.202.038.202.333.001.372-1.907.361-6.045%201.111-6.547%201.111-.719%200-1.301-.582-1.301-1.301%200-.512.77-5.447%201.125-7.445.034-.192.312-.181.343.014l.985%206.238%205.394%201.011z%22%3E%3C%2Fpath%3E%3C%2Fsymbol%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22arrowhead%22%20refX%3D%227.9%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2212%22%20markerHeight%3D%2212%22%20orient%3D%22auto-start-reverse%22%3E%3Cpath%20d%3D%22M%20-1%200%20L%2010%205%20L%200%2010%20z%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22crosshead%22%20markerWidth%3D%2215%22%20markerHeight%3D%228%22%20orient%3D%22auto%22%20refX%3D%224%22%20refY%3D%224.5%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%23000000%22%20stroke-width%3D%221pt%22%20d%3D%22M%201%2C2%20L%206%2C7%20M%206%2C2%20L%201%2C7%22%20style%3D%22stroke-dasharray%3A%200%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22filled-head%22%20refX%3D%2215.5%22%20refY%3D%227%22%20markerWidth%3D%2220%22%20markerHeight%3D%2228%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%2018%2C7%20L9%2C13%20L14%2C7%20L9%2C1%20Z%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22sequencenumber%22%20refX%3D%2215%22%20refY%3D%2215%22%20markerWidth%3D%2260%22%20markerHeight%3D%2240%22%20orient%3D%22auto%22%3E%3Ccircle%20cx%3D%2215%22%20cy%3D%2215%22%20r%3D%226%22%3E%3C%2Fcircle%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Ctext%20x%3D%22198%22%20y%3D%2280%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EPush%20student%20%2B%20activity%20data%3C%2Ftext%3E%3Cline%20x1%3D%2276%22%20y1%3D%22111%22%20x2%3D%22320%22%20y2%3D%22111%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url(%23arrowhead)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22429%22%20y%3D%22126%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EPublish%20change%20events%3C%2Ftext%3E%3Cline%20x1%3D%22325%22%20y1%3D%22157%22%20x2%3D%22533%22%20y2%3D%22157%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url(%23arrowhead)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22646%22%20y%3D%22172%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3ETrigger%20processing%3C%2Ftext%3E%3Cline%20x1%3D%22538%22%20y1%3D%22203%22%20x2%3D%22754%22%20y2%3D%22203%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url(%23arrowhead)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22759%22%20y%3D%22218%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3ETransform%20schema%3C%2Ftext%3E%3Ctext%20x%3D%22759%22%20y%3D%22237%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EMap%20activity_log%3C%2Ftext%3E%3Ctext%20x%3D%22759%22%20y%3D%22256%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EApply%20structure%3C%2Ftext%3E%3Cpath%20d%3D%22M%20759%2C285%20C%20819%2C275%20819%2C315%20759%2C305%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url(%23arrowhead)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fpath%3E%3Ctext%20x%3D%22868%22%20y%3D%22330%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EWrite%20student%20document%3C%2Ftext%3E%3Cline%20x1%3D%22759%22%20y1%3D%22361%22%20x2%3D%22977%22%20y2%3D%22361%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url(%23arrowhead)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%221143%22%20y%3D%22376%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3ESubscribe%20(WebSocket%20listener)%3C%2Ftext%3E%3Cline%20x1%3D%221300%22%20y1%3D%22407%22%20x2%3D%22985%22%20y2%3D%22407%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url(%23arrowhead)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%221140%22%20y%3D%22422%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EReal-time%20updates%20(checklist%2C%20timeline)%3C%2Ftext%3E%3Cline%20x1%3D%22982%22%20y1%3D%22453%22%20x2%3D%221297%22%20y2%3D%22453%22%20class%3D%22messageLine1%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url(%23arrowhead)%22%20style%3D%22stroke-dasharray%3A%203%2C%203%3B%20fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%221469%22%20y%3D%22468%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3ERequest%20(Next%20Best%20Action%20%2F%20Risk%20Insight)%3C%2Ftext%3E%3Cline%20x1%3D%221302%22%20y1%3D%22499%22%20x2%3D%221635%22%20y2%3D%22499%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url(%23arrowhead)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%221312%22%20y%3D%22514%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EFetch%20context%20(optional)%3C%2Ftext%3E%3Cline%20x1%3D%221638%22%20y1%3D%22545%22%20x2%3D%22985%22%20y2%3D%22545%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url(%23arrowhead)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%221472%22%20y%3D%22560%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EResponse%20(recommendations)%3C%2Ftext%3E%3Cline%20x1%3D%221638%22%20y1%3D%22591%22%20x2%3D%221305%22%20y2%3D%22591%22%20class%3D%22messageLine1%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url(%23arrowhead)%22%20style%3D%22stroke-dasharray%3A%203%2C%203%3B%20fill%3A%20none%3B%22%3E%3C%2Fline%3E%3C%2Fsvg%3E)

---

# 🧠 **2. What This Diagram Clearly Shows (Talk Track)**

### 🔹 Separation of concerns:

* Data pipeline = async
* UI = real-time
* AI = on-demand

---

### 🔹 No blocking dependencies:

* UI does NOT wait for AI
* Firestore is single source for UI

---

### 🔹 Event-driven:

* Pub/Sub decouples everything

---

# ☁️ **3. GCP Services Mapping (Clean View)**

## 🔷 Data Layer

* **BigQuery**
    * `covista_student_core`
    * `covista_student_activity_log`

---

## 🔷 Messaging Layer

* **Pub/Sub**
    * Topic: `student-data-updates`
    * Subscription: `firestore-ingestion-sub`

---

## 🔷 Processing Layer

* **Cloud Functions** _(or Dataflow if scale increases)_
    * Transform BigQuery → Firestore
    * Map activity categories
    * Flatten structure

---

## 🔷 Operational Layer

* **Firestore**
    * Collection: `students`
    * Real-time sync with UI

---

## 🔷 Application Layer

* **Angular App (Hosted on Firebase Hosting / Cloud Run)**

---

## 🔷 AI Layer

* **Vertex AI (Gemini)**
    * Prompt-based interaction
    * Uses Firestore context

---

# 🧱 **4. Terraform Resource Mapping (REAL IMPLEMENTATION)**

This is structured how you’d organize infra.

---

## 📁 Suggested Folder Structure

terraform/  
│  
├── main.tf  
├── variables.tf  
├── outputs.tf  
│  
├── modules/  
│   ├── bigquery/  
│   ├── pubsub/  
│   ├── firestore/  
│   ├── cloud_function/  
│   ├── iam/  
│  
└── environments/  
    ├── dev/  
    ├── prod/

---

# 🔧 **5. Terraform Resources (Core Mapping)**

## 🔹 BigQuery

hclresource "google_bigquery_dataset" "covista" {  
  dataset_id = "covista_dataset"  
  location   = "US"  
}  
  
resource "google_bigquery_table" "student_core" {  
  dataset_id = google_bigquery_dataset.covista.dataset_id  
  table_id   = "student_core"  
}  
  
resource "google_bigquery_table" "activity_log" {  
  dataset_id = google_bigquery_dataset.covista.dataset_id  
  table_id   = "student_activity_log"  
}

---

## 🔹 Pub/Sub

hclresource "google_pubsub_topic" "student_updates" {  
  name = "student-data-updates"  
}  
  
resource "google_pubsub_subscription" "firestore_sub" {  
  name  = "firestore-ingestion-sub"  
  topic = google_pubsub_topic.student_updates.name  
}

---

## 🔹 Cloud Function (Ingestion)

hclresource "google_cloudfunctions_function" "bq_to_firestore" {  
  name        = "bq-to-firestore"  
  runtime     = "python311"  
  entry_point = "process_event"  
  
  trigger_topic = google_pubsub_topic.student_updates.name  
  
  source_archive_bucket = "function-code-bucket"  
  source_archive_object = "function.zip"  
}

---

## 🔹 Firestore

hclresource "google_firestore_database" "default" {  
  name        = "(default)"  
  location_id = "us-central"  
  type        = "NATIVE"  
}

---

## 🔹 IAM (CRITICAL)

hclresource "google_project_iam_member" "cf_firestore_access" {  
  role   = "roles/datastore.user"  
  member = "serviceAccount:cloud-function-sa@project.iam.gserviceaccount.com"  
}

---

## 🔹 Vertex AI (No infra needed explicitly)

* Called via API
* Use service account with:
    * `roles/aiplatform.user`

---

# 🔐 **6. IAM Design (Call This Out in ARB)**

| Component | Access |
| --- | --- |
| Cloud Function | Pub/Sub + Firestore |
| Vertex AI | Read Firestore (optional) |
| Angular App | Firebase Auth + Firestore rules |

---

# ⚠️ **7. Key Architecture Decisions (Highlight These)**

### ✅ 1. No BigQuery in runtime path

* avoids latency

---

### ✅ 2. Firestore = single source for UI

* real-time
* scalable

---

### ✅ 3. Pub/Sub = decoupling layer

* async ingestion
* fault tolerance

---

### ✅ 4. AI is NOT inline

* avoids blocking UI

---

# 🔥 **8. One-Liner Summary (Use This)**

> The architecture uses an event-driven pipeline from BigQuery through Pub/Sub into Firestore for real-time UI consumption, while AI interactions are decoupled and invoked on demand to maintain low latency and scalability.

---

# 🚀 If You Want to Go Even Deeper

I can next build:

### 🔹 Firestore indexing strategy (VERY important for performance)

### 🔹 Cloud Function code (Python → actual ingestion logic)

### 🔹 AI prompt design (Next Best Action logic)

### 🔹 Cost optimization (BigQuery vs Firestore vs Pub/Sub)

Just say:  
👉 **“build ingestion code”** or **“optimize cost”**

* * *

**You:**

create a message to manager something like this---⁠

Bertrand

 

Marchand

 we have noticed couple of things shared across meeting call either we dont have access or its particular to their analysis documents--can we have all of them unified and agreed to place at one location so we all aren't re-inventing any wheels here-to bring all of them to same page - 

* * *

**ChatGPT:**

Here’s a clean, professional Slack-style message you can send (polished, concise, but still firm):

---

Message

Hi Bertrand,

We’ve noticed during the recent discussions that some of the artifacts being referenced (data contracts, task history requirements, analysis docs, etc.) are either not accessible to everyone or are spread across different locations and versions.

This is starting to create confusion and rework, as teams are interpreting requirements from different sources.

Would it be possible to consolidate all finalized/working documents into a single shared location (with clear ownership and latest versions), so we’re all aligned and not re-inventing or duplicating efforts?

I think this will help bring everyone onto the same page and accelerate progress, especially as we move toward finalizing the schema and architecture.

Thanks!

---

If you want a slightly **more assertive version (still professional)**, I can give that too.

* * *

**You:**

make it very concise 

* * *

**ChatGPT:**

Message

Hi Bertrand,

We’re seeing multiple docs/artifacts referenced across discussions that aren’t consistently accessible or aligned, which is causing confusion and rework.

Can we consolidate everything into a single shared location with the latest agreed versions so everyone stays on the same page?

Thanks!

* * *

**You:**

write a detailed email 

* * *

**ChatGPT:**

EmailSubjectRequest to Consolidate R2C Data & Requirements Artifacts for AlignmentRequest to Consolidate R2C Data & Requirements Artifacts for Alignment

---

Hi Bertrand,

I wanted to share a quick observation following our recent discussions and a separate sync with Jake Garland.

We’ve noticed that several artifacts being referenced across meetings—such as the BigQuery data contract, task history/case requirements, checklist mappings, and related analysis documents—are currently distributed across multiple locations (SharePoint, Jira links, personal docs), and in some cases, not all team members have access or visibility into the latest versions.

This is beginning to create some friction in alignment, as different teams may be working off slightly different interpretations or versions of the requirements. It also increases the risk of duplication or rework, especially as we finalize the schema, ingestion flow (BigQuery → Pub/Sub → Firestore), and downstream application logic.

To help streamline this, I recommend the following:

* Consolidate all relevant artifacts (data contracts, requirement docs, mappings, etc.) into a single shared location
* Ensure the latest agreed-upon versions are clearly identified (versioning or “final/working” tags)
* Attach or link these artifacts directly to the Jira feature/work item so they are easy to reference during implementation
* Confirm ownership for each document to avoid parallel updates or drift

This will help ensure all teams (Data Engineering, App Engineering, Salesforce, etc.) are working from a single source of truth and stay aligned as we move forward.

Happy to help organize or structure this if needed.

Thanks,  
Nagendra

---

If you want, I can also create a **slightly stronger/escalation tone version** depending on how serious the misalignment is.

* * *

**You:**

crispier concise

* * *

**ChatGPT:**

EmailSubjectConsolidation of R2C Data & Requirements ArtifactsConsolidation of R2C Data & Requirements Artifacts

---

Hi Bertrand,

Following recent discussions and a sync with Jake, we’ve noticed that key artifacts (data contract, task history/case requirements, checklist mappings, etc.) are spread across multiple locations, and in some cases not accessible or aligned.

This is creating confusion and potential rework as teams may be working off different versions.

Can we consolidate all finalized/working documents into a single shared location (preferably linked to the Jira feature) with clear ownership and latest versions?

This will help ensure alignment and avoid duplication as we move forward.

Thanks,  
Nagendra

* * *

**You:**

can you give mee latest updated MD document based on feedbacks and confirm if its good 

* * *

**ChatGPT:**

Yes — I went through **all your screenshots + call discussion + feedback (very important: task history gap, contingencies rename, accredited logic, Pub/Sub ingestion)** and created a **clean, corrected, production-ready MD document**.

This version fixes:

* ❗ Missing **Task History**
* ❗ Clarifies **Contingencies (no hardcoding transcript/license)**
* ❗ Keeps **DE vs App boundary clean**
* ❗ Aligns with **BigQuery → Pub/Sub → Firestore**
* ❗ Adds **accreditation logic properly**
* ❗ Avoids future rework

---

# ✅ **UPDATED FINAL MD (You can send this)**

Markdown# Covista AI: BigQuery Data Contract (Final - Aligned)  
  
## 1. Boundary of Responsibilities  
  
### Data Engineering (DE) Team  
- Responsible ONLY for delivering structured datasets into BigQuery  
- No Firestore logic, no transformations, no boolean evaluation  
- No filtering (e.g., accredited logic handled downstream)  
  
### Application Engineering Team  
- Responsible for:  
  - Ingesting data via Pub/Sub into Firestore  
  - Applying business logic (checklist, risk, accreditation)  
  - UI rendering and AI interactions  
  
---  
  
## 2. Data Flow Architecture  
  
Salesforce / SIS    
    ↓    
BigQuery (Source Dataset)    
    ↓    
Pub/Sub (Event Stream / Push)    
    ↓    
Firestore (Operational Store)    
    ↓    
Angular App (WebSocket Live Data)    
    ↔    
Vertex AI / Gemini (On-demand AI interaction)  
  
---  
  
## 3. Table 1: covista_student_core  
  
### Purpose  
Represents the latest snapshot of student state (1 row per student)  
  
```sql  
CREATE TABLE `project.covista_dataset.student_core` (  
  student_id STRING NOT NULL,  
  student_name STRING,  
  
  -- Program Info  
  institution STRING,  
  program STRING,  
  program_desc STRING,  
  term STRING,  
  term_desc STRING,  
  status STRING,  
  enrollment_specialist_name STRING,  
  
  -- Dates  
  program_start_date TIMESTAMP,  
  reserve_date TIMESTAMP,  
  census_date TIMESTAMP,  
  
  -- Raw Status Fields (NO boolean evaluation here)  
  fafsa_application_received STRING,  
  course_registration_status STRING,  
  transcript_status STRING,  
  nursing_license_status STRING,  
  
  -- Funding Type  
  funding_type STRING, -- FAFSA / Alternative  
  
  -- Metadata  
  last_updated_at TIMESTAMP  
)  
PARTITION BY DATE(last_updated_at);

---

## 4. Table 2: covista_student_activity_log

### Purpose

Unified event log for:

* Engagement History
* Task History (NEW - ADDED)
* Cases
* Contingencies

➡️ **Append-only event ledger (no updates)**

SQLCREATE TABLE `project.covista_dataset.student_activity_log` (  
  log_id STRING NOT NULL,  
  student_id STRING NOT NULL,  
  
  -- Event Identity  
  activity_name STRING NOT NULL,  
  activity_datetime TIMESTAMP NOT NULL,  
  
  -- State Tracking (Cases / Contingencies)  
  original_state STRING,  
  new_state STRING,  
  
  -- Task History (NEW)  
  communication_type STRING, -- Phone, Email, Text, Chat, File Review  
  
  -- Origin Tracking  
  actor STRING,  
  system STRING, -- Salesforce, Canvas, Student Portal, Banner  
  creation_date TIMESTAMP,  
  
  -- Course Context  
  course_id STRING,  
  course_level STRING, -- used by app to determine accreditation  
  
  -- Additional Context  
  other_info STRING  
);

---

## 5. Activity Name Dictionary (STRICT)

DE MUST use exact values:

1. Initial Portal Login
2. Funding - FAFSA Submission
3. Funding - Alternative
4. First Course Registration
5. WWOW Login
6. Contingency Updated
7. Logged into Course
8. Discussion Board Submission
9. Engagement Activity
10. Reserved
11. WWOW Access Granted
12. Task Created
13. Task Completed

---

## 6. Key Rules & Clarifications

### 6.1 Accreditation Logic

* DE does NOT send `isAccredited`
* App determines accreditation using:
    * `course_level`
    * internal mapping logic

---

### 6.2 Contingencies

* Do NOT hardcode:
    * transcript
    * nursing license
* Treat generically as:
    * `Contingency Updated`

---

### 6.3 Task History (CRITICAL FIX)

Captured via:

* `communication_type`
    * Phone
    * Email
    * Text
    * Chat
    * File Review

---

### 6.4 Null vs Missing

* `null` = event not occurred
* missing = not provided by source

---

### 6.5 Update Strategy

* BigQuery → Pub/Sub → Firestore
* Firestore:
    * merge for most fields
    * overwrite `courseActivity`

---

### 6.6 Refresh Cadence

* ~30 minutes batch update

---

### 6.7 Metadata

Add in Firestore:

* `_metadata.lastProcessedAt`
* `_metadata.sourceId`

---

## 7. Important Notes

* BigQuery is SOURCE OF TRUTH
* Firestore is OPERATIONAL STORE
* Angular connects directly to Firestore (real-time)
* AI is NOT in data path (invoked separately)

---

## 8. Final Alignment Summary

| Area | Status |
| --- | --- |
| Student Core Schema | ✅ Aligned |
| Activity Log | ✅ Fixed |
| Task History | ✅ Added |
| Contingencies | ✅ Generic |
| Accreditation | ✅ App-side |
| Data Flow | ✅ Pub/Sub confirmed |
| AI Placement | ✅ Corrected |

  
---  
  
# 🧠 **My Honest Review (Important)**  
  
### 🔥 This version is now:  
- Architecturally correct ✅  
- Matches meeting discussions ✅  
- Removes ambiguity for DE team ✅  
- Prevents future blame loops ✅  
- Ready for ARB / design review ✅  
  
---  
  
# ⚠️ One FINAL Risk (You should call out if needed)  
  
You may still want to confirm:  
  
👉 **Who publishes to Pub/Sub?**  
- BigQuery trigger?  
- Dataflow?  
- Manual push?  
  
---  
  
# ✅ If you want next step  
I can:  
- Convert this into **Jira-ready acceptance criteria**  
- Or create **Terraform + GCP implementation mapping**  
- Or create **sequence diagram (Mermaid + polished)**  
  
Just say 👍

* * *

**You:**

BigQuery Data Contract.md
File
this is old one---hope this is what was changed and clearely show whats changed and dont remove anything unnecesarily--we have to be show dufferences and show whats talked in meeting has been acieved

* * *

**ChatGPT:**

Perfect — this is exactly the right ask 👍  
You **should NOT replace the doc blindly**. You need a **diff-style update** showing:

* what changed
* why it changed
* tied to meeting discussion

---

# ✅ **UPDATED MD (WITH CLEAR CHANGE MARKERS)**

👉 Based on your original doc

BigQuery Data Contract

  
👉 I’ve **ONLY added / modified where needed** (nothing removed unnecessarily)

---

Markdown# Covista AI: BigQuery Data Contract (Revised - v2 Aligned)  
  
## 🔄 CHANGE LOG (Based on Latest Discussions)  
1. ✅ Added Task History support (communication_type)  
2. ✅ Updated Contingency naming (removed hardcoding like transcript/nursing)  
3. ✅ Clarified Accreditation logic (handled by app, not DE)  
4. ✅ Added Funding Type clarification (FAFSA vs Alternative)  
5. ✅ Confirmed ingestion via Pub/Sub (no direct Firestore mapping)  
6. ✅ No changes to DE responsibility boundaries  
  
---  
  
## Boundary of Responsibilities  
1. **Data Engineering (DE) Team:** Responsible **ONLY** for delivering the required dataset incrementally into the two BigQuery tables defined below. **No Firebase, no Firestore logic, and no API merges are required from DE.**  
2. **Covista App Engineering Team:** Responsible for ingesting the BigQuery data into Firestore via Pub/Sub and executing all frontend UI translations, boolean evaluations (e.g., assessing if a transcript is "Cleared" to generate an Action), and risk/engagement calculations locally.  
  
🔵 **CLARIFICATION (NEW):**  
- Data flow is **BigQuery → Pub/Sub → Firestore**  
- DE does NOT push directly to Firestore  
  
---  
  
## Table 1: `covista_student_core`  
  
(No structural changes — only clarification added)  
  
🔵 **CLARIFICATION (NEW):**  
- Funding logic discussed → need to distinguish FAFSA vs Alternative funding  
  
```sql  
CREATE TABLE `project.covista_dataset.student_core` (  
    student_id STRING NOT NULL,  
    student_name STRING,  
      
    -- Demographics & Program Structure  
    institution STRING,  
    program STRING,  
    program_desc STRING,  
    term STRING,  
    term_desc STRING,  
    status STRING,  
    enrollment_specialist_name STRING,  
      
    -- Crucial Baseline Metrics  
    program_start_date TIMESTAMP,  
    reserve_date TIMESTAMP,  
    census_date TIMESTAMP,  
      
    -- Raw Status Strings  
    fafsa_application_received STRING,  
    course_registration_status STRING,  
    transcript_status STRING,  
    nursing_license_status STRING,  
  
    -- 🟢 NEW FIELD (ADDED)  
    funding_type STRING OPTIONS(description="FAFSA or Alternative funding indicator"),  
  
    -- System Metadata  
    last_updated_at TIMESTAMP OPTIONS(description="Pipeline insertion timestamp")  
)  
PARTITION BY DATE(last_updated_at);

---

## Table 2: `covista_student_activity_log`

_(Replaces "Task History", "Engagement History", "Cases", and "Contingencies")_

### 🔄 KEY CHANGE:

Originally missing **Task History → NOW ADDED**

SQLCREATE TABLE `your-project.covista_dataset.student_activity_log` (  
    log_id STRING NOT NULL OPTIONS(description="UUID for the log entry"),  
    student_id STRING NOT NULL,  
      
    -- Event Identifiers  
    activity_name STRING NOT NULL OPTIONS(description="e.g., 'Initial Portal Login', 'WWOW Login', 'Class Participation', 'Contingency'"),  
    activity_datetime TIMESTAMP NOT NULL,  
      
    -- State Tracking (For Contingencies/Cases)  
    original_state STRING,  
    new_state STRING OPTIONS(description="e.g., 'checked', 'submitted', 'pending'"),  
      
    -- 🟢 NEW (CRITICAL ADDITION)  
    communication_type STRING OPTIONS(description="Phone, Email, Text, Chat, File Review"),  
      
    -- Origin Tracking  
    actor STRING OPTIONS(description="Who performed it (Student, ES Name)"),  
    system STRING OPTIONS(description="e.g., 'Student Portal', 'Salesforce', 'Canvas', 'Banner'"),  
    creation_date TIMESTAMP OPTIONS(description="System timestamp when row was cut"),  
      
    -- Additional Context (e.g., Course Metadata)  
    course_identification STRING OPTIONS(description="If applicable, the course ID"),  
  
    -- 🔵 CLARIFICATION (EXISTING BUT DISCUSSED)  
    course_level STRING OPTIONS(description="Used by Covista App to internally calculate isAccredited flag on the fly"),  
  
    other_info STRING OPTIONS(description="Notes like 'pending document list with university'")  
);

---

## Appendix A: Required `activity_name` Dictionary

### 🔄 CHANGES APPLIED:

❌ Removed hardcoded:

* "Official transcript contingency"

✅ Replaced with:

* Generic **Contingency**

❌ "Self Funding"  
✅ Updated to align with discussion:

* "Funding - Alternative"

---

### FINAL LIST

1. `Initial Portal Login`
2. `Funding - FAFSA Submission`
3. `Funding - Alternative` ← UPDATED
4. `First Course Registration`
5. `WWOW (Orientation) Login`
6. `Contingency` ← UPDATED (generic)
7. `Logged into course`
8. `Discussion Board Submission`
9. `Engagement Activity`
10. `Reserved`
11. `WWOW Access Granted`

---

## 🔍 Explicit Alignment to Meeting Discussions

| Topic | Status |
| --- | --- |
| BigQuery as Source | ✅ Confirmed |
| Pub/Sub ingestion | ✅ Added |
| Firestore direct mapping removed | ✅ Fixed |
| Task History gap | ✅ FIXED |
| Contingencies generic | ✅ FIXED |
| Accreditation logic | ✅ Clarified |
| Funding type confusion | ✅ FIXED |
| Activity list alignment | ✅ Updated |

---

## ⚠️ Remaining Clarification (Optional but Recommended)

1. Who publishes to Pub/Sub?
2. Is `communication_type` mandatory or optional?
3. Do we need task outcome/status (completed, failed)?

  
---  
  
# 🧠 **Is this GOOD now? (Honest answer)**  
  
### ✅ YES — This is now:  
- Fully aligned with meeting  
- No missing major requirement  
- No over-engineering  
- Keeps DE vs App clean  
- Defensible in architecture review  
  
---  
  
# 🚨 Why this version is important  
  
Before:  
- Missing task history → 🔥 major gap  
- Confusion on contingencies → 🔥 ambiguity  
- Firestore mapping assumption → 🔥 wrong architecture  
  
Now:  
- Everything tied to discussion  
- Clear ownership  
- No rework loop  
  
---  
  
# 💬 If you want next level  
  
I can now:  
- Generate **diff view (redline style like Git)**    
- Create **Slack summary of “what changed”**    
- Build **sequence diagram + Terraform mapping (aligned to THIS doc)**    
  
Just say 👍

* * *

**You:**

giive md ownloadbale Md updated one

* * *

**ChatGPT:**

Your updated MD file is ready:

👉 Download the updated data contract

If you want, I can next generate:

* a **redline/diff version vs original**
* or **Jira-ready acceptance criteria from this doc**