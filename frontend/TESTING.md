# Frontend Testing Guide

A complete reference for the test suite. The patterns documented here are intentionally framework-agnostic enough to be reused across Vite + React projects — see [Adapting to a New Project](#adapting-to-a-new-project) at the end.

---

## Stack

| Tool | Role |
|------|------|
| [Vitest](https://vitest.dev/) | Test runner (Vite-native, Jest-compatible API) |
| [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) | Component rendering & user-centric queries |
| [@testing-library/user-event](https://testing-library.com/docs/user-event/intro/) | Realistic user interaction simulation |
| [@testing-library/jest-dom](https://github.com/testing-library/jest-dom) | Extra DOM matchers (`toBeInTheDocument`, etc.) |
| [MSW v2](https://mswjs.io/) | Network-layer request mocking (Node adapter) |
| [@vitest/coverage-v8](https://vitest.dev/guide/coverage) | Coverage via V8 |
| [jsdom](https://github.com/jsdom/jsdom) | Browser-like DOM environment |

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run test` | Run the full suite once (CI mode) |
| `npm run test:watch` | Interactive watch mode |
| `npm run test:coverage` | Run suite + generate `coverage/` report |

---

## Configuration

Tests are configured inside `vite.config.ts` under the `test` key — no separate `vitest.config.ts` is needed.

```ts
// vite.config.ts (test block)
test: {
  environment: 'jsdom',          // browser-like DOM
  setupFiles: ['./tests/setup.ts'],
  globals: true,                 // describe/it/expect available without imports
  env: {
    VITE_API_URL: 'http://127.0.0.1:9',   // dummy origin consumed by MSW
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html'],
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/main.tsx'],
  },
  alias: {
    // Stub Vite virtual modules that don't resolve in jsdom
    'virtual:pwa-register/react': path.resolve(__dirname, 'tests/mocks/pwa-register-react.ts'),
  },
},
```

**Key decisions:**
- `globals: true` — avoids boilerplate imports in every test file. Tests can still import explicitly if preferred.
- `VITE_API_URL` points to a port that is never actually open; MSW intercepts all requests before they reach the network.
- `onUnhandledRequest: 'error'` in the setup makes accidental unmocked requests fail loudly.

---

## Directory Structure

```
tests/
├── setup.ts               # Global lifecycle: MSW + jest-dom + cleanup
├── test-utils.tsx         # renderWithProviders helper
├── constants.ts           # TEST_API_ORIGIN (must match vite.config test.env)
├── msw/
│   ├── server.ts          # MSW Node server instance
│   └── handlers.ts        # Default happy-path handlers
├── mocks/
│   └── pwa-register-react.ts  # Stub for virtual:pwa-register/react
└── *.test.tsx / *.test.ts # Test files
```

All test files live under `tests/` at the project root — not co-located with source files. Named `*.test.tsx` (or `*.test.ts` for non-JSX files, e.g. `api.test.ts`).

---

## Setup File (`tests/setup.ts`)

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  server.resetHandlers()   // undo per-test overrides
  localStorage.clear()     // prevent state leaking between tests
  cleanup()                // unmount React trees
})

afterAll(() => server.close())
```

`@testing-library/jest-dom/vitest` registers all DOM matchers globally. The `cleanup()` call is technically automatic with `globals: true` but is kept explicit for clarity.

---

## MSW — Network Mocking

### Server (`tests/msw/server.ts`)

```ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

### Default Handlers (`tests/msw/handlers.ts`)

Define one handler per API endpoint used by the app. These represent the **happy path** and are active for every test:

```ts
import { http, HttpResponse } from 'msw'
import { TEST_API_ORIGIN } from '../constants'

const api = (path: string) => `${TEST_API_ORIGIN}${path}`

export const handlers = [
  http.post(api('/auth/token'), () =>
    HttpResponse.json({ access_token: 'test-access-token', token_type: 'bearer' })
  ),
  // ... one entry per endpoint, e.g. /locations, /locations/:id/items, /public/share/:token
]
```

### Per-Test Overrides

Override a handler inside a specific test to simulate errors or edge cases:

```ts
import { http, HttpResponse } from 'msw'
import { server } from './msw/server'

it('shows an error on 401', async () => {
  server.use(
    http.post(`${TEST_API_ORIGIN}/auth/token`, () =>
      HttpResponse.json({ detail: 'Incorrect email or password' }, { status: 401 })
    )
  )
  // ... rest of test
})
```

`server.resetHandlers()` in `afterEach` automatically removes per-test overrides.

---

## Test Utilities

### `renderWithProviders` (`tests/test-utils.tsx`)

Wraps the component under test in all required providers:

```tsx
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../src/hooks/useAuth'

export function renderWithProviders(
  ui: React.ReactElement,
  { route = '/', ...options }: { route?: string } & Omit<RenderOptions, 'wrapper'> = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    )
  }
  return render(ui, { wrapper: Wrapper, ...options })
}
```

Use this when the component under test depends on routing or auth context (most pages do). The `route` option sets the initial URL for route-dependent rendering.

---

## Mocking Strategies

Two complementary strategies are used depending on what is being tested:

### 1. MSW — Mock the network layer

Used when testing components or pages that issue real `fetch` calls through `src/api/client.ts`. The full fetch chain runs; only the HTTP response is intercepted. This is the **default** strategy in this project — most test files use it.

**Best for:** form submissions, API client unit tests (`api.test.ts`), page/component integration tests where the real auth flow and API calls should run end-to-end (`LoginPage.test.tsx`, `HomePage.test.tsx`, `LocationPage.test.tsx`, `ManualImportModal.test.tsx`, `ItemPhotoModal.test.tsx`).

### 2. `vi.mock()` — Mock a module

Used to isolate a component from a dependency that can't run in jsdom, or to control something MSW can't reach (e.g. `useNavigate`).

**Mock `react-router-dom`'s `useNavigate` to assert on navigation without a real router history:**

```tsx
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => mockNavigate,
}))
```

**Mock a component that depends on browser APIs unavailable in jsdom** (used for `BarcodeScanner`, which needs camera access, and `ExportButton`, which needs canvas — see `LocationPage.test.tsx`):

```tsx
vi.mock('../src/components/BarcodeScanner', () => ({
  default: ({ onScan, onClose }: { onScan: (b: string) => void; onClose: () => void }) => (
    <div data-testid="barcode-scanner">
      <button onClick={() => onScan('3017620422003')}>Trigger Scan</button>
      <button onClick={onClose}>Close Scanner</button>
    </div>
  ),
}))
```

### Gotcha: stubbing `navigator.clipboard`

jsdom ships its own `navigator.clipboard` (a real `Clipboard`/`EventTarget` instance), and `@testing-library/user-event`'s `userEvent.setup()` lazily (re)initializes it. If you stub `navigator.clipboard` in a `beforeEach` that runs *before* the test calls `userEvent.setup()`, your stub gets silently clobbered and `writeText` calls just vanish (see `ShareModal.test.tsx`). Always stub it *after* `userEvent.setup()`, inside the test body:

```ts
const user = userEvent.setup();
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true,
});
```

---

## Testing Patterns

Each test file opens with a `// Pattern X` comment identifying which of these it follows.

