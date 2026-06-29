# Turning on the Lesson Planner (one-time school setup)

You do this **once**. After it, teachers just open the link, upload a chapter,
and press Generate — they never see or enter a key.

The school's Gemini key is stored as a **hidden secret** on Vercel, away from
teachers and away from the code.

---

## Important: connect to the RIGHT repository

When you first deployed, Vercel made a **separate copy** of the project. That copy
does **not** receive new fixes. To get every future update automatically, connect
Vercel to the main **`Ed-Assist`** repository using the steps below.

You only have to do this once. After it, any improvement is live on your link
within a minute — no re-deploying by hand.

---

## Step-by-step (about 3 minutes)

1. Go to **https://vercel.com** and **Log in** (use the same GitHub account you
   used before).

2. Top-right, click **Add New…** → **Project**.

3. You'll see **Import Git Repository**. Find **`Ed-Assist`** in the list and
   click **Import** next to it.
   - If you don't see it, click **Adjust GitHub App Permissions** (or
     "Configure GitHub") and give Vercel access to the `Ed-Assist` repository,
     then come back to this screen.

4. On the **Configure Project** screen, **before** clicking Deploy, open the
   **Environment Variables** section and add the key:
   - **Key / Name:** `GEMINI_API_KEY`
   - **Value:** *(paste the school's Gemini key)*
   - Click **Add**.
   - *(Optional, for highest quality)* add a second one:
     **Name** `GEMINI_MODEL`  **Value** `gemini-2.5-pro`
     *(leave this out to use the faster, cheaper `gemini-2.5-flash` by default)*

5. Click **Deploy**. Wait about a minute.

6. You'll get a link like **`https://ed-assist.vercel.app`**.
   **That is the link teachers use.** Share it on WhatsApp, put it in a bookmark —
   that's all teachers ever need.

---

## Tidy up the old copy (optional but recommended)

So nobody uses the outdated version by mistake:

1. In Vercel, open your **old** project (the earlier copy).
2. **Settings** → scroll to the bottom → **Delete Project**.
3. Keep using the new link from Step 6 above.

---

## Everyday notes

- **Teachers never need the key.** It lives only in the Vercel setting above.
- **Updates are automatic.** Once connected to `Ed-Assist`, every fix appears on
  your live link within a minute — you don't deploy again.
- **To change the model later:** Vercel → your project → **Settings** →
  **Environment Variables** → edit `GEMINI_MODEL` → then **Redeploy**
  (Deployments tab → ⋯ → Redeploy).
- **To rotate the key:** get a new one at
  https://aistudio.google.com/app/apikey, update `GEMINI_API_KEY` in Vercel,
  then **Redeploy**.

## Get a Gemini key

A school admin can create one at **https://aistudio.google.com/app/apikey**
(sign in with the school Google account, **Create API key**, copy it, and paste
it into the `GEMINI_API_KEY` setting in Step 4).
