export async function registerServiceWorker({ navigatorRef = navigator, showToast = () => {} } = {}) {
    if (!('serviceWorker' in navigatorRef) || !window.isSecureContext) return null;
    try {
        const registration = await navigatorRef.serviceWorker.register('./sw.js', { scope: './' });
        registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', () => {
                if (worker.state === 'installed' && navigatorRef.serviceWorker.controller) {
                    showToast('Versi baru tersedia. Muat ulang untuk memperbarui aplikasi.', 'info', 7000);
                }
            });
        });
        return registration;
    } catch (error) {
        console.warn('Service worker tidak dapat didaftarkan:', error);
        return null;
    }
}
