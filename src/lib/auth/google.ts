import { google } from "googleapis";

// All Google Workspace scopes for full suite access
const GOOGLE_SCOPES = [
  // Basic profile
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",

  // Gmail — read, send, manage
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",

  // Google Calendar — full access
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",

  // Google Drive — full access
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",

  // Google Docs — full access
  "https://www.googleapis.com/auth/documents",

  // Google Sheets — full access
  "https://www.googleapis.com/auth/spreadsheets",

  // Google Slides — full access
  "https://www.googleapis.com/auth/presentations",

  // Google Tasks
  "https://www.googleapis.com/auth/tasks",

  // Google Contacts (People API)
  "https://www.googleapis.com/auth/contacts.readonly",
];

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Create a new OAuth2 client instance.
 */
export function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate the Google OAuth consent URL.
 * Uses `access_type: "offline"` to get a refresh token and
 * `prompt: "consent"` to always show the consent screen (ensures refresh token).
 */
export function getGoogleAuthUrl(state?: string): string {
  const client = createOAuth2Client();

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state: state || undefined,
  });
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Fetch the Google user profile using an access token.
 */
export async function getGoogleUserProfile(accessToken: string) {
  const client = createOAuth2Client();
  client.setCredentials({ access_token: accessToken });

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  return {
    googleId: data.id!,
    email: data.email!,
    name: data.name || data.email!,
    avatarUrl: data.picture || undefined,
  };
}

/**
 * Create an authenticated OAuth2 client from stored user tokens.
 * Automatically refreshes expired access tokens.
 */
export function createAuthenticatedClient(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}) {
  const client = createOAuth2Client();

  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt.getTime(),
  });

  return client;
}

export { GOOGLE_SCOPES };
