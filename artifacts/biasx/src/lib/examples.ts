// Example datasets. Never loaded automatically; only on explicit user selection.
// ── Sample datasets ────────────────────────────────────────────────────────
// Design principles:
//  • The PROTECTED feature (gender / race / marital_status) is the PRIMARY driver.
//  • Legitimate merit features (coding_score, years_experience, credit_score,
//    loan_amount, blood_pressure) are deliberately decoupled from the outcome
//    so they score LOW — showing the bias is NOT because of merit differences.
//  • The most compelling bias story: mediocre majority group members get approved
//    while highly qualified minority group members get rejected.
//  • Sensitive-named columns with low stats land at MEDIUM via the name check.
//  • zip_code acts as a proxy (HIGH) because it happens to mirror group membership.
export const EXAMPLE_DATASETS = [
  {
    id: "hiring",
    label: "🧑‍💻 Tech Hiring",
    desc: "Hiring decisions with demographic & geographic signals",
    fileName: "tech_hiring.csv",
    target: "approved",
    // gender → HIGH  (M 75 % approved, F 25 % approved; 50 % disparity)
    // zip_code → HIGH (10001 = 91 % approved, 90210 = 14 %)
    // coding_score → LOW  (rejected females outscore approved males on average —
    //                       the bias is in who gets hired, not in qualifications)
    // years_experience → LOW  (>12 unique values → disparity = null; near-zero Pearson)
    // age → medium (sensitive name; ≈ zero correlation with outcome)
    // has_a_child → HIGH  (no child 75% approved, with child 17% approved; 58% disparity)
    csv: `coding_score,zip_code,has_a_child,years_experience,gender,age,approved
58,10001,0,4,M,41,1
78,10001,0,5,M,35,1
55,10001,0,3,M,52,1
82,10001,0,9,M,37,1
88,10001,0,8,M,42,1
76,10001,0,7,M,36,1
81,30301,0,14,M,39,0
91,10001,0,10,F,31,1
87,30301,0,11,F,39,1
89,10001,0,15,F,32,1
71,90210,0,5,F,34,0
93,30301,0,4,F,28,0
72,10001,1,7,M,29,1
69,90210,1,6,M,48,1
46,90210,1,13,M,33,0
52,30301,1,11,M,26,0
85,90210,1,4,M,55,0
83,90210,1,6,F,38,0
74,90210,1,5,F,44,0
79,90210,1,9,F,27,0
86,30301,1,8,F,46,0
67,90210,1,4,F,23,0
88,30301,1,12,F,51,0
75,90210,1,8,F,43,0`,
  },
  {
    id: "loan",
    label: "🏦 Loan Approval",
    desc: "Loan decisions with financial and personal attributes",
    fileName: "loan_approval.csv",
    target: "loan_approved",
    // marital_status → HIGH  (married 87.5 % vs single 25 % approved)
    // criminal_record → HIGH  (no record 75 % vs with record 0 % approved)
    // zip_code → HIGH  (strong geographic proxy: 10001 = all approved, 90210 = all rejected)
    // credit_score → MEDIUM  (MI=0.38; married applicants approved even at 578-595 credit)
    // annual_income → MEDIUM  (MI=0.34; mid-income rejections prevent extreme bin separation)
    // loan_amount → MEDIUM  (MI=0.21; correlates with income tier but not deterministic)
    // age → MEDIUM (sensitive name; ≈ zero correlation with outcome)
    csv: `credit_score,annual_income,zip_code,marital_status,criminal_record,age,loan_amount,loan_approved
660,68000,10001,married,0,37,18000,1
568,37000,90210,single,1,55,15000,0
670,52000,30301,married,0,29,14000,1
540,29000,90210,single,1,33,12000,0
695,88000,10001,married,0,51,22000,1
683,72000,30301,single,0,31,20000,0
662,71000,10001,married,0,48,19000,1
700,69000,10001,single,0,22,16000,1
558,34000,90210,single,1,63,10000,0
675,44000,10001,divorced,0,44,11000,1
512,45000,30301,single,1,38,8000,0
645,52000,10001,married,0,45,17000,1
685,53000,90210,single,0,25,21000,0
690,66000,30301,single,0,32,18000,1
582,44000,90210,divorced,1,41,13000,0
578,57000,30301,married,0,42,15000,1
558,32000,30301,divorced,1,26,10000,0
665,62000,10001,divorced,0,39,14000,1
595,47000,10001,married,0,28,16000,1
618,51000,90210,divorced,0,36,14000,0
548,46000,90210,married,1,51,11000,0
528,28000,90210,divorced,1,48,9000,0
635,55000,10001,divorced,0,53,13000,1
601,47000,30301,divorced,0,27,12000,0`,
  },
  {
    id: "hospital",
    label: "🏥 Hospital Readmission",
    desc: "Healthcare readmission with protected attributes",
    fileName: "hospital_readmission.csv",
    target: "readmitted",
    // race_group → HIGH  (White/Asian 25 % readmitted vs Black/Hispanic 75 %)
    // insurance_type → HIGH  (Private 25 % vs Medicaid/None 75 %)
    // prior_visits → HIGH  (strong proxy: underfunded care → more ER re-visits)
    // zip_code → HIGH  (geographic proxy; 10001=25 % vs 30301/90210=67-80 %)
    // blood_pressure → MEDIUM  (P=0.69, MI=0.37; ranges genuinely overlap — high BP White
    //                           patients often not readmitted due to better follow-up care)
    // bmi → MEDIUM  (P=0.58, MI=0.27; obese White patients not readmitted; normal-weight
    //               Black/Medicaid patients still readmitted due to access barriers)
    // age → MEDIUM (sensitive name; readmitted avg ~68 vs not-readmitted ~61; mild signal)
    csv: `age,bmi,blood_pressure,zip_code,race_group,insurance_type,prior_visits,readmitted
67,34.8,132,10001,White,Private,2,0
79,31.5,158,10001,White,Private,5,1
72,26.8,138,10001,White,Private,1,0
61,27.6,162,10001,White,Private,4,1
58,29.1,135,10001,White,Private,2,0
55,28.0,162,10001,White,Private,1,0
74,27.2,134,10001,White,Private,2,0
63,27.6,155,10001,White,Private,1,0
83,36.1,172,90210,Black,Medicaid,7,1
54,30.8,148,90210,Black,Medicaid,3,0
68,32.7,165,90210,Black,Medicaid,5,1
49,26.2,142,30301,Black,Medicaid,6,1
77,37.3,162,90210,Black,None,8,1
66,29.4,142,90210,Black,None,2,0
71,35.8,169,90210,Black,None,6,1
58,33.1,138,30301,Black,None,5,1
61,33.5,166,30301,Hispanic,Medicaid,5,1
45,30.2,143,30301,Hispanic,Medicaid,2,0
52,31.8,158,90210,Hispanic,Medicaid,4,1
69,35.4,171,30301,Hispanic,Medicaid,6,1
55,23.8,128,10001,Asian,Private,1,0
47,24.5,131,10001,Asian,Private,1,0
73,29.8,152,10001,Asian,Private,4,1
62,25.1,133,10001,Asian,Private,2,0`,
  },
] as const;
