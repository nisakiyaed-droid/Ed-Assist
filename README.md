# Ed-Assist — Lesson Planner for Dr. Dasarathan International School

Upload a chapter, pick the grade, subject, and number of sessions, and the app
writes **complete, ready-to-teach session plans** — built around a story set in
Tamil Nadu that children follow across the chapter. Plans download as a **PDF**
and can be **shared on WhatsApp**.

Teachers never enter a key or log in. The school's Gemini key is stored once as a
hidden secret on Vercel.

---

## 🚀 Put it live (one-time, ~2 minutes)

Click the button, paste the school's Gemini key when asked, and press **Deploy**:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnisakiyaed-droid%2FEd-Assist&env=GEMINI_API_KEY&envDescription=The%20school%27s%20Gemini%20API%20key%20—%20kept%20hidden%20from%20teachers&envLink=https%3A%2F%2Faistudio.google.com%2Fapp%2Fapikey&project-name=ed-assist&repository-name=ed-assist)

- When Vercel asks for **`GEMINI_API_KEY`**, paste the school's key
  (get one at https://aistudio.google.com/app/apikey).
- After about a minute you get a link like `https://ed-assist.vercel.app` —
  **that's the link teachers use.**

> Want the site to update **automatically** every time the app is improved?
> Use the **Import existing repository** steps in [`DEPLOY.md`](DEPLOY.md)
> instead of the button. (The button makes a one-time copy that includes all the
> current fixes; importing keeps it linked for future updates.)

---

## What's in this project

| Folder / file | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The teacher website |
| `api/generate.js` | The hidden backend that holds the key and writes the plan |
| `api/framework.js` | The Framework (the engine), bundled for the backend |
| `docs/framework/` | The system documents, including **Framework v1.1** |
| `docs/preview/`, `docs/samples/` | A colored sample plan and a full sample chapter |
| `DEPLOY.md` | One-time setup, with the auto-updating import option |
| `vercel.json`, `package.json` | Vercel configuration |

---

## How a teacher uses it

1. Open the school's link.
2. **Upload the chapter pages** (a PDF or photos). The app reads the chapter
   name and number itself — no need to type them.
3. Choose **Grade**, **Subject**, and **Total sessions**.
4. Press **Generate all sessions**. Every session is written, one after another,
   with the story carried forward.
5. When it's done, **Download PDF**, **Share on WhatsApp**, or **Print**.

---

## Notes

- **Teachers never need the key.** It lives only in the Vercel setting.
- **Model:** defaults to `gemini-2.5-flash`. For the highest quality, add a Vercel
  environment variable `GEMINI_MODEL` with the value `gemini-2.5-pro`.
- **Downloads are always PDF**, formatted for comfortable reading and printing.
