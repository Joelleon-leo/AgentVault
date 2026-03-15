# Deployment Guide

This guide will walk you through deploying your Next.js application. This application uses Auth0 for authentication and a database, so you will need to configure environment variables for those services.

## 1. Prerequisites

*   **Git:** You'll need Git installed to push your code to a repository.
*   **Hosting Provider Account:** Sign up for a hosting provider that supports Node.js applications. Vercel is highly recommended for Next.js applications.
*   **Auth0 Account:** You will need an Auth0 account to get your client ID, client secret, and issuer base URL.
*   **Database:** You will need a database and its connection URL.

## 2. Configure Environment Variables

Your application requires the following environment variables. Create a `.env.production` file in the root of your project or set these in your hosting provider's dashboard.

*   `AUTH0_SECRET`: A long, random string used to encrypt the session cookie.
*   `AUTH0_BASE_URL`: The base URL of your application (e.g., `https://yourapp.vercel.app`).
*   `AUTH0_ISSUER_BASE_URL`: The URL of your Auth0 tenant domain.
*   `AUTH0_CLIENT_ID`: Your Auth0 application's client ID.
*   `AUTH0_CLIENT_SECRET`: Your Auth0 application's client secret.
*   `DATABASE_URL`: The connection string for your database.
*   `GITHUB_CLIENT_ID`: Your GitHub OAuth app's client ID (if you use GitHub login).
*   `GITHUB_CLIENT_SECRET`: Your GitHub OAuth app's client secret (if you use GitHub login).

You can generate a suitable `AUTH0_SECRET` by running the following command in your terminal:

```bash
openssl rand -hex 32
```

## 3. Deployment Steps

1.  **Initialize a Git Repository:**
    If you haven't already, initialize a Git repository and commit your code.

    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    ```

2.  **Push to a Git Provider:**
    Create a new repository on a service like GitHub, GitLab, or Bitbucket and push your code to it.

    ```bash
    git remote add origin <your-git-repository-url>
    git push -u origin main
    ```

3.  **Deploy with Vercel (Recommended):**
    *   Go to your Vercel dashboard and click "Add New... > Project".
    *   Import your Git repository.
    *   Vercel will automatically detect that you're using Next.js and configure the build settings.
    *   In the "Environment Variables" section, add all the variables listed in step 2.
    *   Click "Deploy".

Vercel will now build and deploy your application. You'll be given a URL where you can access your live site.
