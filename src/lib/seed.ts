// Starting resources, saved once into the database the first time you sign in.
// After that they live in Supabase and can be edited, replaced or deleted in the app.
export const SEED_RESOURCES = [
  {
    key: "discovery_call",
    name: "Free Discovery / Reach-Out Call",
    url: "https://calendly.com/michael-michaelwatsoncoach/discuss-working-with-me",
    category: "Booking",
    purpose: "Calendly link for the discovery call with Michael. Free, no obligation.",
  },
  {
    key: "peaceful_path_page",
    name: "Peaceful Path Information Page",
    url: "https://www.rebornwithmichael.com/peaceful-path",
    category: "Information",
    purpose: "Details about the Peaceful Path, a paid four-month programme.",
  },
  {
    key: "peaceful_path_video",
    name: "Peaceful Path Video",
    url: "https://youtu.be/O0gS7pvoFyU",
    category: "Information",
    purpose: "Video explaining how the Peaceful Path works and what it costs.",
  },
  {
    key: "private_session",
    name: "Private One-to-One Session",
    url: "https://www.rebornwithmichael.com/private-sessions",
    category: "Paid option",
    purpose: "Single paid private session page.",
  },
  {
    key: "free_30_day_series",
    name: "Free 30-Day Letting Go Coaching Series",
    url: "https://www.rebornwithmichael.com/30-days-of-inspiration",
    category: "Free resource",
    purpose: "Separate free resource: a daily message for 30 days.",
  },
];
