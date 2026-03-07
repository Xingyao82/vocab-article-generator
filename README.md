# LexiDraft Studio

A static website that can be deployed directly to GitHub Pages.

- Paste English words or upload vocabulary files
- Generate an English article through an OpenAI-compatible API
- Highlight every target word in bold
- Check whether all vocabulary items are covered
- Copy or download HTML and Markdown output

## Files

```text
.
|- .github/workflows/deploy-pages.yml
|- app.js
|- favicon.svg
|- index.html
`- styles.css
```

## Run Locally

Because the page calls an external API from the browser, it is better to open
it through a local static server instead of double-clicking `index.html`.

If Python is installed:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Publish to GitHub Pages

1. Create a new GitHub repository.
2. Upload the contents of this directory to the repository root.
3. Use `main` as the default branch.
4. Push the repository. GitHub Actions will run
   [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml).
5. In `Settings -> Pages`, confirm that the source is `GitHub Actions`.

The published address is usually:

```text
https://<your-user-name>.github.io/<repo-name>/
```

## API Notes

- This is a static site with no backend.
- The API key is stored in browser `localStorage`, not in the repository.
- The page sends `POST /chat/completions`.
- Fill in:
  - `Base URL`
  - `Model`
  - `API Key`

## Accepted Vocabulary Formats

- One word or phrase per line
- Comma-separated text
- Semicolon-separated text
- `.txt`
- `.csv`
- `.md`
- `.json`

JSON example:

```json
["adapt", "perspective", "take responsibility"]
```

## Limits

- A static site cannot safely hide a production API secret.
- If the vocabulary list is very long, the model may still miss items. The app
  performs up to two repair attempts and shows any remaining missing words.
- GitHub Pages can only host static files, so private server-side secrets are
  not supported inside the repository.

## References

The Pages workflow matches the current GitHub official guidance:

- [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
