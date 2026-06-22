# Frontend Testing Guide

A complete reference for the test suite. The patterns documented here are intentionally framework-agnostic enough to be reused across Vite + React projects.

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

Tests are configured inside `vite.config.js` under the `test` key — no separate `vitest.config.ts` is needed.

```js
// vite.config.js (test block)
test: {
  environment: 'jsdom',          // browser-like DOM
  setupFiles: ['./tests/setup.js'],
  globals: true,                 // describe/it/expect available without imports
  env: {
    VITE_API_URL: 'http://127.0.0.1:9',   // dummy origin consumed by MSW
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html'],
    include: ['src/**/*.{js,jsx}'],
    exclude: ['src/main.jsx'],
  },
  alias: {
    // Stub Vite virtual modules that don't resolve in jsdom
    'virtual:pwa-register/react': resolve(__dirname, 'tests/mocks/pwa-register-react.js'),
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
├── setup.js              # Global lifecycle: MSW + jest-dom + cleanup
├── test-utils.jsx         # renderWithProviders helper
├── constants.js           # TEST_API_ORIGIN (must match vite.config test.env)
├── msw/
│   ├── server.js          # MSW Node server instance
│   └── handlers.js        # Default happy-path handlers
├── mocks/
│   └── pwa-register-react.js  # Stub for virtual:pwa-register/react
└── *.test.jsx             # Test files
```

All test files live under `tests/` at the project root — not co-located with source files. Named `*.test.jsx` (or `*.test.js` for non-JSX files).

---

## Setup File (`tests/setup.js`)

```js
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw/server.js'

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

### Server (`tests/msw/server.js`)

```js
import { setupServer } from 'msw/node'
import { handlers } from './handlers.js'

export const server = setupServer(...handlers)
```

### Default Handlers (`tests/msw/handlers.js`)

Define one handler per API endpoint used by the app. These represent the **happy path** and are active for every test:

```js
import { http, HttpResponse } from 'msw'
import { TEST_API_ORIGIN } from '../constants.js'

const base = (path) => `${TEST_API_ORIGIN}${path}`

export const handlers = [
  http.post(base('/auth/login'), async ({ request }) => {
    await request.json()
    return HttpResponse.json({ access_token: 'test-access-token' })
  }),
  // ... one entry per endpoint
]
```

### Per-Test Overrides

Override a handler inside a specific test to simulate errors or edge cases:

```js
import { http, HttpResponse } from 'msw'
import { server } from './msw/server.js'

it('shows an error on 401', async () => {
  server.use(
    http.post(`${TEST_API_ORIGIN}/auth/login`, () =>
      HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 })
    )
  )
  // ... rest of test
})
```

`server.resetHandlers()` in `afterEach` automatically removes per-test overrides.

---

## Test Utilities

### `renderWithProviders` (`tests/test-utils.jsx`)

Wraps the component under test in all required providers:

```jsx
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../src/context/AuthContext.jsx'

export function renderWithProviders(ui, { route = '/', ...options } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
    options
  )
}
```

Use this when the component under test depends on routing or auth context. The `route` option sets the initial URL for route-dependent rendering.

---

## Mocking Strategies

Two complementary strategies are used depending on what is being tested:

### 1. MSW — Mock the network layer

Used when testing components or services that issue real `fetch` calls through `api.js`. The full fetch chain runs; only the HTTP response is intercepted.

**Best for:** form submissions, API service unit tests, integration tests where the real auth flow should run end-to-end.

### 2. `vi.mock()` — Mock a module

Used to isolate a component from its dependencies by replacing an entire module with controlled stubs.

**Mock `AuthContext` to isolate a component from auth state:**

```jsx
import { vi } from 'vitest'
import * as AuthModule from '../src/context/AuthContext.jsx'

const mockUseAuth = vi.fn()
vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }) => children,
}))

const authState = (overrides = {}) => ({
  user: null,
  token: null,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  ...overrides,
})

beforeEach(() => mockUseAuth.mockReturnValue(authState()))
```

**Mock the API service to isolate context logic:**

```js
import { vi } from 'vitest'
import * as api from '../src/services/api.js'

vi.mock('../src/services/api.js')

beforeEach(() => {
  vi.mocked(api.login).mockResolvedValue({ access_token: 'tok' })
})
```

---

## Testing Patterns

### A — Context unit test

Tests a React context provider in isolation by rendering a minimal consumer component.

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../src/context/AuthContext.jsx'
import * as api from '../src/services/api.js'

vi.mock('../src/services/api.js')

function Consumer() {
  const { user, login } = useAuth()
  return (
    <>
      <span>{user?.email ?? 'none'}</span>
      <button onClick={() => login('a@b.com', 'pw')}>Login</button>
    </>
  )
}

it('updates user after successful login', async () => {
  vi.mocked(api.login).mockResolvedValue({ access_token: 'tok' })
  vi.mocked(api.getProfile).mockResolvedValue({ email: 'a@b.com' })

  render(<AuthProvider><Consumer /></AuthProvider>)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Login' }))
  await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument())
})
```

