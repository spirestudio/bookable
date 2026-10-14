/* Blog queue. Each post goes live at its `time` (UK time, default 09:00) on its `date`; the Worker decides, no redeploy needed.
   Morning posts live here, afternoon ones (15:00) in posts-more.mjs. To add more: append with the next free date and time. Body format: blank line = new paragraph,
   "## " = heading, lines starting "- " = bullet list. cta is the Bookable page the post links to. */

import { MORE } from './posts-more.mjs';

const BASE = [
  {
    slug: 'stop-no-shows-barbershop', date: '2026-10-13', cta: '/barbers/', ctaLabel: 'See Bookable for barbers',
    title: 'How to stop no-shows at your barbershop',
    description: 'Empty chairs cost a solo barber real money. Six simple ways to cut no-shows and late cancellations without upsetting your regulars.',
    body: `
A client who does not turn up is not just a missed haircut. It is a slot you could have given to someone else, and when you work alone that gap is simply unpaid time. The good news is that most no-shows are not rude people. They forgot, or something came up and cancelling felt awkward.

## 1. Send a reminder the day before
This is the single biggest fix. A short message the day before, with the time in it, catches most of the forgetful ones. Keep it friendly: "Hi Sam, just a reminder you're booked in tomorrow at 3.30. Let me know if you need to move it."

## 2. Make it easy to change
If cancelling means a phone call, people avoid it and just do not come. Tell them they can message you any time before, and that you would rather know than wait.

## 3. Ask them to reply YES
A one-word confirmation tells you who is actually coming. If someone has not replied by the evening before, you can offer the slot to a waiting client.

## 4. Have a simple, fair policy
You do not need anything harsh. Something like "Please give me 24 hours' notice if you can't make it" is enough, and saying it once on your booking page means you never have to argue about it.

## 5. Keep a short waiting list
When a slot opens up, message a regular who has asked for an earlier time. A cancellation then costs you nothing.

## 6. Do not let bookings get lost in DMs
Many no-shows happen because the booking was agreed in a chat that scrolled away. When clients book from a link, the time is written down in a calendar for both of you.

## The takeaway
Reminders, an easy way to change plans and one clear policy fix most no-shows. If you want the booking, the calendar and the reminder messages in one place, Bookable does exactly that for solo barbers.
`,
  },
  {
    slug: 'booking-link-instagram-bio-barber', date: '2026-10-13', time: '06:05', cta: '/barbers/', ctaLabel: 'Get your booking link',
    title: 'How to put a booking link in your Instagram bio',
    description: 'A step-by-step guide for barbers, nail techs and dog walkers: add one booking link to your Instagram bio so clients stop booking by DM.',
    body: `
If clients book you by messaging "any slots Saturday?", you already know how much time that takes. A booking link in your Instagram bio lets them pick a time themselves, while you get on with the job.

## What a booking link is
It is a web address that opens your own booking page. The client chooses a service, a day and a time, types their name and number, and it appears in your calendar. They do not need an account.

## How to add it to Instagram
- Open your profile and tap Edit profile.
- Tap Links, then Add external link.
- Paste your booking link and save.
- In your bio, add a short line such as "Book here 👇" so people know what the link is for.

## Make people actually use it
- Put the link in your bio, not only in a post. It is the first place people look.
- Reply to "are you free Friday?" DMs with the link instead of going back and forth. After a couple of weeks, regulars start using it without being asked.
- Add it to your WhatsApp status and business description too.
- Say what the link is called. "Book an appointment" gets more taps than a bare web address.

## What to check first
Open the link on your own phone before you share it. Make sure the services, prices and times look right, because that is exactly what your clients will see.

## The takeaway
One link, in the right place, replaces dozens of messages a week. Bookable gives every barber, nail technician and dog walker their own booking page, free for 7 days.
`,
  },
  {
    slug: 'nail-technician-booking-dms-time', date: '2026-10-13', time: '06:14', cta: '/nail-technicians/', ctaLabel: 'See Bookable for nail technicians',
    title: 'How much time do nail technicians lose to booking DMs?',
    description: 'Booking by message feels free, but the back-and-forth adds up. A quick way for a solo nail technician to work out what it really costs.',
    body: `
Taking bookings over Instagram and WhatsApp feels like it costs nothing. In reality every booking is a small conversation: what set, which day, is that time free, what about this one, can you do an infill. It adds up quickly.

## Work out your own number
Try this for one normal week:
- Count how many bookings you took by message.
- Guess how many messages each one took. Three to six back and forth is common.
- Guess a minute or so for each message, including the interruptions.

Multiply it out. Many solo technicians land on a few hours a week, often in the evening when they would rather be off.

## The hidden cost
The time is only part of it. Messages arrive while you are mid-set, so you either stop or reply late. A client who waits a day for an answer may book somewhere that confirms instantly.

## What changes with a booking link
When a client can see your free times and pick one, the conversation shrinks to nothing. They choose "Gel infill, Thursday 2pm", add a note about the design, and you see it in your calendar. You still message them for the personal touch, but you are no longer the one managing a diary by hand.

## It also protects your time
A booking page can include your rules: how far ahead people can book, a gap between clients for cleaning down, and the days you do not work. You stop getting asked for 9pm on a Sunday.

## The takeaway
If booking by DM is taking you more than an hour or two a week, it is worth changing. Bookable gives you a booking link, a calendar and WhatsApp reminders for £14.99 a month after a free trial.
`,
  },
  {
    slug: 'dog-walker-booking-questions', date: '2026-10-13', time: '06:23', cta: '/dog-walkers/', ctaLabel: 'See Bookable for dog walkers',
    title: 'What to ask every new dog walking client',
    description: 'The questions a dog walker should always ask before the first walk, and how to collect the answers automatically when someone books.',
    body: `
A good first walk starts before you reach the door. The more you know about the dog and the owner, the safer and smoother it is for everyone. Here is what to ask every new client.

## About the dog
- Name, breed and age.
- Any health problems or medication.
- How they behave with other dogs, children and strangers.
- Do they pull, jump or run off? Are they let off the lead?
- Any fears, such as traffic or fireworks.

## About the walk
- How long, and how often?
- Where do you collect them, and how do you get in?
- What should happen after the walk: water, towel, treats, any food rules?

## About emergencies
- Which vet do they use, and the phone number.
- A second contact if you cannot reach the owner.
- Whether you can take the dog to the vet if needed.

## Collect it at booking
Asking all of this over messages is slow and things get missed. A better way is to ask the one key question when someone books. For example, a booking form can ask for "Your dog's name and anything I should know", and make it required, so you never get a booking with nothing in it.

## Keep it with the booking
When the note sits with the appointment in your calendar, you see "Biscuit, nervous around bikes" right when you open the day, not buried in a chat from three weeks ago.

## The takeaway
Ask the same questions every time and keep the answers where you will see them. Bookable lets dog walkers add their own question to the booking page and shows the answer with each booking.
`,
  },
  {
    slug: 'free-vs-paid-booking-apps-small-business', date: '2026-10-13', time: '06:32', cta: '/pricing/', ctaLabel: 'See Bookable pricing',
    title: 'Free vs paid booking apps: what you really pay for',
    description: 'Free booking tools often charge in other ways. Here is what to look for before you hand your clients to a booking app.',
    body: `
Plenty of booking apps are free, and for some businesses that is the right choice. But "free" often comes with a catch, so it is worth knowing what you are really signing up for.

## How free apps make money
- **Fees on bookings or deposits.** The app takes a cut each time a client pays.
- **Upgrades for basics.** The free plan limits clients, services or reminders, and the useful part costs extra.
- **Marketplace listings.** Your clients are shown to other businesses nearby.
- **Your data.** Some tools use client details for their own marketing.

None of that is automatically wrong, but you should know which one applies.

## What a paid plan usually gives you
A fixed monthly price tends to mean no cut of your income, no limit on bookings and nobody advertising to your clients. For a solo business with steady regulars, a flat fee is often easier to budget for.

## Questions to ask any booking app
- What exactly does it cost per month, and what is extra?
- Does it take a percentage of what my clients pay?
- Who owns my client list, and can I take it with me?
- Can I delete everything if I leave?
- What happens to bookings if the app has a problem?
- Can I try it without putting in a card?

## What matters most for a one-person business
Simplicity. If you cannot set it up in a few minutes and understand it at a glance, you will go back to messages. The best booking app is the one you and your clients will actually use.

## The takeaway
Look past the headline price. Bookable is a flat £14.99 a month after 7 days free, with no cut of your bookings and no card needed during early access.
`,
  },
  {
    slug: 'barber-opening-hours-buffer-times', date: '2026-10-13', time: '06:41', cta: '/barbers/', ctaLabel: 'See Bookable for barbers',
    title: 'Setting barber opening hours and buffer times that work',
    description: 'How solo barbers can set sensible hours, gaps between cuts and booking limits so the day runs smoothly instead of running late.',
    body: `
Running late is stressful for you and annoying for the next client. Most of the time it is not slow cutting, it is a diary with no breathing room. A few settings fix it.

## Be realistic about service length
If a skin fade takes you 45 minutes, book it as 45, not 30 because that is what you would like. Time each service for a week and use the real number. Clients do not mind a slightly longer slot. They mind waiting.

## Add a buffer between clients
A five or ten minute gap lets you sweep up, wipe down, take payment and breathe. It also absorbs the chat that always runs on a few minutes. Over a day those small gaps are the difference between finishing on time and falling behind by an hour.

## Set days you do not take bookings
Decide your working days and hours and stick to them. If you take Mondays off, your booking page should simply not offer Mondays, so you never have to say no.

## Limit how far ahead people can book
Booking six months out sounds good, but plans change. Many barbers allow bookings four to eight weeks ahead, which keeps the diary useful without filling with maybes.

## Require a little notice
A minimum lead time, such as two hours, stops someone booking a slot that starts while you are in the middle of another cut.

## Block your own time
Dentist, lunch, a day away: mark them as time off so no one can book over them.

## The takeaway
Honest timings, a small buffer and clear opening days make a calmer, more profitable day. Bookable lets you set all of these once and the booking page follows them automatically.
`,
  },
  {
    slug: 'whatsapp-appointment-reminder-templates', date: '2026-10-13', time: '06:50', cta: '/barbers/', ctaLabel: 'Try Bookable reminders',
    title: 'WhatsApp appointment reminder templates you can copy',
    description: 'Short, friendly reminder and confirmation messages for barbers, nail technicians and dog walkers. Copy, change the details and send.',
    body: `
A good reminder is short, friendly and includes the details people need. Here are templates you can copy and adjust to sound like you.

## Booking confirmation
"Hi Sam, you're booked in for a skin fade on Tuesday at 3.30. See you then! Message me here if anything changes."

## Day-before reminder
"Hi Sam, quick reminder you're in tomorrow at 3.30. Reply YES to confirm, or let me know if you need to move it."

## Same-day reminder
"Hi Sam, see you at 3.30 today. I'm at the same place as last time."

## For nail technicians
"Hi Jess, you're booked for a gel infill on Thursday at 2pm. Could you remove any old nail art before you come? Thank you!"

## For dog walkers
"Hi Alex, Biscuit's walk is tomorrow at 12. I'll collect him from the usual place. Please let me know if anything has changed."

## If someone has not replied
"Hi Sam, just checking you can still make Tuesday at 3.30? If not, no problem, just tell me and I'll offer it to someone else."

## Tips that make reminders work
- Use their first name.
- Include the day and the time, written clearly.
- Make it easy to reply: ask for one word, like YES.
- Send from your own number so it feels personal.
- Keep it to a couple of lines.

## A note on privacy
Only use someone's phone number to message them about their booking. Do not add clients to groups or send promotions unless they have said they would like them.

## The takeaway
Reminders save you far more time than they take. Bookable writes messages like these for each booking and opens WhatsApp with them ready for you to send.
`,
  },
  {
    slug: 'handle-late-cancellations-politely', date: '2026-10-13', time: '06:59', cta: '/barbers/', ctaLabel: 'See Bookable for barbers',
    title: 'How to handle late cancellations without losing the client',
    description: 'Late cancellations happen. Here is how solo barbers, nail techs and dog walkers can stay polite, protect their time and keep their regulars.',
    body: `
Someone cancels half an hour before their slot. You feel annoyed, but you also do not want to lose a regular. A calm, clear approach protects both.

## Decide your policy before it happens
It is much easier to be fair when you have already decided. Common choices:
- Free to change with 24 hours' notice.
- A friendly warning the first time, a deposit next time.
- A cancellation fee for repeated late changes.

Pick something you are comfortable enforcing every time.

## Say it once, where people will see it
Put your policy on your booking page and in your confirmation message. When it is written down in advance, it feels like a normal rule, not a telling-off.

## Respond kindly, but clearly
"No problem, thanks for letting me know. I'd normally ask for 24 hours' notice, so please try to give me a bit more next time. Want me to find you another slot?"

That message is polite, it states the rule and it offers a way forward.

## Try to refill the gap
Keep a short list of people who would like an earlier slot. A quick message to them can turn a cancellation into a booked appointment.

## Know when to be flexible
Illness, a family emergency, a genuine mistake: a regular who is usually reliable deserves some grace. Being generous when it matters earns loyalty.

## Know when to be firm
If the same person cancels late again and again, it is fine to ask for a deposit or limit their bookings. You are running a business.

## The takeaway
Clear rules plus a kind tone keep both your income and your clients. Bookable shows your upcoming bookings and sends reminders so fewer people cancel at the last minute in the first place.
`,
  },
  {
    slug: 'how-many-appointments-solo-barber-day', date: '2026-10-21', cta: '/barbers/', ctaLabel: 'See Bookable for barbers',
    title: 'How many appointments can a solo barber fit in a day?',
    description: 'A simple way for a one-chair barber to work out how many clients fit in a day, with real slot lengths and breaks.',
    body: `
It is easy to guess that a barber fits "about ten" people in a day. A quick calculation gives you a number you can plan and price around.

## Start with your working hours
Say you work 9am to 5.30pm. That is eight and a half hours, or 510 minutes.

## Take off your breaks
Subtract lunch and any other breaks. If you take 30 minutes, you now have 480 minutes of chair time.

## Add the real length of each service
Time each service honestly, including talking, finishing and taking payment:
- Haircut: 30 minutes.
- Skin fade: 45 minutes.
- Beard trim: 20 minutes.
- Haircut and beard: 60 minutes.

## Add a buffer
A five minute gap between clients is normal. With 480 minutes and an average slot of 40 minutes plus a 5 minute buffer, you fit roughly ten or eleven clients.

## Do the money sum
Multiply the number of clients by your average price. If it is £20, ten clients is £200 a day. That is a number you can compare with your costs and your goals, and it shows what a single empty slot is worth.

## Where the gaps hide
Most days fall short of the maximum because of dead time: a client cancels, there are 15 minutes nobody can use, or a long service lands awkwardly. A booking page that offers slots which fit together neatly reduces those gaps.

## The takeaway
Know your real service times and buffer, and you can plan your day and your pricing with confidence. Bookable builds your available times from the lengths and gaps you set, so clients can only book slots that actually fit.
`,
  },
  {
    slug: 'what-to-put-on-your-booking-page', date: '2026-10-22', cta: '/pricing/', ctaLabel: 'Create your booking page',
    title: 'What to put on your booking page so people actually book',
    description: 'A good booking page is short and clear. Here is what a barber, nail tech or dog walker should include, and what to leave out.',
    body: `
Your booking page has one job: help someone pick a time in under a minute. The best ones are simple. Here is what to include.

## Your name and what you do
One clear line. "Joe's Barbers, Lichfield" tells people immediately that they are in the right place.

## A short, friendly intro
One or two sentences. Say how to reach you if plans change. "If you need to move your appointment, message me on WhatsApp" is perfect.

## A short list of services with prices and times
People want to know what it costs and how long it takes. Keep the list tight. Four to six services is plenty. Clear names beat clever ones: "Skin fade, 45 min, £22".

## Easy-to-see free times
Show real availability so nobody has to ask. If the next free slot is on Thursday, they will see that instantly.

## One simple question
Ask only for what you need. For a barber it might be "Anything I should know?" For a dog walker it might be "Your dog's name and anything I should know".

## Your policy in one line
For example, "Please give 24 hours' notice if you need to cancel." Said once, politely, in advance.

## What to leave out
- Long paragraphs nobody will read.
- Too many services.
- Anything that makes booking feel like filling in a tax form.

## Check it on your phone
Almost all your clients will use a phone. Open your page, book a pretend appointment and see how it feels.

## The takeaway
Short, honest and easy beats fancy. Bookable's booking pages are set up this way by default, and you can change the wording, services and colour in a few minutes.
`,
  },
  {
    slug: 'do-i-need-a-website-if-i-have-instagram', date: '2026-10-23', cta: '/pricing/', ctaLabel: 'See what Bookable includes',
    title: 'Do I need a website if I already have Instagram?',
    description: 'For many barbers, nail techs and dog walkers, Instagram plus a booking link is enough. Here is when a full website is worth it.',
    body: `
Instagram is a great shop window, but it has limits. The question is whether you also need a website, and the answer depends on what you want clients to do.

## What Instagram does well
It shows your work, builds a following and lets people get a feel for you. For a barber or nail technician, great photos do most of the selling.

## Where Instagram falls short
- It is hard to show prices and opening times clearly.
- Booking happens in messages, which is slow.
- People who are not on Instagram cannot easily find you.
- You do not control the platform. If your account has a problem, your shop window disappears.

## The middle option: a booking link
You do not need a full website to fix most of that. A booking link in your bio gives you a simple page with your services, prices, free times and a way to book. It is quick to set up and works on a phone.

## When a full website is worth it
- You want to appear when people search Google for your trade in your town.
- You have a lot to explain, such as courses, packages or a team.
- You want to look established to new customers who have never heard of you.

If that is you, a small, well-made website can be worth the money, ideally with a Google Business profile so you show up on the map.

## A simple order of priorities
1. Good photos on Instagram.
2. A booking link in your bio.
3. A Google Business profile.
4. A website, when you are ready.

## The takeaway
For most solo businesses, Instagram plus a booking link covers the essentials. Bookable is built for step two, and costs £14.99 a month after a free trial.
`,
  },
  {
    slug: 'uk-data-protection-sole-traders-bookings', date: '2026-10-24', cta: '/privacy/', ctaLabel: 'Read how Bookable handles data',
    title: 'Client phone numbers and UK data protection, simply',
    description: 'If you take bookings, you hold your clients’ names and numbers. A plain-English guide to doing it properly under UK data protection rules.',
    body: `
This is general information, not legal advice. If you take bookings, you hold personal details such as names and phone numbers. UK data protection law applies to that, even if you are a one-person business. The good news is that the basics are simple.

## What counts as personal data
Anything that identifies a person: a name, a phone number, an email address. A note such as "nervous around bikes" about a dog's owner can also count, depending on what it says.

## The basic rules
- **Only keep what you need.** For a booking, that is usually a name, a number and the service.
- **Use it for the booking.** Do not use someone's number to send promotions unless they have agreed.
- **Keep it safe.** A locked phone, a strong password and a tool that stores data securely.
- **Do not keep it forever.** Delete old details you no longer need.
- **Help people see or delete their data** if they ask.

## Do I need to register?
Many people who handle personal data for business need to pay a small data protection fee to the Information Commissioner's Office, the ICO. There are some exceptions. The ICO website has a short self-assessment, so check there for your situation.

## Be careful with notes
Avoid putting health information or other sensitive details in booking notes. Keep notes practical.

## Choose tools that take it seriously
When you use a booking app, you are trusting it with your clients' details. Look for a clear privacy policy, a way to delete everything and honesty about what is stored.

## The takeaway
Collect little, use it only for bookings, keep it secure and delete it when you can. Bookable stores bookings securely, shows a clear privacy notice to clients, and lets you delete your data whenever you like.
`,
  },
  {
    slug: 'get-repeat-bookings-barber-nails-dog-walker', date: '2026-10-25', cta: '/barbers/', ctaLabel: 'See Bookable for barbers',
    title: 'How to get clients to rebook before they leave',
    description: 'Regulars are the base of a solo business. Simple, friendly ways to get your next booking in the diary before the client has left.',
    body: `
Finding a new client takes effort. Keeping the ones you have is much easier, and most of the work is simply asking at the right moment.

## Ask while they are still with you
The best time to rebook is at the end of the appointment, when they are happy with the result. "Shall we get your next one in? Four weeks from today works well for that cut." Most people say yes because it is easy.

## Suggest a time that fits their pattern
A barber might say "I'd see you again in about three to four weeks". A nail technician might say "infills are best every three weeks". A dog walker might offer a weekly slot. Giving a sensible interval shows you know your craft.

## Make rebooking a one-tap job
If the client has to message and wait, some will not bother. A booking link they already have lets them rebook from their phone in seconds. Remind them where it is.

## Send a gentle nudge
A few weeks later, a short message does the trick: "Hi Sam, it's about time for your next trim! Here's my link if you'd like to grab a time."

## Reward loyalty without discounts
You do not have to cut prices. A friendly thank-you, remembering their name and the details of their last visit, and offering their favourite slot are all small things that keep people coming back.

## Track who has gone quiet
If a regular has not booked in a couple of months, a simple "Haven't seen you in a while, everything OK?" often brings them back.

## The takeaway
Ask, suggest, and make it easy. Bookable gives every client the same booking link, so rebooking is always a few taps away.
`,
  },
  {
    slug: 'how-to-price-your-services-and-show-durations', date: '2026-10-26', cta: '/pricing/', ctaLabel: 'See what Bookable includes',
    title: 'How to price your services and show how long they take',
    description: 'Clear prices and durations get you more bookings and fewer awkward conversations. A simple approach for solo barbers, nail techs and dog walkers.',
    body: `
Unclear prices lead to questions, and questions lead to messages, and messages are the thing you are trying to cut down. Putting a clear price and length on every service saves time and builds trust.

## Show the price and the time
"Gel infill, 45 minutes, £24" tells the client everything. They know how much to bring and how long to set aside. It also tells you how long to block in your diary.

## Price for your time, not just the job
Work out what an hour of your time needs to earn once you include products, travel, tax and the days you do not work. Then check that each service pays that back in the minutes it takes.

## Keep the menu short
Four to six main services are easier to choose from than twenty. If you offer extras, make them optional add-ons rather than separate items.

## Be careful with "from" prices
"From £25" can hide a range, and surprises at the end are awkward. If a service varies, explain why in one line, such as "Price depends on length and design".

## Review prices once or twice a year
Costs go up. A small, regular increase with a friendly heads-up is easier than a big jump after years of no change. Your regulars will usually understand.

## Do not apologise for your prices
Clients are paying for your skill, your time and your reliability. A clear, confident price list says that without needing to argue the point.

## The takeaway
Honest times and clear prices help clients book and help you plan your day. In Bookable each service has its own length and price, so your calendar and your booking page always agree.
`,
  },
];

export const POSTS = [...BASE, ...MORE];

/* Metadata only (used by the Worker, which decides what is live). */
export const POST_META = POSTS.map(({ slug, date, time, title, description }) => ({ slug, date, time: time || '09:00', title, description }));