### A — Context/hook unit test (dependency module mocked, no network)

Tests a React context/hook provider in isolation by rendering a minimal consumer component, with the API module mocked directly (no MSW involved). See `useAuth.test.tsx`.

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../src/hooks/useAuth'
import * as apiClient from '../src/api/client'

vi.mock('../src/api/client')
const mockedLogin = vi.mocked(apiClient.login)

function Consumer() {
  const { token, login } = useAuth()
  return (
    <>
      <span data-testid="token">{token ?? 'none'}</span>
      <button onClick={() => login('a@b.com', 'pw')}>Login</button>
    </>
  )
}

it('updates token after successful login', async () => {
  mockedLogin.mockResolvedValue('test-token')

  render(<AuthProvider><Consumer /></AuthProvider>)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Login' }))
  await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('test-token'))
})
```

### B — Page/component integration test (MSW + renderWithProviders)

The real `AuthProvider` and `api/client.ts` run; only HTTP is mocked. Validates the full user-visible flow. This is the most common pattern in the suite (`LoginPage.test.tsx`, `HomePage.test.tsx`, `LocationPage.test.tsx`, `ManualImportModal.test.tsx`, `ItemPhotoModal.test.tsx`).

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from './msw/server'
import { TEST_API_ORIGIN } from './constants'
import { renderWithProviders } from './test-utils'
import LoginPage from '../src/pages/LoginPage'

const api = (p: string) => `${TEST_API_ORIGIN}${p}`

it('stores the token and navigates to / on successful login', async () => {
  renderWithProviders(<LoginPage />)
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
  await user.type(screen.getByPlaceholderText('••••••••'), 'secret')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
  await waitFor(() => expect(localStorage.getItem('token')).toBe('test-access-token'))
})

it('shows the server error message on 401', async () => {
  server.use(
    http.post(api('/auth/token'), () =>
      HttpResponse.json({ detail: 'Incorrect email or password' }, { status: 401 })
    )
  )
  renderWithProviders(<LoginPage />)
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText('you@example.com'), 'bad@b.com')
  await user.type(screen.getByPlaceholderText('••••••••'), 'wrong')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
  expect(await screen.findByText('Incorrect email or password')).toBeInTheDocument()
})
```

