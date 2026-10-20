// Fictional demo data. Every name, client and number here is made up.
(() => {
const D = "Demo repository";
const DEMO = [
  { kind: "cv", path: `${D}/CVs/Thandi Mokoena CV.docx`, title: "Thandi Mokoena CV", text: `CURRICULUM VITAE (fictional demo data)
Thandi Mokoena, Lead Data Engineer, Demo Consulting
Qualifications: BSc Honours Computer Science, University of Pretoria (2015).
Certifications: Microsoft Certified: Fabric Data Engineer Associate (DP-700), 2025. Microsoft Certified: Azure Data Engineer Associate (DP-203), 2022.
Experience: 9 years in data engineering, 5 years in the public sector.
Key projects:
- Limvelo Provincial Treasury Revenue Analytics Platform (2023 to 2024): lead data engineer. Built Azure data lake and Data Factory pipelines from SAP and billing systems.
- Riverside Metro Water Smart Meter Data Platform (2022): data engineer. Pipelines for 1.2 million meter readings per day.
- Mopane City Council Electricity Revenue Dashboards on Microsoft Fabric (2024 to 2025): lead engineer. Fabric lakehouse and data quality checks.
Skills: Python, PySpark, SQL, Azure Data Factory, Microsoft Fabric, Delta Lake, data quality frameworks, POPIA compliance.` },
  { kind: "cv", path: `${D}/CVs/Johan van Wyk CV.pdf`, title: "Johan van Wyk CV", text: `CURRICULUM VITAE (fictional demo data)
Johan van Wyk, BI Developer, Demo Consulting
Qualifications: National Diploma in Information Technology, Tshwane University of Technology (2017).
Certifications: Microsoft Certified: Power BI Data Analyst Associate (PL-300), 2023.
Experience: 6 years building Power BI reports for finance and operations teams.
Key projects:
- Limvelo Provincial Treasury Revenue Analytics Platform (2023 to 2024): built 18 Power BI dashboards.
- Mopane City Council Electricity Revenue Dashboards (2024 to 2025): built 16 Power BI dashboards on revenue and electricity losses.
- Provincial Department of Health Power BI Skills Programme (2024): trainer, trained 60 users.
Skills: Power BI, DAX, Power Query, row level security, report design, end user training.` },
  { kind: "cv", path: `${D}/CVs/Lerato Nkosi CV.docx`, title: "Lerato Nkosi CV", text: `CURRICULUM VITAE (fictional demo data)
Lerato Nkosi, Senior Project Manager, Demo Consulting
Qualifications: BCom Information Systems, University of the Witwatersrand (2009). MBA (2016).
Certifications: PMP (2014). PRINCE2 Practitioner (2018).
Experience: 14 years in project management, 9 years in the public sector (municipalities and provincial departments).
Key projects:
- Limvelo Provincial Treasury Revenue Analytics Platform (2023 to 2024): project manager, R3.4 million.
- Provincial Department of Health Power BI Skills Programme (2024): programme manager, 120 staff trained.
- Kwena Local Municipality Billing Data Quality and POPIA Governance (2025): project manager.
Skills: stakeholder management, MFMA procurement rules, project governance, risk management, change management.` },
  { kind: "cv", path: `${D}/CVs/Sipho Dlamini CV.pdf`, title: "Sipho Dlamini CV", text: `CURRICULUM VITAE (fictional demo data)
Sipho Dlamini, Project Manager, Demo Consulting
Qualifications: BTech Project Management, University of Johannesburg (2016).
Certifications: PRINCE2 Foundation (2020).
Experience: 7 years in project management, mainly private sector (retail and insurance).
Key projects:
- National retail group customer analytics on AWS (2021): project manager, R4.1 million.
- Insurance claims fraud detection model (2023): project manager.
Skills: agile delivery, Jira, vendor management, budgeting.` },
  { kind: "cv", path: `${D}/CVs/Priya Naidoo CV.docx`, title: "Priya Naidoo CV", text: `CURRICULUM VITAE (fictional demo data)
Priya Naidoo, Data Scientist, Demo Consulting
Qualifications: MSc Statistics, University of KwaZulu-Natal (2018).
Certifications: Microsoft Certified: Azure AI Engineer Associate (AI-102), 2024.
Experience: 6 years in data science and machine learning.
Key projects:
- Insurance claims fraud detection model (2023): lead data scientist.
- Mining predictive maintenance models (2019): data scientist.
Skills: Python, machine learning, forecasting, some Power BI use (no certification).` },
  { kind: "cv", path: `${D}/CVs/Michael Botha CV.pdf`, title: "Michael Botha CV", text: `CURRICULUM VITAE (fictional demo data)
Michael Botha, Data Engineer, Demo Consulting
Qualifications: BEng Computer Engineering, Stellenbosch University (2016).
Certifications: AWS Certified Data Engineer Associate (2024). No Microsoft certifications.
Experience: 8 years in data engineering.
Key projects:
- National retail group customer analytics on AWS (2021): data engineer. Glue, Redshift, Airflow.
- Riverside Metro Water Smart Meter Data Platform (2022): supporting engineer, some Azure Data Factory work.
Skills: AWS Glue, Redshift, Airflow, Python, SQL, some Azure Data Factory.` },

  { kind: "project", path: `${D}/Past Projects/2024 Limvelo Provincial Treasury Revenue Analytics.docx`, title: "Limvelo Provincial Treasury Revenue Analytics", text: `PROJECT CLOSE OUT REPORT (fictional demo data)
Client: Limvelo Provincial Treasury (public sector, provincial government)
Project: Revenue Analytics Platform
Contract value: R3.4 million excluding VAT
Period: March 2023 to June 2024
Scope: Azure data lake and Synapse warehouse; Azure Data Factory pipelines from SAP and the revenue billing system; 18 Power BI dashboards for revenue, debt and collections; POPIA aligned data governance framework; training of 35 treasury staff.
Team: Lerato Nkosi (project manager), Thandi Mokoena (lead data engineer), Johan van Wyk (BI developer).
Outcome: monthly revenue reporting time cut from 10 working days to 2. Delivered on time and within budget.` },
  { kind: "project", path: `${D}/Past Projects/2022 Riverside Metro Water Smart Meter Platform.pdf`, title: "Riverside Metro Water Smart Meter Platform", text: `PROJECT CLOSE OUT REPORT (fictional demo data)
Client: Riverside Metro Water Utility (a municipal entity)
Project: Smart Meter Data Platform
Contract value: R2.8 million excluding VAT
Period: February 2022 to November 2022
Scope: Azure Data Factory and Databricks pipelines processing 1.2 million water meter readings per day; anomaly alerts for leaks and meter faults; 6 Power BI operational dashboards.
Team: Thandi Mokoena (data engineer), Michael Botha (supporting engineer).
Outcome: non revenue water losses identified worth an estimated R11 million per year.` },
  { kind: "project", path: `${D}/Past Projects/2025 Kwena Billing Data Quality and POPIA Governance.docx`, title: "Kwena Billing Data Quality and POPIA Governance", text: `PROJECT CLOSE OUT REPORT (fictional demo data)
Client: Kwena Local Municipality (public sector, local government)
Project: Billing Data Quality and POPIA Governance
Contract value: R1.6 million excluding VAT
Period: January 2025 to July 2025
Scope: data quality rules on the billing database; data governance framework and policies aligned with POPIA; Microsoft Purview data catalogue; training of 25 data stewards.
Team: Lerato Nkosi (project manager).
Outcome: billing data errors reduced by 40 percent.` },
  { kind: "project", path: `${D}/Past Projects/2021 National Retailer Customer Analytics.pdf`, title: "National Retailer Customer Analytics", text: `PROJECT CLOSE OUT REPORT (fictional demo data)
Client: National retail group (private sector, name withheld)
Project: Customer Analytics Platform
Contract value: R4.1 million excluding VAT
Period: 2021
Scope: AWS Redshift data warehouse, AWS Glue pipelines, customer segmentation models, Tableau dashboards.
Team: Sipho Dlamini (project manager), Michael Botha (data engineer).` },
  { kind: "project", path: `${D}/Past Projects/2024 Health Department Power BI Skills Programme.docx`, title: "Health Department Power BI Skills Programme", text: `PROJECT CLOSE OUT REPORT (fictional demo data)
Client: Provincial Department of Health (public sector)
Project: Power BI Skills Programme
Contract value: R0.9 million excluding VAT
Period: 2024
Scope: Power BI training for 120 staff across 4 districts; train the trainer programme for 8 internal champions; course material and assessments.
Team: Lerato Nkosi (programme manager), Johan van Wyk (trainer).` },
  { kind: "project", path: `${D}/Past Projects/2019 Mining Predictive Maintenance.pdf`, title: "Mining Predictive Maintenance", text: `PROJECT CLOSE OUT REPORT (fictional demo data)
Client: Mining company (private sector)
Project: Predictive Maintenance Models
Contract value: R2.2 million excluding VAT
Period: 2019
Scope: machine learning models to predict conveyor and pump failures.
Team: Priya Naidoo (data scientist).` },
  { kind: "project", path: `${D}/Past Projects/2025 Mopane City Electricity Revenue Dashboards (Fabric).docx`, title: "Mopane City Electricity Revenue Dashboards (Fabric)", text: `PROJECT CLOSE OUT REPORT (fictional demo data)
Client: Mopane City Council (public sector, local government)
Project: Electricity Revenue Dashboards on Microsoft Fabric
Contract value: R2.3 million excluding VAT
Period: August 2024 to May 2025, followed by 12 months support
Scope: Microsoft Fabric lakehouse fed from the prepaid and conventional electricity billing systems; 16 Power BI dashboards on revenue and electricity losses; data quality checks; training of 20 finance staff.
Team: Thandi Mokoena (lead data engineer), Johan van Wyk (BI developer).
Outcome: electricity revenue losses reporting now daily instead of quarterly.` },
  { kind: "project", path: `${D}/Past Projects/2023 Insurance Claims Fraud Detection.pdf`, title: "Insurance Claims Fraud Detection", text: `PROJECT CLOSE OUT REPORT (fictional demo data)
Client: Short term insurer (private sector)
Project: Claims Fraud Detection Model
Contract value: R3.0 million excluding VAT
Period: 2023
Scope: machine learning model scoring insurance claims for fraud risk.
Team: Priya Naidoo (lead data scientist), Sipho Dlamini (project manager).` },

  { kind: "letter", path: `${D}/Reference Letters/Limvelo Treasury reference letter.pdf`, title: "Limvelo Treasury reference letter", text: `REFERENCE LETTER (fictional demo data)
Limvelo Provincial Treasury, 12 July 2024
To whom it may concern. Demo Consulting delivered our Revenue Analytics Platform between March 2023 and June 2024 at a value of R3.4 million. The work was delivered on time, within budget and to a high standard. We recommend them.
Signed: Chief Financial Officer, Limvelo Provincial Treasury.` },
  { kind: "letter", path: `${D}/Reference Letters/Riverside Metro Water reference letter.pdf`, title: "Riverside Metro Water reference letter", text: `REFERENCE LETTER (fictional demo data)
Riverside Metro Water Utility, 2 December 2022
Demo Consulting delivered our Smart Meter Data Platform (R2.8 million) between February and November 2022. We are satisfied with the quality of the work.
Signed: General Manager, Information Technology.` },
  { kind: "letter", path: `${D}/Reference Letters/National retail group reference letter.pdf`, title: "National retail group reference letter", text: `REFERENCE LETTER (fictional demo data)
National retail group, 15 January 2022
Demo Consulting delivered our Customer Analytics Platform in 2021. Signed: Head of Data.` },
];

const SAMPLE_RFP = `SAMPLE TENDER (fictional, for demonstration only)

NORTHVALE METROPOLITAN MUNICIPALITY
Request for Proposal: RFP NMM/ICT/2026/014
Provision of a Data Analytics and Reporting Platform for a period of 24 months

1. Background
Northvale Metropolitan Municipality wants a service provider to design, build and support a central data analytics platform. The platform must bring together revenue, billing, water and electricity meter data, and give managers monthly and near real-time dashboards.

2. Closing date and submission
Closing date: 27 November 2026 at 11:00. Late bids will not be accepted.
A compulsory virtual briefing session will be held on 6 November 2026 at 10:00. Bidders who do not attend will be disqualified.
Bids must be submitted electronically through the municipal eTender portal. Bids must remain valid for 120 days.

3. Mandatory requirements (failure to comply leads to disqualification)
3.1 Registration on the Central Supplier Database (CSD); attach the CSD summary report.
3.2 Valid tax compliance status (SARS PIN).
3.3 Completed and signed SBD 1, SBD 4 and SBD 6.1 forms.
3.4 Proof that municipal rates and taxes of the bidder and its directors are not in arrears for more than 90 days.
3.5 Attendance of the compulsory briefing session.

4. Scope of work
4.1 Assess current data sources and produce a data architecture design.
4.2 Build data pipelines and a data warehouse or lakehouse on a cloud platform (Microsoft Azure or Microsoft Fabric preferred).
4.3 Build at least 15 Power BI dashboards for revenue, billing and service delivery.
4.4 Put data quality checks and data governance in place, in line with POPIA.
4.5 Train at least 40 municipal staff.
4.6 Provide support and maintenance for 12 months after go-live.

5. Key personnel (CVs must be attached)
5.1 Project Manager: degree, PMP or PRINCE2, 8+ years, public sector experience.
5.2 Lead Data Engineer: degree in a relevant field, Microsoft Fabric Data Engineer (DP-700) or Azure Data Engineer (DP-203) certification, 6+ years.
5.3 BI Developer: Power BI Data Analyst (PL-300) certification, 4+ years.

6. Evaluation
Stage 1: Mandatory requirements (pass or fail).
Stage 2: Functionality, scored out of 100. Bidders must score at least 70 to go to Stage 3.
  - Company experience: at least 3 similar projects of more than R2 million each, completed in the last 5 years, with signed reference letters (30 points)
  - Key personnel qualifications and experience (35 points)
  - Proposed methodology and project plan (25 points)
  - Training and skills transfer plan (10 points)
Stage 3: Price and specific goals using the 80/20 preference point system.

7. Pricing
Bidders must submit a fixed price per phase, including VAT, using the pricing schedule in Annexure B.`;

window.BID_DESK_DEMO = { DEMO, SAMPLE_RFP };
})();
