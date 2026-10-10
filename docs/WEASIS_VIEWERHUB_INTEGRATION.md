# Weasis ViewerHub and OIDC integration

This integration enables a one-click launch from VIARA to Weasis through an externally operated Weasis ViewerHub and Gateway. It does not place a VIARA session token, API token, client secret, or bearer token in the launch URL.

## Request flow

1. VIARA opens the configured ViewerHub authenticated launch endpoint for the selected study.
2. ViewerHub/Gateway completes the configured OIDC authorization-code flow.
3. The Gateway sends the resulting short-lived access token to the VIARA DICOMweb proxy.
4. VIARA validates the token's signature, issuer, audience, lifetime, and PACS scope. The token must also identify the corresponding VIARA user.
5. VIARA loads the user's active state and current role from its database, checks the PACS permission, and applies the existing study-assignment policy to every DICOMweb request.

The Gateway must proxy to VIARA's `/api/pacs/dicom-web` endpoint. Do not configure it to bypass VIARA and connect directly to Orthanc or another archive; that would bypass VIARA's PACS authorization policy.

## Identity provider and VIARA configuration

Configure an OIDC access token with:

- An exact issuer URL and a dedicated audience for the VIARA PACS API.
- A `pacs.read` scope (or a different scope configured below).
- A `viara_user_id` claim containing the user's immutable VIARA `users.user_id` UUID.
- An access-token lifetime of five minutes or less.

Provision or link the identity-provider user to the corresponding VIARA staff user, then add the immutable VIARA UUID to the **access token** as `viara_user_id` (for example, using a Keycloak protocol mapper or the equivalent custom-claim feature in the selected provider). Do not use an email address, display name, or an unverified user-supplied claim for this mapping. Add `pacs.read` as an access-token scope and ensure the resulting `aud` is exactly the configured API audience. These values must be present on the token the Gateway actually forwards, not only on the ID token used by the login client.

Set the following backend environment values together. OIDC authentication remains disabled when they are all unset; partial configuration fails closed when an OIDC token is presented.

```dotenv
PACS_OIDC_ISSUER=https://identity.example.org/realms/viara
PACS_OIDC_AUDIENCE=viara-pacs
PACS_OIDC_JWKS_URL=https://identity.example.org/realms/viara/protocol/openid-connect/certs
PACS_OIDC_USER_ID_CLAIM=viara_user_id
PACS_OIDC_REQUIRED_SCOPE=pacs.read
PACS_OIDC_MAX_TOKEN_TTL_SECONDS=300
```

Production issuer and JWKS URLs must use HTTPS. VIARA accepts RS256 or ES256 signatures from the configured JWKS, and checks the exact issuer and audience. The active role is loaded from VIARA rather than trusted from OIDC claims. Deactivated users and users required to change their VIARA password are rejected. PACS access permission and the existing per-study assignment rules still apply.

OIDC access tokens are independent of VIARA browser sessions. Revoking a VIARA login session does not revoke an already-issued OIDC token; keep the provider's access-token lifetime short (maximum 10 minutes, five minutes recommended). Disabling a VIARA account is checked on each DICOMweb request.

## Local Keycloak for development

The main development Compose file includes an **opt-in, development-only** Keycloak service. It is not enabled by default and is not part of the production package.

1. Copy `.env.example` to `.env`, set `KEYCLOAK_DEV_ADMIN_PASSWORD` to a strong local-only password, and start Keycloak:

   ```powershell
   docker compose --profile oidc-dev up -d keycloak
   ```

   Open `http://localhost:8081` and sign in with `KEYCLOAK_DEV_ADMIN_USERNAME` and `KEYCLOAK_DEV_ADMIN_PASSWORD`. The service binds to loopback only and stores its development data in the `keycloak_dev_data` volume.

2. Create a realm named `viara`. Its issuer URL is `http://localhost:8081/realms/viara`; confirm it at `http://localhost:8081/realms/viara/.well-known/openid-configuration`.

