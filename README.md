# Ed-Assist — Lesson Plan Creator

A simple, free web tool that helps **teachers and tutors** create structured,
ready-to-teach lesson plans in seconds. Type a topic, pick a few options, and
get a full plan with objectives, materials, a timed lesson flow, differentiation,
assessment, and homework.

> Built as an experiment. Free to use today — no account, no cost. Designed so
> that AI-powered plans (Claude) can be added later.

---

## How to open it

**Option A — just look at it on your computer (easiest):**
1. Download this project as a folder.
2. Double-click `index.html`. It opens in your web browser. Done.

**Option B — put it online with a shareable link (free):**
This project is ready to host on **GitHub Pages** (free):
1. In your repository on GitHub, go to **Settings → Pages**.
2. Under "Build and deployment", set **Source** to *Deploy from a branch*.
3. Pick the branch this code is on and the `/ (root)` folder, then **Save**.
4. After a minute, GitHub gives you a public link like
   `https://YOUR-NAME.github.io/Ed-Assist/` that you can share with anyone.

*(I can set this up for you — just ask.)*

---

## How to use it

1. Enter a **topic** (e.g. "Photosynthesis"). This is the only required field.
2. Optionally add subject, grade, lesson length, teaching style, and goals.
3. Press **Generate lesson plan**.
4. Use **Copy** to paste it anywhere, or **Print / PDF** to save or print it.

Press **Try an example** to see it work instantly.

---

## What's inside (for the curious)

- `index.html` — the page layout
- `styles.css` — the look and feel
- `app.js` — the "engine" that builds the lesson plan
- No installation, no server, no dependencies. It all runs in your browser.

---

## Adding AI later (Claude)

Right now plans are built from a smart template — free and instant. To make them
fully custom and AI-written, we'd add a small secure step that sends the topic to
Anthropic's Claude and returns a tailored plan. The page is already structured for
this: in `app.js`, the line marked `--- This is the line to swap for AI later ---`
is the single place that changes.

Adding AI needs an Anthropic API key (paid, usually a fraction of a cent per plan)
and a tiny backend to keep the key private. When you're ready, just ask and I'll
walk you through it.
