# Deployment — image, publishing, and release flow

Public-safe guidance only. **No hostnames, addresses, ports, server paths, image
digests tied to a private environment, credentials, service inventory, or
Compose deployment instructions appear here** — those live in the operator's
untracked notes. The container image itself is generic; a deployment supplies
every concrete value through the environment.

## The image

Built from the repository [`Dockerfile`](../Dockerfile):

- Multi-stage. A digest-pinned Node LTS base (never a floating tag); the build
  stage produces the `@sveltejs/adapter-node` output; a fresh runtime stage
  carries only that output and production dependencies.
- Runs as the base image's **non-root** user.
- Contains **no** source, tests, specs, VCS metadata, environment file, or the
  operator's private context file.
- Configuration is **environment-only** and fails closed at boot
  (`src/lib/server/env.ts`) — a missing or malformed required value exits the
  process.
- The container `HEALTHCHECK` calls `/healthz` on the **configured runtime
  listener** (the port the server binds, from its environment); the image
  hard-codes no port and carries no `EXPOSE`.
- `CMD ["node", "build"]`.

## CI workflow

The build / validate / publish workflow is
[`.github/workflows-pending/build.yml`](../.github/workflows-pending/build.yml).
It must be moved to `.github/workflows/build.yml` to take effect —
`git mv .github/workflows-pending/build.yml .github/workflows/build.yml` from a
push that carries the `workflow` token scope, or via the GitHub web editor. No
content change is needed on the move.

## Registry and tags

CI publishes to this repository's **public** GitHub Container Registry package.

| Trigger                            | Published tag                                       |
| ---------------------------------- | --------------------------------------------------- |
| push to `main`                     | the immutable per-commit tag `sha-<short>` only     |
| owner pushes a `v<semver>` git tag | the matching `v<semver>` image (plus `sha-<short>`) |

- **Never** `latest`, and never a mutable branch tag.
- CI authenticates with the built-in `GITHUB_TOKEN` and least-privilege
  permissions (`packages: write` only on the publish job). **No** personal access
  token or repository secret is used.
- **CI never creates a git tag.** It only reacts to tags the owner pushes.
- No CI secret is needed for the portal's own authentication: the password hash
  and the session signing secret are **runtime** environment values, supplied
  only where the container runs.

### One-time owner action

Making the GHCR package **public** (so a host pulls it anonymously, with no
stored registry credential) is a one-time setting in the package's visibility
options. It is **not** automated by CI.

## Release flow

1. Changes land on `main` through reviewed PRs; each `main` build publishes a
   `sha-<short>` image. These are for review / preview use.
2. A versioned release is cut **only after final acceptance passes** (WP16a): the
   **owner** manually creates a `v<semver>` git tag from an accepted `main`
   commit and pushes it. CI then publishes the matching `v<semver>` image.
3. A deployment pins the image by its **`@sha256:` digest** (resolved from the
   published tag), not by a tag.

## Promote / roll back a running deployment

Generic procedure — a deployment's own directory, project name, networks, and
env file are private operator configuration:

- **Promote:** pull the intended image, resolve its `@sha256:` digest, change the
  single portal image-digest line (keep the previous digest as a rollback
  comment), re-apply **only** the portal service, then re-check `/healthz`, the
  logs, and the UI.
- **Roll back:** restore the previous digest line and re-apply the portal
  service.
- The container is always **stopped and re-applied**, never destroyed, and
  **never** with volume removal. There is **no** auto-updater.

## External access

Reaching the portal from outside the home network is handled by a separately
operated HTTPS reverse proxy and is an **unverified external acceptance gate**
(WP16b). This project creates or modifies **no** DNS, router, firewall, VPN,
CDN, or reverse-proxy configuration.
