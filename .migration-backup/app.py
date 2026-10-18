import streamlit as st
import pandas as pd
import numpy as np
import streamlit_analytics2 as streamlit_analytics
from sklearn.feature_selection import mutual_info_regression

with streamlit_analytics.track(unsafe_password="your_chosen_dashboard_password"):

    st.set_page_config(
        page_title="AI bias and Proxy Auditor",
        page_icon="🛡️",
        layout="wide"
    )

    st.title("AI bias and Proxy Variable Auditing")
    st.markdown("""
This tool audits datasets to find ***Hidden Biases*** and ***Proxy Variables*** before they are used to train AI models. Drop a CSV file to check for feature correlations and data anomalies.
""")

    st.divider()

    st.sidebar.header("Data Input")
    uploaded_file = st.sidebar.file_uploader("Upload a CSV file", type=["csv"])

    if uploaded_file is not None:
        df = pd.read_csv(uploaded_file)

        col1, col2 = st.columns([1, 1])

        with col1:
            st.subheader("Data Preview")
            st.write(f"Number of rows: {df.shape[0]}")
            st.write(f"Number of columns: {df.shape[1]}")
            st.dataframe(df.head(10))

        with col2:
            st.subheader("Configure Audit")

            numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()

            if len(numeric_cols) < 2:
                st.error("At least two numeric columns are required for correlation analysis.")
            else:
                target_col = st.selectbox(
                    "Select the target variable (e.g., 'Approved', 'Hired', 'Salary'):",
                    options=numeric_cols,
                    index=len(numeric_cols) - 1
                )

                threshold = st.slider(
                    "Set Risk Threshold (Correlation Coefficient):",
                    min_value=0.5, max_value=1.0, value=0.75, step=0.05,
                    help="Features correlating higher than this number with your target will be flagged as high risk."
                )

        st.divider()

        st.subheader("Audit Results and Risk Analysis")

        if len(numeric_cols) >= 2:
            corr_matrix = df[numeric_cols].corr()
            target_correlations = corr_matrix[target_col].drop(target_col).abs()

            if target_correlations.empty:
                st.warning("No numeric columns available for correlation analysis.")
            else:
                has_flags = False

                BIAS_REASONS = {
                    "zip_code":"ZIP codes strongly correlate with race and income — redlining-era discrimination.",
                    "zipcode":"ZIP codes strongly correlate with race and income — redlining-era discrimination.",
                    "gender":"Gender is a protected attribute; including it can directly discriminate against applicants.",
                    "sex":"Sex is a legally protected attribute — a low correlation score doesn't make it safe.",
                    "age":"Age is a protected attribute and can disadvantage older or younger candidates.",
                    "race":"Race is a protected attribute — using it is directly discriminatory.",
                    "ethnicity":"Ethnicity is a protected attribute — using it is directly discriminatory.",
                    "religion":"Religion is a protected attribute in most anti-discrimination laws.",
                    "nationality":"Nationality can proxy for race/ethnicity and is protected in many jurisdictions.",
                    "disability":"Disability status is a legally protected attribute.",
                    "name":"Names can reveal ethnicity or gender and introduce cultural or demographic bias.",
                    "first_name":"First names strongly signal gender and cultural background.",
                    "last_name":"Last names can signal ethnicity or national origin.",
                    "address":"Addresses proxy for race, income, or neighbourhood demographics.",
                    "income":"Income correlates with race, gender, and class — amplifying existing inequality.",
                    "has_a_child":"Parental status disproportionately impacts women — a proxy for gender discrimination.",
                    "has_a_kid":"Parental status disproportionately impacts women — a proxy for gender discrimination.",
                    "has_kids":"Parental status disproportionately impacts women — a proxy for gender discrimination.",
                    "is_parent":"Parental status disproportionately impacts women — a proxy for gender discrimination.",
                    "children":"Parental status disproportionately impacts women — a proxy for gender discrimination.",
                    "marital_status":"Marital status intersects with gender and can lead to indirect discrimination.",
                    "married":"Marital status intersects with gender and can lead to indirect discrimination.",
                    "pregnant":"Pregnancy status is a legally protected characteristic in many jurisdictions.",
                    "criminal_record":"Criminal records correlate heavily with race and socioeconomic background.",
                    "arrest_history":"Arrest history strongly correlates with race — rarely justified as a feature.",
                }

                # Fields inherently sensitive regardless of measured correlation
                SENSITIVE_FIELDS = {
                    "gender","sex","gender_identity","male","female","is_male","is_female",
                    "age","dob","date_of_birth","birth_year","age_group","age_band",
                    "race","ethnicity","ethnic_group","ethnic_background",
                    "religion","faith","denomination",
                    "nationality","citizenship","country_of_birth","national_origin","birthplace",
                    "disability","disabled","has_disability","health_condition","mental_health",
                    "has_a_child","has_a_kid","has_kids","has_children","is_parent","have_children",
                    "num_children","num_kids","children","kids","child_count","parent","parental_status",
                    "marital_status","marital","married","is_married","divorced","widowed","single",
                    "pregnant","pregnancy","is_pregnant",
                    "zip_code","zipcode","zip","postcode","postal_code","area_code",
                    "neighborhood","neighbourhood","district","borough","census_tract",
                    "name","full_name","first_name","last_name","surname","given_name",
                    "address","street_address","home_address",
                    "income","household_income","annual_income","salary","net_worth","wealth",
                    "criminal_record","criminal_history","arrest_history","felony","conviction",
                    "weight","height","bmi",
                }

                for feature, pearson_corr in target_correlations.items():
                    feature_key = feature.lower().replace(" ", "_")
                    bias_reason = BIAS_REASONS.get(
                        feature_key,
                        f'`{feature}` may carry hidden demographic signal — check whether it reflects genuine merit or encodes group membership.'
                    )

                    # ── Signal 2: Mutual Information (non-linear bias) ─────────────
                    try:
                        mi_score = mutual_info_regression(
                            df[[feature]].fillna(0), df[target_col].fillna(0), random_state=0
                        )[0]
                    except Exception:
                        mi_score = 0.0

                    # ── Signal 3: Group Disparity (outcome rate gap) ───────────────
                    disparity = None
                    try:
                        n_unique = df[feature].nunique()
                        if 2 <= n_unique <= 10:
                            group_means = df.groupby(feature)[target_col].mean()
                            if len(group_means) >= 2:
                                disparity = float(group_means.max() - group_means.min())
                    except Exception:
                        pass

                    # ── Determine risk using all signals ──────────────────────────
                    triggers = []
                    risk = "low"

                    if pearson_corr >= threshold:
                        triggers.append(f"Pearson r = {pearson_corr:.2f} — strong linear correlation (above {threshold:.2f} threshold)")
                        risk = "high"
                    elif pearson_corr >= threshold * 0.65:
                        triggers.append(f"Pearson r = {pearson_corr:.2f} — moderate linear correlation")
                        if risk == "low": risk = "medium"

                    if mi_score >= 0.4:
                        triggers.append(f"Mutual Information = {mi_score:.2f} bits — strong non-linear association missed by Pearson")
                        if risk != "high": risk = "high"
                    elif mi_score >= 0.1:
                        triggers.append(f"Mutual Information = {mi_score:.2f} bits — moderate non-linear association")
                        if risk == "low": risk = "medium"

                    if disparity is not None and disparity >= 0.40:
                        triggers.append(f"Group disparity = {disparity*100:.0f}% — large outcome rate gap between value groups")
                        if risk != "high": risk = "high"
                    elif disparity is not None and disparity >= 0.20:
                        triggers.append(f"Group disparity = {disparity*100:.0f}% — notable outcome rate gap between value groups")
                        if risk == "low": risk = "medium"

                    if feature_key in SENSITIVE_FIELDS:
                        triggers.append(f'"{feature}" is a known protected or sensitive attribute — risky regardless of correlation score')
                        if risk == "low": risk = "medium"

                    # ── Render result ─────────────────────────────────────────────
                    signal_summary = " | ".join([
                        f"Pearson r={pearson_corr:.2f}",
                        f"MI={mi_score:.2f} bits",
                        *([] if disparity is None else [f"Disparity={disparity*100:.0f}%"])
                    ])

                    if risk == "high":
                        has_flags = True
                        st.error(f"🔴 **HIGH RISK** — `{feature}` ({signal_summary})")
                        for i, t in enumerate(triggers, 1):
                            st.caption(f"⚑ Signal {i}: {t}")
                        st.caption(f"*Why it may be biased:* {bias_reason}")
                    elif risk == "medium":
                        has_flags = True
                        st.warning(f"🟡 **MEDIUM RISK** — `{feature}` ({signal_summary})")
                        for i, t in enumerate(triggers, 1):
                            st.caption(f"⚑ Signal {i}: {t}")
                        st.caption(f"*Why it may be biased:* {bias_reason}")
                    else:
                        st.success(f"✅ **LOW RISK** — `{feature}` ({signal_summary})")

                if not has_flags:
                    st.balloons()
                    st.info("No extreme correlations found. Your dataset appears to be free of hidden biases.")

    else:
        st.info("**Getting Started:** Upload a dataset in the sidebar to begin your audit. Don't have one? See below for instructions.")

        st.markdown("""
### Example Dataset Layout
Your CSV should have a structure like this:

| coding_score | zip_code | uses_dark_mode | approved |
|---|---|---|---|
| 95 | 10001 | 1 | 1 |
| 42 | 90210 | 0 | 0 |
""")
