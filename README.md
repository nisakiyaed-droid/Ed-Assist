# Ed-Assist — Lesson Plans for Teachers (Version 1)

A free website that helps teachers plan a whole chapter in minutes. A teacher
answers **five small questions**, and the app builds a ready-to-paste message for
Claude. The teacher attaches the **Framework** and their **chapter pages**, and
Claude writes complete, ready-to-teach session plans — built around a story
children follow across the chapter.

> **Version 1 is free.** It works with your school's Claude account and needs no
> payment. (Version 2 — generating plans inside the website itself — needs the
> paid Claude key. We add that when you're ready.)

---

## What's in this project

| Folder / file | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The version 1 website |
| `docs/framework/` | The system documents, including the **Framework v1.1** (the engine) |
| `docs/house-style-and-readability.md` | The color palette and the reading-level rules |
| `docs/preview/` | A colored sample plan (image + printable page) |
| `docs/samples/` | A full sample chapter (4 sessions + summary) |
| `.github/workflows/deploy-pages.yml` | Publishes the site online automatically |

---

## How to make it live (a shareable link) — one-time setup

The site is ready to publish for free with GitHub Pages:

1. On GitHub, open this repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. That's it. Within a minute or two you'll get a public link like
   `https://YOUR-NAME.github.io/Ed-Assist/` to share with teachers.

After this, every change we push updates the live site by itself.

*(Prefer not to touch settings? You can also just open `index.html` on your
computer to use the app locally.)*

---

## How a teacher uses it

1. Open the website.
2. Fill in the five small questions and press **Build my starter message**.
3. **Copy** the message and **download the Framework**.
4. Open Claude, paste the message, and attach two files: the Framework and the
   scanned chapter pages.
5. Send. Claude confirms the chapter, then builds each session as the teacher
   approves it.
