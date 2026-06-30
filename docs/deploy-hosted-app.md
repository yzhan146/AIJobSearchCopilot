# Hosted App Deployment

GetThatJob! should live as its own hosted web app. `marshallzzz.com/getThatJob/` should stay a lightweight gateway page that points visitors to the live app.

## Recommended shape

1. Deploy this repo as a Node web service.
2. Give it a stable public URL such as `https://getthatjob.marshallzzz.com/`.
3. Let the website repo keep only the gateway page and brand entry links.
4. Push future product changes only to this repo.

## Render setup

This repo now includes `render.yaml`, so Render can create the web service from the repo directly.

Suggested environment variables:

```text
LLM_PROVIDER=zhipu
ZHIPU_API_KEY=...
ZHIPU_MODEL=glm-4.7
ZHIPU_ENDPOINT=https://open.bigmodel.cn/api/paas/v4/chat/completions
```

Optional additions:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5
```

The service start command is:

```text
node web_server.js
```

The health check path is:

```text
/healthz
```

## Domain split

Once the hosted app is live:

1. Point `getthatjob.marshallzzz.com` to the deployed service.
2. Keep `marshallzzz.com/getThatJob/` as the public entry page.
3. Let that gateway auto-forward visitors to the hosted app when the domain is reachable.

After that split, day-to-day product work should happen only in `AIJobSearchCopilot`.
