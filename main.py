import streamlit as st
import pandas as pd

# --- PAGE CONFIGURATION ---
st.set_page_config(
    page_title="AI Bias & Proxy Auditor",
    page_icon="🛡️",
    layout="wide"
)

# --- APP HEADER ---
st.title("🛡️ AI Bias & Proxy Variable Auditor")
st.markdown("""
This tool audits datasets to find **hidden biases** and **proxy variables** before they train a broken AI model. 
Drop a CSV file below to calculate feature correlations and check for data anomalies.
""")

st.divider()

# --- FILE UPLOADER SIDEBAR ---
st.sidebar.header("📁 Data Input")
uploaded_file = st.sidebar.file_uploader("Upload your training dataset (CSV format)", type="csv")

# --- APP LOGIC ---
if uploaded_file is not None:
    # Read the dataset
    df = pd.read_csv(uploaded_file)

    # Create two columns for clean layout
    col1, col2 = st.columns([1, 1])

    with col1:
        st.subheader("📊 Dataset Preview")
        st.write(f"Loaded **{df.shape[0]}** rows and **{df.shape[1]}** columns.")
        st.dataframe(df.head(10)) # Show first 10 rows

    with col2:
        st.subheader("⚙️ Configure Audit")

        # Identify numeric columns for math tracking
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()

        if len(numeric_cols) < 2:
            st.error("❌ This tool requires at least two numeric columns to calculate statistical correlations.")
        else:
            # Let the user pick which column represents the AI's final outcome/decision
            target_col = st.selectbox(
                "Select your target/decision column (e.g., 'Approved', 'Hired', 'Salary'):", 
                options=numeric_cols,
                index=len(numeric_cols)-1 # Default to last column
            )

            # Let user define the threshold for what constitutes a "high bias risk"
            threshold = st.slider(
                "Set Risk Threshold (Correlation Coefficient):",
                min_value=0.5, max_value=1.0, value=0.75, step=0.05,
                help="Features correlating higher than this number with your final target will be flagged as high risk."
            )

    st.divider()

    # --- PROCESSING CORRELATIONS ---
    st.subheader("🔍 Audit Results & Risk Analysis")

    # Calculate the Pearson correlation matrix for numeric columns
    corr_matrix = df[numeric_cols].corr()

    # Isolate correlations related to the target variable
    target_correlations = corr_matrix[target_col].drop(target_col).abs()

    if target_correlations.empty:    
        st.warning("No other numeric features found to compare against the target.")
    else:
        # Loop through features and display status indicators
        has_flags = False

        for feature, correlation_value in target_correlations.items():
            # Check if correlation breaks user threshold
            if correlation_value >= threshold:
                has_flags = True
                st.error(f"🚨 **HIGH RISK** | Feature: `{feature}` has a correlation of **{correlation_value:.2f}** with `{target_col}`.")
                st.caption(f"👉 *Why this matters:* This feature strongly dictates the AI's behavior. If `{feature}` is a biased or irrelevant metric (like our Dark Mode example), the model will learn an unfair shortcut rule.")
            else:
                st.success(f"✅ **LOW RISK** | Feature: `{feature}` has a safe correlation of **{correlation_value:.2f}**.")

        if not has_flags:
            st.balloons()
            st.info("🎉 No extreme proxy variables or mathematical biases flagged based on your current threshold!")    

else:
    # Default State when no file is uploaded
    st.info("💡 **Getting Started:** Upload a dataset in the sidebar to begin your audit. Don't have one? See below for instructions.")

    # Show a quick example layout of what a sample CSV looks like
    st.markdown("""
    ### Example Dataset Layout
    Your CSV should map categories to numbers. For example:

    | Coding_Score | Uses_Dark_Mode | Approved |
    |---|---|---|
    | 95 | 1 | 1 |
    | 42 | 0 | 0 |
    """)    
    st.caption("💡 *Note:* The last column is your target variable (e.g., 'Approved'). The tool will flag if other columns are too closely tied to this outcome.")