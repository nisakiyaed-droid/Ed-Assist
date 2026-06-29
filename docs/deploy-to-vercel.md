# Put Ed-Assist Online with Vercel (Free)

This guide shows you how to put the website online. No coding. No command line. It takes about 5 minutes.

## Steps

1. Open your web browser and go to **https://vercel.com**.
2. Click **Sign Up** (or **Log In**). Choose **Continue with GitHub**.
3. If GitHub asks you to allow Vercel, click **Authorize**.
4. On your Vercel dashboard, click **Add New** in the top right, then click **Project**.
5. Find **Ed-Assist** in the list of repos. Click **Import** next to it. (If you don't see it, click "Adjust GitHub App Permissions" and give Vercel access.)
6. On the setup screen, find **Framework Preset** and choose **Other**.
7. Leave everything else exactly as it is. Don't touch the build or output boxes. There's nothing to fill in.
8. Click the **Deploy** button.
9. Wait a minute. When it's done, you'll see a "Congratulations" screen. Click the preview image or the link to open your live site.

Your link will look like **https://ed-assist-XXXX.vercel.app**. You can rename it later in the project settings.

## If the page looks blank or old

The newest code lives on a branch called **claude/product-building-consultation-bbqq58**, not the main one. To make that the official site:

1. In Vercel, open your project, then go to **Settings → Git**.
2. Find **Production Branch** and set it to **claude/product-building-consultation-bbqq58**.
3. Save, then go to the **Deployments** tab and click **Redeploy** on the latest one.

## Good to know

Every time we push a change to GitHub, Vercel updates your site by itself. You don't have to do anything.
