import assert from "node:assert/strict";
import test from "node:test";
import { auditDataset, buildData, buildHeatmap, getTargetInfo, setColumnType } from "../artifacts/biasx/src/lib/audit";
import { EXAMPLE_DATASETS } from "../artifacts/biasx/src/lib/examples";
import { buildPDF } from "../artifacts/biasx/src/lib/pdf";
import { getBiasReason, getMediumRiskReason } from "../artifacts/biasx/src/lib/knowledge";

function resultFor(csv: string, target: string, feature: string) {
  const data = buildData(csv, "test.csv");
  const result = auditDataset(data, target, 0.75).find(result => result.name === feature);
  assert.ok(result, `Expected a result for ${feature}`);
  return result;
}

test("quoted CSV cells preserve commas, escaped quotes, and embedded newlines", () => {
  const data = buildData(
    '\uFEFFnote,score,approved\r\n"hello, world",10,1\r\n"said ""yes""\nnext line",20,0\r\n',
    "quoted.csv",
  );
  assert.deepEqual(data.columns, ["note", "score", "approved"]);
  assert.equal(data.rows.length, 2);
  assert.equal(data.rows[0].note, "hello, world");
  assert.equal(data.rows[1].note, 'said "yes"\nnext line');
});

test("numeric-looking text is not partially parsed as a number", () => {
  const data = buildData("location,approved\n90210-west,1\n10001-east,0", "text.csv");
  assert.equal(data.rows[0].location, "90210-west");
  assert.equal(data.columnTypes.location, "categorical");
});

test("binary categorical features and outcomes retain valid Pearson correlation", () => {
  const result = resultFor(
    "group,approved\nA,yes\nA,yes\nB,no\nB,no",
    "approved",
    "group",
  );
  assert.equal(result.pearsonApplicable, true);
  assert.ok(Math.abs(result.corr - 1) < 1e-10);
  assert.equal(result.risk, "high");
});

test("multiclass nominal categories do not receive an ordered Pearson score", () => {
  const result = resultFor(
    "region,approved\nNorth,1\nSouth,0\nWest,1\nNorth,1\nSouth,0\nWest,0",
    "approved",
    "region",
  );
  assert.equal(result.pearsonApplicable, false);
  assert.ok(!result.triggers.some(trigger => trigger.startsWith("Pearson r =")));
});

test("missing target rows do not turn a nominal column into an ordered binary feature", () => {
  const result = resultFor(
    "region,approved\nNorth,1\nNorth,1\nSouth,0\nSouth,0\nWest,",
    "approved",
    "region",
  );
  assert.equal(result.pearsonApplicable, false);
});

test("category identities preserve leading zeros and letter case", () => {
  const data = buildData(
    "region_code,approved\n001,1\n1,0\nA,1\na,0\n001,1\n1,0\nA,1\na,0",
    "identifiers.csv",
  );
  assert.equal(data.rows[0].region_code, "001");
  const result = auditDataset(data, "approved", 0.75)[0];
  assert.equal(result.pearsonApplicable, false);
  assert.ok(Math.abs(result.mi - 1) < 1e-10, "Distinct category labels must not be silently merged");
});

test("special JavaScript property names remain ordinary CSV columns", () => {
  const data = buildData(
    "__proto__,constructor,approved\nA,X,1\nA,X,1\nB,Y,0\nB,Y,0",
    "headers.csv",
  );
  assert.equal(data.rows[0]["__proto__"], "A");
  assert.equal(data.rows[0].constructor, "X");
  assert.equal(auditDataset(data, "approved", 0.75).length, 2);
  for (const name of ["__proto__", "constructor", "toString"]) {
    assert.equal(typeof getBiasReason(name), "string");
    assert.equal(typeof getMediumRiskReason(name), "string");
  }
});

test("malformed CSVs fail explicitly", () => {
  assert.throws(() => buildData("x,x\n1,2\n3,4", "duplicate.csv"), /more than once/);
  assert.throws(() => buildData('x,y\n"unclosed,1\n2,3', "quote.csv"), /never closed/);
  assert.throws(() => buildData("x,y\n1,2,3\n4,5", "width.csv"), /header has 2/);
});

test("mutual information is invariant to nominal category names", () => {
  const a = resultFor(
    "region,approved\nNorth,1\nSouth,0\nWest,1\nNorth,1\nSouth,0\nWest,0",
    "approved",
    "region",
  );
  const b = resultFor(
    "region,approved\nZ,1\nA,0\nM,1\nZ,1\nA,0\nM,0",
    "approved",
    "region",
  );
  assert.ok(Math.abs(a.mi - b.mi) < 1e-10);
});

