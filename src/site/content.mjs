/* All public page copy. body() receives helpers from build.mjs: img(name, alt, opts), faq(items), crumbs. */

const FAQ_HOME = [
  ['Do my clients need an account?', 'No. They open your link, pick a service, a day and a time, then enter their name and mobile number. That is all.'],
  ['Do reminders send automatically?', 'Not yet. Bookable writes each message for you and opens WhatsApp with it ready, so it comes from your own number and replies land in your normal chats. Sending automatically needs WhatsApp’s paid business service, which is not part of the £14.99.'],
  ['Where are my bookings stored?', 'On Bookable’s servers, tied to your account, so you can sign in from any phone or computer. Clients book from your link on their own phones and you see it straight away.'],
  ['How much does Bookable cost?', '£14.99 a month after a 7-day free trial, with no contract. No card is taken while Bookable is in early access.'],
  ['Who is Bookable for?', 'Solo barbers, nail technicians and dog walkers first, because they book by message every day. If you take appointments by DM, it will probably suit you too.'],
];

const FAQ_BARBERS = [
  ['Can I add walk-ins to the calendar?', 'Yes. Use Add booking, or click an empty space in the week view. Walk-ins block out their time just like online bookings, so nobody gets double-booked.'],
  ['Can I take bookings through Instagram?', 'Put your Bookable link in your bio and send it whenever someone asks for a time. They book on their phone and you do not need to reply.'],
  ['What if I close on Mondays and open late on Fridays?', 'Set each weekday’s hours separately under Calendar, then Set your availability. Add days off for holidays and they disappear from your booking page.'],
];
const FAQ_NAILS = [
  ['Can I charge a deposit?', 'Not through Bookable yet. Take deposits the way you do now, usually by bank transfer, and add the booking in Bookable once it is paid.'],
  ['Can I set different lengths for sets, infills and removals?', 'Yes. Every service has its own length and price, and the calendar blocks that exact time.'],
  ['Can clients tell me what they want?', 'Each booking has a note, so clients can say the shape or colour they have in mind before they arrive.'],
];
const FAQ_DOGS = [
  ['Can clients book more than one dog?', 'Clients can mention extra dogs in the note, or you can add a group walk as its own service with its own price.'],
  ['Can clients book repeat walks?', 'Each booking is one visit for now. Clients can use your link again whenever they need another.'],
  ['How do I know the dog’s name?', 'It goes in the booking note, and it shows on your Today screen next to the time, so you see it before you leave the house.'],
];
const FAQ_PRICING = [
  ['Is there a contract?', 'No. You can stop whenever you like.'],
  ['Do I pay per booking or per client?', 'No. It is a flat £14.99 a month, however many bookings and clients you have.'],
  ['When do I pay?', 'Your first 7 days are free. No card is taken while Bookable is in early access, and when billing opens you will see the price and the date before anything is charged.'],
];


const FAQ_GDPR = [
  ['Is Bookable UK GDPR compliant?', 'We follow UK GDPR: we collect only what the service needs, keep it secure, tell you what we hold, honour your rights and delete data when you ask. This page and our privacy policy explain how.'],
  ['Who is responsible for my clients’ data?', 'You are, as the business that collects it. Bookable stores it on your behalf and only uses it to run the service.'],
  ['Where is the data stored?', 'On Cloudflare, our hosting and database provider, which may process data in the UK, the EEA and other countries using recognised safeguards.'],
];

const FAQ_PAYMENTS = [
  ['How do I pay for Bookable?', 'By bank transfer. The details are on your Plan page and we message you before your free trial ends.'],
  ['Do you store my card or bank details?', 'No. We only record the amount, date and method of each payment.'],
  ['Can I cancel any time?', 'Yes. There is no contract. You keep access until the end of the month you have paid for.'],
];

const ctaBand = (h, p) => `<section class="s band"><div class="wrap"><h2>${h}</h2><p>${p}</p><a class="btn accent" href="/app/#/signup">Try Bookable free</a></div></section>`;
const tradeHero = (h1, lede, inner) => `
<section class="hero v2 sub2">
  <div class="wrap">
    <div>
      <h1>${h1}</h1>
      <p class="lede">${lede}</p>
      <div class="ctas"><a class="btn accent" href="/app/#/signup">Try Bookable free</a><a class="btn ghost" href="/pricing/">£14.99 a month after 7 days</a></div>
    </div>
    <div class="pane red">${inner}</div>
  </div>
</section>`;

