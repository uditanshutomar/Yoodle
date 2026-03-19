import { getGoogleServices } from "./client";
import { withGoogleRetry } from "./retry-wrapper";
import { people_v1 } from "googleapis";

export interface Contact {
  resourceName: string;
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
  photoUrl?: string;
}

/**
 * List the user's contacts.
 */
async function listContacts(
  userId: string,
  options: { maxResults?: number; query?: string } = {}
): Promise<Contact[]> {
  const { people } = await getGoogleServices(userId);

  if (options.query) {
    const res = await withGoogleRetry(() => people.people.searchContacts({
      query: options.query,
      readMask: "names,emailAddresses,phoneNumbers,organizations,photos",
      pageSize: options.maxResults || 20,
    }));

    return (res.data.results || [])
      .map((r) => r.person)
      .filter((p): p is people_v1.Schema$Person => Boolean(p))
      .map(formatContact);
  }

  const res = await withGoogleRetry(() => people.people.connections.list({
    resourceName: "people/me",
    pageSize: options.maxResults || 50,
    personFields: "names,emailAddresses,phoneNumbers,organizations,photos",
    sortOrder: "LAST_MODIFIED_DESCENDING",
  }));

  return (res.data.connections || []).map(formatContact);
}

/**
 * Search contacts by name or email.
 */
export async function searchContacts(
  userId: string,
  query: string,
  maxResults = 10
): Promise<Contact[]> {
  return listContacts(userId, { query, maxResults });
}

function formatContact(person: people_v1.Schema$Person): Contact {
  return {
    resourceName: person.resourceName || "",
    name:
      person.names?.[0]?.displayName ||
      person.emailAddresses?.[0]?.value ||
      "Unknown",
    email: person.emailAddresses?.[0]?.value ?? undefined,
    phone: person.phoneNumbers?.[0]?.value ?? undefined,
    organization: person.organizations?.[0]?.name ?? undefined,
    photoUrl: person.photos?.[0]?.url ?? undefined,
  };
}
