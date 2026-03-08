import { getGoogleServices } from "./client";

export interface SheetData {
  spreadsheetId: string;
  title: string;
  sheets: { sheetId: number; title: string }[];
}

/**
 * Get spreadsheet metadata (sheet names, etc.).
 */
export async function getSpreadsheet(
  userId: string,
  spreadsheetId: string
): Promise<SheetData> {
  const { sheets } = await getGoogleServices(userId);

  const res = await sheets.spreadsheets.get({ spreadsheetId });

  return {
    spreadsheetId: res.data.spreadsheetId || spreadsheetId,
    title: res.data.properties?.title || "",
    sheets: (res.data.sheets || []).map((s) => ({
      sheetId: s.properties?.sheetId || 0,
      title: s.properties?.title || "",
    })),
  };
}

/**
 * Read values from a range in a spreadsheet.
 */
export async function readSheet(
  userId: string,
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const { sheets } = await getGoogleServices(userId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return (res.data.values as string[][]) || [];
}

/**
 * Write values to a range in a spreadsheet.
 */
export async function writeSheet(
  userId: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
): Promise<{ updatedRows: number; updatedColumns: number }> {
  const { sheets } = await getGoogleServices(userId);

  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  return {
    updatedRows: res.data.updatedRows || 0,
    updatedColumns: res.data.updatedColumns || 0,
  };
}

/**
 * Append rows to the end of a spreadsheet.
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
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });

  return {
    updatedRows: res.data.updates?.updatedRows || 0,
  };
}

/**
 * Clear values from a range.
 */
export async function clearSheet(
  userId: string,
  spreadsheetId: string,
  range: string
): Promise<void> {
  const { sheets } = await getGoogleServices(userId);

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
    requestBody: {},
  });
}
