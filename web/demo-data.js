// Fictional demo data. Every name, client and number here is made up.
(() => {
const D = "Demo repository";
const DEMO = [
  { kind: "cv", path: `${D}/Consultants/Thandi Mokoena/Thandi Mokoena CV.docx`, title: "Thandi Mokoena CV", text: `CURRICULUM VITAE (fictional demo data)
Thandi Mokoena, Lead Data Engineer, Demo Consulting
Email: thandi.mokoena@demo-consulting.example | CV last updated: 12 August 2026
Qualifications: BSc Honours Computer Science, University of Pretoria (2015).
Certifications: Microsoft Certified: Fabric Data Engineer Associate (DP-700), 2025. Microsoft Certified: Azure Data Engineer Associate (DP-203), 2022.
Experience: 9 years in data engineering, 5 years in the public sector.
Key projects:
- Limvelo Provincial Treasury Revenue Analytics Platform (2023 to 2024): lead data engineer. Built Azure data lake and Data Factory pipelines from SAP and billing systems.
- Riverside Metro Water Smart Meter Data Platform (2022): data engineer. Pipelines for 1.2 million meter readings per day.
- Mopane City Council Electricity Revenue Dashboards on Microsoft Fabric (2024 to 2025): lead engineer. Fabric lakehouse and data quality checks.
Skills: Python, PySpark, SQL, Azure Data Factory, Microsoft Fabric, Delta Lake, data quality frameworks, POPIA compliance.` },
  { kind: "cv", path: `${D}/Consultants/Johan van Wyk/Johan van Wyk CV.pdf`, title: "Johan van Wyk CV", text: `CURRICULUM VITAE (fictional demo data)
Johan van Wyk, BI Developer, Demo Consulting
Email: johan.vanwyk@demo-consulting.example | CV last updated: 14 June 2025
Qualifications: National Diploma in Information Technology, Tshwane University of Technology (2017).
Certifications: Microsoft Certified: Power BI Data Analyst Associate (PL-300), 2023.
Experience: 6 years building Power BI reports for finance and operations teams.
Key projects:
- Limvelo Provincial Treasury Revenue Analytics Platform (2023 to 2024): built 18 Power BI dashboards.
- Mopane City Council Electricity Revenue Dashboards (2024 to 2025): built 16 Power BI dashboards on revenue and electricity losses.
- Provincial Department of Health Power BI Skills Programme (2024): trainer, trained 60 users.
Skills: Power BI, DAX, Power Query, row level security, report design, end user training.` },
  { kind: "cv", path: `${D}/Consultants/Lerato Nkosi/Lerato Nkosi CV.docx`, title: "Lerato Nkosi CV", text: `CURRICULUM VITAE (fictional demo data)
Lerato Nkosi, Senior Project Manager, Demo Consulting
Email: lerato.nkosi@demo-consulting.example | CV last updated: 20 January 2026
Qualifications: BCom Information Systems, University of the Witwatersrand (2009). MBA (2016).
Certifications: PMP (2014). PRINCE2 Practitioner (2018).
Experience: 14 years in project management, 9 years in the public sector (municipalities and provincial departments).
Key projects:
- Limvelo Provincial Treasury Revenue Analytics Platform (2023 to 2024): project manager, R3.4 million.
- Provincial Department of Health Power BI Skills Programme (2024): programme manager, 120 staff trained.
- Kwena Local Municipality Billing Data Quality and POPIA Governance (2025): project manager.
Skills: stakeholder management, MFMA procurement rules, project governance, risk management, change management.` },
  { kind: "cv", path: `${D}/Consultants/Sipho Dlamini/Sipho Dlamini CV.pdf`, title: "Sipho Dlamini CV", text: `CURRICULUM VITAE (fictional demo data)
Sipho Dlamini, Project Manager, Demo Consulting
Email: sipho.dlamini@demo-consulting.example | CV last updated: 3 November 2024
Qualifications: BTech Project Management, University of Johannesburg (2016).
Certifications: PRINCE2 Foundation (2020).
Experience: 7 years in project management, mainly private sector (retail and insurance).
Key projects:
- National retail group customer analytics on AWS (2021): project manager, R4.1 million.
- Insurance claims fraud detection model (2023): project manager.
Skills: agile delivery, Jira, vendor management, budgeting.` },
  { kind: "cv", path: `${D}/Consultants/Priya Naidoo/Priya Naidoo CV.docx`, title: "Priya Naidoo CV", text: `CURRICULUM VITAE (fictional demo data)
Priya Naidoo, Data Scientist, Demo Consulting
Email: priya.naidoo@demo-consulting.example | CV last updated: 15 December 2025
Qualifications: MSc Statistics, University of KwaZulu-Natal (2018).
Certifications: Microsoft Certified: Azure AI Engineer Associate (AI-102), 2024.
Experience: 6 years in data science and machine learning.
Key projects:
- Insurance claims fraud detection model (2023): lead data scientist.
- Mining predictive maintenance models (2019): data scientist.
Skills: Python, machine learning, forecasting, some Power BI use (no certification).` },
  { kind: "cv", path: `${D}/Consultants/Michael Botha/Michael Botha CV.pdf`, title: "Michael Botha CV", text: `CURRICULUM VITAE (fictional demo data)
Michael Botha, Data Engineer, Demo Consulting
Email: michael.botha@demo-consulting.example
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

  { kind: "project", path: `${D}/Past Projects/Credentials deck - Public sector data and analytics 2026.pptx`, title: "Credentials deck - Public sector data and analytics 2026", text: `[Slide 1]
Public sector data and analytics credentials (fictional demo data)
Demo Consulting, 2026 edition

[Slide 2]
Why public sector clients choose us
12 municipal and provincial data platforms delivered since 2019
More than 300 public servants trained in Power BI and data literacy

[Slide 3]
Limvelo Provincial Treasury: Revenue Analytics Platform (2023 to 2024)
Built an Azure data lake and Data Factory pipelines from SAP and billing systems
Contract value R3.4 million. Signed reference letter available.

[Slide 4]
Mopane City Council: Electricity Revenue Dashboards on Microsoft Fabric (2024 to 2025)
Delivered a Fabric lakehouse and 16 Power BI dashboards on revenue and electricity losses
Trained 20 finance staff. Contract value R2.3 million.

[Slide 5]
Riverside Metro Water: Smart Meter Data Platform (2022)
Pipelines for 1.2 million meter readings per day, with daily water loss reporting
Contract value R2.8 million. Signed reference letter available.

[Slide 6]
Kwena Local Municipality: Billing Data Quality and POPIA Governance (2025)
Data quality rules, data owner roles and a POPIA compliant governance framework
Contract value R1.6 million.

[Slide 7]
Our delivery approach
Mobilise, assess, design, build, train and support
Every engagement ends with a skills transfer plan and 12 months of support` },

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
  { kind: "cert", path: `${D}/Consultants/Thandi Mokoena/DP-700 certificate.pdf`, title: "DP-700 certificate", text: `CERTIFICATE (fictional demo data)
Holder: Thandi Mokoena
Certification: Microsoft Certified: Fabric Data Engineer Associate (DP-700)
Issued: 3 November 2025
Expires: 3 November 2026
Credential ID: DEMO-DP700-0001` },
  { kind: "cert", path: `${D}/Consultants/Johan van Wyk/PL-300 certificate.pdf`, title: "PL-300 certificate", text: `CERTIFICATE (fictional demo data)
Holder: Johan van Wyk
Certification: Microsoft Certified: Power BI Data Analyst Associate (PL-300)
Issued: 26 June 2023
Expires: 26 June 2026
Credential ID: DEMO-PL300-0002` },
  { kind: "cert", path: `${D}/Consultants/Johan van Wyk/Certificates/DP-600.pdf`, title: "DP-600", text: `CERTIFICATE (fictional demo data)
Holder: Johan van Wyk
Certification: Microsoft Certified: Fabric Analytics Engineer Associate (DP-600)
Issued: 2 March 2026
Expires: 2 March 2027
Credential ID: DEMO-DP600-0005` },
  { kind: "cert", path: `${D}/Consultants/Lerato Nkosi/PMP.pdf`, title: "PMP", text: `CERTIFICATE (fictional demo data)
This certifies that L. Nkosi has met the requirements of the Project Management Institute for the credential
Certification: Project Management Professional (PMP)
Issued: 12 May 2014, renewed 1 September 2024
Valid until: 31 August 2027
Certificate number: DEMO-PMP-0003` },
  { kind: "cert", path: `${D}/Consultants/Sipho Dlamini/PRINCE2 course attendance.pdf`, title: "PRINCE2 course attendance", text: `CERTIFICATE OF ATTENDANCE (fictional demo data)
This confirms that Sipho Dlamini attended a 3 day PRINCE2 Foundation preparation course
Training provider: Demo Training Academy
Dates: 10 to 12 March 2020
Note: this certificate confirms course attendance only. It is not a PRINCE2 exam certificate.` },
  { kind: "cert", path: `${D}/Company Compliance/CSD summary report.pdf`, title: "CSD summary report", text: `CENTRAL SUPPLIER DATABASE SUMMARY REPORT (fictional demo data)
Supplier: Demo Consulting (Pty) Ltd
Supplier number: MAAA0000000
Registration status: Active
Tax compliance status: Compliant
Report date: 1 September 2026` },
  { kind: "cert", path: `${D}/Company Compliance/SARS tax compliance status PIN.pdf`, title: "SARS tax compliance status PIN", text: `TAX COMPLIANCE STATUS (fictional demo data)
Taxpayer: Demo Consulting (Pty) Ltd
Status: Compliant
PIN: DEMO-TCS-0004
Issued: 1 April 2026
Valid until: 31 March 2027` },
  { kind: "cert", path: `${D}/Company Compliance/B-BBEE Level 2 certificate.pdf`, title: "B-BBEE Level 2 certificate", text: `B-BBEE VERIFICATION CERTIFICATE (fictional demo data)
Entity: Demo Consulting (Pty) Ltd
B-BBEE status: Level 2 contributor
Issued: 15 August 2026
Valid until: 14 August 2027` },
  { kind: "cert", path: `${D}/Company Compliance/SBD 1 and SBD 4 signed forms.pdf`, title: "SBD 1 and SBD 4 signed forms", text: `STANDARD BIDDING DOCUMENTS (fictional demo data)
Forms: SBD 1 (Invitation to bid) and SBD 4 (Bidder's disclosure)
Bidder: Demo Consulting (Pty) Ltd
Completed and signed by: Director
Date signed: 10 October 2026
Note: SBD 6.1 (Preference points claim form) is not included in this file.` },
  /* ---- Built environment team (fictional demo data) for school water and sanitation tenders ---- */
  { kind: "cv", path: `${D}/Consultants/Kagiso Mabena/Kagiso Mabena CV.docx`, title: "Kagiso Mabena CV", text: `CURRICULUM VITAE (fictional demo data)
Kagiso Mabena, Construction Project Manager and Team Leader, Demo Built Environment Consultants
Email: kagiso.mabena@demo-consulting.example | CV last updated: 14 August 2026
Qualifications: BSc Construction Management, University of Pretoria (2008). BSc Honours Construction Management (2010).
Certifications: Pr. CPM: Professional Construction Project Manager, registered with SACPCMP (2015), registration DEMO-PRCPM-1101.
Experience: 16 years in construction project management, 12 years leading professional service provider (PSP) teams on public sector school infrastructure.
Key projects:
- Thabaneng Schools Sanitation Programme, Cluster 2 (2024 to 2025): team leader for 42 schools, construction value R38 million.
- Marula Valley Rural Schools Water Supply (2023 to 2024): construction project manager for 28 schools.
- Sunhill Schools Infrastructure Trust Ablution Blocks (2022 to 2023): project manager for 15 schools.
Skills: CIDB Standard Professional Services Contract, JBCC and GCC contracts, IDMS, site meetings, payment certificates, close-out reports.` },
  { kind: "cert", path: `${D}/Consultants/Kagiso Mabena/SACPCMP Pr CPM registration certificate.pdf`, title: "SACPCMP Pr CPM registration certificate", text: `CERTIFICATE OF REGISTRATION (fictional demo data)
South African Council for the Project and Construction Management Professions (SACPCMP)
This certifies that Kagiso Mabena is registered as a Professional Construction Project Manager (Pr. CPM)
Registration number: DEMO-PRCPM-1101
Registered: 3 March 2015
Valid until: 31 March 2029` },

  { kind: "cv", path: `${D}/Consultants/Nomvula Sithole/Nomvula Sithole CV.pdf`, title: "Nomvula Sithole CV", text: `CURRICULUM VITAE (fictional demo data)
Nomvula Sithole, Professional Architect, Demo Built Environment Consultants
Email: nomvula.sithole@demo-consulting.example | CV last updated: 2 June 2026
Qualifications: Master of Architecture (Professional), University of the Witwatersrand (2012).
Certifications: Pr. Arch: Professional Architect, registered with SACAP (2015), registration DEMO-PRARCH-2207.
Experience: 11 years in architecture, 8 years designing school buildings, ablution blocks and universal access toilets for education departments.
Key projects:
- Thabaneng Schools Sanitation Programme, Cluster 2 (2024 to 2025): architect for standard ablution block designs and site layouts at 42 schools.
- Sunhill Schools Infrastructure Trust Ablution Blocks (2022 to 2023): lead architect, 15 schools.
- Northvale Clinics Water and Sanitation Upgrade (2022): architect.
Skills: Norms and Standards for School Infrastructure, SANS 10400, universal access design, municipal building plan approvals, Revit.` },
  { kind: "cert", path: `${D}/Consultants/Nomvula Sithole/SACAP Pr Arch certificate.pdf`, title: "SACAP Pr Arch certificate", text: `CERTIFICATE OF REGISTRATION (fictional demo data)
South African Council for the Architectural Profession (SACAP)
This certifies that Nomvula Sithole is registered as a Professional Architect (Pr. Arch)
Registration number: DEMO-PRARCH-2207
Registered: 18 May 2015
Valid until: 31 March 2028` },

  { kind: "cv", path: `${D}/Consultants/Pieter Joubert/Pieter Joubert CV.docx`, title: "Pieter Joubert CV", text: `CURRICULUM VITAE (fictional demo data)
Pieter Joubert, Professional Quantity Surveyor, Demo Built Environment Consultants
Email: pieter.joubert@demo-consulting.example | CV last updated: 3 March 2024
Qualifications: BSc Quantity Surveying, University of the Free State (2005). BSc Honours Quantity Surveying (2006).
Certifications: Pr. QS: Professional Quantity Surveyor, registered with SACQSP (2010), registration DEMO-PRQS-3015.
Experience: 19 years in quantity surveying, 10 years on public sector water, sanitation and school projects.
Key projects:
- Thabaneng Schools Sanitation Programme, Cluster 2 (2024 to 2025): quantity surveyor, bills of quantities and cost control for R38 million of works.
- Marula Valley Rural Schools Water Supply (2023 to 2024): quantity surveyor.
Skills: bills of quantities, cost estimates, tender evaluation, payment certificates, final accounts, escalation (CPAP).` },
  { kind: "cert", path: `${D}/Consultants/Pieter Joubert/SACQSP Pr QS certificate.pdf`, title: "SACQSP Pr QS certificate", text: `CERTIFICATE OF REGISTRATION (fictional demo data)
South African Council for the Quantity Surveying Profession (SACQSP)
This certifies that Pieter Joubert is registered as a Professional Quantity Surveyor (Pr. QS)
Registration number: DEMO-PRQS-3015
Registered: 9 August 2010
Valid until: 31 March 2027` },

  { kind: "cv", path: `${D}/Consultants/Ayanda Khumalo/Ayanda Khumalo CV.pdf`, title: "Ayanda Khumalo CV", text: `CURRICULUM VITAE (fictional demo data)
Ayanda Khumalo, Civil and Structural Engineer, Demo Built Environment Consultants
Email: ayanda.khumalo@demo-consulting.example | CV last updated: 21 September 2026
Qualifications: BEng Civil Engineering, Stellenbosch University (2011). MEng Structural Engineering (2014).
Certifications: Pr. Eng: Professional Engineer (civil), registered with ECSA (2016), registration DEMO-PRENG-4120.
Experience: 14 years in civil and structural engineering, 9 years on water supply and sanitation for schools and clinics.
Key projects:
- Marula Valley Rural Schools Water Supply (2023 to 2024): lead civil engineer for boreholes, elevated steel tanks and water reticulation at 28 schools.
- Thabaneng Schools Sanitation Programme, Cluster 2 (2024 to 2025): civil and structural engineer for ablution blocks, septic tanks and soakaways.
- Northvale Clinics Water and Sanitation Upgrade (2022): civil engineer.
Skills: water reticulation design, sanitation systems, structural design of ablution blocks and tank stands, geotechnical reports, site supervision.` },
  { kind: "cert", path: `${D}/Consultants/Ayanda Khumalo/ECSA Pr Eng certificate.pdf`, title: "ECSA Pr Eng certificate", text: `CERTIFICATE OF REGISTRATION (fictional demo data)
Engineering Council of South Africa (ECSA)
This certifies that Ayanda Khumalo is registered as a Professional Engineer (Pr. Eng), civil
Registration number: DEMO-PRENG-4120
Registered: 11 April 2016
Valid until: 31 March 2028` },

  { kind: "cv", path: `${D}/Consultants/Rhulani Baloyi/Rhulani Baloyi CV.docx`, title: "Rhulani Baloyi CV", text: `CURRICULUM VITAE (fictional demo data)
Rhulani Baloyi, Electrical Engineering Technologist, Demo Built Environment Consultants
Email: rhulani.baloyi@demo-consulting.example | CV last updated: 30 April 2026
Qualifications: BTech Electrical Engineering, Tshwane University of Technology (2013).
Certifications: Pr. Tech Eng: Professional Engineering Technologist (electrical), registered with ECSA (2017), registration DEMO-PRTECH-5031.
Experience: 12 years in electrical engineering, 8 years on borehole pumps, solar power and lighting for rural schools.
Key projects:
- Marula Valley Rural Schools Water Supply (2023 to 2024): electrical engineer for solar borehole pumps and control panels at 28 schools.
- Thabaneng Schools Sanitation Programme, Cluster 2 (2024 to 2025): electrical engineer for ablution block lighting.
Skills: SANS 10142 wiring code, solar PV pumping systems, Certificates of Compliance, electrical reticulation.` },
  { kind: "cert", path: `${D}/Consultants/Rhulani Baloyi/ECSA Pr Tech Eng certificate.pdf`, title: "ECSA Pr Tech Eng certificate", text: `CERTIFICATE OF REGISTRATION (fictional demo data)
Engineering Council of South Africa (ECSA)
This certifies that Rhulani Baloyi is registered as a Professional Engineering Technologist (Pr. Tech Eng), electrical
Registration number: DEMO-PRTECH-5031
Registered: 2 October 2017
Valid until: 31 March 2028` },

  { kind: "cv", path: `${D}/Consultants/Fatima Patel/Fatima Patel CV.pdf`, title: "Fatima Patel CV", text: `CURRICULUM VITAE (fictional demo data)
Fatima Patel, Mechanical Engineer, Demo Built Environment Consultants
Email: fatima.patel@demo-consulting.example | CV last updated: 12 July 2026
Qualifications: BSc Mechanical Engineering, University of Cape Town (2013).
Certifications: Pr. Eng: Professional Engineer (mechanical), registered with ECSA (2019), registration DEMO-PRENG-6044.
Experience: 12 years in mechanical engineering, 7 years on wet services, plumbing and drainage for public buildings.
Key projects:
- Sunhill Schools Infrastructure Trust Ablution Blocks (2022 to 2023): wet services and drainage design, 15 schools.
- Thabaneng Schools Sanitation Programme, Cluster 2 (2024 to 2025): plumbing and rainwater harvesting design.
Skills: SANS 10252 water supply and drainage, rainwater harvesting, pump selection, fire services.` },
  { kind: "cert", path: `${D}/Consultants/Fatima Patel/ECSA Pr Eng mechanical.pdf`, title: "ECSA Pr Eng mechanical", text: `CERTIFICATE OF REGISTRATION (fictional demo data)
Engineering Council of South Africa (ECSA)
This certifies that Fatima Patel is registered as a Professional Engineer (Pr. Eng), mechanical
Registration number: DEMO-PRENG-6044
Registered: 15 July 2019
Valid until: 31 March 2028` },

  { kind: "cv", path: `${D}/Consultants/Tshepo Maluleke/Tshepo Maluleke CV.docx`, title: "Tshepo Maluleke CV", text: `CURRICULUM VITAE (fictional demo data)
Tshepo Maluleke, Construction Health and Safety Agent, Demo Built Environment Consultants
Email: tshepo.maluleke@demo-consulting.example | CV last updated: 5 May 2026
Qualifications: National Diploma Safety Management, University of Johannesburg (2012).
Certifications: Pr. CHSA: Professional Construction Health and Safety Agent, registered with SACPCMP (2018), registration DEMO-PRCHSA-7019.
Experience: 13 years in construction health and safety, 7 years as health and safety agent on school and clinic projects.
Key projects:
- Thabaneng Schools Sanitation Programme, Cluster 2 (2024 to 2025): health and safety agent, 42 sites.
- Sunhill Schools Infrastructure Trust Ablution Blocks (2022 to 2023): health and safety agent.
Skills: Construction Regulations 2014, health and safety specifications, baseline risk assessments, site audits.` },
  { kind: "cert", path: `${D}/Consultants/Tshepo Maluleke/SACPCMP Pr CHSA certificate.pdf`, title: "SACPCMP Pr CHSA certificate", text: `CERTIFICATE OF REGISTRATION (fictional demo data)
South African Council for the Project and Construction Management Professions (SACPCMP)
This certifies that Tshepo Maluleke is registered as a Professional Construction Health and Safety Agent (Pr. CHSA)
Registration number: DEMO-PRCHSA-7019
Registered: 1 April 2018
Valid until: 31 March 2026` },

  /* ---- Past projects and credentials for school water and sanitation (fictional clients) ---- */
  { kind: "project", path: `${D}/Past Projects/2025 Thabaneng Schools Sanitation Programme Cluster 2.pdf`, title: "2025 Thabaneng Schools Sanitation Programme Cluster 2", text: `PROJECT CLOSE-OUT REPORT (fictional demo data)
Client: Thabaneng Provincial Department of Education (fictional)
Project: Schools Sanitation Programme, Cluster 2. Professional service provider (PSP) appointment.
Period: February 2024 to October 2025. Construction value: R38 million. Professional fees: R4.1 million.
Scope: Replaced pit latrines with new ablution blocks at 42 rural schools. Septic tanks, soakaways, rainwater harvesting, universal access toilets.
Services: inception, concept and viability, design development, documentation and procurement, contract administration and close-out (CIDB Standard Professional Services Contract).
Team: Kagiso Mabena (team leader and construction project manager), Nomvula Sithole (architect), Pieter Joubert (quantity surveyor), Ayanda Khumalo (civil and structural engineer), Rhulani Baloyi (electrical), Fatima Patel (mechanical), Tshepo Maluleke (health and safety agent).
Outcome: All 42 schools handed over on time. Zero lost time injuries.` },
  { kind: "project", path: `${D}/Past Projects/2024 Marula Valley Rural Schools Water Supply.docx`, title: "2024 Marula Valley Rural Schools Water Supply", text: `PROJECT CLOSE-OUT REPORT (fictional demo data)
Client: Marula Valley District Municipality (fictional)
Project: Rural Schools Water Supply. Professional service provider (PSP) appointment.
Period: March 2023 to June 2024. Construction value: R21 million. Professional fees: R2.6 million.
Scope: New boreholes, solar borehole pumps, elevated steel water tanks and water reticulation at 28 rural schools.
Team: Kagiso Mabena (construction project manager), Ayanda Khumalo (lead civil engineer), Rhulani Baloyi (electrical engineer), Pieter Joubert (quantity surveyor).
Outcome: Reliable water supply at all 28 schools. Water quality tested to SANS 241.` },
  { kind: "project", path: `${D}/Past Projects/2023 Sunhill Schools Ablution Blocks.pdf`, title: "2023 Sunhill Schools Ablution Blocks", text: `PROJECT CLOSE-OUT REPORT (fictional demo data)
Client: Sunhill Schools Infrastructure Trust (fictional)
Project: Ablution Blocks for 15 Schools. Professional service provider appointment.
Period: April 2022 to August 2023. Construction value: R12.5 million. Professional fees: R1.5 million.
Scope: Design and contract administration of new ablution blocks with waterborne sanitation and universal access toilets at 15 schools.
Team: Kagiso Mabena (project manager), Nomvula Sithole (lead architect), Fatima Patel (wet services), Tshepo Maluleke (health and safety agent).` },
  { kind: "project", path: `${D}/Past Projects/2022 Northvale Clinics Water and Sanitation Upgrade.pdf`, title: "2022 Northvale Clinics Water and Sanitation Upgrade", text: `PROJECT CLOSE-OUT REPORT (fictional demo data)
Client: Northvale Metropolitan Municipality (fictional)
Project: Clinics Water and Sanitation Upgrade.
Period: January to November 2022. Construction value: R6.8 million.
Scope: Upgraded water supply, toilets and drainage at 9 clinics.
Team: Ayanda Khumalo (civil engineer), Nomvula Sithole (architect).` },
  { kind: "project", path: `${D}/Past Projects/Credentials deck - School water and sanitation 2026.pptx`, title: "Credentials deck - School water and sanitation 2026", text: `[Slide 1]
School water and sanitation credentials (fictional demo data)
Demo Built Environment Consultants, 2026 edition

[Slide 2]
Why education departments choose us
85 schools given safe sanitation and water since 2022
A full multidisciplinary PSP team: project management, architecture, quantity surveying, civil, electrical, mechanical, and health and safety

[Slide 3]
Thabaneng Schools Sanitation Programme, Cluster 2 (2024 to 2025)
Replaced pit latrines with new ablution blocks at 42 rural schools
Construction value R38 million. Signed reference letter available.

[Slide 4]
Marula Valley Rural Schools Water Supply (2023 to 2024)
Boreholes, solar pumps, elevated tanks and reticulation at 28 schools
Construction value R21 million. Signed reference letter available.

[Slide 5]
Sunhill Schools Ablution Blocks (2022 to 2023)
Waterborne ablution blocks with universal access toilets at 15 schools
Construction value R12.5 million.

[Slide 6]
Our PSP approach
Inception, concept, design, procurement, contract administration and close-out under the CIDB Standard Professional Services Contract` },

  { kind: "letter", path: `${D}/Reference Letters/Thabaneng Department of Education reference letter.pdf`, title: "Thabaneng Department of Education reference letter", text: `REFERENCE LETTER (fictional demo data)
From: Thabaneng Provincial Department of Education (fictional), Infrastructure Directorate
Date: 20 November 2025
To whom it may concern
Demo Built Environment Consultants were our professional service provider for the Schools Sanitation Programme, Cluster 2 (February 2024 to October 2025), construction value R38 million.
They delivered new ablution blocks at 42 schools on time and within budget. We recommend them without reservation.
Signed: Director: Education Infrastructure (fictional)` },
  { kind: "letter", path: `${D}/Reference Letters/Marula Valley District Municipality reference letter.pdf`, title: "Marula Valley District Municipality reference letter", text: `REFERENCE LETTER (fictional demo data)
From: Marula Valley District Municipality (fictional), Technical Services
Date: 15 July 2024
Demo Built Environment Consultants delivered the Rural Schools Water Supply project (March 2023 to June 2024), construction value R21 million, at 28 schools. Their work was of a high standard.
Signed: Director: Technical Services (fictional)` },

  { kind: "cert", path: `${D}/Company Compliance/Professional indemnity insurance certificate.pdf`, title: "Professional indemnity insurance certificate", text: `CERTIFICATE OF INSURANCE (fictional demo data)
Insured: Demo Built Environment Consultants
Cover: Professional indemnity insurance, R10 million per claim
Valid from: 1 March 2026
Valid until: 28 February 2027` },
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
