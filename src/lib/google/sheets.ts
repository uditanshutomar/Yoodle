import { getGoogleServices } from "./client";

export interface SheetData {
  spreadsheetId: string;
  title: string;
  sheetName: string;
  values: string[][];
  webViewLink: string;
}

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  sheets: { sheetId: number; title: string }[];
  webViewLink: string;
}

/**
 * Read data from a Google Sheet range.
 */
export async function readSheet(
  userId: string,
  spreadsheetId: string,
  range = "Sheet1"
): Promise<SheetData> {
  const { sheets, drive } = await getGoogleServices(userId);

  // Use allSettled so a non-critical failure (e.g. drive metadata) doesn't
  // prevent returning the actual sheet data.
  const [dataResult, metaResult, fileResult] = await Promise.allSettled([
    sheets.spreadsheets.values.get({ spreadsheetId, range }),
    sheets.spreadsheets.get({ spreadsheetId, fields: "properties.title" }),
    drive.files.get({ fileId: spreadsheetId, fields: "webViewLink" }),
  ]);

  // The data fetch is essential — re-throw if it failed
  if (dataResult.status === "rejected") throw dataResult.reason;

  return {
    spreadsheetId,
    title: metaResult.status === "fulfilled" ? (metaResult.value.data.properties?.title || "") : "",
    sheetName: range,
    values: (dataResult.value.data.values as string[][]) || [],
    webViewLink: fileResult.status === "fulfilled"
      ? (fileResult.value.data.webViewLink || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`)
      : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

/**
 * Write data to a Google Sheet range (overwrites existing data).
 */
export async function writeSheet(
  userId: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
): Promise<{ updatedCells: number }> {
  const { sheets } = await getGoogleServices(userId);

  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  return { updatedCells: res.data.updatedCells || 0 };
}

/**
 * Append rows to the end of a Google Sheet.
 */
export async function appendToSheet(
  userId: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
): Promise<{ updatedRows: number }> {
  const { sheets } = await getGoogleServices(userId);

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });

  return { updatedRows: res.data.updates?.updatedRows || 0 };
}

/**
 * Create a new Google Spreadsheet.
 */
export async function createSpreadsheet(
  userId: string,
  title: string
): Promise<SpreadsheetInfo> {
  const { sheets } = await getGoogleServices(userId);

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
    },
    fields: "spreadsheetId,properties.title,sheets.properties,spreadsheetUrl",
  });

  return {
    spreadsheetId: res.data.spreadsheetId || "",
    title: res.data.properties?.title || title,
    sheets: (res.data.sheets || []).map((s) => ({
      sheetId: s.properties?.sheetId || 0,
      title: s.properties?.title || "Sheet1",
    })),
    webViewLink: res.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${res.data.spreadsheetId}/edit`,
  };
}

/**
 * Clear a range in a Google Sheet.
 */
export async function clearSheetRange(
  userId: string,
  spreadsheetId: string,
  range: string
): Promise<void> {
  const { sheets } = await getGoogleServices(userId);

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
  });
}
