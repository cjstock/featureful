/**
 * Static demo data for `npm run seed`: people, and Requests for a coffee-tracking app.
 *
 * `group` is only a hint for readers (and the offline fake Matcher used by `--dry-run`):
 * Requests sharing a group are deliberate near-duplicates that the real Matcher should
 * put on one Problem. The real seed never sends `group` to the AI.
 */

export type SeedRole = "customer" | "support_agent" | "pm";

export const SEED_PEOPLE: { name: string; role: SeedRole }[] = [
  { name: "Alex", role: "customer" },
  { name: "Priya", role: "customer" },
  { name: "Marco", role: "customer" },
  { name: "Hana", role: "customer" },
  { name: "Lucas", role: "customer" },
  { name: "Ines", role: "customer" },
  { name: "Tomás", role: "customer" },
  { name: "Wen", role: "customer" },
  { name: "Dana", role: "support_agent" },
  { name: "Sam", role: "pm" },
];

export type SeedRequest = {
  /** Unique key, used to attach extra Support to whichever Problem this Request lands on. */
  key: string;
  group: string;
  author: string;
  /** Backdates the Request so the demo has a history. */
  daysAgo: number;
  title: string;
  description: string;
};

export const SEED_REQUESTS: SeedRequest[] = [
  {
    key: "export-csv-alex",
    group: "export",
    author: "Alex",
    daysAgo: 58,
    title: "Export my roast logs to CSV",
    description:
      "I have two years of roast logs in here and no way to get them out. I want a CSV with every roast (date, bean, batch weight, charge temp, first crack time, drop temp, weight loss) so I can analyse it in a spreadsheet.",
  },
  {
    key: "ratio-priya",
    group: "ratio",
    author: "Priya",
    daysAgo: 55,
    title: "Brew ratio calculator",
    description:
      "When I change my dose I always end up doing the maths on my phone calculator. Let me type a dose and a ratio like 1:16 and tell me how much water to pour, inside the brew screen.",
  },
  {
    key: "inventory-tomas",
    group: "inventory",
    author: "Tomás",
    daysAgo: 53,
    title: "Track how much green coffee I have left",
    description:
      "I buy green beans in 5 kg bags from three importers. Every roast should subtract the batch weight from that bean's stock so I know when I'm about to run out. Right now I keep a separate notebook for this.",
  },
  {
    key: "grinder-marco",
    group: "grinder",
    author: "Marco",
    daysAgo: 51,
    title: "Save grinder setting per bean",
    description:
      "My Comandante setting is different for every bean and brew method. When I log a brew I'd like the app to remember the click number I used for that bean so next time I start from the right setting instead of guessing.",
  },
  {
    key: "artisan-lucas",
    group: "import",
    author: "Lucas",
    daysAgo: 49,
    title: "Import Artisan .alog roast profiles",
    description:
      "I roast with Artisan on a laptop next to my Bullet. Re-typing temperatures and times into the app after every roast is tedious and error prone. Please let me upload the .alog file and fill the roast log from it.",
  },
  {
    key: "export-dana",
    group: "export",
    author: "Dana",
    daysAgo: 47,
    title: "Customers asking how to download their data",
    description:
      "Third ticket this month from a customer who wants a copy of all their roasting and brewing history before switching laptops / 'in case you shut down'. We have to tell them there's no export. A self-serve download would save us these tickets.",
  },
  {
    key: "repeat-priya",
    group: "repeat",
    author: "Priya",
    daysAgo: 45,
    title: "'Brew again' button on a past brew",
    description:
      "When a cup comes out great I want to repeat it exactly the next morning. A button on the brew log that copies dose, grind, water temp, ratio and pour schedule into a new brew would be perfect.",
  },
  {
    key: "darkmode-alex",
    group: "darkmode",
    author: "Alex",
    daysAgo: 44,
    title: "Dark mode",
    description: "I log my first brew at 6am and the white screen is blinding. Please add a dark theme.",
  },
  {
    key: "ratio-wen",
    group: "ratio",
    author: "Wen",
    daysAgo: 42,
    title: "Scale recipe to a different cup size",
    description:
      "I found a V60 recipe for 15 g but I want to make 22 g for two people. Can the app scale the water and the pour steps automatically for a new dose while keeping the ratio?",
  },
  {
    key: "rest-wen",
    group: "rest",
    author: "Wen",
    daysAgo: 40,
    title: "Remind me when a roast has rested enough",
    description:
      "I always forget which bags are ready. I'd like to set a rest period (e.g. 7 days for espresso, 3 for filter) and get a reminder or a 'ready' badge when the roast has degassed long enough.",
  },
  {
    key: "inventory-alex",
    group: "inventory",
    author: "Alex",
    daysAgo: 38,
    title: "Green bean stock levels",
    description:
      "Would love a pantry view showing each green coffee and how many grams are left after all the roasts I've logged, with a warning when one drops below a batch or two.",
  },
  {
    key: "cupping-tomas",
    group: "cupping",
    author: "Tomás",
    daysAgo: 36,
    title: "Cupping scores for each roast",
    description:
      "I cup my roasts on day 3 and want to record SCA-style scores (aroma, acidity, body, sweetness, aftertaste) against the roast, so I can see which profile tasted best for a given bean.",
  },
  {
    key: "export-hana",
    group: "export",
    author: "Hana",
    daysAgo: 34,
    title: "Backup / JSON export of everything",
    description:
      "I don't want my roasting history locked in one app. Give me a full export (beans, roasts, brews, recipes) in an open format like JSON that I could re-import or use elsewhere.",
  },
  {
    key: "social-marco",
    group: "social",
    author: "Marco",
    daysAgo: 32,
    title: "Share recipes with other users and follow people",
    description:
      "It would be fun to publish my recipes, follow other home baristas and like their brews, like a feed inside the app.",
  },
  {
    key: "grinder-ines",
    group: "grinder",
    author: "Ines",
    daysAgo: 30,
    title: "Remember my grind size for each coffee",
    description:
      "Every time I switch bags I lose track of where I had the grinder dialed in. I want the last grind setting that worked for this coffee shown when I start a new brew with it.",
  },
  {
    key: "water-ines",
    group: "water",
    author: "Ines",
    daysAgo: 28,
    title: "Log the water recipe I brew with",
    description:
      "I make my own brewing water (Third Wave Water, or my own Mg/K recipe). It changes extraction a lot, but there's no field for it, so I can't tell which water a good brew used.",
  },
  {
    key: "cafe-dana",
    group: "cafe",
    author: "Dana",
    daysAgo: 26,
    title: "Multi-user accounts for a small roastery",
    description:
      "A customer who runs a small cafe roastery asked for team accounts so three roasters can share the same roast logs and bean stock, with per-person logins.",
  },
  {
    key: "ratio-marco",
    group: "ratio",
    author: "Marco",
    daysAgo: 24,
    title: "Show the ratio automatically",
    description:
      "I enter dose and water weight but the app doesn't show the resulting ratio. Calculate it for me (and let me enter it the other way round, ratio to water) so I don't do the arithmetic.",
  },
  {
    key: "scale-lucas",
    group: "scale",
    author: "Lucas",
    daysAgo: 22,
    title: "Connect my Bluetooth scale (Acaia / Timemore)",
    description:
      "Typing the final weight and brew time is the most annoying part of logging. If the app could read my Acaia Pearl over Bluetooth it could log the pour curve and total time for me.",
  },
  {
    key: "offline-hana",
    group: "offline",
    author: "Hana",
    daysAgo: 20,
    title: "Works offline in my garage",
    description:
      "I roast in the garage where there's no Wi-Fi. The app spins forever and I lose the roast I was entering. I need to log a roast offline and have it sync later.",
  },
  {
    key: "weightloss-tomas",
    group: "weightloss",
    author: "Tomás",
    daysAgo: 18,
    title: "Auto-calculate roast weight loss %",
    description:
      "I enter green weight and roasted weight for every batch. Please compute the weight loss percentage and show it in the roast list; it's my main indicator of roast degree.",
  },
  {
    key: "export-lucas",
    group: "export",
    author: "Lucas",
    daysAgo: 16,
    title: "Send roast data to Google Sheets",
    description:
      "I keep a big roasting spreadsheet with charts. A way to get my roast logs out of the app into Sheets (even just a CSV download) would mean I stop double-entering everything.",
  },
  {
    key: "repeat-ines",
    group: "repeat",
    author: "Ines",
    daysAgo: 14,
    title: "Save a brew as a reusable recipe",
    description:
      "When I nail a brew I want to turn it into a recipe and start my next brews from it, with the same dose, grind, temperature and pours pre-filled, then just note what changed.",
  },
  {
    key: "inventory-dana",
    group: "inventory",
    author: "Dana",
    daysAgo: 12,
    title: "Users confused that bean weight doesn't go down",
    description:
      "Several support chats this week: people log roasts and expect the green coffee weight on the bean page to decrease. It's just a static field they typed once. They keep asking how to see what's left.",
  },
  {
    key: "units-wen",
    group: "units",
    author: "Wen",
    daysAgo: 9,
    title: "Fahrenheit and ounces",
    description:
      "My roaster reads in Fahrenheit and I buy beans by the pound. Let me choose units (°C/°F, g/oz/lb) instead of converting everything to metric by hand.",
  },
  {
    key: "artisan-hana",
    group: "import",
    author: "Hana",
    daysAgo: 6,
    title: "Upload roast curve from my roasting software",
    description:
      "My Kaffelogic exports a log file after every roast. I'd like to attach it so the app shows the bean temperature curve and fills in first crack and development time automatically.",
  },
];

/** Customers who Support a Problem without having submitted a Request for it (keyed by a Request on that Problem). */
export const SEED_EXTRA_SUPPORT: { request: string; people: string[] }[] = [
  { request: "export-csv-alex", people: ["Ines", "Wen", "Priya", "Tomás"] },
  { request: "ratio-priya", people: ["Hana", "Tomás"] },
  { request: "inventory-tomas", people: ["Marco", "Hana"] },
  { request: "repeat-priya", people: ["Hana", "Lucas", "Wen"] },
  { request: "grinder-marco", people: ["Priya"] },
  { request: "scale-lucas", people: ["Wen", "Priya"] },
  { request: "offline-hana", people: ["Lucas"] },
  { request: "artisan-lucas", people: ["Tomás"] },
];
