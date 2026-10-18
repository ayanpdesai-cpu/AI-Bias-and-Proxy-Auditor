// ── Bias knowledge base ────────────────────────────────────────────────────
const BIAS_REASONS: Record<string, string> = {
  zip_code:         "ZIP codes strongly correlate with race and income — they can silently encode redlining-era discrimination.",
  zipcode:          "ZIP codes strongly correlate with race and income — they can silently encode redlining-era discrimination.",
  gender:           "Gender is a protected attribute; including it can directly discriminate against applicants.",
  sex:              "Sex is often a protected attribute. Review the legal and fairness implications of using it in decisions.",
  age:              "Age is a protected attribute and can disadvantage older or younger candidates.",
  race:             "Race is a protected attribute in many contexts. Review the purpose, necessity, and fairness implications of using it in decisions.",
  race_group:       "Race / ethnicity grouping is a directly protected attribute.",
  ethnicity:        "Ethnicity is a protected attribute in many contexts. Review the purpose, necessity, and fairness implications of using it in decisions.",
  name:             "Names can reveal ethnicity or gender and introduce cultural or demographic bias.",
  address:          "Addresses, like ZIP codes, can proxy for race, income, or neighbourhood demographics.",
  income:           "Income correlates with race, gender, and class — it can amplify existing societal inequalities.",
  annual_income:    "Annual income correlates with race, gender, and class — it can amplify existing inequalities.",
  has_a_child:      "Parental status disproportionately impacts women — a proxy for gender discrimination.",
  has_a_kid:        "Parental status disproportionately impacts women — a proxy for gender discrimination.",
  marital_status:   "Marital status intersects with gender and can lead to indirect discrimination.",
  criminal_record:  "Criminal records correlate heavily with race and socioeconomic background.",
  arrest_history:   "Arrest history strongly correlates with race and should almost never be used as a feature.",
  insurance_type:   "Insurance type correlates with income, race, and socioeconomic status — a proxy for protected characteristics.",
};
const MEDIUM_RISK_REASONS: Record<string, string> = {
  has_a_child:      "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  has_a_kid:        "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  has_kids:         "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  children:         "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  num_children:     "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  marital_status:   "Marital status intersects with gender and can lead to indirect discrimination against women or LGBTQ+ applicants.",
  pregnant:         "Pregnancy status is a legally protected characteristic in many jurisdictions.",
  criminal_record:  "Criminal records correlate heavily with race and socioeconomic background.",
  arrest_history:   "Arrest history strongly correlates with race and should almost never be used as a feature.",
  income:           "Income correlates with race, gender, and class — even a weak measured correlation can mask compounding inequality.",
  annual_income:    "Annual income correlates with race, gender, and class — even a weak correlation can mask compounding inequality.",
  name:             "Names can reveal ethnicity or gender to a downstream model even if this dataset's correlation score looks low.",
  zip_code:         "ZIP codes proxy for race and income. Even a low correlation here may not hold in a larger dataset.",
  zipcode:          "ZIP codes proxy for race and income. Even a low correlation here may not hold in a larger dataset.",
  gender:           "Gender is a legally protected attribute. Low correlation in this sample doesn't mean the model won't learn a gender shortcut.",
  sex:              "Sex is a legally protected attribute. Low correlation in this sample doesn't mean the model won't learn a shortcut.",
  age:              "Age is a protected attribute. Low correlation now can grow once the model encounters a broader distribution.",
  race:             "Race warrants legal and fairness review even when its measured association is low; its presence alone does not establish discrimination.",
  race_group:       "Race / ethnicity grouping warrants legal and fairness review even when its measured association is low; its presence alone does not establish discrimination.",
  ethnicity:        "Ethnicity warrants legal and fairness review even when its measured association is low; its presence alone does not establish discrimination.",
  religion:         "Religion is a protected attribute in most anti-discrimination laws.",
  nationality:      "Nationality can proxy for race or ethnicity and is a protected characteristic in many jurisdictions.",
  disability:       "Disability status is a legally protected attribute and its inclusion is rarely justified.",
  insurance_type:   "Insurance type correlates with socioeconomic status, race, and income — a proxy for protected characteristics.",
  bmi:              "BMI / body weight can correlate with disability status and may introduce proxy bias.",
  weight:           "Body weight can correlate with disability status and may introduce proxy bias.",
};
const SENSITIVE_FIELDS = new Set([
  "gender","sex","gender_identity","biological_sex","male","female","is_male","is_female",
  "age","dob","date_of_birth","birth_date","birthdate","birth_year","year_of_birth","age_group","age_band",
  "race","race_group","ethnicity","ethnic_group","ethnic_background","race_ethnicity","racial_group",
  "religion","faith","religious_belief","denomination",
  "nationality","citizenship","country_of_birth","country_of_origin","national_origin","birthplace",
  "disability","disabled","has_disability","disability_status","health_condition","mental_health",
  "has_a_child","has_a_kid","has_kids","has_children","is_parent","have_children","num_children",
  "num_kids","children","kids","child_count","parent","parental_status","family_status",
  "marital_status","marital","married","is_married","marriage_status","civil_status",
  "divorced","widowed","single","relationship_status",
  "pregnant","pregnancy","is_pregnant","expecting",
  "zip_code","zipcode","zip","postcode","postal_code","area_code","neighborhood","neighbourhood",
  "district","borough","census_tract","county_fips",
  "name","full_name","first_name","last_name","surname","family_name","given_name",
  "address","street_address","home_address","residential_address",
  "income","household_income","annual_income","salary","net_worth","wealth",
  "poverty_level","benefits","social_security","welfare",
  "criminal_record","criminal_history","arrest_history","felony","conviction","prior_offenses",
  "weight","height","bmi","body_mass_index",
  "insurance_type","insurance","coverage_type",
]);