export const pages = [
  {
    path: '/', file: 'index.html', nav: null,
    title: 'Bookable: bookings for barbers, nail techs and dog walkers',
    description: 'One booking link for your Instagram and WhatsApp, a calendar that stops double-booking, and reminders ready to send. £14.99 a month after 7 days free.',
    ogTitle: 'Fewer messages.\nFewer missed appointments.',
    faq: FAQ_HOME,
    body: ({ img, faq }) => `
<section class="hero v2">
  <div class="wrap">
    <div>
      <h1>Never miss a call.</h1>
      <p class="lede">Bookable gives any business one booking link for their Instagram bio and WhatsApp, a calendar that knows when they are free, and reminders written and ready to send.</p>
      <div class="ctas"><a class="btn accent" href="/app/#/signup">Try Bookable free</a><a class="btn ghost" href="#how">See how it works</a></div>
      <p class="note fine" style="margin-top:18px">7 days free, then £14.99 a month. Cancel any time. No card needed while Bookable is in early access.</p>
      <form class="herosearch" action="/find/" method="get" role="search">
        <label for="hq">Booking an appointment? Find your barber, nail tech or dog walker.</label>
        <div class="box"><input id="hq" type="search" name="q" placeholder="Search by name or town" maxlength="50" autocomplete="off"><button type="submit">Search</button></div>
      </form>
    </div>
    <div class="art" aria-hidden="false">
      <div class="panel"></div>
      <div class="dash">${img('home-dashboard', 'The Bookable Today screen showing the next appointment at 10:00, today’s schedule, the booking link and this week’s totals', { eager: true })}</div>
      <div class="ph">${img('phone-barber', 'A barber’s Bookable booking page on a phone, listing haircut, skin fade, beard trim and haircut and beard with prices', { eager: true })}</div>
      <div class="chip2">New booking: skin fade, Tue 3:30</div>
    </div>
  </div>
</section>

<section class="gate" aria-label="Choose how to continue">
  <div class="wrap">
    <h2>Who are you?</h2>
    <div class="gatecards">
      <div class="gcard">
        <p class="eyebrow">Customer</p>
        <h3>I want to book an appointment</h3>
        <p>Make a free account to keep your bookings in one place, cancel in a tap, and book faster next time.</p>
        <div class="ctas"><a class="btn accent" id="gc-main" href="/client/#signup">Create customer account</a><a class="btn ghost" id="gc-alt" href="/client/">Customer login</a></div>
      </div>
      <div class="gcard biz">
        <p class="eyebrow">Business</p>
        <h3>I take bookings for my business</h3>
        <p>Barbers, nail technicians and dog walkers. One booking link, a calendar and reminders. 7 days free.</p>
        <div class="ctas"><a class="btn accent" id="gb-main" href="/app/#/signup">Start free</a><a class="btn ghost" id="gb-alt" href="/app/#/login">Owner login</a></div>
      </div>
    </div>
  </div>
</section>

<section class="facts" aria-label="At a glance">
  <div class="wrap">
    <div><b>7 days free</b>Try everything first</div>
    <div><b>£14.99 a month</b>One flat price</div>
    <div><b>No card</b>Needed in early access</div>
    <div><b>No booking fees</b>Keep all you earn</div>
  </div>
</section>

<section class="feat" id="what">
  <div class="wrap">
    <div class="copy">
      <p class="eyebrow">One link</p>
      <h2>One link replaces the DM thread</h2>
      <p>Clients pick a service, a day and a time on their phone. No more “are you free Thursday?” back and forth, and no scrolling to find who asked for what.</p>
      <ul class="ticks"><li>Put it in your Instagram bio and send it on WhatsApp</li><li>Clients see only the times you are really free</li><li>No account or app for your clients to set up</li></ul>
    </div>
    <div class="pane red">
      <figure class="phone-card">${img('phone-barber', 'A barber’s Bookable booking page on a phone, listing haircut, skin fade, beard trim and haircut and beard with prices')}</figure>
      <div class="chip2 r">Booked in: 3:30 Tuesday</div>
    </div>
  </div>
</section>

<section class="feat tint flip">
  <div class="wrap">
    <div class="copy">
      <p class="eyebrow">Your week at a glance</p>
      <h2>See who is coming, and when you are free</h2>
      <p>The week view greys out the hours you are closed and your days off, so the gaps are obvious. Click an empty space to add a walk-in. Tap a booking for the client’s number, their note, and a one-tap WhatsApp message.</p>
      <ul class="ticks"><li>A calendar that stops double-booking</li><li>Set your hours, days off and the gap between clients</li><li>A time disappears the moment it is taken</li></ul>
    </div>
    <div class="pane sand"><div class="shot-card">${img('home-calendar', 'The Bookable calendar week view with bookings in dark red and closed hours shaded')}</div></div>
  </div>
</section>

<section class="dark">
  <div class="wrap">
    <div class="copy">
      <p class="eyebrow" style="color:rgba(246,234,217,.6)">Reminders</p>
      <h2>Reminders you only have to send</h2>
      <p>Bookable writes the WhatsApp message for each appointment, in your words, with the name, day and time filled in. Tap send and it comes from your own number, so replies land in your normal chats.</p>
      <ul class="ticks"><li>Written for you, ready to send</li><li>Ask clients to reply YES so you know who is coming</li><li>Fewer no-shows, with time to fill a gap</li></ul>
    </div>
    <div class="chat">
      <small>WhatsApp · from your own number</small>
      <div class="bub in">Hi Sam, a reminder you’re booked in tomorrow at 3.30 for a skin fade. Reply YES to confirm and let me know if you need to move it.</div>
      <div class="bub out">YES, see you then</div>
    </div>
  </div>
</section>

<section class="s" id="trades">
  <div class="wrap">
    <p class="eyebrow">Built for</p>
    <h2>Set up for the way you work</h2>
    <div class="tiles">
      <a class="tile2" href="/barbers/"><strong>Barbers</strong><span>Cuts, fades and beard trims, each with the right amount of time.</span><em aria-hidden="true">→</em><div class="ph">${img('phone-barber', 'A barber’s Bookable booking page on a phone')}</div></a>
      <a class="tile2 ink" href="/nail-technicians/"><strong>Nail technicians</strong><span>Sets, infills and removals, with a note for the look they want.</span><em aria-hidden="true">→</em><div class="ph">${img('phone-nails', 'A nail technician’s Bookable booking page on a phone')}</div></a>
      <a class="tile2 sandy" href="/dog-walkers/"><strong>Dog walkers</strong><span>Walks and drop-ins, with the dog’s name and anything you should know.</span><em aria-hidden="true">→</em><div class="ph">${img('phone-dogs', 'A dog walker’s Bookable booking page on a phone')}</div></a>
    </div>
  </div>
</section>

<section class="band2" id="how">
  <div class="wrap">
    <p class="eyebrow" style="color:rgba(255,255,255,.65)">How it works</p>
    <h2>Up and running in a few minutes</h2>
    <div class="steps2">
      <div><b>1</b><h3>Tell Bookable what you do</h3><p>Pick barber, nail technician or dog walker and your services are filled in. Change any name, length or price.</p></div>
      <div><b>2</b><h3>Share your link</h3><p>Put it in your Instagram bio and send it on WhatsApp when someone asks for a time.</p></div>
      <div><b>3</b><h3>Send the reminders</h3><p>Open Reminders in the morning. Each message is written. Tap Send on the ones you want.</p></div>
    </div>
  </div>
</section>

<section class="s">
  <div class="wrap split">
    <div class="pricecard">
      <p class="eyebrow">Pricing</p>
      <div class="price-row"><div class="big-price">£14.99<small> a month</small></div></div>
      <ul><li>Free for the first 7 days</li><li>Unlimited bookings and clients</li><li>No contract, cancel any time</li><li>No fee on your bookings</li></ul>
      <a class="btn accent" href="/app/#/signup">Try Bookable free</a> <a class="note" style="margin-left:14px" href="/pricing/">What is included</a>
    </div>
    <div>
      <p class="eyebrow">Common questions</p>
      ${faq(FAQ_HOME)}
    </div>
  </div>
</section>

<section class="s sand" id="terms">
  <div class="wrap split">
    <div>
      <p class="eyebrow">The small print, in plain English</p>
      <h2>Before you start</h2>
      <ul class="ticks">
        <li>Free for 7 days, then £14.99 a month. No contract, cancel any time.</li>
        <li>No card is taken while Bookable is in early access.</li>
        <li>Your clients’ details stay with your business. Bookable stores them for you and never sells them.</li>
        <li>Reminders open WhatsApp for you to send. Bookable does not message your clients by itself.</li>
        <li>You need to be 13 or over to make an account.</li>
        <li>Bookable is in early access, so keep your own note of important appointments.</li>
      </ul>
    </div>
    <div class="pricecard">
      <p class="eyebrow">Read it in full</p>
      <ul class="doclinks"><li><a href="/terms/">Terms of use</a></li><li><a href="/privacy/">Privacy policy</a></li><li><a href="/gdpr/">Data protection (UK GDPR)</a></li><li><a href="/payments/">Payments and billing</a></li></ul>
    </div>
  </div>
</section>

<section class="s band">
  <div class="wrap">
    <h2>Give your clients one link to book</h2>
    <p>Set up your booking page in a few minutes and try it free for 7 days.</p>
    <a class="btn accent" href="/app/#/signup">Try Bookable free</a>
  </div>
</section>`,
  },

  {
    path: '/barbers/', file: 'barbers/index.html', nav: 'Barbers',
    title: 'Booking app for barbers | Bookable',
    description: 'A booking link for your barbershop’s Instagram and WhatsApp. Haircuts, skin fades and beard trims with the right time for each. £14.99 a month, 7 days free.',
    ogTitle: 'Booking app\nfor barbers',
    faq: FAQ_BARBERS,
    body: ({ img, faq, crumbs }) => `
<div class="wrap">${crumbs}</div>
${tradeHero(`Booking app for barbers`, `Stop answering “got any space Saturday?” all day. Put one link in your bio, set your hours once, and clients pick a slot that is really free.`, `<figure class="phone-card">${img('phone-barber', 'A barber’s Bookable booking page on a phone, listing haircut, skin fade, beard trim and haircut and beard with prices', { eager: true })}</figure><div class="chip2 r">Skin fade · Tue 3:30</div>`)}

<section class="s">
  <div class="wrap split">
    <div>
      <p class="eyebrow">Starting services</p>
      <h2>Your menu, with the time each cut takes</h2>
      <ul class="rows" style="margin-top:28px">
        <li>Haircut <span>30 min · £18</span></li>
        <li>Skin fade <span>45 min · £22</span></li>
        <li>Beard trim <span>20 min · £10</span></li>
        <li>Haircut and beard <span>60 min · £26</span></li>
      </ul>
      <p class="note" style="margin-top:14px">These are the services Bookable starts you with. Rename them and set your own prices.</p>
    </div>
    <div class="pane sand"><figure class="phone-card">${img('phone-barber', 'A barber’s Bookable booking page on a phone, listing haircut, skin fade, beard trim and haircut and beard with prices')}</figure></div>
  </div>
</section>

<section class="s sand">
  <div class="wrap">
    <h2>Built around how a barbershop runs</h2>
    <div class="list">
      <div><span class="n">01</span><h3>Open Sundays, closed Mondays</h3><p>Set each weekday’s hours on their own, and add days off for holidays. Closed hours never show on your booking page.</p></div>
      <div><span class="n">02</span><h3>A gap between every client</h3><p>Add 5, 10 or 15 minutes between appointments so nobody is squeezed in while you are still sweeping up.</p></div>
      <div><span class="n">03</span><h3>Fewer no-shows</h3><p>Send a reminder the day before, or two hours before for same-day bookings, and ask clients to reply YES. If someone cannot make it, you find out early enough to offer the slot.</p></div>
    </div>
  </div>
</section>

<section class="s">
  <div class="wrap">
    <h2>Questions from barbers</h2>
    ${faq(FAQ_BARBERS)}
  </div>
</section>

<section class="s">
  <div class="wrap">
    <p class="eyebrow">Also built for</p>
    <div class="trades">
      <a href="/nail-technicians/"><strong>Nail technicians</strong><span>Sets, infills and removals.</span><i aria-hidden="true">→</i></a>
      <a href="/dog-walkers/"><strong>Dog walkers</strong><span>Walks and drop-in visits.</span><i aria-hidden="true">→</i></a>
    </div>
  </div>
</section>
${ctaBand(`Give your clients one link to book`, `Set up your barber booking page in a few minutes and try it free for 7 days.`)}`,
  },

  {
    path: '/nail-technicians/', file: 'nail-technicians/index.html', nav: 'Nail technicians',
    title: 'Booking app for nail technicians | Bookable',
    description: 'One booking link for your nail business. Sets, infills and removals with the right time for each, and WhatsApp reminders to cut no-shows. £14.99 a month.',
    ogTitle: 'Booking app for\nnail technicians',
    faq: FAQ_NAILS,
    body: ({ img, faq, crumbs }) => `
<div class="wrap">${crumbs}</div>
${tradeHero(`Booking app for nail technicians`, `A set takes an hour, an infill takes 45 minutes and a removal is 20. Give each its own length and a booking never runs into the next client.`, `<figure class="phone-card">${img('phone-nails', 'A nail technician’s Bookable booking page on a phone, listing gel manicure, gel infill, gel removal and nail art with prices', { eager: true })}</figure><div class="chip2 r">Gel infill · Thu 2:00</div>`)}

<section class="s">
  <div class="wrap split">
    <div>
      <p class="eyebrow">Starting services</p>
      <h2>Every treatment with its own time and price</h2>
      <ul class="rows" style="margin-top:28px">
        <li>Gel manicure <span>60 min · £28</span></li>
        <li>Gel infill <span>45 min · £24</span></li>
        <li>Gel removal <span>20 min · £8</span></li>
        <li>Nail art, per set <span>30 min · £12</span></li>
      </ul>
      <p class="note" style="margin-top:14px">These are the services Bookable starts you with. Rename them and set your own prices.</p>
    </div>
    <div class="pane sand"><figure class="phone-card">${img('phone-nails', 'A nail technician’s Bookable booking page on a phone, listing gel manicure, gel infill, gel removal and nail art with prices')}</figure></div>
  </div>
</section>

<section class="s sand">
  <div class="wrap">
    <h2>Less back and forth before the appointment</h2>
    <div class="list">
      <div><span class="n">01</span><h3>Know the look before they arrive</h3><p>Each booking has a note. Clients can say the shape or colour they have in mind, and you see it on your Today screen next to the time.</p></div>
      <div><span class="n">02</span><h3>No bookings you cannot make</h3><p>Set the shortest notice you accept, like two hours or a day, so nobody books a slot while you are already on your way home.</p></div>
      <div><span class="n">03</span><h3>Fewer last-minute cancellations</h3><p>Reminders go from your own WhatsApp the day before. Ask clients to reply YES and you know who is coming.</p></div>
    </div>
  </div>
</section>

<section class="s">
  <div class="wrap">
    <h2>Questions from nail technicians</h2>
    ${faq(FAQ_NAILS)}
  </div>
</section>

<section class="s">
  <div class="wrap">
    <p class="eyebrow">Also built for</p>
    <div class="trades">
      <a href="/barbers/"><strong>Barbers</strong><span>Cuts, fades and beard trims.</span><i aria-hidden="true">→</i></a>
      <a href="/dog-walkers/"><strong>Dog walkers</strong><span>Walks and drop-in visits.</span><i aria-hidden="true">→</i></a>
    </div>
  </div>
</section>
${ctaBand(`Give your clients one link to book`, `Set up your nail technician booking page in a few minutes and try it free for 7 days.`)}`,
  },

  {
    path: '/dog-walkers/', file: 'dog-walkers/index.html', nav: 'Dog walkers',
    title: 'Booking app for dog walkers | Bookable',
    description: 'Walks and drop-in visits booked from one link. Clients add the dog’s name and anything you should know. WhatsApp reminders included. £14.99 a month, 7 days free.',
    ogTitle: 'Booking app\nfor dog walkers',
    faq: FAQ_DOGS,
    body: ({ img, faq, crumbs }) => `
<div class="wrap">${crumbs}</div>
${tradeHero(`Booking app for dog walkers`, `Mornings are full of messages about Biscuit’s walk. Bookable gives clients one link to book a 30-minute walk, an hour or a drop-in, and tells you the dog’s name when they do.`, `<figure class="phone-card">${img('phone-dogs', 'A dog walker’s Bookable booking page on a phone, listing a 30-minute walk, a 1-hour walk, a drop-in visit and a group walk with prices', { eager: true })}</figure><div class="chip2 r">Morning walk · Mon 8:30</div>`)}

<section class="s">
  <div class="wrap split">
    <div>
      <p class="eyebrow">Starting services</p>
      <h2>Walks and visits, each with a length and price</h2>
      <ul class="rows" style="margin-top:28px">
        <li>30-minute walk <span>30 min · £12</span></li>
        <li>1-hour walk <span>60 min · £18</span></li>
        <li>Drop-in visit <span>20 min · £10</span></li>
        <li>Group walk <span>60 min · £14</span></li>
      </ul>
      <p class="note" style="margin-top:14px">These are the services Bookable starts you with. Rename them and set your own prices.</p>
    </div>
    <div class="pane sand"><figure class="phone-card">${img('phone-dogs', 'A dog walker’s Bookable booking page on a phone, listing a 30-minute walk, a 1-hour walk, a drop-in visit and a group walk with prices')}</figure></div>
  </div>
</section>

<section class="s sand">
  <div class="wrap">
    <h2>The details that matter on a walk</h2>
    <div class="list">
      <div><span class="n">01</span><h3>Notes on every booking</h3><p>Clients tell you the dog’s name, how they pull on the lead, or where the key is. It sits next to the time on your Today screen.</p></div>
      <div><span class="n">02</span><h3>Your week, with the gaps showing</h3><p>The calendar greys out the hours you are not working, so you can see where an extra walk fits without checking your messages.</p></div>
      <div><span class="n">03</span><h3>Reminders from your own number</h3><p>Bookable writes the message with the day and time filled in. Tap send and it goes from your WhatsApp, so owners reply where they already talk to you.</p></div>
    </div>
  </div>
</section>

<section class="s">
  <div class="wrap">
    <h2>Questions from dog walkers</h2>
    ${faq(FAQ_DOGS)}
  </div>
</section>

<section class="s">
  <div class="wrap">
    <p class="eyebrow">Also built for</p>
    <div class="trades">
      <a href="/barbers/"><strong>Barbers</strong><span>Cuts, fades and beard trims.</span><i aria-hidden="true">→</i></a>
      <a href="/nail-technicians/"><strong>Nail technicians</strong><span>Sets, infills and removals.</span><i aria-hidden="true">→</i></a>
    </div>
  </div>
</section>
${ctaBand(`Give your clients one link to book`, `Set up your dog walker booking page in a few minutes and try it free for 7 days.`)}`,
  },

  {
    path: '/find/', file: 'find/index.html', nav: 'Find a business', scriptName: 'find',
    title: 'Find a barber, nail technician or dog walker | Bookable',
    description: 'Search for a local barber, nail technician or dog walker on Bookable and book an appointment online.',
    ogTitle: 'Find your barber.\nBook in a minute.',
    body: ({ crumbs }) => `
<div class="wrap">${crumbs}</div>
<section class="hero sub">
  <div class="wrap">
    <p class="eyebrow">Client area</p>
    <h1>Find your barber, nail tech or dog walker.</h1>
    <p class="lede">Search, pick a time and you are booked. There is no account or password to set up.</p>
    <ol class="csteps"><li><b>1</b>Search by name, town or trade</li><li><b>2</b>Choose a service and a time</li><li><b>3</b>Add your name and number, and you are booked</li></ol>
    <form id="findform" class="find" role="search" autocomplete="off">
      <label for="q" class="vh">Search for a business</label>
      <input id="q" type="search" placeholder="e.g. Joe’s Barbers, Lichfield" maxlength="50" autocomplete="off">
      <button class="btn accent" type="submit">Search</button>
    </form>
  </div>
</section>
<section class="s">
  <div class="wrap">
    <p class="note" id="findmsg" role="status" aria-live="polite">Loading…</p>
    <div class="results" id="results"></div>
    <noscript><p class="note">Search needs JavaScript. Or ask the business for their Bookable booking link.</p></noscript>
    <p class="note" style="margin-top:28px">Businesses appear here only if they choose to be listed. Not here? Ask them for their Bookable link, usually in their Instagram bio.</p>
  </div>
</section>
<section class="s">
  <div class="wrap">
    <p class="eyebrow">Run a business?</p>
    <h2>Get your own booking page.</h2>
    <p class="lede" style="margin-top:14px">Free for 7 days, then £14.99 a month. Switch on “List me in Bookable search” and customers can find you.</p>
    <div class="ctas" style="margin-top:24px"><a class="btn accent" href="/app/#/signup">Try Bookable free</a><a class="btn ghost" href="/pricing/">See pricing</a></div>
  </div>
</section>`,
  },

  {
    path: '/blog/', file: 'blog/index.html', nav: 'Blog',
    title: 'Blog: booking tips for barbers, nail techs and dog walkers | Bookable',
    description: 'Practical, plain-English advice for solo barbers, nail technicians and dog walkers: fewer no-shows, better booking pages, reminders and more. A new post every morning.',
    ogTitle: 'Booking tips for\nsolo businesses.',
    body: ({ crumbs }) => `
<div class="wrap">${crumbs}</div>
<section class="hero sub">
  <div class="wrap">
    <h1>The Bookable blog.</h1>
    <p class="lede">Practical advice for barbers, nail technicians and dog walkers on bookings, no-shows, reminders and running a tidy diary. New posts every day.</p>
  </div>
</section>
<section class="s">
  <div class="wrap">
    <div class="results"><!--POSTS--></div>
  </div>
</section>`,
  },

  {
    path: '/gdpr/', file: 'gdpr/index.html', nav: 'Data protection',
    title: 'Data protection and UK GDPR | Bookable',
    description: 'How Bookable protects personal data under UK GDPR: roles, what we hold, security, hosting, your rights and the commitments we make to business owners.',
    faq: FAQ_GDPR,
    body: ({ crumbs, faq }) => `
<div class="wrap">${crumbs}</div>
<section class="hero sub"><div class="wrap"><h1>Data protection and UK GDPR</h1><p class="lede">How Bookable handles personal data, in plain English. Last updated 12 October 2026.</p></div></section>
<section class="s"><div class="wrap" style="max-width:720px">
<p>This page explains our approach to the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018. It sits alongside our <a href="/privacy/">privacy policy</a>, which lists exactly what we collect. This is general information, not legal advice.</p>

<h2 style="margin-top:36px">Our roles</h2>
<ul class="rows">
<li><strong>Controller</strong> for the details of business owners who sign up (email, business details, payment records).</li>
<li><strong>Processor</strong> for the bookings and client details a business owner enters or collects through their booking page. The business owner is the controller of that data and decides what to do with it. We only store and process it to run the service.</li>
</ul>

<h2 style="margin-top:36px">What we promise business owners (processor commitments)</h2>
<ul class="rows">
<li>We only use your clients’ data to provide Bookable to you, and never for our own marketing or to sell.</li>
<li>Everyone who can access the data is bound by confidentiality.</li>
<li>We keep the data secure (see below) and tell you without undue delay if we find a breach that affects you.</li>
<li>We help you answer your clients’ requests to see, correct or delete their data. You can delete bookings and your whole account in the app.</li>
<li>When you delete your account we delete your business, bookings and clients, except payment records we must keep for accounts and tax.</li>
<li>We only use the sub-processor listed below, and will update this page if that changes.</li>
</ul>

<h2 style="margin-top:36px">Security</h2>
<ul class="rows">
<li>Everything is sent over encrypted HTTPS connections.</li>
<li>Passwords are never stored. We keep a salted, hashed version, strengthened with a secret key kept outside the database.</li>
<li>Each owner can only see their own bookings and clients. Our admin area shows business and payment information, not client names or phone numbers.</li>
<li>Admin access needs a private access code, with limits on repeated attempts.</li>
<li>Sign-in attempts and booking requests are rate limited, and the temporary anti-abuse records (including IP addresses) are deleted automatically within about 24 hours.</li>
<li>The database can be backed up and restored to an earlier point in time if something goes wrong.</li>
<li>No card or bank details are stored.</li>
</ul>

<h2 style="margin-top:36px">Where data is stored</h2>
<p>Bookable is hosted on Cloudflare, which provides our servers and database. Cloudflare may process data in the UK, the European Economic Area and other countries, using recognised safeguards for transfers outside the UK. Cloudflare is our hosting provider. Telegram is used only to send private alerts to the owner, with a masked email address, never client data.</p>

<h2 style="margin-top:36px">Lawful bases</h2>
<ul class="rows">
<li>Providing the service you signed up for: contract.</li>
<li>Security and preventing abuse: legitimate interests.</li>
<li>Keeping payment records: legal obligation (accounts and tax).</li>
</ul>

<h2 style="margin-top:36px">Your rights</h2>
<p>You can ask us to see, correct or delete your personal data, restrict or object to its use, or receive a copy. Clients of a business should contact that business first, as it decides how the data is used, and we will help. We reply within one month. You can also complain to the Information Commissioner’s Office at ico.org.uk.</p>

<h2 style="margin-top:36px">Breaches</h2>
<p>If a personal data breach puts people at risk, we will tell the affected business owners without undue delay and report it to the ICO within 72 hours where the law requires.</p>

<h2 style="margin-top:36px">Contact</h2>
<p><a href="mailto:websitebuilds01@gmail.com">websitebuilds01@gmail.com</a></p>

<h2 style="margin-top:44px">Common questions</h2>
${faq(FAQ_GDPR)}
</div></section>`,
  },

  {
    path: '/payments/', file: 'payments/index.html', nav: 'Payments',
    title: 'Payments and billing | Bookable',
    description: 'How paying for Bookable works: 7 days free, £14.99 a month, paid by bank transfer, no card details stored, cancel any time.',
    faq: FAQ_PAYMENTS,
    body: ({ crumbs, faq }) => `
<div class="wrap">${crumbs}</div>
<section class="hero sub"><div class="wrap"><h1>Payments and billing</h1><p class="lede">Simple and honest. Last updated 12 October 2026.</p></div></section>
<section class="s"><div class="wrap" style="max-width:720px">
<h2>The price</h2>
<p>Bookable is free for 7 days. After that it is £14.99 a month, with no contract and no charge per booking. Some businesses are on a different plan, for example an early supporter price. Your plan and price are always shown on the Plan page inside the app.</p>

<h2 style="margin-top:36px">How you pay</h2>
<ul class="rows">
<li>Payments are made by <strong>bank transfer</strong>. The bank details are shown on your Plan page and we message you before your trial ends.</li>
<li>When your payment arrives we record it by hand against your account, so it can take up to a day to appear. Each payment covers the month you paid for.</li>
<li>We do not take card payments yet, and we never ask for card details or passwords by message.</li>
</ul>

<h2 style="margin-top:36px">What we store about payments</h2>
<p>The amount, the date and the method (for example bank transfer). We do not store your bank or card details. Payment records are kept for up to 6 years for accounting and tax, as required by law.</p>

<h2 style="margin-top:36px">If a payment is late</h2>
<p>We will message you first. Nothing is deleted without warning, and you can ask us any time to stop the plan instead. If a month is missed, your account may be paused until the payment is made.</p>

<h2 style="margin-top:36px">Cancelling and refunds</h2>
<ul class="rows">
<li>Cancel any time by emailing us or deleting your account. You keep access until the end of the month you have paid for.</li>
<li>You will not be charged for the next month after you cancel.</li>
<li>If you think you were charged by mistake, tell us and we will put it right.</li>
</ul>

<h2 style="margin-top:36px">Receipts</h2>
<p>We can send a receipt for any payment on request. Email <a href="mailto:websitebuilds01@gmail.com">websitebuilds01@gmail.com</a>.</p>

<p class="note" style="margin-top:28px">See also the <a href="/terms/">terms of use</a> and the <a href="/privacy/">privacy policy</a>.</p>

<h2 style="margin-top:44px">Common questions</h2>
${faq(FAQ_PAYMENTS)}
</div></section>`,
  },

  {
    path: '/pricing/', file: 'pricing/index.html', nav: 'Pricing',
    title: 'Pricing: £14.99 a month, free for 7 days | Bookable',
    description: 'Bookable costs £14.99 a month after 7 days free. No contract, cancel any time. Unlimited bookings and clients, your own booking link, a calendar and WhatsApp reminders.',
    ogTitle: '£14.99 a month.\nFree for 7 days.',
    faq: FAQ_PRICING,
    body: ({ faq, crumbs }) => `
<div class="wrap">${crumbs}</div>
<section class="hero sub">
  <div class="wrap">
    <h1>£14.99 a month. Free for 7 days.</h1>
    <p class="lede">One price, no contract, and no charge per booking. Cancel whenever you like.</p>
    <div class="ctas"><a class="btn accent" href="/app/#/signup">Try Bookable free</a></div>
  </div>
</section>

<section class="s">
  <div class="wrap split">
    <div>
      <p class="eyebrow">Included</p>
      <h2>Everything you need to take bookings</h2>
      <ul class="rows" style="margin-top:28px">
        <li>Unlimited bookings and clients</li>
        <li>Your own booking link</li>
        <li>Calendar and availability</li>
        <li>Booking page editor</li>
        <li>WhatsApp confirmations and reminders</li>
      </ul>
    </div>
    <div>
      <p class="eyebrow">Not included yet</p>
      <h2>What Bookable does not do today</h2>
      <ul class="rows" style="margin-top:28px">
        <li>Online payments or deposits from clients</li>
        <li>Reminders that send themselves</li>
        <li>Password reset by email</li>
      </ul>
      <p class="note" style="margin-top:14px">Bookable is in early access. Reminders open WhatsApp with the message ready for you to send, and there is no email password reset yet, so choose a password you will remember.</p>
    </div>
  </div>
</section>

<section class="s">
  <div class="wrap">
    <h2>Questions about pricing</h2>
    ${faq(FAQ_PRICING)}
  </div>
</section>

<section class="s">
  <div class="wrap">
    <p class="eyebrow">See how it fits your work</p>
    <div class="trades">
      <a href="/barbers/"><strong>Barbers</strong><span>Cuts, fades and beard trims.</span><i aria-hidden="true">→</i></a>
      <a href="/nail-technicians/"><strong>Nail technicians</strong><span>Sets, infills and removals.</span><i aria-hidden="true">→</i></a>
      <a href="/dog-walkers/"><strong>Dog walkers</strong><span>Walks and drop-in visits.</span><i aria-hidden="true">→</i></a>
    </div>
  </div>
</section>
${ctaBand(`Start your 7 days free`, `Set up your booking page in a few minutes. No card needed while Bookable is in early access.`)}`,
  },

  {
    path: '/privacy/', file: 'privacy/index.html', nav: 'Privacy',
    title: 'Privacy policy | Bookable',
    description: 'What data Bookable collects, why, who can see it, how long it is kept, and your rights under UK GDPR.',
    faq: [['Do you sell my data?', 'No. Bookable never sells data and does not use it for advertising.'], ['How do I delete my data?', 'Business owners can delete their account in the app, which removes the business, its bookings and its clients. Clients can ask the business they booked with, or email websitebuilds01@gmail.com.']],
    body: ({ crumbs }) => `
<div class="wrap">${crumbs}</div>
<section class="hero sub"><div class="wrap"><h1>Privacy policy</h1><p class="lede">Plain English. Last updated 12 October 2026.</p></div></section>
<section class="s"><div class="wrap" style="max-width:720px">
<h2>Who we are</h2>
<p>Bookable is a booking app for one-person businesses, run from the UK. Contact for anything in this policy: <a href="mailto:websitebuilds01@gmail.com">websitebuilds01@gmail.com</a>.</p>

<h2 style="margin-top:36px">Who is responsible for what</h2>
<ul class="rows">
<li><strong>Business owners</strong> (barbers, nail technicians, dog walkers and similar): for your own account details, Bookable is the “controller”, meaning we decide how they are used.</li>
<li><strong>Clients who book</strong>: the business you book with is the “controller” of your booking details and decides how to use them. Bookable only stores them on that business’s behalf (we are the “processor”) and does not use them for anything else.</li>
</ul>

<h2 style="margin-top:36px">What we collect</h2>
<ul class="rows">
<li><strong>Owner account:</strong> email address, a scrambled (hashed) password, business name, town, phone number, services, prices, opening hours and the other settings you choose.</li>
<li><strong>Bookings and clients:</strong> a client’s name and mobile number, the service, date and time, price, any note or answer they give (for example a dog’s name), and the status of the booking. Please do not put health or other sensitive information in notes.</li>
<li><strong>Calendar link (optional):</strong> an owner can switch on a private calendar link so their bookings, including client names, numbers and notes, appear in the calendar app they choose (for example Google or Apple). Anyone who has the link can see those bookings, so owners should keep it private and can replace it at any time.</li>
<li><strong>Owner alerts:</strong> when someone creates an account, signs in or pays, Bookable's owner gets a private message on Telegram with a masked email (like j***@gmail.com) and, for payments, the business name and amount. No client names, phone numbers or booking details are ever sent. Telegram is a separate service.</li>
<li><strong>Payment records:</strong> if you pay Bookable, we record the amount, date and method (for example bank transfer) against your account. We do not store card or bank details. These records are kept for up to 6 years for accounting and tax, even after an account is deleted.</li>
<li><strong>Public listing (only if the owner switches it on):</strong> the business name, town, type and booking page appear in Bookable search. Nothing else is shown, and it is off by default.</li>
<li><strong>Sign-in cookie:</strong> one essential cookie that keeps you signed in. It is not used for tracking or advertising, so no cookie banner is needed.</li>
<li><strong>Technical data:</strong> your IP address and, for bookings, the phone number used, kept for up to 24 hours purely to stop spam and abuse (for example, limiting how many bookings or sign-up attempts can be made).</li>
</ul>
<p>We do not collect payment or card details. We do not use analytics or advertising trackers.</p>

<h2 style="margin-top:36px">Why we use it, and our legal reason</h2>
<ul class="rows">
<li>To run the service you signed up for: show free times, take bookings and let owners manage them. (Legal basis: contract.)</li>
<li>To keep Bookable secure and stop abuse and double bookings. (Legal basis: legitimate interests.)</li>
</ul>
<p>We do not sell data, do not share it for advertising, and do not use it to make automated decisions about you.</p>

<h2 style="margin-top:36px">WhatsApp reminders</h2>
<p>Bookable does not send messages itself. It opens WhatsApp on the owner’s phone with a message ready, and the owner chooses whether to send it from their own number. Owners should only message clients about their booking.</p>

<h2 style="margin-top:36px">Who can see it</h2>
<p>A business owner sees only their own bookings and clients. Nobody else can. Bookable is hosted by Cloudflare, which stores the data for us and may process it outside the UK under standard safeguards. The person running Bookable can technically access the database to keep the service working, and will not look at it except to fix problems or when the law requires.</p>

<h2 style="margin-top:36px">How long we keep it</h2>
<ul class="rows">
<li>Owner and booking data: until the owner deletes a booking or their account. Deleting an account removes the business, its bookings and its clients.</li>
<li>Payment records (amount, date, method): up to 6 years, as required for accounts and tax.</li>
<li>Sign-in sessions: until they expire or you sign out.</li>
<li>Anti-abuse records (IP addresses, phone numbers used for bookings): deleted automatically within about 24 hours.</li>
</ul>

<h2 style="margin-top:36px">Your rights</h2>
<p>Under UK GDPR you can ask to see your data, correct it, delete it, restrict or object to its use, or have it moved. Business owners can delete their account in the app. Clients should ask the business they booked with, or email us and we will pass it on or help. We will reply within one month. If you are unhappy, you can complain to the Information Commissioner’s Office at ico.org.uk.</p>

<h2 style="margin-top:36px">Age and changes</h2>
<p>Bookable is for people aged 13 and over. If we change this policy in a meaningful way we will update the date at the top.</p>
</div></section>`,
  },

  {
    path: '/terms/', file: 'terms/index.html', nav: 'Terms',
    title: 'Terms of use | Bookable',
    description: 'The simple rules for using Bookable: early access, pricing, cancelling, your data and your responsibilities.',
    faq: [['Is there a contract?', 'No. Bookable is 7 days free, then £14.99 a month, and you can cancel at any time.'], ['Will I be charged without agreeing?', 'No. No card is taken during early access, and you will not be charged without agreeing first.']],
    body: ({ crumbs }) => `
<div class="wrap">${crumbs}</div>
<section class="hero sub"><div class="wrap"><h1>Terms of use</h1><p class="lede">Plain English. Last updated 12 October 2026.</p></div></section>
<section class="s"><div class="wrap" style="max-width:720px">
<h2>The service</h2>
<p>Bookable gives your business a booking page, a calendar and ready-to-send WhatsApp messages. It is in early access, so it is new, may have bugs and may change. Keep your own note of important appointments.</p>

<h2 style="margin-top:36px">Who can use it</h2>
<p>Bookable is for self-employed people and small businesses, aged 13 or over. By creating an account you agree to these terms and the <a href="/privacy/">privacy policy</a>.</p>

<h2 style="margin-top:36px">Price</h2>
<p>7 days free, then £14.99 a month, with no contract. No card is taken during early access. Before any charge begins we will tell you and ask you to agree. You can cancel any time by emailing us or deleting your account, and you will not be charged for the following month. If we change the price we will tell you first, and you can cancel instead.</p>

<h2 style="margin-top:36px">Your data and your clients</h2>
<ul class="rows">
<li>You are responsible for the client details you put into Bookable. Under UK GDPR you are the “controller” of your clients’ data and Bookable stores it on your behalf. You must have a good reason to hold it (normally, to carry out their booking).</li>
<li>Only use client names and numbers to deal with their booking. Do not send marketing messages unless the client has agreed to them.</li>
<li>Do not store sensitive information (such as health details) in booking notes.</li>
<li>Keep your password safe. There is no email reset yet.</li>
<li>If a client asks to see or delete their data, you are responsible for answering. You can delete bookings in the app, and we can help.</li>
</ul>

<h2 style="margin-top:36px">What you must not do</h2>
<ul class="rows"><li>Use Bookable for anything unlawful, misleading or abusive, or to send spam.</li><li>Try to break, overload or get into other people’s accounts or data.</li><li>Take bookings for anything illegal, or for someone else’s business without their permission.</li></ul>

<h2 style="margin-top:36px">Our promises and limits</h2>
<p>We will take reasonable care to keep Bookable running and your data safe, but we cannot promise it will always be available or free of errors. Reminders open WhatsApp for you to send; they do not send themselves. Nothing in these terms limits liability that cannot legally be limited, such as for death or personal injury caused by negligence, or for fraud. Otherwise, to the extent the law allows, we are not liable for lost bookings, lost income or indirect losses, and our total liability is limited to what you paid us in the 12 months before the problem.</p>

<h2 style="margin-top:36px">Ending things</h2>
<p>You can stop any time. We may suspend or close an account that breaks these terms, or if we stop running Bookable, and we will give notice where we can and a chance to take your data. Deleting your account permanently removes your data as described in the privacy policy.</p>

<h2 style="margin-top:36px">Changes and law</h2>
<p>We may update these terms and will change the date above. If a change is significant we will tell you. These terms are governed by the law of England and Wales, and the courts of England and Wales can deal with any dispute.</p>

<h2 style="margin-top:36px">Contact</h2>
<p><a href="mailto:websitebuilds01@gmail.com">websitebuilds01@gmail.com</a></p>
</div></section>`,
  },
];

export const notFound = {
  file: '404.html',
  title: 'Page not found | Bookable',
  description: 'That page does not exist. Go back to Bookable, the booking app for barbers, nail technicians and dog walkers.',
  body: `
<section class="nf">
  <div class="wrap">
    <p class="eyebrow">Error 404</p>
    <h1>That page has gone missing.</h1>
    <p class="lede">The link may be old or mistyped. Here are some places to start instead.</p>
    <div class="ctas"><a class="btn accent" href="/">Go to the home page</a><a class="btn ghost" href="/pricing/">See pricing</a></div>
    <div class="trades" style="margin-top:56px;max-width:760px">
      <a href="/barbers/"><strong>Barbers</strong><span>Booking app for barbers.</span><i aria-hidden="true">→</i></a>
      <a href="/nail-technicians/"><strong>Nail technicians</strong><span>Booking app for nail technicians.</span><i aria-hidden="true">→</i></a>
      <a href="/dog-walkers/"><strong>Dog walkers</strong><span>Booking app for dog walkers.</span><i aria-hidden="true">→</i></a>
    </div>
  </div>
</section>`,
};
