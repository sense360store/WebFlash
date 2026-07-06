// Origin guard (REPO-CUSTOMER-READY-001 S8).
//
// WebFlash has exactly one canonical deployment origin:
// https://sense360store.github.io (served under /WebFlash/). A copy of this
// repository is trivially rehostable — it is a static site — so a user can be
// handed a lookalike installer whose page, scripts, or firmware manifest have
// been altered. This module runs before the view mounts (static import from
// scripts/bootstrap.js) and does two things:
//
//   1. Frame bust. The page never legitimately runs inside a frame
//      (`_headers` sends frame-ancestors 'none', but GitHub Pages ignores
//      `_headers` and a meta CSP cannot carry frame-ancestors), so if we find
//      ourselves framed we replace the top window with this page. A hostile
//      embedder can still suppress this with an iframe sandbox; the bust is a
//      partial mitigation, not a guarantee.
//
//   2. Origin warning banner. When location.origin is anything other than the
//      canonical origin, a prominent banner names the canonical installer URL
//      so the user can switch to it. It warns and links; it deliberately does
//      not block — local development (http://localhost:5000) and genuine
//      forks land here too, and the engine's install gates (manifest SHA-256
//      + Ed25519 verification) remain the enforcement layer.
//
// Styling is applied through CSSOM property assignments (element.style.x)
// because the page CSP is style-src 'self' without 'unsafe-inline': a style=""
// attribute set via markup/setAttribute would be blocked, but CSSOM writes are
// permitted. No markup string is injected — nodes are built with DOM APIs.

const CANONICAL_ORIGIN = 'https://sense360store.github.io';
const CANONICAL_INSTALLER_URL = 'https://sense360store.github.io/WebFlash/';
const BANNER_ID = 'webflash-origin-guard-banner';

/**
 * If this page is embedded in a frame, navigate the top window to this page.
 * Swallows the cross-origin SecurityError a hostile embedder produces; the
 * warning banner still renders in that case.
 */
export function frameBust(win = window) {
  try {
    if (win.top !== win.self) {
      win.top.location.href = win.self.location.href;
      return true;
    }
  } catch (err) {
    // Cross-origin or sandboxed embedder: navigation is not permitted from
    // here. Nothing else to do — the banner below still renders.
  }
  return false;
}

/** True when the page is served from the canonical deployment origin. */
export function isCanonicalOrigin(origin) {
  return origin === CANONICAL_ORIGIN;
}

/**
 * Build and prepend the non-canonical-origin warning banner. Idempotent —
 * a second call while the banner exists is a no-op.
 */
export function renderOriginWarningBanner(doc = document) {
  if (doc.getElementById(BANNER_ID)) {
    return doc.getElementById(BANNER_ID);
  }

  const banner = doc.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'alert');
  banner.style.background = '#7f1d1d';
  banner.style.color = '#ffffff';
  banner.style.padding = '12px 16px';
  banner.style.fontSize = '15px';
  banner.style.lineHeight = '1.5';
  banner.style.textAlign = 'center';
  banner.style.fontFamily = 'inherit';

  const strong = doc.createElement('strong');
  strong.textContent = 'You are not on the official Sense360 installer. ';
  banner.appendChild(strong);

  banner.appendChild(
    doc.createTextNode(
      'This copy of WebFlash is being served from a different web address, so it may not be the version Sense360 published. Use the official installer at ',
    ),
  );

  const link = doc.createElement('a');
  link.href = CANONICAL_INSTALLER_URL;
  link.textContent = CANONICAL_INSTALLER_URL;
  link.style.color = '#ffffff';
  link.style.fontWeight = '700';
  link.style.textDecoration = 'underline';
  banner.appendChild(link);

  banner.appendChild(doc.createTextNode('.'));

  const mount = () => {
    if (!doc.getElementById(BANNER_ID)) {
      doc.body.insertBefore(banner, doc.body.firstChild);
    }
  };
  if (doc.body) {
    mount();
  } else {
    doc.addEventListener('DOMContentLoaded', mount, { once: true });
  }
  return banner;
}

// Side-effect entry point. Guarded so the module can be imported by Jest
// (no window) without executing browser-only code.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  frameBust(window);
  if (!isCanonicalOrigin(window.location.origin)) {
    renderOriginWarningBanner(document);
  }
}