export function getBiasReason(f: string) {
  const k = f.toLowerCase().replace(/[^a-z_]/g, "");
  return Object.hasOwn(BIAS_REASONS, k) ? BIAS_REASONS[k] : `"${f}" may carry hidden demographic signal — check whether it reflects genuine merit or encodes group membership.`;
}
export function getMediumRiskReason(f: string) {
  const k = f.toLowerCase().replace(/[^a-z_]/g, "");
  return Object.hasOwn(MEDIUM_RISK_REASONS, k) ? MEDIUM_RISK_REASONS[k] : (isSensitive(f)
    ? `"${f}" matches a known sensitive attribute. A low score in this sample does not mean it is free of risk in production.`
    : `"${f}" shows a moderate statistical association with the target. Check whether it could stand in for a demographic attribute.`);
}
// Substrings that unambiguously signal a sensitive/proxy field regardless of
// how the column is named (e.g. "race_category", "household_income_2022",
// "school_district", "gender_code", "voting_precinct" all get caught here).
// Patterns are chosen to avoid false positives (e.g. "age" is too broad but
// "ethnic", "pregnan", "disabilit" are safe).
const SENSITIVE_PATTERNS: RegExp[] = [
  /race|racial/, // race, race_group, race_category, racial_background …
  /ethnic/,      // ethnicity, ethnic_group, ethnic_background …
  /gender/,      // gender, gender_identity, gender_code …
  /\bsex\b/,     // sex — exact word only to avoid "sexual_harassment_report" false hits
  /income/,      // income, annual_income, household_income_2022 …
  /salary/,      // salary, salary_band …
  /marital/,     // marital_status, marital …
  /pregnan/,     // pregnant, pregnancy …
  /disabilit/,   // disability, disabled, disability_status …
  /criminal/,    // criminal_record, criminal_history …
  /\barrест\b|arrest/, // arrest_history …
  /felony/,      // felony, felonies …
  /convict/,     // conviction, convicted …
  /district/,    // school_district, voting_district, census_district …
  /precinct/,    // voting_precinct …
  /neighbo/,     // neighborhood, neighbourhood …
  /citizen/,     // citizenship, non_citizen …
  /immigr/,      // immigration_status, immigrant …
  /national/,    // nationality, national_origin …
  /religi/,      // religion, religious_belief, religious_affiliation …
  /veteran/,     // veteran_status, is_veteran …
  /\bzip/,       // zip, zip_code, zip_2020, zipcode … (prefix match avoids "unzip" etc.)
  /postal/,      // postal_code …
  /postcode/,    // postcode …
];

export function isSensitive(f: string): boolean {
  const normalized = f.toLowerCase().replace(/[^a-z_]/g, "");
  if (SENSITIVE_FIELDS.has(normalized)) return true;
  // Also match by pattern so unlisted but clearly proxy-related column names
  // (e.g. "race_category", "household_income_q4", "school_district_id") are caught.
  return SENSITIVE_PATTERNS.some(re => re.test(normalized));
}
