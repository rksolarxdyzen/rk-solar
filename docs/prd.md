# PRD: RK Solar Platform (₹50,000 Tier)

**Project Name:** RK Solar CRM & Field Operations System  
**Document Version:** v1.0.0  
**Target Audience:** Internal Tele-calling Team, Field Sales Representatives, Technical Surveyors, Installation Team, Licensing/Discom Liaison Team, Accounts Department

---

## 1. Executive Summary & Architecture Philosophy

### 1.1 Objective

To build a dedicated CRM & ERP platform tailored for RK Solar. The system manages:

- Lead acquisition (Referrals / Facebook Ads)
- Tele-calling routing
- Digital site surveys
- Quotation creation (solar and non-solar products such as RO systems / heaters)
- Multi-tier payment verification
- Field installation tagging (with panel / barcode photo capture)
- Meter setup tracking
- Subsidy realization
- Automated maintenance / referral engagement



### 1.2 Architecture Principles


| Principle                            | Description                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modular Decoupling**               | Application logic, database adapters, controllers, and routing layers are completely decoupled to ensure zero-dependency scaling.               |
| **Role-Based Access Control (RBAC)** | Strict segregation between Tele-callers, Field Sales/Surveyors, Document/Feasibility Teams, Installation Crews, Liaison Officers, and Accounts. |
| **Auditability**                     | Complete end-to-end traceability of customer milestone progression and financial ledger updates.                                                |


---



## 2. Detailed Functional Modules



### Module 1: Lead Ingestion & Sales Operations

**Lead Acquisition Channels**

- Manual individual entry & bulk CSV/Excel ingestion (mapped to Phone, Customer Name, Address)
- Automated API ingestion for Facebook Ad leads and Referral entries

**Sales Team Segregation**


| Role                        | Responsibility                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Tele-calling Team**       | Initial contact, lead qualification, and scheduling field visits. Tele-callers do **not** conduct field visits. |
| **Field Sales / Surveyors** | Assigned specific site visits by tele-callers to meet clients and conduct surveys.                              |




### Module 2: Field Visit & Digital Survey Engine

**Field Survey Data Capture**

- Customer demographics
- Geolocation tagging (latitude & longitude)
- **Rooftop analysis:** Total terrace area (sq. ft.) and shadow-free area (sq. ft.)
- **Feasibility check:** Surveyor explicit boolean confirmation whether the shadow-free area is sufficient for the requested system size
- **Capacity requirement:** Customer-requested capacity (kW)



### Module 3: Multi-Template Quotation Engine

**Template Routing**


| Template                                        | Contents                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dedicated Solar Quotation**                   | Auto-populates PV module selections (TopCon, Mono PERC, Bifacial), Brand (Adani, Waaree, Goldi), On-Grid Inverter specs, GEB/MGVCL Meter Charges, and Government Subsidy calculations. |
| **Dedicated Non-Solar / Other Items Quotation** | Standalone quotes for non-solar appliances (Water Heaters, RO Systems) omitting solar BOM (panels, structure, grid inverters).                                                         |


**Quotation Options**

- Percentage-based (%) and fixed-amount (₹) discounts
- Custom terms, conditions, and payment schedule milestones



### Module 4: Milestone Payments & Feasibility Workflow

**Payment Terms (3-Stage Split)**

1. **Token / Advance Deposit** — Triggers Documentation & Accounts Review
2. **Pre-Dispatch Payment** — Triggers Warehouse Material Dispatch & Installation Team Routing
3. **Post-Installation / Final Settlement**

**Parallel Feasibility & Verification Flow**

Upon receiving token payment, the lead splits into two parallel review streams:


| Stream                               | Action                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| **Feasibility / Documentation Team** | Generates and uploads the Grid Feasibility Report                                    |
| **Accounts Team**                    | Verifies transaction IDs, dates, and bank credit before marking payments as Verified |




### Module 5: Installation & Barcode Photo Capture

- **Crew routing:** Back-end team assigns installation crews once pre-dispatch payments are verified
- **Field proof capture:** Installation crew uploads site completion photos
- **Panel barcode capture:** Crew uploads high-resolution photos/barcode scans of each installed PV Panel’s DCR/Serial Number for Discom compliance
- **Automatic system notifications:** Upon installation completion, auto-notify Accounts, Sales, and Discom Liaison teams



### Module 6: Discom Liaison, Subsidy Tracking & Customer Portal

**Discom / Meter Tracking**

- Liaison team tracks grid meter approval and installation

**Customer Portal**

- Client logs in to view active project status, accepted quotations, uploaded invoices/self-declarations
- Client can mark meter completion (**Meter Installed**)

