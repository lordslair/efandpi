// Stub for the Vite-only virtual module virtual:pwa-register/react
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as [boolean, () => void],
    offlineReady: [false, () => {}] as [boolean, () => void],
    updateServiceWorker: async () => {},
  };
}
