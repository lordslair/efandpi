# GitHub Actions workflows

**Version 2.0.0** (2026-10-19), see [Changelog](#changelog).

How the CI/CD in this folder is built, and the rules to follow when changing it.

This document is shared between repositories: it describes the conventions, not one project. Paths are relative to the repository root, and "default branch" means the branch set in the pipelines' `on:` (`main` or `master`).

Two layouts are covered:

- **Single image**: one app, one `Dockerfile` at the repository root, one image.
- **Multiple images**: several apps in subdirectories (e.g. `backend/`, `frontend/`), each with its own `Dockerfile` and image.

Everything applies to both unless a section says otherwise. Python and Node are used as examples; the rules are the same for any language.

## Overview

| File | Name | Trigger | Role |
|------|------|---------|------|
| [pipeline-tests.yml](pipeline-tests.yml) | Pipeline Tests | push / PR to the default branch, `workflow_dispatch` | lint + tests + image build, pushes the `edge` image (default branch pushes only) |
| [pipeline-release.yml](pipeline-release.yml) | Pipeline Release | push of a `v*` tag | lint + tests, then builds and pushes the release images |
| `lint.yml` / `lint-<app>.yml` | Lint / Lint (`<app>`) | `workflow_call` only | reusable lint job |
| `tests.yml` / `tests-<app>.yml` | Tests / Tests (`<app>`) | `workflow_call` only | reusable test job |

Only the two `pipeline-*` workflows have real triggers. The `lint*` and `tests*` files are reusable workflows: they are never run on their own, only called by the pipelines.

A single-image repository has one `lint.yml` and one `tests.yml`. A multiple-images repository has one pair per app (`lint-backend.yml`, `tests-backend.yml`, `lint-frontend.yml`, `tests-frontend.yml`), since each app has its own language, toolchain and dependency files.

```
pipeline-tests / pipeline-release
├── lint[-<app>]   (uses ./.github/workflows/lint[-<app>].yml)    one per app
├── tests[-<app>]  (uses ./.github/workflows/tests[-<app>].yml)   one per app
└── build-push     (needs: every lint and tests job)              matrix over apps if several
```

All lint and tests jobs run in parallel; `build-push` only starts when **all** of them pass. A frontend test failure blocks the backend image too: the apps are released together, at the same commit.

## Reusable jobs

### Reading the runtime version

Every lint and tests job starts by reading the runtime version (Python, Node, ...) from the app's `Dockerfile`, so CI always runs the same version as the image. The version is never written in a workflow.

The step matches the `FROM` line **by image name**, not by position, and fails if nothing matches:

```yaml
# CI runs the same Python as the image: the version comes from the Dockerfile only
- name: Read Python version 🔍
  id: python
  run: |
    version=$(sed -nE 's/^FROM python:([0-9]+\.[0-9]+).*/\1/p' Dockerfile | head -1)
    if [ -z "$version" ]; then
      echo "::error::No 'FROM python:X.Y' found in Dockerfile"
      exit 1
    fi
    echo "version=$version" >> "$GITHUB_OUTPUT"
```

For Node, match `^FROM node:([0-9]+)` (major only, e.g. `26`) and name the step `Read Node version 🔍`.

With a multi-stage `Dockerfile`, the version that matters is the stage that **builds or runs the code**, which is not always the final one. A frontend typically builds with `FROM node:26-alpine AS builder` and serves with `FROM nginx:...`: CI must use Node 26, and matching on the image name (`node:`) finds it whatever the stage order. If the `Dockerfile` has several stages from the same image with different versions, add a comment in the `Dockerfile` saying which one CI follows, and match on it explicitly (e.g. `AS builder`).

### Lint ([lint.yml](lint.yml))

1. Reads the runtime version from the `Dockerfile`.
2. Sets up the runtime, with a dependency cache keyed on the lint dependencies.
3. Installs the lint dependencies only.
4. Runs a minimal check that only fails on real errors, not on style:

| Language | Dependencies | Command |
|----------|--------------|---------|
| Python | `requirements-lint.txt` (flake8, pinned) | `flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics` |
| TypeScript | `package-lock.json` (`npm ci`) | `npx tsc --noEmit` (plus `npm run lint` if the project has an eslint config) |

Style settings (`.flake8`, eslint/prettier rules, ...) apply to local runs; they are not enforced by CI.

For TypeScript, `tsc` also runs inside the image build (`npm run build`), but only after the tests and as part of a multi-minute Docker build. The lint job gives the same answer in seconds, on every PR, next to the test results.

### Tests ([tests.yml](tests.yml))

1. Same runtime version detection from the `Dockerfile`.
2. Sets up the runtime, with a dependency cache keyed on the runtime **and** test dependencies.
3. Installs the runtime and test dependencies.
4. Runs the test suite:

| Language | Dependencies | Command | Config |
|----------|--------------|---------|--------|
| Python | `requirements.txt` + `requirements-tests.txt` | `pytest` | `pytest.ini` (typically `pythonpath = code`, `testpaths = tests`) |
| TypeScript | `package-lock.json` (`npm ci`) | `npx vitest run --passWithNoTests` | `vite.config.ts` / `vitest.config.ts` |

An empty test suite passes with a warning, so a repository (or a new app) can use these workflows before it has tests; every other failure fails the job. pytest exits with code 5 when it collects nothing, and the job turns that into a warning; vitest does the same with `--passWithNoTests`.

External services (Discord, Kubernetes, APIs, ...) are faked in the tests: no token, network access or secret is needed. Keep it that way, since this job also runs on pull requests (where secrets are unavailable).

### Multiple images: working directory

The reusable workflows of an app set it once at job level instead of repeating `cd` or paths in every step:

```yaml
defaults:
  run:
    working-directory: backend
```

`defaults.run` only applies to `run:` steps. Action inputs that take a path (`cache-dependency-path`, `context`, `file`, ...) still need the app directory written out (`backend/requirements.txt`, `frontend/package-lock.json`).

## Pipelines

Both pipelines share the same `build-push` structure: checkout → Docker Hub login → `docker/metadata-action` (tags) → (QEMU) → Buildx → `docker/build-push-action`.

### Image names

| Layout | Image | Build context | Dockerfile |
|--------|-------|---------------|------------|
| Single image | `${{ vars.DOCKER_USERNAME }}/${{ github.event.repository.name }}` | `.` | `./Dockerfile` |
| Multiple images | `${{ vars.DOCKER_USERNAME }}/${{ github.event.repository.name }}-${{ matrix.app }}` | `./${{ matrix.app }}` | `./${{ matrix.app }}/Dockerfile` |

The image name is built from the Docker Hub account, the GitHub repository name and (if several) the app directory name, so the same block works in any repository without changes. Renaming the repository or an app directory changes the image name: update whatever deploys it (Kubernetes manifests, compose files, ...).

### Multiple images: the build matrix

`build-push` runs once per app through a matrix:

```yaml
strategy:
  # One app failing must not cancel the others: each image is pushed or not on its own result
  fail-fast: false
  matrix:
    app: [ backend, frontend ]
```

`fail-fast: false` because the default (`true`) does not keep images consistent anyway: when one app fails, the other may already have pushed. It only hides the second app's result. Lint and tests run before the matrix, so a failing build here is a build problem (Dockerfile, registry, network), not a code problem.

The matrix status checks are named `build-push (backend)`, `build-push (frontend)`: see [Migrating a repository](#migrating-a-repository) for branch protection.

### Build cache

Both pipelines use the GitHub Actions cache (`type=gha`). Its `scope` defaults to a single shared name (`buildkit`), so with several images **every image must set its own scope**, otherwise each build overwrites the other's cache and both always build from scratch, silently:

```yaml
cache-from: type=gha,scope=${{ matrix.app }}
cache-to: type=gha,scope=${{ matrix.app }},mode=max
```

The release pipeline must read the **same** scope as the default branch writes. A single-image repository can leave the scope out.

### Build args

Both pipelines pass two build args, so the app can show what it runs:

| Build arg | Value | Example |
|-----------|-------|---------|
| `VERSION` | `steps.meta.outputs.version` | `1.2.3` (release), `edge` (default branch) |
| `COMMIT` | `github.sha` | full commit SHA |

The `Dockerfile` declares them with local-build defaults (`ARG VERSION=dev`, `ARG COMMIT=unknown`) and copies them into `ENV`. Declare them **last**: `COMMIT` changes on every build and invalidates the cache of every layer after it. A `Dockerfile` that doesn't use them ignores them.

For a frontend built into static files, `ENV` in the final stage is useless (the browser never sees it). Declare the args in the **build stage**, before the build command, and expose them to the bundler (e.g. `ENV VITE_VERSION=$VERSION` for Vite). Since that is before the build, `COMMIT` invalidates the build step's cache on every commit: that step changes on every commit anyway, and the dependency install above it stays cached.

### Multi-arch images

Only build for the platforms that actually run the image. Add `platforms: linux/amd64,linux/arm64` only when an arm64 host (Raspberry Pi, Ampere, Graviton, Apple Silicon dev machines, ...) pulls it, and say so in a comment.

On the standard `ubuntu-24.04` runner, the arm64 build runs through QEMU (`docker/setup-qemu-action`) in emulation, which is **several times slower**, especially for `npm ci`, bundlers and compiled dependencies. Two consequences:

- The `build-push` timeout must be raised (see [Conventions](#conventions)), with a comment saying why.
- The build cache matters even more: a cached multi-arch build takes about as long as an uncached single-arch one.

If emulated builds become too slow, the alternative is native runners: build each platform on its own runner (`ubuntu-24.04` and `ubuntu-24.04-arm`, free on public repositories), push by digest, and merge them into one tag with `docker buildx imagetools create`. This is a lot more workflow to maintain: only do it when emulation is an actual problem.

### Tag ownership

Every tag pushed to Docker Hub is written by **exactly one** pipeline:

| Tag | Written by | Moves? |
|-----|------------|:-:|
| `edge` | Pipeline Tests, default branch pushes only | ✅ |
| short SHA | both (same commit → same image) | ❌ |
| `{{version}}`, `{{major}}.{{minor}}` | Pipeline Release | `X.Y` ✅ |
| `latest` | Pipeline Release | ✅ |

Never list a tag type in a pipeline that does not own it, even when `docker/metadata-action` would skip it for that event (`type=edge` outputs nothing on a tag push, for example). The metadata block must show at a glance what the pipeline pushes.

### Pipeline Tests ([pipeline-tests.yml](pipeline-tests.yml))

| Event | Lint + tests | Build | Docker Hub login | Push | Tags |
|-------|:-:|:-:|:-:|:-:|------|
| push to the default branch | ✅ | ✅ | ✅ | ✅ | `edge`, short SHA |
| pull request to the default branch | ✅ | ✅ | ❌ | ❌ | – |
| `workflow_dispatch` (any branch) | ✅ | ✅ | ❌ | ❌ | – (dry run) |

- The Docker Hub login and the push are both gated on `github.event_name == 'push'`. See [Secrets and variables](#secrets-and-variables) for why the login must be gated too, not only the push.
- Unmerged code must never overwrite `edge`.
- Writes the GitHub Actions build cache (`cache-to: type=gha,mode=max`), so the default branch keeps it warm.
- Concurrency group: `<workflow>-<event_name>-<ref>`.
  - PRs and dry runs: `cancel-in-progress: true` (a new run cancels the previous one).
  - Default branch pushes: queued, never cancelled, so an older run can never push `edge` after a newer one.
  - The event name is part of the group so a dry run on the default branch never takes the place of a queued push.

### Pipeline Release ([pipeline-release.yml](pipeline-release.yml))

Triggered by pushing a `v*` tag (e.g. `v1.2.3`). Always pushes, with these tags:

- `{{version}}` (e.g. `1.2.3`)
- `{{major}}.{{minor}}` (e.g. `1.2`)
- short SHA
- `latest`

- Runs the same lint and tests as Pipeline Tests before building. A tag can be pushed on any commit, including one that never went through a PR.
- Build cache is **read-only** (`cache-from: type=gha`, no `cache-to`): a tag's cache could only be reused by that same tag, so it reuses the one the default branch's `edge` builds already filled (same `scope` per app).
- Concurrency group: the workflow name, with `cancel-in-progress: false`. Releases run one at a time, so an older tag can never push `latest` after a newer one.

## Secrets and variables

| Name | Kind | Used by |
|------|------|---------|
| `DOCKER_USERNAME` | repository **variable** (`vars.`) | login + image namespace |
| `DOCKER_PASSWORD` | repository **secret** (`secrets.`) | Docker Hub login |

No other secret or variable is used. Tests and lint need none.

**Only log in when the run pushes.** A build with `push: false` does not need registry credentials (public base images are pulled anonymously), and a login step on a run without secrets fails the job:

- Pull requests from **forks** get no secrets at all.
- Pull requests opened by **Dependabot** only get *Dependabot* secrets (Settings → Secrets and variables → Dependabot), not the Actions secrets. `DOCKER_PASSWORD` is empty there unless it was also added as a Dependabot secret, which it should not be.

Gating the login on `github.event_name == 'push'` keeps the credentials out of every run that does not need them, and makes PR runs work the same for everyone.

## Conventions

Follow these when adding or editing a workflow:

- **Header comment**: every file starts with a short comment saying what *this* file does and when it runs. Never keep a template's comment (e.g. GitHub's "This workflow will install Python dependencies...") on a workflow that does something else.
- **Unique names**: the `name:` of each workflow is unique in the repository and matches the Overview table. Two workflows with the same name can't be told apart in the Actions tab or in status checks.
- **Least privilege**: top-level `permissions: contents: read`. Add more only at job level and only when needed.
- **Runner**: `ubuntu-24.04` (or `ubuntu-24.04-arm` for native arm64 builds), pinned, never `ubuntu-latest`.
- **Timeouts**: every job sets `timeout-minutes`. Defaults: 5 for lint/tests, 10 for build-push, 15 for a multi-arch build-push through QEMU. Anything above the default gets a comment saying why.
- **Step names**: every step has a `name:`, a short label followed by an emoji (`Checkout 🛎️`, `Read Python version 🔍`, `Set up Python X.Y 🐍`, `Read Node version 🔍`, `Set up Node X 🟢`, `Install requirements ⏬`, `Lint with flake8 📝`, `Type-check with tsc 📝`, `Test with PyTest ⚙️`, `Test with Vitest ⚙️`, `Log in to Docker Hub 🔐`, `Extracting Metadata 🔧`, `Set up QEMU 🔧`, `Set up Docker Buildx 🐳`, `Build 🏗️ & Push to Docker Hub 🚀`, ...). Reuse the existing ones for the same kind of step, including `Checkout 🛎️` on the first step.
- **Actions**: pinned to a major version tag (`actions/checkout@vN`, `docker/build-push-action@vN`, ...). Dependabot bumps them, per repository: the version numbers in this document's examples may lag behind, the repository's workflows are the reference.
- **Runtime version**: never hard-coded in a workflow. It is read from the app's `Dockerfile`, matched by image name (see [Reading the runtime version](#reading-the-runtime-version)). To change it, change the `Dockerfile` only.
- **Dependency split**: each job installs only what it needs, and its dependency cache is keyed on those same files.
  - Python: runtime deps in `requirements.txt` (compiled from `requirements.in`), lint-only deps in `requirements-lint.txt`, test-only deps in `requirements-tests.txt`, all pinned. No catch-all `requirements-dev.txt`.
  - Node: `package.json` `dependencies` / `devDependencies`, installed with `npm ci` from `package-lock.json` (committed). Cache: `actions/setup-node` with `cache: npm` and `cache-dependency-path` pointing at the lockfile.
- **No project names**: image names and similar values come from the GitHub context (`github.event.repository.name`, ...), matrix values or repository variables, never hard-coded, so the workflows can be copied between repositories as-is.
- **Shared steps go in reusable workflows**: anything both pipelines need (like lint or tests) lives in its own `workflow_call` file and is called with `uses: ./.github/workflows/<file>.yml`, rather than being duplicated.
- **No push without lint + tests**: any job that pushes an image must `needs:` every lint and tests job, of every app.
- **No registry login without a push**: see [Secrets and variables](#secrets-and-variables).
- **Ordering safety**: a workflow that pushes a moving tag (`edge`, `latest`, `X.Y`) must use a concurrency group that queues instead of cancelling.
- **One owner per tag**: see [Tag ownership](#tag-ownership).
- **One cache scope per image**: see [Build cache](#build-cache).
- **No `paths:` filters on the pipelines**: GitHub never reports a status for a workflow skipped by `paths:`, so a required check stays "Expected" forever and blocks the PR. In a multiple-images repository, the scoped build cache already makes an unchanged app's rebuild cheap.
- **Inline comments** explain the *why* of non-obvious settings (concurrency, cache mode and scope, `if:` gates, `fail-fast`, platforms, raised timeouts). Keep them up to date when changing those settings.
- **README**: the "GitHub Actions pipelines" section of the repository's `README.md` summarises the pipelines; update it if their triggers or behaviour change.

## Testing workflow changes

From quickest to most realistic. Run at least the first and the last before merging a workflow change.

### 1. Static check: [actionlint](https://github.com/rhysd/actionlint)

Single binary, no Docker. Checks YAML and workflow syntax, `${{ }}` expressions and context names, `needs:`, reusable workflow `uses:`, action inputs, and `run:` scripts (through `shellcheck`, if installed). It runs nothing.

```
actionlint            # from the repository root, checks every file in .github/workflows/
```

### 2. Local run: [act](https://github.com/nektos/act)

Single binary, needs Docker. Runs the workflows in containers that imitate GitHub runners, following the reusable workflows and `if:` gates. Good to check lint and tests and the job graph. Not a guarantee that GitHub behaves the same.

```
act pull_request -l          # list the jobs a PR would run
act pull_request \
  -e pr-event.json \
  -P ubuntu-24.04=catthehacker/ubuntu:act-24.04 \
  --var DOCKER_USERNAME=dummy \
  --concurrent-jobs 1
```

- `-e pr-event.json`: a minimal event payload. `github.event.repository.name` (used for the image name) is empty without it:
  ```json
  { "repository": { "name": "<repo>", "default_branch": "<default branch>" },
    "pull_request": { "number": 1, "base": { "ref": "<default branch>" } } }
  ```
- `-P ubuntu-24.04=...`: maps the pinned runner to an act image (about 2.3 GB, plus the build needs about 1 GB free).
- `--concurrent-jobs 1`: act shares one tool cache between jobs, so lint and tests jobs installing the same runtime in parallel corrupt each other. On GitHub each job has its own VM.
- `--matrix app:backend`: with multiple images, only runs that matrix entry of `build-push` (the lint and tests jobs still all run).
- Only use `pull_request` or `workflow_dispatch`: on `push` events act really logs in and pushes to Docker Hub.

Known limits with these workflows:

- `docker/metadata-action` fails with `Bad credentials`: it calls the GitHub API with the job token, which act fakes (an empty `-s GITHUB_TOKEN=` does not help). A real read-only token (`-s GITHUB_TOKEN=...`) should get past it.
- The `type=gha` build cache needs GitHub's cache service and does not work under act.
- The `setup-python` / `setup-node` dependency cache can't be saved (`reserveCache failed`): only a warning.
- Multi-arch builds through QEMU work under act but are very slow; drop `platforms` locally if you only want to check the job graph.
- Avoid `-j lint` / `-j tests`: it also selects the reusable workflow itself as a standalone job, both runs get the same container name, and one fails with `Conflict. The container name ... is already in use`. Run the whole event instead.

### 3. On GitHub

The only fully realistic run. Push the branch and open a PR to the default branch: Pipeline Tests runs lint, tests and the full image build (with cache), and pushes nothing.

`workflow_dispatch` runs the same dry run on any branch (Actions tab, or `gh workflow run pipeline-tests.yml --ref <branch>`). The workflow file must already exist on the default branch for it to be dispatchable, so it can't test a brand new workflow.

## Migrating a repository

To bring a repository with older workflows (e.g. `build-on-pr.yml` / `build-on-push.yml` / `build-on-release.yml`) to these conventions:

1. **Note the current required checks** (Settings → Branches / Rules → required status checks) before changing anything.
2. **Add the new files** (`pipeline-*`, `lint*`, `tests*`) and **delete the old ones in the same PR**, so the two sets never run side by side and push the same tags.
3. **Align the dependency files** with the [dependency split](#conventions) (e.g. rename `requirements-dev.txt` to `requirements-tests.txt`, add `requirements-lint.txt`) and update the Dependabot config if directories or groups change.
4. **Update the required checks.** Status checks are named after jobs: `<caller job> / <reusable job>` for reusable workflows (e.g. `tests-backend / tests`), `<job> (<matrix value>)` for matrix jobs (e.g. `build-push (frontend)`). The old names stay "Expected" forever and block every PR until they are removed from the rule. Pick the new names once they have run at least once (on the migration PR itself).
5. **Check what deploys the images**: if the image names change (see [Image names](#image-names)), update the Kubernetes manifests, compose files, etc.
6. **Update the README** section about the pipelines.
7. Run [actionlint](#1-static-check-actionlint), then let the migration PR run Pipeline Tests on GitHub.

## Dependabot

[.github/dependabot.yml](../dependabot.yml) checks weekly for updates to:

- the app's dependency manager: `pip` (requirements files), `npm` (`package.json` / lockfile), ...
- `github-actions` (action versions in the workflows), with `directory: "/"`
- `docker` (each `Dockerfile`'s base images, which also changes the runtime used by CI)

With multiple images, there is **one entry per app and per ecosystem**, each with its app's `directory` (e.g. `pip` in `/backend`, `npm` in `/frontend`, `docker` in both).

Use `groups` for packages that must move together (e.g. `pytest*`; `vite`, `vitest*`, `@vitejs/*`, `@vitest/*`; `react`, `react-*`, `@types/react*`): one PR per group instead of several PRs that fail on their own because they only bump half of a set.

Dependabot PRs go through **Pipeline Tests** like any other PR, without Docker Hub credentials (see [Secrets and variables](#secrets-and-variables)).

## Releasing

```
git tag v1.2.3
git push origin v1.2.3
```

Pipeline Release then lints, tests, and pushes `1.2.3`, `1.2`, the short SHA and `latest` to Docker Hub (for every image, with multiple images).

## Changelog

Versioning of this document: **major** when a convention changes or is added and existing repositories must be updated to follow it, **minor** for new guidance that existing repositories already satisfy (or new optional sections), **patch** for wording and fixes. When copying this file to a repository, keep the version: it tells which conventions that repository follows.

### 2.0.0 (2026-10-19)

- Covers repositories with multiple images (one app per subdirectory): image names, build matrix with `fail-fast: false`, one reusable lint/tests pair per app, working directory.
- Language-neutral rules, with Python and Node/TypeScript examples (lint with `tsc --noEmit`, tests with `vitest run --passWithNoTests`, npm cache).
- Runtime version matched by image name in the `Dockerfile`, with guidance for multi-stage builds.
- One `type=gha` cache scope per image; the release reads the same scope.
- Build args for static frontends.
- Multi-arch builds: when to use them, QEMU cost, native-runner alternative.
- Tag ownership: each tag written by exactly one pipeline.
- No registry login without a push (fork and Dependabot PRs have no Docker Hub secret).
- New conventions: unique workflow names, no template header comments, every step named, timeouts above defaults commented, no `paths:` filters on the pipelines, no catch-all `requirements-dev.txt`.
- New sections: Migrating a repository (incl. required status check names), Dependabot with several apps and `groups`.
- act: `--matrix`, multi-arch note.

### 1.0.0

- Initial version (single Python image): Pipeline Tests and Pipeline Release, reusable flake8 and pytest jobs, Python version read from the `Dockerfile`, `edge`/release tags, concurrency rules, conventions, testing with actionlint/act, Dependabot, releasing.