**15-Day Subsidy Timer & Payment Realization**

1. Marking meter completion triggers a **15-Day Subsidy Timer**
2. If the customer does not mark **Subsidy Received** within 15 days, automated prompts route to the Liaison team to follow up
3. Once marked received, Accounts verifies the bank deposit and issues a formal completion certificate



### Module 7: Maintenance Tickets & Automated Cleaning Reminders

**Post-Sales Customer Engagement**

- **Automated panel cleaning alerts:** Every 15 days, send an automated notification to the customer portal/WhatsApp reminding them to clean panels for optimal yield, accompanied by a subtle Referral Request

**Maintenance Ticketing System**

1. Customers raise service tickets directly from their portal
2. Notification routes to **3 Service Engineers**; the first engineer to accept takes ownership
3. If all reject / unassigned, the Lead Service Supervisor forcefully assigns an engineer
4. Engineer resolves issue, captures proof photos, and closes the ticket

---



## 3. Data Schema Overview


| Entity             | Primary Attributes                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Lead**           | Lead ID, Customer Name, Phone, Address, Source (Facebook/Referral/Manual), Assigned Telecaller, Assigned Field Sales   |
| **Survey**         | Survey ID, Lead ID, Lat/Long, Total Terrace Area, Shadow-Free Area, Feasibility Status (Pass/Fail), Capacity (kW)      |
| **Quotation**      | Quote ID, Lead ID, Template Type (Solar/Non-Solar), Total Cost, Discount, Net Amount, Subsidy Amount, PDF URL          |
| **Payment**        | Payment ID, Quote ID, Stage (Token/Pre-Dispatch/Final), Amount, Transaction ID, Verification Status (Pending/Verified) |
| **Installation**   | Installation ID, Quote ID, Crew ID, Completion Photo URLs, Panel Barcode Photo URLs, Discom Status                     |
| **Service Ticket** | Ticket ID, Customer ID, Issue Description, Assigned Engineer, Status (Raised/Accepted/In-Progress/Closed)              |


---



## 4. Complete Lead-to-Maintenance Workflow

```
[Lead Acquisition: Facebook Ads / Referrals / CSV Import]
        │
        ▼
[Assign to Tele-calling Team]
        │
        ▼
[Tele-caller Schedules Site Visit]
        │
        ▼
[Assign to Field Sales / Surveyor]
        │
        ▼
[Conduct Digital Site Survey]
  ├── Capture Lat/Long, Terrace Area, Shadow-Free Area
  └── Verify Capacity (kW) Requirement
        │
        ▼
[Sales Team Generates Quotation]
  ├── Option A: Solar Template (Modules, Inverter, Grid Charges, Subsidy)
  └── Option B: Non-Solar Template (RO System, Water Heater)
        │
        ▼
[Quotation Sent to Customer & Marked Accepted]
        │
        ▼
[Customer Pays Token / Advance Deposit]
        │
        ├──────────────────────────────┐
        ▼                              ▼
[Feasibility & Doc Team]        [Accounts Team]
 └── Upload Feasibility Report   └── Verify Token Payment Credit
        │                              │
        └──────────────┬───────────────┘
                       ▼
        [System Triggers Pre-Dispatch Alert]
                       │
                       ▼
        [Customer Pays Pre-Dispatch Payment]
                       │dis
                       ▼
        [Accounts Verifies Pre-Dispatch Credit]
                       │
                       ▼
        [Assign Installation Crew]
                       │
                       ▼
        [Execute Site Installation]
          ├── Upload Site Photos
          └── Scan/Upload Panel Barcodes
                       │
                       ▼
        [Auto-Notify Accounts, Sales & Liaison]
                       │
                       ▼
        [Liaison Team Processes Grid Meter]
                       │
                       ▼
        [Customer Marks "Meter Installed" in Portal]
                       │
                       ▼
        [15-Day Subsidy Timer Initiated]
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
[Subsidy Received]      [15 Days Elapsed: No Subsidy]
          │                         │
          ▼                         ▼
[Accounts Verifies Credit]  [Trigger Liaison Follow-Up Alert]
          │
          ▼
[Customer Feedback Form Sent]
          │
          ▼
[Post-Sales Phase Activated]
  ├── 15-Day Automated Panel Cleaning & Referral Prompts
  └── Maintenance Ticketing (Auto-routed to 3 Engineers)
```

---



## 5. Notes

- **Tier:** ₹50,000 product tier
- **App path:** `Apps/RK-Solar`
- **Related platforms:** Distinct from Jaleshwar Solar (dealer-driven, no tele-calling); share patterns only where explicitly designed to.

