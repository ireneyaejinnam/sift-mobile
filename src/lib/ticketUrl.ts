/**
 * Checks if a URL is from a known ticket vendor.
 * Only show "Get Tickets" button for these domains.
 * Other URLs get "View Event" instead.
 */

const TICKET_DOMAINS = [
  'ticketmaster.com',
  'eventbrite.com',
  'dice.fm',
  'shotgun.live',
  'seetickets.com',
  'universe.com',
  'ra.co',
  'axs.com',
  'ticketweb.com',
  'stubhub.com',
  'seatgeek.com',
  'livenation.com',
  'feverup.com',
];

export function isTicketVendorUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return TICKET_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