test("group disparity is an outcome-rate gap even when binary labels are not 0/1", () => {
  const result = resultFor(
    "group,outcome\nA,10\nA,10\nB,20\nB,20",
    "outcome",
    "group",
  );
  assert.equal(result.disp, 1);
});

test("group disparity is unavailable for multiclass outcomes", () => {
  const result = resultFor(
    "group,outcome\nA,red\nA,blue\nB,green\nB,red\nA,blue\nB,green",
    "outcome",
    "group",
  );
  assert.equal(result.disp, null);
  assert.equal(result.pearsonApplicable, false);
});

test("numeric type corrections update the dataset and analysis", () => {
  const data = buildData(
    "region_code,approved\n1,1\n2,0\n3,1\n4,0",
    "types.csv",
  );
  assert.equal(data.columnTypes.region_code, "categorical");
  const corrected = setColumnType(data, "region_code", "numeric");
  assert.equal(corrected.columnTypes.region_code, "numeric");
  assert.ok(corrected.numericColumns.includes("region_code"));
  assert.equal(
    auditDataset(corrected, "approved", 0.75).find(result => result.name === "region_code")?.pearsonApplicable,
    true,
  );
  assert.equal(data.columnTypes.region_code, "categorical", "Corrections must not mutate the previous state");
});

test("missing numeric values are excluded pairwise rather than imputed as zero", () => {
  const result = resultFor(
    "score,approved\n1,1\n2,0\n,1\n3,0",
    "approved",
    "score",
  );
  assert.ok(Math.abs(result.corr - Math.sqrt(0.75)) < 1e-10);
});

test("the Tech Hiring example flags has_a_child with its measured rate gap", () => {
  const example = EXAMPLE_DATASETS.find(example => example.id === "hiring");
  assert.ok(example);
  const data = buildData(example.csv, example.fileName);
  const results = auditDataset(data, example.target, 0.75);
  const parentalStatus = results.find(result => result.name === "has_a_child");
  assert.ok(parentalStatus);
  assert.equal(parentalStatus.risk, "high");
  assert.ok(parentalStatus.disp !== null);
  assert.ok(Math.abs(parentalStatus.disp - (0.75 - 2 / 12)) < 1e-10);
  assert.equal(results.length, data.columns.length - 1);
});

test("all example datasets produce finite scores and one result per non-target column", () => {
  for (const example of EXAMPLE_DATASETS) {
    const data = buildData(example.csv, example.fileName);
    const results = auditDataset(data, example.target, 0.75);
    assert.equal(results.length, data.columns.length - 1);
    for (const result of results) {
      assert.ok(Number.isFinite(result.corr));
      assert.ok(Number.isFinite(result.mi));
      assert.ok(result.disp === null || (result.disp >= 0 && result.disp <= 1));
    }
  }
});

test("all-categorical CSVs can be analyzed", () => {
  const data = buildData(
    "department,decision\nResearch,yes\nResearch,no\nSales,yes\nSales,no",
    "categorical.csv",
  );
  assert.equal(data.numericColumns.length, 0);
  assert.equal(auditDataset(data, "decision", 0.75).length, 1);
});

test("the heatmap includes every dataset column and is symmetric", () => {
  for (const example of EXAMPLE_DATASETS) {
    const data = buildData(example.csv, example.fileName);
    const matrix = buildHeatmap(data, data.columns);
    assert.equal(matrix.length, data.columns.length);
    matrix.forEach((row, i) => {
      assert.equal(row.length, data.columns.length);
      row.forEach((cell, j) => {
        assert.ok(Number.isFinite(cell.value));
        assert.ok(cell.value >= 0 && cell.value <= 1);
        assert.ok(Math.abs(cell.value - matrix[j][i].value) < 1e-10);
      });
    });
  }
});

test("PDF generation includes the analysis, methodology, and all example features", () => {
  for (const example of EXAMPLE_DATASETS) {
    const data = buildData(example.csv, example.fileName);
    const results = auditDataset(data, example.target, 0.75);
    const doc = buildPDF(data.fileName, results, example.target, 0.75, getTargetInfo(data, example.target).note);
    const raw = doc.output();
    assert.ok(raw.startsWith("%PDF-"));
    assert.ok(doc.getNumberOfPages() >= 3);
    assert.ok(raw.includes("Feature Risk Analysis"));
    assert.ok(raw.includes("Recommendations"));
    assert.ok(raw.includes("not proof of bias"));
    for (const result of results) assert.ok(raw.includes(result.name), `Missing ${result.name} from PDF`);
  }
});
