import streamlit as st
import pandas as pd
import streamlit_analytics2 as streamlit_analytics

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
                    "zip_code":       "ZIP codes strongly correlate with race and income — they can silently encode redlining-era discrimination.",
                    "zipcode":        "ZIP codes strongly correlate with race and income — they can silently encode redlining-era discrimination.",
                    "gender":         "Gender is a protected attribute; including it can directly discriminate against applicants.",
                    "sex":            "Sex is a legally protected attribute — a low correlation score doesn't make it safe to include.",
                    "age":            "Age is a protected attribute and can disadvantage older or younger candidates.",
                    "race":           "Race is a protected attribute — using it is directly discriminatory.",
                    "ethnicity":      "Ethnicity is a protected attribute — using it is directly discriminatory.",
                    "religion":       "Religion is a protected attribute in most anti-discrimination laws.",
                    "nationality":    "Nationality can proxy for race or ethnicity and is protected in many jurisdictions.",
                    "disability":     "Disability status is a legally protected attribute and its inclusion is rarely justified.",
                    "uses_dark_mode": "Superficial personal preferences can act as unexpected proxies for demographic groups.",
                    "dark_mode":      "Superficial personal preferences can act as unexpected proxies for demographic groups.",
                    "name":           "Names can reveal ethnicity or gender and introduce cultural or demographic bias.",
                    "first_name":     "First names strongly signal gender and cultural background.",
                    "last_name":      "Last names can signal ethnicity or national origin.",
                    "address":        "Addresses, like ZIP codes, can proxy for race, income, or neighbourhood demographics.",
                    "income":         "Income correlates with race, gender, and class — it can amplify existing societal inequalities.",
                    "has_a_child":    "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
                    "children":       "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
                    "marital_status": "Marital status intersects with gender and can lead to indirect discrimination.",
                    "pregnant":       "Pregnancy status is a legally protected characteristic in many jurisdictions.",
                    "criminal_record":"Criminal records correlate heavily with race and socioeconomic background.",
                    "arrest_history": "Arrest history strongly correlates with race and should almost never be used as a feature.",
                }

                # Fields that are inherently sensitive regardless of measured correlation
                SENSITIVE_FIELDS = {
                    "gender", "sex", "age", "race", "ethnicity", "religion", "nationality",
                    "disability", "marital_status", "has_a_child", "children", "num_children",
                    "pregnant", "pregnancy", "zip_code", "zipcode", "postcode", "postal_code",
                    "name", "first_name", "last_name", "surname", "address", "income",
                    "household_income", "net_worth", "criminal_record", "arrest_history",
                }

                for feature, correlation_value in target_correlations.items():
                    feature_key = feature.lower().replace(" ", "_")
                    bias_reason = BIAS_REASONS.get(feature_key, f'`{feature}` may carry hidden demographic signal — check whether it reflects genuine merit or encodes group membership.')

                    if correlation_value >= threshold:
                        has_flags = True
                        st.error(f"🔴 **HIGH RISK** | Feature `{feature}` has a correlation of **{correlation_value:.2f}** with `{target_col}`.")
                        st.caption(f"*Why this matters:* This feature strongly dictates the AI's behavior. If `{feature}` is a biased or irrelevant metric, the model will learn an unfair shortcut rule.")
                        st.caption(f"*Why it may be biased:* {bias_reason}")
                    elif feature_key in SENSITIVE_FIELDS:
                        has_flags = True
                        st.warning(f"🟡 **MEDIUM RISK** | Feature `{feature}` has a low correlation of **{correlation_value:.2f}** with `{target_col}` — but this field is inherently sensitive.")
                        st.caption(f"*Why Pearson correlation alone isn't enough:* A low score in this sample does **not** mean the feature is safe. Sensitive attributes can introduce bias through interaction effects, distributional shift, or a different population in production.")
                        st.caption(f"*Why it may be biased:* {bias_reason}")
                    else:
                        st.success(f"✅ **LOW RISK** | Feature: `{feature}` has a safe correlation of **{correlation_value:.2f}**.")

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
