# Connect Android Agent to Gemini

The existing Windows stack exposes the same phone tools to Gemini and ChatGPT.
In Gemini web, open Settings > Connected Apps > Custom apps and add the public
HTTPS server URL ending in `/mcp`. Complete Google's linking flow and enter the
owner approval key only on this server's approval page. Select the app using `@`
after connecting. Initial setup is on the web; account availability is controlled
by Google.

The OAuth gateway supports dynamic registration with public clients (`none`) and
`client_secret_post`. Secrets are returned once at registration, stored only as
hashes inside encrypted state, and required for token exchange, refresh, and
revocation for secret-authenticated clients. S256 PKCE and owner approval remain
required. Existing ChatGPT registrations remain compatible.

Gemini callback validation accepts only these exact Google relay hosts:

- `oauth-redirect.googleusercontent.com`
- `oauth-redirect-sandbox.googleusercontent.com`
- `oauth-redirect-test.googleusercontent.com`

Each callback must use HTTPS and a single `/r/user_bound_custom-mcp-…` or
`/a/user_bound_custom-mcp-…` path with a nonempty letters/digits/underscore/hyphen
suffix. Queries, fragments, credentials, custom ports, other Google hosts and
other paths are rejected. The exact registered URI remains bound to authorization
and token exchange. The browser form policy allows the named relays and Gemini's
web origin for the return flow; this does not relax callback validation.

Google documents the production/sandbox relay and the `/r/` account-linking
route. Gemini's six-URI registration and `client_secret_post` request were
reported in the upstream integration issue below; the particular account's live
Gemini handshake still needs verification. Do not treat registration tests as a
completed live Gemini connection.

After changing gateway code, restart the managed Windows stack. Saved pairing
and unexpired OAuth grants survive restart; active phone sessions do not. Retry
adding the custom app rather than entering the owner approval key as a client
secret. Test `phone_status` before requesting any phone actions.

Sources:

- https://support.google.com/gemini/answer/17209137?hl=en-yt
- https://developers.google.com/identity/account-linking/google-api-reference
- https://github.com/BerriAI/litellm/issues/46640

Validation: `node --test server/test/*.test.mjs` (57 passing tests).
