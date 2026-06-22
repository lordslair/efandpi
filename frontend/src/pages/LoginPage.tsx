import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

type Mode = "login" | "register";

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-brand-50">
      {/* Logo / Header */}
      <div className="mb-8 text-center">
        <div className="text-5xl mb-3">🧊</div>
        <h1 className="text-3xl font-bold text-brand-700">EfanDpi</h1>
        <p className="text-gray-500 mt-1 text-sm">Your smart pantry tracker</p>
      </div>

      <div className="w-full max-w-sm card">
        {/* Tab toggle */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-6">
          <button
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              mode === "login" ? "bg-brand-600 text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
            onClick={() => setMode("login")}
          >
            Sign In
          </button>
          <button
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              mode === "register" ? "bg-brand-600 text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
            onClick={() => setMode("register")}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