### B — Form integration test (MSW + renderWithProviders)

The real auth context and API service run; only HTTP is mocked. Validates the full user-visible flow.

```jsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from './test-utils.jsx'
import LoginForm from '../src/components/LoginForm.jsx'
import { server } from './msw/server.js'
import { http, HttpResponse } from 'msw'
import { TEST_API_ORIGIN } from './constants.js'

it('stores token on successful login', async () => {
  renderWithProviders(<LoginForm />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/email/i), 'a@b.com')
  await user.type(screen.getByLabelText(/password/i), 'secret')
  await user.click(screen.getByRole('button', { name: /log in/i }))
  await screen.findByText(/dashboard/i)
  expect(localStorage.getItem('token')).toBe('test-access-token')
})

it('shows error on 401', async () => {
  server.use(
    http.post(`${TEST_API_ORIGIN}/auth/login`, () =>
      HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 })
    )
  )
  renderWithProviders(<LoginForm />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/email/i), 'bad@b.com')
  await user.type(screen.getByLabelText(/password/i), 'wrong')
  await user.click(screen.getByRole('button', { name: /log in/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i)
})
```

### C — Service unit test (pure fetch, no React)

Tests the raw API service without rendering any component.

```js
import { server } from './msw/server.js'
import { http, HttpResponse } from 'msw'
import { TEST_API_ORIGIN } from './constants.js'
import { login } from '../src/services/api.js'

it('throws when response is not JSON', async () => {
  server.use(
    http.post(`${TEST_API_ORIGIN}/auth/login`, () =>
      new HttpResponse('<html>Error</html>', {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      })
    )
  )
  await expect(login('a@b.com', 'pw')).rejects.toThrow()
})
```

### D — Routing test (mocked auth state)

Tests that routes render the correct component and redirect unauthenticated users.

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }) => children,
}))

it('redirects unauthenticated users to /login', () => {
  mockUseAuth.mockReturnValue(authState({ token: null }))
  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: /log in/i })).toBeInTheDocument()
})

it('renders dashboard for authenticated users', () => {
  mockUseAuth.mockReturnValue(authState({ token: 'tok', user: { email: 'a@b.com' } }))
  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
})
```

### E — Presentational component test (conditional rendering)

Tests conditional UI by varying the mock auth state.

```jsx
it('shows admin link when user is admin', () => {
  mockUseAuth.mockReturnValue(authState({ user: { is_admin: true } }))
  render(<Sidebar />)
  expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument()
})

it('hides admin link for regular users', () => {
  mockUseAuth.mockReturnValue(authState({ user: { is_admin: false } }))
  render(<Sidebar />)
  expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument()
})
```

### F — Client-side validation (no network call)

Tests validation logic that fires before any fetch is made.

```jsx
it('shows error when passwords do not match', async () => {
  renderWithProviders(<RegisterForm />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/^password/i), 'abc123')
  await user.type(screen.getByLabelText(/confirm/i), 'xyz789')
  await user.click(screen.getByRole('button', { name: /register/i }))
  expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i)
})
```

---

## Stubbing Vite Virtual Modules

Vite plugins expose virtual modules (e.g. `virtual:pwa-register/react`) that do not resolve in jsdom. Stub them via `test.alias` in `vite.config.js`:

```js
// vite.config.js
test: {
  alias: {
    'virtual:pwa-register/react': resolve(__dirname, 'tests/mocks/pwa-register-react.js'),
  },
}
```

```js
// tests/mocks/pwa-register-react.js
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

HTML report is written to `coverage/index.html`. Configured in `vite.config.js`:

```js
coverage: {
  provider: 'v8',
  reporter: ['text', 'html'],
  include: ['src/**/*.{js,jsx}'],
  exclude: ['src/main.jsx'],   // entry point — not unit-testable
},
```

Add `coverage/` to `.gitignore`.

---

## ESLint Integration

Add a Vitest globals override so ESLint does not flag `describe`/`it`/`expect` as undefined:

```js
// eslint.config.js
import globals from 'globals'

{
  files: ['**/*.test.{js,jsx}', 'tests/**/*.{js,jsx}'],
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
        node-version: '24'           # match engines.node in package.json
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

---

## Adapting to a New Project

| If your project has… | Change… |
|---|---|
| A different provider (Redux, React Query, etc.) | Update `renderWithProviders` to wrap with that provider |
| Different `import.meta.env` variables | Add them to `test.env` in `vite.config.js` and export from `tests/constants.js` |
| TypeScript | Rename files `.test.tsx` / `.test.ts`; Vitest supports TS out of the box via Vite |
| Co-located tests | Change `include` pattern or use the Vitest default (`**/*.test.*`) instead of the `tests/` layout |
| No routing | Remove `MemoryRouter` from `renderWithProviders`; keep the auth provider wrapper only |
| No auth context | Simplify `renderWithProviders` to a bare `render` re-export or add only the providers you need |
| Vite virtual modules | Add a stub file under `tests/mocks/` and wire it via `test.alias` |
