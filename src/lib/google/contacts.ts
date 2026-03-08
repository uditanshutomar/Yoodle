import { getGoogleServices } from "./client";

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
export async function listContacts(
  userId: string,
  options: { maxResults?: number; query?: string } = {}
): Promise<Contact[]> {
  const { people } = await getGoogleServices(userId);

  if (options.query) {
    const res = await people.people.searchContacts({
      query: options.query,
      readMask: "names,emailAddresses,phoneNumbers,organizations,photos",
      pageSize: options.maxResults || 20,
    });

    return (res.data.results || [])
      .map((r) => r.person)
      .filter(Boolean)
      .map(formatContact);
  }

  const res = await people.people.connections.list({
    resourceName: "people/me",
    pageSize: options.maxResults || 50,
    personFields: "names,emailAddresses,phoneNumbers,organizations,photos",
    sortOrder: "LAST_MODIFIED_DESCENDING",
  });

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatContact(person: any): Contact {
  return {
    resourceName: person.resourceName || "",
    name:
      person.names?.[0]?.displayName ||
      person.emailAddresses?.[0]?.value ||
      "Unknown",
    email: person.emailAddresses?.[0]?.value,
    phone: person.phoneNumbers?.[0]?.value,
    organization: person.organizations?.[0]?.name,
    photoUrl: person.photos?.[0]?.url,
  };
}
