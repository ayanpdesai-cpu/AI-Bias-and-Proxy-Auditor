from numpy.f2py.crackfortran import n
import streamlit as st
import pandas as pd
import streamlit_analytics2 as streamlit_analytics  


with streamlit_analytics.track(unsafe_password="your_chosen_dashboard_password"):

# page config
st.set_page_config(
    page_title="AI bias and Proxy Auditor",
    page_icon="🛡️",
    layout = "wide"
)

# app header 
st.title("AI bias and Proxy Variable Auditor") 
st.markdown("""
This tool audits datasets to find ***Hidden Biases*** and ***Proxy Variables*** before they are used to train AI models. Drop a CSV file to check forr feature correlations and data anomalies.
""")

st.divider()

# file uploader
st.sidebar.header("Data Input")
uploaded_file = st.file_uploader("Upload a CSV file", type=["csv"])

if uploaded_file is not None:
   # read the file
   df = pd.read_csv(uploaded_file)
   col1, col2 = st.columns([1, 1])
   with col1:
       st.subheader("Data Preview")
       st.write(f"Number of rows: {df.shape[0]}")
       st.write(f"Number of columns: {df.shape[1]}")
       st.dataframe(df.head(10))

   with col2:
         st.subheader("Configure Audit")

         numeric_cols = df.select_dtypes(include=['number']).columns.tolist()

         if len(numeric_cols) < 2:
            st.error("At least two numeric columns are required for correlation analysis.")
         else:

           target_col = st.selectbox(
              "Select the target variable (e.g., 'Approved', 'Hired', 'Salary'):",
               options=numeric_cols,
               index = len(numeric_cols)-1
           )

  st.divider()



  st.subheader("Audit Results and Risk Analysis")

  corr_matrix = df[numeric_cols].corr()


  target_correlations = corr_matrix[target_col].drop(target_col).abs()


  if target_correlations.empty:
     st.warning("No numeric columns available for correlation analysis.")

  else:

    has_flags = False
    
    for feature, correlation_value in target_correlations.items():

       if correlation_value >= threshold:
         has_flags = True
         st.error(f"High Risk! | Feature {feature} has a correlation of {correlation_value:.2f} with the target variable {target_col}.")
         st.caption(f"*Why this matters:* This feature strongly dictates the AI's behavior. If `{feature}` is a biased or irrelevant metric (like our Dark Mode example), the model will learn an unfair shortcut rule.")
       else:
         st.success(f"**LOW RISK** | Feature: `{feature}` has a safe correlation of **{correlation_value:.2f}**.")
    if not has_flags:
      st.balloons()
      st.info("No extreme correlations found. Your dataset appears to be free of hidden biases.")
else:
  st.info(" **Getting Started:** Upload a dataset in the sidebar to begin your audit. Don't have one? See below for instructions.")

  st.markdown("""
   ### Example Dataset Layout
   Your CSV should have a structure like this:

   | Age | Education | Experience | Hired |
   |------|------------|-------------|--------|
   | 25   | Bachelor   | 3           | 1      |
   | 30   | Master     | 5           | 0      |
   """)