### C — Service unit test (pure fetch, no React)

Tests the raw `api/client.ts` functions without rendering any component. See `api.test.ts`.

```ts
import { server } from './msw/server'
import { http, HttpResponse } from 'msw'
import { TEST_API_ORIGIN } from './constants'
import { login } from '../src/api/client'

it('throws with the server detail message on 401', async () => {
  server.use(
    http.post(`${TEST_API_ORIGIN}/auth/token`, () =>
      HttpResponse.json({ detail: 'Incorrect email or password' }, { status: 401 })
    )
  )
  await expect(login('bad@b.com', 'wrong')).rejects.toThrow('Incorrect email or password')
})
```

### D — Routing test (real providers, real MSW)

Tests that routes render the correct page and gate protected routes correctly. Unlike a generic React app that might mock the auth context for this, this project's `App.test.tsx` renders the **real** `AuthProvider` and just seeds `localStorage` directly — simpler, and it exercises the real `ProtectedRoute` logic instead of a stand-in.

```tsx
import { render, screen } from '@testing-library/react'
import App from '../src/App'

beforeEach(() => {
  window.history.pushState({}, '', '/')
})

it('redirects / to /login and shows the login form when unauthenticated', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'EfanDpi' })).toBeInTheDocument()
})

it('renders the home page when a token is set', async () => {
  localStorage.setItem('token', 'test-token')
  render(<App />)
  expect(await screen.findByText('My Locations')).toBeInTheDocument()
})
```

### E — Presentational component test (conditional rendering, no network)

Tests conditional UI purely by varying props — no providers, no network. See `ItemCard.test.tsx`.

```tsx
import { render, screen } from '@testing-library/react'
import ItemCard from '../src/components/ItemCard'

it('does not render a brand line when brand is null', () => {
  render(<ItemCard item={{ ...BASE_ITEM, brand: null }} />)
  expect(screen.queryByText('Ferrero')).not.toBeInTheDocument()
})

it('does not render an edit-photo button in readOnly mode', () => {
  render(<ItemCard item={BASE_ITEM} readOnly onEditPhoto={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Edit photo' })).not.toBeInTheDocument()
})
```

### F — Best-effort / silent-failure test

Tests a deliberately-swallowed error path — e.g. attaching a photo right after creating an item is treated as best-effort, so a failed upload must not block the rest of the flow. See `ManualImportModal.test.tsx` and `LocationPage.test.tsx`. Whenever a `catch` block intentionally does nothing (or only logs), add a test proving the fallback behavior — silent catches are exactly the code most likely to regress unnoticed.

