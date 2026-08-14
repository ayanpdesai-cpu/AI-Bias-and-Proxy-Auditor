# AI Bias & Proxy Auditor (BiasX)

An interactive tool that helps identify potentially sensitive attributes and demographic proxy features in tabular datasets.

# Overview

AI systems can unintentionally learn patterns that disadvantage certain groups. Sometimes the problem is obvious, such as directly including a protected attribute. Other times, a seemingly ordinary feature—such as ZIP code, income, or name—may act as a proxy for demographic information.

**AI Bias & Proxy Auditor** is a prototype designed to help users identify these potential risks before using a dataset to train or evaluate an AI system.

The tool analyzes uploaded CSV datasets and highlights features that may warrant fairness review.

## Features

# Sensitive Feature Detection

The auditor uses a fairness-focused knowledge base to recognize commonly sensitive or potentially problematic fields, including:

* Gender
* Race and ethnicity
* Age
* Religion
* Nationality
* Disability
* Parental status
* Marital status
* Pregnancy
* ZIP code and geographic information
* Name and address
* Income and wealth
* Criminal history

The tool recognizes common variations of field names where supported.

### Statistical Analysis

For datasets containing appropriate numerical or categorical data, the auditor can calculate statistical signals such as:

* **Pearson correlation** — measures linear association between variables.
* **Mutual Information** — measures statistical dependence between variables.
* **Group disparity** — identifies differences in outcome rates between groups.

These measurements are used as indicators for further investigation rather than proof that a feature is discriminatory.

###  Risk Classification

Features can be categorized into different levels of concern, such as:

* **High Risk**
* **Medium Risk**
* **Lower Risk / Informational**

Risk classifications combine statistical signals and known fairness considerations.

### 💡 Explainable Findings

Instead of only displaying a numerical score, the auditor explains why a feature was flagged.

For example:

> `zip_code` may function as a proxy for protected characteristics because geographic information can be associated with demographic and socioeconomic differences.

The goal is to help users understand **why** a feature deserves further review.

## Example Findings

A dataset might produce findings such as:

```text
HIGH RISK
coding_score

Pearson r = 0.91
Mutual Information = 1.00 bits

Strong statistical association detected.
Review whether the feature reflects legitimate merit
or could contribute to disparate impact.
```

Another example:

```text
HIGH RISK
zip_code

Pearson r = 0.76
Mutual Information = 0.31 bits
Group Disparity = 100%

ZIP code may function as a proxy for demographic
or socioeconomic characteristics.
```

## How It Works

The general analysis pipeline is:

```text
Upload CSV
    ↓
Parse Dataset
    ↓
Identify Columns
    ↓
Check Known Sensitive Features
    ↓
Run Statistical Analysis
    ↓
Calculate Risk Signals
    ↓
Generate Explanations
    ↓
Display Potential Bias / Proxy Findings
```

## Example Dataset Types

The project can be demonstrated using datasets such as:

* Hiring
* College admissions
* Loan approval
* Insurance
* Other tabular decision-making datasets

Example features include:

```text
gender
race
age
zip_code
income
years_experience
coding_score
has_a_child
marital_status
criminal_record
```

## Important Limitations

This project is a **bias-auditing prototype**, not a definitive detector of discrimination.

A statistical association does not necessarily mean that a feature is discriminatory. For example, years of experience may legitimately be related to a job while also being associated with age.

Similarly, a feature not flagged by the tool is **not guaranteed to be fair**.

The current prototype primarily relies on:

1. A knowledge base of known sensitive and proxy-related features.
2. Statistical signals available from the uploaded dataset.
3. Rule-based explanations and risk classifications.

Unknown proxy variables may not be identified by name alone. Additional statistical analysis, domain knowledge, and human review may be necessary.

## Why Proxy Features Matter

A model does not necessarily need a protected attribute directly to produce potentially unfair outcomes.

For example:

```text
Race
  ↓
Neighborhood
  ↓
ZIP Code
  ↓
Model
```

A model that does not explicitly receive race may still learn patterns associated with race through other variables.

This is why auditing potential proxy features can be useful when evaluating AI systems.

## Technical Approach

The project uses statistical methods to identify relationships between dataset features and protected or sensitive attributes.

### Pearson Correlation

Pearson correlation measures the strength and direction of a linear relationship.

A high absolute correlation can be a signal that a feature deserves further investigation.

### Mutual Information

Mutual Information measures statistical dependence between variables and can capture relationships that are not necessarily linear.

It should be interpreted relative to the variables and dataset rather than treated as a universal "bias score."

 Group Disparity

Group disparity compares outcome rates across groups.

A large difference may indicate a potential fairness concern and can motivate additional investigation.

Responsible Use

The auditor is intended to support **human review**, not replace it.

A flagged feature should be investigated in context:

* Is the feature legitimately relevant?
* How was the feature collected?
* Could it act as a proxy for a protected characteristic?
* Does removing it change model performance?
* Does the model produce different outcomes across groups?
* Are there legitimate reasons for observed differences?

The tool should not be used by itself to make employment, lending, admissions, insurance, or other high-impact decisions.

 Project Goals

The goal of this project is to make AI fairness concepts more accessible by providing an interactive way to explore how seemingly harmless dataset features can potentially create fairness concerns.

Rather than simply saying that an AI system is "biased," the auditor attempts to show **which features deserve attention and why**.

Future Improvements

Potential future versions could include:

* Automatic proxy detection for previously unknown feature names
* Additional fairness metrics
* More sophisticated categorical-variable analysis
* Model-level fairness testing
* Fairness comparisons before and after removing a feature
* User-defined protected attributes
* More comprehensive domain-specific rules
* Dataset quality checks
* Automated audit reports


This project is an educational prototype intended to demonstrate concepts in AI fairness, proxy detection, and responsible machine learning.

A finding from this tool does not establish that a dataset, feature, model, organization, or decision-making process is discriminatory. Results should be interpreted in context and reviewed by qualified individuals.

## Author

Built as a student project exploring **AI fairness, responsible machine learning, and algorithmic bias detection**.

---

**AI Bias & Proxy Auditor — helping users ask better questions about the data behind AI.**
