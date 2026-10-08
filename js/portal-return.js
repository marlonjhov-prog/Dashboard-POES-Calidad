(() => {
    'use strict';

    const STORAGE_KEY = 'qa_portal_return_url';
    const RETURN_PARAM = 'portal_return';
    const DEFAULT_PORTAL_URL = 'https://portal-central-calidad-git-desarrollo-portal-v010-marjhov.vercel.app';
    const TRUSTED_PORTAL_HOSTS = new Set([
        'portal-central-calidad-git-desarrollo-portal-v010-marjhov.vercel.app',
        'portal-central-calidad-marjhov.vercel.app',
        'portal-central-calidad-git-main-marjhov.vercel.app'
    ]);

    function normalizeTrustedPortalUrl(value) {
        try {
            const url = new URL(String(value || '').trim());
            const localDevelopment = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

            if (!localDevelopment && url.protocol !== 'https:') return '';
            if (!localDevelopment && !TRUSTED_PORTAL_HOSTS.has(url.hostname)) return '';

            url.pathname = '/';
            url.search = '';
            url.hash = '';
            return url.toString().replace(/\/$/, '');
        } catch {
            return '';
        }
    }

    function capturePortalReturnUrl() {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = normalizeTrustedPortalUrl(params.get(RETURN_PARAM));

        if (fromQuery) {
            sessionStorage.setItem(STORAGE_KEY, fromQuery);
            return fromQuery;
        }

        return normalizeTrustedPortalUrl(sessionStorage.getItem(STORAGE_KEY))
            || DEFAULT_PORTAL_URL;
    }

    function returnToPortal() {
        window.location.assign(capturePortalReturnUrl());
    }

    function mountPortalButton() {
        if (document.getElementById('btn-volver-portal')) return;

        const actionArea = document.querySelector('#dashboard-content header .flex.items-center.space-x-3');
        if (!actionArea) return;

        capturePortalReturnUrl();

        const button = document.createElement('button');
        button.id = 'btn-volver-portal';
        button.type = 'button';
        button.title = 'Regresar al panel de aplicaciones';
        button.className = 'bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-2 px-4 rounded-lg border border-white/20 transition flex items-center shadow-sm whitespace-nowrap';
        button.innerHTML = '<i class="fa-solid fa-table-cells-large mr-2" aria-hidden="true"></i><span>Portal Central</span>';
        button.addEventListener('click', returnToPortal);

        actionArea.prepend(button);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountPortalButton, { once: true });
    } else {
        mountPortalButton();
    }
})();