3. Create a client for the **Gateway** (not VIARA's browser app): use OpenID Connect, enable Client authentication and Standard flow, and leave Implicit flow, Direct access grants, and Service accounts disabled. Set the exact redirect URI and web origin required by the Gateway you are testing. Do not guess or use a wildcard redirect URI.

4. Create a client scope named `pacs.read` and attach it as a default scope to that Gateway client. Add these protocol mappers to the scope:
   - **User Attribute**: user attribute and token claim `viara_user_id`, claim type String, included in the Access Token. Assign the value administratively for each test user, matching that user's immutable VIARA `users.user_id` UUID.
   - **Audience**: add `viara-pacs` to the Access Token audience.

   Ensure the issued Access Token's `scope` contains `pacs.read`. Create a Keycloak user for testing and set its `viara_user_id` attribute to the UUID of an active VIARA user who has PACS viewing permission. Do not enable user self-registration or let users edit this attribute.

5. Set the Access Token lifespan in the realm to 5 minutes. In the root `.env`, configure VIARA with these development values:

   ```dotenv
   PACS_OIDC_ISSUER=http://localhost:8081/realms/viara
   PACS_OIDC_AUDIENCE=viara-pacs
   PACS_OIDC_JWKS_URL=http://keycloak:8080/realms/viara/protocol/openid-connect/certs
   PACS_OIDC_USER_ID_CLAIM=viara_user_id
   PACS_OIDC_REQUIRED_SCOPE=pacs.read
   PACS_OIDC_MAX_TOKEN_TTL_SECONDS=300
   ```

   The issuer uses `localhost` because that is the URL Keycloak places in tokens and the browser can reach. The backend uses the Compose-only `keycloak` hostname for the JWKS fetch. The backend permits this HTTP JWKS address only outside production; production must use HTTPS. Restart the backend after changing `.env`.

This starts the identity provider only; it does **not** install ViewerHub/Gateway or create its OIDC client/redirect URI. End-to-end Weasis launch requires a separately running Gateway and the exact redirect URI it documents. Do not use this local Keycloak configuration with real patient data or expose its HTTP endpoint beyond the development machine.

## ViewerHub/Gateway configuration

Configure a DICOMweb archive in ViewerHub/Gateway that points to VIARA's DICOMweb proxy, and configure the Gateway's **authorization-code** filter/flow to forward the signed-in user's OIDC access token as `Authorization: Bearer <token>`. Limit the configured archive to the DICOMweb services required for retrieval. Do not use a service-account token or client-credentials flow for individual readers; that would remove the user's identity from VIARA's per-study authorization checks.

In VIARA **PACS Settings**, set the external viewer URL template to the authenticated ViewerHub launch endpoint, for example:

```text
https://viewerhub.example.org/display/auth?viewer=WEASIS&studyUID={studyUid}&archive=viara
```

Replace the ViewerHub origin and `archive` value with the values configured by the operator. The `display/auth` endpoint is the ViewerHub authenticated launch path. When configured, VIARA's external-viewer launch button opens the selected study through ViewerHub and the identity provider. Use HTTPS and configure ViewerHub and reverse-proxy access logs to avoid retaining study identifiers from launch query strings longer than operationally necessary.

## Production deployment requirements

The upstream ViewerHub sample Imaging Hub Compose stack is documented for development and testing, not production. Do not deploy its sample credentials or unmodified Compose configuration in production. Operate ViewerHub and Gateway with a reviewed production configuration, pinned images, HTTPS, restricted network access, protected secrets, and persistent storage appropriate to the deployment. Verify the configured OAuth redirect URIs and the Gateway's Authorization-header forwarding before enabling the launch template.

Official references:

- [ViewerHub overview](https://weasis.org/en/viewer-hub/)
- [ViewerHub launch APIs](https://weasis.org/en/viewer-hub/api/)
- [ViewerHub connectors and authentication](https://weasis.org/en/viewer-hub/connectors/)
- [ViewerHub Gateway source and configuration](https://github.com/nroduit/viewer-hub-gateway)
- [ViewerHub source and deployment notes](https://github.com/nroduit/viewer-hub)