```tsx
it('still adds the item and closes when the photo upload fails (best-effort)', async () => {
  server.use(
    http.post(api('/locations/:id/items/:itemId/image'), () =>
      HttpResponse.json({ detail: 'Failed to upload image' }, { status: 502 })
    )
  )
  const user = userEvent.setup()
  const { onClose, onAdded } = renderModal()

  await searchAndSelect(user)
  await user.upload(screen.getByLabelText('Custom photo (optional)'), someFile)
  await user.click(screen.getByRole('button', { name: /^Add$/ }))

  await waitFor(() => expect(onAdded).toHaveBeenCalled())
  expect(onAdded.mock.calls[0][0].custom_image_url).toBeNull()
  expect(onClose).toHaveBeenCalledOnce()
})
```

---

## Stubbing Vite Virtual Modules

Vite plugins expose virtual modules (e.g. `virtual:pwa-register/react`, from `vite-plugin-pwa`) that do not resolve in jsdom. Stub them via `test.alias` in `vite.config.ts`:

```ts
// vite.config.ts
test: {
  alias: {
    'virtual:pwa-register/react': path.resolve(__dirname, 'tests/mocks/pwa-register-react.ts'),
  },
}
```

```ts
// tests/mocks/pwa-register-react.ts
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  }
}
```

Apply the same pattern for any other Vite-only virtual module (`virtual:*`).

---

## Coverage

```bash
npm run test:coverage
```

HTML report is written to `coverage/index.html`. Configured in `vite.config.ts`:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'html'],
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['src/main.tsx'],   // entry point — not unit-testable
},
```

Add `coverage/` to `.gitignore`.

There is currently no enforced coverage threshold (`coverage.thresholds` is unset) — a regression in coverage won't fail CI on its own. Components that wrap a browser API unavailable in jsdom (`BarcodeScanner.tsx`, `ExportButton.tsx`) are expected to show 0% since they're stubbed via `vi.mock()` rather than exercised directly; every other component/page should have a dedicated test file.

---

## Linting

This project does not currently have ESLint configured (no `eslint.config.js`, no `lint` script in `package.json`). If ESLint is added later, remember to give `tests/**` and `*.test.{ts,tsx}` a globals override so `describe`/`it`/`expect` aren't flagged as undefined:

```js
// eslint.config.js
import globals from 'globals'

{
  files: ['**/*.test.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
  languageOptions: {
    globals: {
      ...globals.browser,
      ...globals.vitest,
    },
  },
}
```

---

## CI — GitHub Actions

```yaml
frontend-test:
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: frontend
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '24'
        cache: 'npm'
        cache-dependency-path: frontend/package-lock.json
    - run: npm ci
    - run: npm run test
    # Optional — upload coverage artifact:
    # - run: npm run test:coverage
    # - uses: actions/upload-artifact@v4
    #   with:
    #     name: coverage
    #     path: frontend/coverage/
```

There's no `engines.node` field in `package.json` today, so the Node version above is just what CI happens to use — bump it here if the toolchain requirement changes.

---

## Adapting to a New Project

This guide's infrastructure (MSW setup, `renderWithProviders`, the lettered patterns) generalizes well beyond this specific app. If reusing it elsewhere:

| If your project has… | Change… |
|---|---|
| A different provider (Redux, React Query, etc.) | Update `renderWithProviders` to wrap with that provider instead of/alongside `AuthProvider` |
| Different `import.meta.env` variables | Add them to `test.env` in `vite.config.ts` and export from `tests/constants.ts` |
| JavaScript instead of TypeScript | Rename files `.test.jsx` / `.test.js`; drop the type annotations from the examples above |
| Co-located tests | Change `coverage.include` pattern or use the Vitest default (`**/*.test.*`) instead of the `tests/` layout |
| No routing | Remove `MemoryRouter` from `renderWithProviders`; keep the auth provider wrapper only |
| No auth context | Simplify `renderWithProviders` to a bare `render` re-export or add only the providers you need |
| Vite virtual modules | Add a stub file under `tests/mocks/` and wire it via `test.alias` |
