# Turning on the Lesson Planner (one-time school setup)

You do this **once**. After it, teachers just open the link, upload a chapter,
and press Generate — they never see or enter a key.

The school's Gemini key is stored as a **hidden secret** on Vercel, away from
teachers and away from the code.

## Steps (about 3 minutes)

1. Go to **https://vercel.com** and sign in with your GitHub account.
2. Click **Add New… → Project**.
3. Find and **Import** the repository **`Ed-Assist`**.
4. Before deploying, open **Environment Variables** and add:
   - **Name:** `GEMINI_API_KEY` **Value:** *(paste the school's Gemini key)*
   - *(optional)* **Name:** `GEMINI_MODEL` **Value:** `gemini-2.5-flash`
     *(use `gemini-2.5-pro` for the highest quality — a little slower and pricier)*
5. Click **Deploy**.
6. After a minute you'll get a link like **`https://ed-assist.vercel.app`**.
   That's the link teachers use.

## Notes

- **Teachers never need the key.** It lives only in the Vercel setting above.
- To **change the model** later, edit `GEMINI_MODEL` in Vercel → Settings →
  Environment Variables, then **Redeploy**.
- To **rotate the key**, get a new one at
  https://aistudio.google.com/app/apikey, update `GEMINI_API_KEY` in Vercel, and
  Redeploy.
- Every change pushed to the repository updates the live site automatically.

## Get a Gemini key

A school admin can create one at **https://aistudio.google.com/app/apikey**
(sign in with the school Google account, create an API key, paste it into the
`GEMINI_API_KEY` setting above).
