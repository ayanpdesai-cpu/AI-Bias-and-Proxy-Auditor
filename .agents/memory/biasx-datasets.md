---
name: BiasX example dataset design
description: Verified risk distributions and data design rules for the three BiasX example datasets in AuditorRerun.tsx
---

## Thresholds (constants in AuditorRerun.tsx)
- `MI_HIGH = 0.4`, `MI_MED = 0.15`
- `DISP_HIGH = 0.35`, `DISP_MED = 0.15`
- Pearson threshold: user-controlled (default 0.75)
- Sensitive name match: escalates LOW → MEDIUM only

## Tech Hiring (target: `approved`)
| Column | Expected risk | Key signal |
|---|---|---|
| gender | HIGH | Disparity ~42% (M 67%, F 25%) |
| zip_code | HIGH | Disparity ~89% (10001 100%, 90210 11%) |
| has_a_child | HIGH | Disparity ~58% (no child 75%, with child 17%) |
| age | MEDIUM | Sensitive name escalation; near-zero Pearson |
| coding_score | LOW | Similar avg across approved/rejected (~77 vs ~75) |
| years_experience | LOW | >12 unique values → disparity null; near-zero Pearson |

**Why:** Dataset was redesigned so `has_a_child` has 58% disparity (HIGH), reflecting real-world parental status discrimination. High scorers appear in rejected set (93, 85) deliberately — the story is bias is in *who gets hired*, not qualifications.

## Loan Approval (target: `loan_approved`)
| Column | Expected risk |
|---|---|
| marital_status | HIGH |
| criminal_record | HIGH |
| zip_code | HIGH |
| credit_score | MEDIUM (MI≈0.38) |
| annual_income | MEDIUM (MI≈0.34) |
| loan_amount | MEDIUM |
| age | MEDIUM (sensitive name) |

## Hospital Readmission (target: `readmitted`)
| Column | Expected risk |
|---|---|
| race_group | HIGH |
| insurance_type | HIGH |
| prior_visits | HIGH |
| zip_code | HIGH |
| blood_pressure | MEDIUM (P≈0.69, MI≈0.37) |
| bmi | MEDIUM (P≈0.58, MI≈0.27) |
| age | MEDIUM (sensitive name) |

## How to apply
When adjusting data: calculate disparity manually before committing. With 24 rows, one row can shift disparity by ~4-8%. Keep "low" features balanced across outcome to keep Pearson/MI near zero. Unique values > 12 → disparity = null for that column.
